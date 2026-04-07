import { NextResponse } from 'next/server';
import { verifySlackRequest, sendSlackMessage } from '@/lib/slack';
import { askDianBot } from '@/lib/ai';
import { readSheet, readSheetAsObjects } from '@/lib/sheets';

export async function POST(request) {
  const body = await request.text();
  const headers = Object.fromEntries(request.headers);

  // Slack 서명 검증
  if (!verifySlackRequest(process.env.SLACK_SIGNING_SECRET, headers, body)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(body);

  // Slack URL 검증 (앱 설치 시 필요)
  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge });
  }

  // 이벤트 처리
  if (payload.type === 'event_callback') {
    const event = payload.event;

    // 봇 자신의 메시지는 무시
    if (event.bot_id) {
      return NextResponse.json({ ok: true });
    }

    // @멘션 이벤트 처리
    if (event.type === 'app_mention') {
      // 비동기로 처리 (Slack 3초 타임아웃 방지)
      handleMention(event).catch(console.error);
      return NextResponse.json({ ok: true });
    }
  }

  return NextResponse.json({ ok: true });
}

/**
 * @멘션 메시지 처리
 */
async function handleMention(event) {
  const userMessage = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  const channel = event.channel;

  try {
    // 구글 시트에서 데이터 가져오기
    let context = '';

    // 재고 관련 키워드가 있으면 재고 시트 데이터 로드
    const inventoryKeywords = ['재고', '수량', '입고', '남은', '있어', '몇'];
    const orderKeywords = ['주문', '견적', '오더', '발주'];
    const priceKeywords = ['단가', '가격', '얼마', '비용', '원'];

    if (inventoryKeywords.some(kw => userMessage.includes(kw)) && process.env.SHEET_ID_INVENTORY) {
      try {
        const data = await readSheet(process.env.SHEET_ID_INVENTORY, 'Sheet1!A1:Z200');
        if (data.length > 0) {
          context += '[재고 시트 데이터]\n' + data.map(row => row.join(' | ')).join('\n') + '\n\n';
        }
      } catch (e) {
        console.error('재고 시트 읽기 실패:', e.message);
      }
    }

    if (orderKeywords.some(kw => userMessage.includes(kw)) && process.env.SHEET_ID_ORDERS) {
      try {
        const data = await readSheet(process.env.SHEET_ID_ORDERS, 'Sheet1!A1:Z200');
        if (data.length > 0) {
          context += '[주문 시트 데이터]\n' + data.map(row => row.join(' | ')).join('\n') + '\n\n';
        }
      } catch (e) {
        console.error('주문 시트 읽기 실패:', e.message);
      }
    }

    if (priceKeywords.some(kw => userMessage.includes(kw)) && process.env.SHEET_ID_PRICING) {
      try {
        const data = await readSheet(process.env.SHEET_ID_PRICING, 'Sheet1!A1:Z200');
        if (data.length > 0) {
          context += '[단가 시트 데이터]\n' + data.map(row => row.join(' | ')).join('\n') + '\n\n';
        }
      } catch (e) {
        console.error('단가 시트 읽기 실패:', e.message);
      }
    }

    // Claude AI에 질문
    const answer = await askDianBot(userMessage, context);

    // 슬랙에 답변 전송
    await sendSlackMessage(channel, answer);

  } catch (error) {
    console.error('멘션 처리 오류:', error);
    await sendSlackMessage(channel, '죄송합니다. 요청을 처리하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
  }
}
