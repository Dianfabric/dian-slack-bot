import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { verifySlackRequest, sendSlackMessage } from '@/lib/slack';
import { askDianBot } from '@/lib/ai';
import { getSheetTabs, readSheet } from '@/lib/sheets';

/**
 * 스프레드시트의 모든 탭 데이터를 자동으로 읽어오기
 */
async function readAllSheetData(spreadsheetId) {
  const tabs = await getSheetTabs(spreadsheetId);
  let allData = '';
  for (const tab of tabs) {
    try {
      const data = await readSheet(spreadsheetId, `${tab}!A1:Z200`);
      if (data.length > 0) {
        allData += `[${tab}]\n` + data.map(row => row.join(' | ')).join('\n') + '\n\n';
      }
    } catch (e) {
      console.error(`[Sheets] tab "${tab}" read fail:`, e.message);
    }
  }
  return allData;
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
    if (event.bot_id) {
      return NextResponse.json({ ok: true });
    }
    if (event.type === 'app_mention') {
      waitUntil(handleMention(event));
      return NextResponse.json({ ok: true });
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleMention(event) {
  const userMessage = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  const channel = event.channel;

  try {
    let context = '';
    const inventoryKeywords = ['재고', '수량', '입고', '남은', '있어', '몇'];
    const orderKeywords = ['주문', '견적', '오더', '발주'];
    const priceKeywords = ['단가', '가격', '얼마', '비용', '원'];

    if (inventoryKeywords.some(kw => userMessage.includes(kw)) && process.env.SHEET_ID_INVENTORY) {
      try {
        const data = await readAllSheetData(process.env.SHEET_ID_INVENTORY);
        if (data.length > 0) {
          context += '[재고 시트 데이터]\n' + data + '\n\n';
        }
      } catch (e) {
        console.error('재고 시트 읽기 실패:', e.message);
      }
    }

    if (orderKeywords.some(kw => userMessage.includes(kw)) && process.env.SHEET_ID_ORDERS) {
      try {
        const data = await readAllSheetData(process.env.SHEET_ID_ORDERS);
        if (data.length > 0) {
          context += '[주문 시트 데이터]\n' + data + '\n\n';
        }
      } catch (e) {
        console.error('주문 시트 읽기 실패:', e.message);
      }
    }

    if (priceKeywords.some(kw => userMessage.includes(kw)) && process.env.SHEET_ID_PRICING) {
      try {
        const data = await readAllSheetData(process.env.SHEET_ID_PRICING);
        if (data.length > 0) {
          context += '[단가 시트 데이터]\n' + data + '\n\n';
        }
      } catch (e) {
        console.error('단가 시트 읽기 실패:', e.message);
      }
    }

    const answer = await askDianBot(userMessage, context);
    await sendSlackMessage(channel, answer);
  } catch (error) {
    console.error('멘션 처리 오류:', error);
    await sendSlackMessage(channel, '죄송합니다. 요청을 처리하는 중 오류가 발생했습니다.');
  }
}
