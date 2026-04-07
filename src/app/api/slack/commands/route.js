import { NextResponse } from 'next/server';
import { verifySlackRequest, sendSlackMessage } from '@/lib/slack';
import { readSheet, readSheetAsObjects } from '@/lib/sheets';
import { askDianBot } from '@/lib/ai';

export async function POST(request) {
  const body = await request.text();
  const headers = Object.fromEntries(request.headers);

  // Slack 서명 검증
  if (!verifySlackRequest(process.env.SLACK_SIGNING_SECRET, headers, body)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // URL-encoded form data 파싱
  const params = new URLSearchParams(body);
  const command = params.get('command');
  const text = params.get('text') || '';
  const channelId = params.get('channel_id');
  const userId = params.get('user_id');

  // 슬래시 커맨드 라우팅
  switch (command) {
    case '/재고':
      handleInventory(text, channelId).catch(console.error);
      return NextResponse.json({
        response_type: 'ephemeral',
        text: '재고를 조회하고 있습니다...',
      });

    case '/주문':
      handleOrder(text, channelId).catch(console.error);
      return NextResponse.json({
        response_type: 'ephemeral',
        text: '주문 내역을 확인하고 있습니다...',
      });

    case '/견적':
      handleQuote(text, channelId).catch(console.error);
      return NextResponse.json({
        response_type: 'ephemeral',
        text: '견적을 산출하고 있습니다...',
      });

    case '/디안':
      handleGeneral(text, channelId).catch(console.error);
      return NextResponse.json({
        response_type: 'ephemeral',
        text: '디안봇이 답변을 준비하고 있습니다...',
      });

    default:
      return NextResponse.json({
        response_type: 'ephemeral',
        text: `알 수 없는 명령어입니다: ${command}`,
      });
  }
}

/**
 * /재고 명령어 처리
 */
async function handleInventory(query, channel) {
  try {
    let context = '';
    if (process.env.SHEET_ID_INVENTORY) {
      const data = await readSheet(process.env.SHEET_ID_INVENTORY, 'Sheet1!A1:Z200');
      if (data.length > 0) {
        context = '[재고 시트 데이터]\n' + data.map(row => row.join(' | ')).join('\n');
      }
    }

    const prompt = query
      ? `"${query}" 원단의 재고 현황을 알려줘. 수량, 컬러, 위치 정보를 포함해서.`
      : '전체 재고 현황을 카테고리별로 요약해줘.';

    const answer = await askDianBot(prompt, context);
    await sendSlackMessage(channel, answer);
  } catch (error) {
    console.error('재고 조회 오류:', error);
    await sendSlackMessage(channel, '재고 조회 중 오류가 발생했습니다.');
  }
}

/**
 * /주문 명령어 처리
 */
async function handleOrder(query, channel) {
  try {
    let context = '';
    if (process.env.SHEET_ID_ORDERS) {
      const data = await readSheet(process.env.SHEET_ID_ORDERS, 'Sheet1!A1:Z200');
      if (data.length > 0) {
        context = '[주문 시트 데이터]\n' + data.map(row => row.join(' | ')).join('\n');
      }
    }

    const prompt = query
      ? `"${query}" 관련 주문 내역을 조회해줘.`
      : '최근 주문 현황을 요약해줘. 진행 중인 주문 위주로.';

    const answer = await askDianBot(prompt, context);
    await sendSlackMessage(channel, answer);
  } catch (error) {
    console.error('주문 조회 오류:', error);
    await sendSlackMessage(channel, '주문 조회 중 오류가 발생했습니다.');
  }
}

/**
 * /견적 명령어 처리
 */
async function handleQuote(query, channel) {
  try {
    let context = '';
    if (process.env.SHEET_ID_PRICING) {
      const data = await readSheet(process.env.SHEET_ID_PRICING, 'Sheet1!A1:Z200');
      if (data.length > 0) {
        context = '[단가 시트 데이터]\n' + data.map(row => row.join(' | ')).join('\n');
      }
    }
    if (process.env.SHEET_ID_INVENTORY) {
      const invData = await readSheet(process.env.SHEET_ID_INVENTORY, 'Sheet1!A1:Z200');
      if (invData.length > 0) {
        context += '\n[재고 시트 데이터]\n' + invData.map(row => row.join(' | ')).join('\n');
      }
    }

    const prompt = query
      ? `다음 내용으로 견적을 산출해줘: ${query}. 원단명, 수량, 단가, 합계를 정리해서 보여줘.`
      : '견적 작성을 위해 어떤 정보가 필요한지 안내해줘. (예: /견적 A사 Boucle Ivory 50m)';

    const answer = await askDianBot(prompt, context);
    await sendSlackMessage(channel, answer);
  } catch (error) {
    console.error('견적 산출 오류:', error);
    await sendSlackMessage(channel, '견적 산출 중 오류가 발생했습니다.');
  }
}

/**
 * /디안 일반 질문 처리
 */
async function handleGeneral(query, channel) {
  try {
    let context = '';

    const sheetConfigs = [
      { id: process.env.SHEET_ID_INVENTORY, label: '재고' },
      { id: process.env.SHEET_ID_ORDERS, label: '주문' },
      { id: process.env.SHEET_ID_PRICING, label: '단가' },
    ];

    for (const config of sheetConfigs) {
      if (config.id) {
        try {
          const data = await readSheet(config.id, 'Sheet1!A1:Z100');
          if (data.length > 0) {
            context += `[${config.label} 시트]\n` + data.map(row => row.join(' | ')).join('\n') + '\n\n';
          }
        } catch (e) {
          // 시트 읽기 실패 시 무시
        }
      }
    }

    const answer = await askDianBot(query || '안녕! 디안봇이 뭘 도와줄 수 있는지 알려줘.', context);
    await sendSlackMessage(channel, answer);
  } catch (error) {
    console.error('일반 질문 오류:', error);
    await sendSlackMessage(channel, '요청 처리 중 오류가 발생했습니다.');
  }
}
