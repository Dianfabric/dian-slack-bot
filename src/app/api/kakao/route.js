import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { answer } from '@/lib/chat-core';
import { sendSlackMessage } from '@/lib/slack';

export const maxDuration = 60;

const MAX_LEN = 1000;
const USE_CALLBACK = process.env.KAKAO_USE_CALLBACK === 'true';
// ⚠️ 디안봇 AI는 내부용(대리점가·재고 컨텍스트) — 외부 고객 자동응답은 명시적으로 켤 때만.
const AI_REPLY = process.env.KAKAO_AI_REPLY === 'true';
// 카톡 문의 수신 시 슬랙 알림 채널 (전용 채널 없으면 디안봇 채널로)
const ALERT_CHANNEL = process.env.KAKAO_ALERT_CHANNEL_ID || process.env.DIANBOT_CHANNEL_ID || '';

const RECEIPT_TEXT = '문의가 접수되었습니다 🙂\n담당자가 확인 후 곧 답변드리겠습니다.\n(영업시간: 평일 09:00~18:00)';

// 문의 영구 기록 — [디안]재고현황 시트의 "카카오문의로그" 탭 (분석·매뉴얼화 재료)
async function logInquiry(userId, utterance, reply) {
  if (!process.env.SHEET_ID_ORDERS) return;
  const { appendToSheet } = await import('@/lib/sheets');
  const kst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  await appendToSheet(process.env.SHEET_ID_ORDERS, '카카오문의로그!A:D', [
    [kst, String(userId || '').slice(-6), utterance, reply || ''],
  ]).catch((e) => console.error('[Kakao] log fail:', e.message));
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'dian kakao skill webhook' });
}

function simpleText(text) {
  const safe = text && text.length > MAX_LEN
    ? text.slice(0, MAX_LEN) + '\n\n...(메시지가 너무 길어 일부 생략되었습니다)'
    : (text || '응답이 비어있습니다.');
  return {
    version: '2.0',
    template: { outputs: [{ simpleText: { text: safe } }] },
  };
}

export async function POST(request) {
  const body = await request.json();
  const utterance = body?.userRequest?.utterance?.trim() || '';
  const callbackUrl = body?.userRequest?.callbackUrl;
  const userId = body?.userRequest?.user?.id;

  console.log(`[Kakao] utterance: "${utterance}" user:${userId} callback:${!!callbackUrl}`);

  if (!utterance) {
    return NextResponse.json(simpleText('메시지를 입력해주세요.'));
  }

  // 고객 문의 → 슬랙 즉시 알림 (botUserKey는 익명키라 뒷자리만 동일고객 식별용으로 표기)
  if (ALERT_CHANNEL) {
    const tag = userId ? ` (고객 …${String(userId).slice(-6)})` : '';
    waitUntil(
      sendSlackMessage(ALERT_CHANNEL, `📩 *카카오톡 신규 문의*${tag}\n> ${utterance}`)
        .catch((e) => console.error('[Kakao] slack alert fail:', e.message)),
    );
  }

  // v1: 접수 안내만 응답 + 기록. AI 자동응답은 KAKAO_AI_REPLY=true 로 명시 활성화(내부정보 노출 방지).
  if (!AI_REPLY) {
    waitUntil(logInquiry(userId, utterance, '(접수안내)'));
    return NextResponse.json(simpleText(RECEIPT_TEXT));
  }

  if (USE_CALLBACK && callbackUrl) {
    waitUntil(handleViaCallback(utterance, callbackUrl, userId));
    return NextResponse.json({
      version: '2.0',
      useCallback: true,
      data: { text: '🤖 디안봇이 답변을 준비하고 있습니다...' },
    });
  }

  try {
    const { answer: text } = await withTimeout(
      answer({ userMessage: utterance, sheetMode: 'auto' }),
      4500,
    );
    waitUntil(logInquiry(userId, utterance, text));
    return NextResponse.json(simpleText(text));
  } catch (error) {
    console.error('[Kakao] Sync error:', error.message);
    return NextResponse.json(simpleText('답변이 늦어지고 있어요. 잠시 후 다시 시도해주세요.'));
  }
}

async function handleViaCallback(utterance, callbackUrl, userId) {
  try {
    const { answer: text } = await answer({ userMessage: utterance, sheetMode: 'auto' });
    await logInquiry(userId, utterance, text);
    await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(simpleText(text)),
    });
  } catch (error) {
    console.error('[Kakao] Callback error:', error.message, error.stack);
    await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(simpleText('처리 중 오류가 발생했습니다.')),
    }).catch(() => {});
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}
