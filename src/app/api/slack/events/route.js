import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { verifySlackRequest, sendBotReply, sendSlackMessage, getChannelHistory, buildConversationContext } from '@/lib/slack';
import { askDianBot } from '@/lib/ai';
import { getSheetTabs, readSheet } from '@/lib/sheets';

export const maxDuration = 60;

const DIANBOT_CHANNEL_ID = process.env.DIANBOT_CHANNEL_ID || '';

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
  }

  return NextResponse.json({ ok: true });
}

async function handleMessage(event) {
  const userMessage = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  const channel = event.channel;

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

    const [history, ...sheetResults] = await Promise.all([
      getChannelHistory(channel).then(msgs => buildConversationContext(msgs)),
      ...sheetIds.map(id => readAllSheetData(id).catch(e => {
        console.error('[Event] sheet read fail:', e.message);
        return '';
      })),
    ]);

    const context = history + sheetResults.join('');
    console.log('[Event] Context length:', context.length);

    const answer = await askDianBot(userMessage, context);
    console.log('[Event] AI response length:', answer.length);
    await sendBotReply(channel, userMessage, answer);
  } catch (error) {
    console.error('[Event] Error:', error.message, error.stack);
    await sendSlackMessage(channel, '죄송합니다. 요청을 처리하는 중 오류가 발생했습니다.');
  }
}
