import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { verifySlackRequest, sendBotReply, sendSlackMessage, getChannelHistory, buildConversationContext } from '@/lib/slack';
import { askDianBot } from '@/lib/ai';
import { getSheetTabs, readSheet } from '@/lib/sheets';
import { buildStockContext } from '@/lib/stock-context';
import { handleSecretaryDM } from '@/lib/secretary';

export const maxDuration = 60;

const DIANBOT_CHANNEL_ID = process.env.DIANBOT_CHANNEL_ID || '';
// 비서 기능 허용 사용자 (콤마 구분 Slack user ID). 비어 있으면 모든 DM 허용.
const SECRETARY_USER_IDS = (process.env.SECRETARY_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

/**
 * 스프레드시트의 모든 탭 데이터를 자동으로 읽어오기
 * 최근 6개 탭만 읽어서 타임아웃 방지
 */
async function readAllSheetData(spreadsheetId) {
  const tabs = await getSheetTabs(spreadsheetId);
  const recentTabs = tabs.slice(-6);
  console.log('[Sheets] Found tabs:', tabs.length, '| Reading recent:', recentTabs);
  const results = await Promise.all(
    recentTabs.map(async (tab) => {
      try {
        const data = await readSheet(spreadsheetId, `${tab}!A1:Z200`);
        if (data.length > 0) {
          return `[${tab}]\n` + data.map(row => row.join(' | ')).join('\n') + '\n\n';
        }
      } catch (e) {
        console.error(`[Sheets] tab "${tab}" read fail:`, e.message);
      }
      return '';
    })
  );
  return results.join('');
}

export async function POST(request) {
  const body = await request.text();
  const headers = Object.fromEntries(request.headers);

  if (!verifySlackRequest(process.env.SLACK_SIGNING_SECRET, headers, body)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(body);

  // Slack URL 검증 (앱 설치 시 필요)
  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge });
  }

  if (payload.type === 'event_callback') {
    const event = payload.event;

    // 봇 자신의 메시지는 무시
    if (event.bot_id || event.subtype === 'bot_message') {
      return NextResponse.json({ ok: true });
    }

    // @멘션 이벤트
    if (event.type === 'app_mention') {
      waitUntil(handleMessage(event));
      return NextResponse.json({ ok: true });
    }

    // dianbot 채널에서의 일반 메시지 → 슬래시 없이 자동 응답
    if (event.type === 'message' && event.channel === DIANBOT_CHANNEL_ID) {
      waitUntil(handleMessage(event));
      return NextResponse.json({ ok: true });
    }

    // DM → 개인 비서 모드 (업무 기록·이슈·할일을 세컨드 브레인 볼트에 기록)
    if (event.type === 'message' && event.channel_type === 'im' && !event.subtype) {
      if (SECRETARY_USER_IDS.length > 0 && !SECRETARY_USER_IDS.includes(event.user)) {
        return NextResponse.json({ ok: true });
      }
      waitUntil(handleSecretaryDM(event));
      return NextResponse.json({ ok: true });
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleMessage(event) {
  const userMessage = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  const channel = event.channel;
  // 이미 스레드면 그 스레드에, 아니면 이 메시지를 루트로 스레드 답변
  const threadTs = event.thread_ts || event.ts;

  if (!userMessage) return;

  console.log(`[Event] message: "${userMessage}" in channel:${channel}`);

  try {
    // 시트 데이터 + 대화 히스토리를 병렬로 가져오기
    const sheetIds = [];
    const inventoryKeywords = ['재고', '수량', '입고', '남은', '있어', '몇'];
    const orderKeywords = ['주문', '견적', '오더', '발주'];
    const priceKeywords = ['단가', '가격', '얼마', '비용', '원'];

    // dianbot 채널이면 항상 전체 시트 참조, 아니면 키워드 기반
    const isDianbotChannel = channel === DIANBOT_CHANNEL_ID;

    if ((isDianbotChannel || inventoryKeywords.some(kw => userMessage.includes(kw))) && process.env.SHEET_ID_INVENTORY) {
      sheetIds.push(process.env.SHEET_ID_INVENTORY);
    }
    if ((isDianbotChannel || orderKeywords.some(kw => userMessage.includes(kw))) && process.env.SHEET_ID_ORDERS) {
      sheetIds.push(process.env.SHEET_ID_ORDERS);
    }
    if ((isDianbotChannel || priceKeywords.some(kw => userMessage.includes(kw))) && process.env.SHEET_ID_PRICING) {
      sheetIds.push(process.env.SHEET_ID_PRICING);
    }

    const [history, stockCtx, ...sheetResults] = await Promise.all([
      getChannelHistory(channel).then(msgs => buildConversationContext(msgs)),
      buildStockContext(userMessage).catch(e => {
        console.error('[Event] overseas stock fail:', e.message);
        return '';
      }),
      ...sheetIds.map(id => readAllSheetData(id).catch(e => {
        console.error('[Event] sheet read fail:', e.message);
        return '';
      })),
    ]);

    // 해외 재고를 찾았으면(=원단 재고 질문) 무거운 구글시트 덤프는 Claude에 보내지 않음 → 토큰/비용 대폭 절감.
    // (시트는 국내재고/주문/단가용. 해외 실시간재고 답변엔 불필요)
    const context = history + stockCtx + (stockCtx ? '' : sheetResults.join(''));
    if (stockCtx) console.log('[Event] overseas stock hit → skipping sheet dump');
    console.log('[Event] Context length:', context.length);

    const answer = await askDianBot(userMessage, context);
    console.log('[Event] AI response length:', answer.length);
    await sendBotReply(channel, userMessage, answer, threadTs);
  } catch (error) {
    console.error('[Event] Error:', error.message, error.stack);
    await sendSlackMessage(channel, '죄송합니다. 요청을 처리하는 중 오류가 발생했습니다.', null, threadTs);
  }
}
