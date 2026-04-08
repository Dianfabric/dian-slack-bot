import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { verifySlackRequest, sendSlackMessage } from '@/lib/slack';
import { getSheetTabs, readSheet } from '@/lib/sheets';
import { askDianBot } from '@/lib/ai';

/**
 * 스프레드시트의 모든 탭 데이터를 자동으로 읽어오기
 */
async function readAllSheetData(spreadsheetId) {
  const tabs = await getSheetTabs(spreadsheetId);
  console.log('[Sheets] Found tabs:', tabs);
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
    console.error('[Auth] Invalid Slack signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const params = new URLSearchParams(body);
  const command = params.get('command');
  const text = params.get('text') || '';
  const channelId = params.get('channel_id');
  const userId = params.get('user_id');

  console.log(`[Command] ${command} "${text}" from user:${userId} in channel:${channelId}`);

  switch (command) {
    case '/재고':
      waitUntil(handleInventory(text, channelId));
      return NextResponse.json({ response_type: 'ephemeral', text: '📦 재고를 조회하고 있습니다...' });
    case '/주문':
      waitUntil(handleOrder(text, channelId));
      return NextResponse.json({ response_type: 'ephemeral', text: '📋 주문 내역을 확인하고 있습니다...' });
    case '/견적':
      waitUntil(handleQuote(text, channelId));
      return NextResponse.json({ response_type: 'ephemeral', text: '💰 견적을 산출하고 있습니다...' });
    case '/디안':
      waitUntil(handleGeneral(text, channelId));
      return NextResponse.json({ response_type: 'ephemeral', text: '🤖 디안봇이 답변을 준비하고 있습니다...' });
    default:
      return NextResponse.json({ response_type: 'ephemeral', text: `알 수 없는 명령어입니다: ${command}` });
  }
}

async function handleInventory(query, channel) {
  try {
    let context = '';
    if (process.env.SHEET_ID_INVENTORY) {
      console.log('[재고] Reading inventory sheet...');
      context = await readAllSheetData(process.env.SHEET_ID_INVENTORY);
      console.log('[재고] Sheet data length:', context.length);
    } else {
      console.warn('[재고] SHEET_ID_INVENTORY not set');
    }
    const prompt = query
      ? `"${query}" 원단의 재고 현황을 알려줘. 수량, 컬러, 위치 정보를 포함해서.`
      : '전체 재고 현황을 카테고리별로 요약해줘.';
    console.log('[재고] Asking AI...');
    const answer = await askDianBot(prompt, context);
    console.log('[재고] AI response length:', answer.length);
    await sendSlackMessage(channel, answer);
  } catch (error) {
    console.error('[재고] Error:', error.message, error.stack);
    try {
      await sendSlackMessage(channel, '⚠️ 재고 조회 중 오류가 발생했습니다: ' + error.message);
    } catch (slackErr) {
      console.error('[재고] Failed to send error message to Slack:', slackErr.message);
    }
  }
}

async function handleOrder(query, channel) {
  try {
    let context = '';
    if (process.env.SHEET_ID_ORDERS) {
      console.log('[주문] Reading orders sheet...');
      context = await readAllSheetData(process.env.SHEET_ID_ORDERS);
      console.log('[주문] Sheet data length:', context.length);
    } else {
      console.warn('[주문] SHEET_ID_ORDERS not set');
    }
    const prompt = query
      ? `"${query}" 관련 주문 내역을 조회해줘.`
      : '최근 주문 현황을 요약해줘. 진행 중인 주문 위주로.';
    console.log('[주문] Asking AI...');
    const answer = await askDianBot(prompt, context);
    console.log('[주문] AI response length:', answer.length);
    await sendSlackMessage(channel, answer);
  } catch (error) {
    console.error('[주문] Error:', error.message, error.stack);
    try {
      await sendSlackMessage(channel, '⚠️ 주문 조회 중 오류가 발생했습니다: ' + error.message);
    } catch (slackErr) {
      console.error('[주문] Failed to send error message to Slack:', slackErr.message);
    }
  }
}

async function handleQuote(query, channel) {
  try {
    let context = '';
    if (process.env.SHEET_ID_PRICING) {
      console.log('[견적] Reading pricing sheet...');
      context = await readAllSheetData(process.env.SHEET_ID_PRICING);
      console.log('[견적] Pricing data length:', context.length);
    }
    if (process.env.SHEET_ID_INVENTORY) {
      console.log('[견적] Reading inventory sheet...');
      const invData = await readAllSheetData(process.env.SHEET_ID_INVENTORY);
      context += invData;
      console.log('[견적] Total context length:', context.length);
    }
    const prompt = query
      ? `다음 내용으로 견적을 산출해줘: ${query}. 원단명, 수량, 단가, 합계를 정리해서 보여줘.`
      : '견적 작성을 위해 어떤 정보가 필요한지 안내해줘. (예: /견적 A사 Boucle Ivory 50m)';
    console.log('[견적] Asking AI...');
    const answer = await askDianBot(prompt, context);
    console.log('[견적] AI response length:', answer.length);
    await sendSlackMessage(channel, answer);
  } catch (error) {
    console.error('[견적] Error:', error.message, error.stack);
    try {
      await sendSlackMessage(channel, '⚠️ 견적 산출 중 오류가 발생했습니다: ' + error.message);
    } catch (slackErr) {
      console.error('[견적] Failed to send error message to Slack:', slackErr.message);
    }
  }
}

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
          console.log(`[디안] Reading ${config.label} sheet...`);
          const data = await readAllSheetData(config.id);
          context += data;
        } catch (e) {
          console.error(`[디안] ${config.label} sheet read fail:`, e.message);
        }
      }
    }
    console.log('[디안] Total context length:', context.length);
    console.log('[디안] Asking AI...');
    const answer = await askDianBot(query || '안녕! 디안봇이 뭘 도와줄 수 있는지 알려줘.', context);
    console.log('[디안] AI response length:', answer.length);
    await sendSlackMessage(channel, answer);
  } catch (error) {
    console.error('[디안] Error:', error.message, error.stack);
    try {
      await sendSlackMessage(channel, '⚠️ 요청 처리 중 오류가 발생했습니다: ' + error.message);
    } catch (slackErr) {
      console.error('[디안] Failed to send error message to Slack:', slackErr.message);
    }
  }
}
