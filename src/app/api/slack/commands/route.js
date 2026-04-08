import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { verifySlackRequest, sendBotReply, sendSlackMessage, getChannelHistory, buildConversationContext } from '@/lib/slack';
import { getSheetTabs, readSheet } from '@/lib/sheets';
import { askDianBot } from '@/lib/ai';

export const maxDuration = 60;

/**
 * 스프레드시트의 모든 탭 데이터를 자동으로 읽어오기
 * 최근 6개 탭만 읽어서 타임아웃 방지
 */
async function readAllSheetData(spreadsheetId) {
  const tabs = await getSheetTabs(spreadsheetId);
  const recentTabs = tabs.slice(-6);
  console.log('[Sheets] Found tabs:', tabs.length, '| Reading recent:', recentTabs);
  let allData = '';
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
  allData = results.join('');
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
    const [sheetContext, history] = await Promise.all([
      process.env.SHEET_ID_INVENTORY
        ? readAllSheetData(process.env.SHEET_ID_INVENTORY).then(d => { console.log('[재고] Sheet data length:', d.length); return d; })
        : Promise.resolve(''),
      getChannelHistory(channel).then(msgs => buildConversationContext(msgs)),
    ]);
    const context = history + sheetContext;
    const prompt = query
      ? `"${query}" 원단의 재고 현황을 알려줘. 수량, 컬러, 위치 정보를 포함해서.`
      : '전체 재고 현황을 카테고리별로 요약해줘.';
    console.log('[재고] Asking AI...');
    const answer = await askDianBot(prompt, context);
    console.log('[재고] AI response length:', answer.length);
    await sendBotReply(channel, query || '전체 재고 조회', answer);
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
    const [sheetContext, history] = await Promise.all([
      process.env.SHEET_ID_ORDERS
        ? readAllSheetData(process.env.SHEET_ID_ORDERS).then(d => { console.log('[주문] Sheet data length:', d.length); return d; })
        : Promise.resolve(''),
      getChannelHistory(channel).then(msgs => buildConversationContext(msgs)),
    ]);
    const context = history + sheetContext;
    const prompt = query
      ? `"${query}" 관련 주문 내역을 조회해줘.`
      : '최근 주문 현황을 요약해줘. 진행 중인 주문 위주로.';
    console.log('[주문] Asking AI...');
    const answer = await askDianBot(prompt, context);
    console.log('[주문] AI response length:', answer.length);
    await sendBotReply(channel, query || '전체 주문 조회', answer);
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
    const [pricingData, inventoryData, history] = await Promise.all([
      process.env.SHEET_ID_PRICING
        ? readAllSheetData(process.env.SHEET_ID_PRICING).then(d => { console.log('[견적] Pricing data length:', d.length); return d; })
        : Promise.resolve(''),
      process.env.SHEET_ID_INVENTORY
        ? readAllSheetData(process.env.SHEET_ID_INVENTORY).then(d => { console.log('[견적] Inventory data length:', d.length); return d; })
        : Promise.resolve(''),
      getChannelHistory(channel).then(msgs => buildConversationContext(msgs)),
    ]);
    const context = history + pricingData + inventoryData;
    console.log('[견적] Total context length:', context.length);
    const prompt = query
      ? `다음 내용으로 견적을 산출해줘: ${query}. 원단명, 수량, 단가, 합계를 정리해서 보여줘.`
      : '견적 작성을 위해 어떤 정보가 필요한지 안내해줘. (예: /견적 A사 Boucle Ivory 50m)';
    console.log('[견적] Asking AI...');
    const answer = await askDianBot(prompt, context);
    console.log('[견적] AI response length:', answer.length);
    await sendBotReply(channel, query || '견적 안내', answer);
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
    const sheetIds = [
      process.env.SHEET_ID_INVENTORY,
      process.env.SHEET_ID_ORDERS,
      process.env.SHEET_ID_PRICING,
    ].filter(Boolean);

    const [history, ...sheetResults] = await Promise.all([
      getChannelHistory(channel).then(msgs => buildConversationContext(msgs)),
      ...sheetIds.map(id => readAllSheetData(id).catch(e => {
        console.error(`[디안] sheet read fail:`, e.message);
        return '';
      })),
    ]);

    const context = history + sheetResults.join('');
    console.log('[디안] Total context length:', context.length);
    console.log('[디안] Asking AI...');
    const answer = await askDianBot(query || '안녕! 디안봇이 뭘 도와줄 수 있는지 알려줘.', context);
    console.log('[디안] AI response length:', answer.length);
    await sendBotReply(channel, query || '안녕', answer);
  } catch (error) {
    console.error('[디안] Error:', error.message, error.stack);
    try {
      await sendSlackMessage(channel, '⚠️ 요청 처리 중 오류가 발생했습니다: ' + error.message);
    } catch (slackErr) {
      console.error('[디안] Failed to send error message to Slack:', slackErr.message);
    }
  }
}
