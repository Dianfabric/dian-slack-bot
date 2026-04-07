import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { verifySlackRequest, sendSlackMessage } from '@/lib/slack';
import { getSheetTabs, readSheet } from '@/lib/sheets';
import { askDianBot } from '@/lib/ai';

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
                        console.error(`tab "${tab}" read fail:`, e.message);
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
      const params = new URLSearchParams(body);
      const command = params.get('command');
      const text = params.get('text') || '';
      const channelId = params.get('channel_id');
      const userId = params.get('user_id');

  switch (command) {
      case '/재고':
                waitUntil(handleInventory(text, channelId));
                return NextResponse.json({ response_type: 'ephemeral', text: '재고를 조회하고 있습니다...' });
      case '/주문':
                waitUntil(handleOrder(text, channelId));
                return NextResponse.json({ response_type: 'ephemeral', text: '주문 내역을 확인하고 있습니다...' });
      case '/견적':
                waitUntil(handleQuote(text, channelId));
                return NextResponse.json({ response_type: 'ephemeral', text: '견적을 산출하고 있습니다...' });
      case '/디안':
                waitUntil(handleGeneral(text, channelId));
                return NextResponse.json({ response_type: 'ephemeral', text: '디안봇이 답변을 준비하고 있습니다...' });
      default:
                return NextResponse.json({ response_type: 'ephemeral', text: `알 수 없는 명령어입니다: ${command}` });
  }
}

async function handleInventory(query, channel) {
      try {
              let context = '';
              if (process.env.SHEET_ID_INVENTORY) {
                        context = await readAllSheetData(process.env.SHEET_ID_INVENTORY);
              }
              const prompt = query
                ? `"${query}" 원단의 재고 현황을 알려줘. 수량, 컬러, 위치 정보를 포함해서.`
                        : '전체 재고 현황을 카테고리별로 요약해줘.';
              const answer = await askDianBot(prompt, context);
              await sendSlackMessage(channel, answer);
      } catch (error) {
              console.error('재고 조회 오류:', error);
              await sendSlackMessage(channel, '재고 조회 중 오류: ' + error.message);
      }
}

async function handleOrder(query, channel) {
      try {
              let context = '';
              if (process.env.SHEET_ID_ORDERS) {
                        context = await readAllSheetData(process.env.SHEET_ID_ORDERS);
              }
              const prompt = query
                ? `"${query}" 관련 주문 내역을 조회해줘.`
                        : '최근 주문 현황을 요약해줘. 진행 중인 주문 위주로.';
              const answer = await askDianBot(prompt, context);
              await sendSlackMessage(channel, answer);
      } catch (error) {
              console.error('주문 조회 오류:', error);
              await sendSlackMessage(channel, '주문 조회 중 오류: ' + error.message);
      }
}

async function handleQuote(query, channel) {
      try {
              let context = '';
              if (process.env.SHEET_ID_PRICING) {
                        context = await readAllSheetData(process.env.SHEET_ID_PRICING);
              }
              if (process.env.SHEET_ID_INVENTORY) {
                        context += await readAllSheetData(process.env.SHEET_ID_INVENTORY);
              }
              const prompt = query
                ? `다음 내용으로 견적을 산출해줘: ${query}. 원단명, 수량, 단가, 합계를 정리해서 보여줘.`
                        : '견적 작성을 위해 어떤 정보가 필요한지 안내해줘. (예: /견적 A사 Boucle Ivory 50m)';
              const answer = await askDianBot(prompt, context);
              await sendSlackMessage(channel, answer);
      } catch (error) {
              console.error('견적 산출 오류:', error);
              await sendSlackMessage(channel, '견적 산출 중 오류: ' + error.message);
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
                                                  context += await readAllSheetData(config.id);
                                    } catch (e) {}
                        }
              }
              const answer = await askDianBot(query || '안녕! 디안봇이 뭘 도와줄 수 있는지 알려줘.', context);
              await sendSlackMessage(channel, answer);
      } catch (error) {
              console.error('일반 질문 오류:', error);
              await sendSlackMessage(channel, '요청 처리 중 오류: ' + error.message);
      }
}
