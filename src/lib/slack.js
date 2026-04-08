import crypto from 'crypto';

export function verifySlackRequest(signingSecret, headers, body) {
  const timestamp = headers['x-slack-request-timestamp'];
  const slackSignature = headers['x-slack-signature'];
  if (!timestamp || !slackSignature) return false;

  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp) < fiveMinutesAgo) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(sigBasestring, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(mySignature, 'utf8'),
    Buffer.from(slackSignature, 'utf8')
  );
}

export async function sendSlackMessage(channel, text, blocks = null) {
  const MAX_LENGTH = 3900;
  let safeText = text;
  if (text && text.length > MAX_LENGTH) {
    safeText = text.substring(0, MAX_LENGTH) + '\n\n...(메시지가 너무 길어 일부 생략되었습니다)';
  }

  const payload = { channel, text: safeText };
  if (blocks) payload.blocks = blocks;

  console.log('[Slack] Sending message to channel:', channel, '| text length:', safeText.length);

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!data.ok) {
    console.error('[Slack] API Error:', data.error, '| channel:', channel);
    throw new Error(`Slack API error: ${data.error}`);
  }

  console.log('[Slack] Message sent successfully, ts:', data.ts);
  return data;
}

/**
 * 질문과 답변을 함께 포맷하여 채널에 전송
 */
export async function sendBotReply(channel, question, answer) {
  const formatted = `> 💬 *${question}*\n\n${answer}`;
  return sendSlackMessage(channel, formatted);
}

/**
 * 채널의 최근 대화 히스토리 가져오기
 */
export async function getChannelHistory(channel, limit = 10) {
  const res = await fetch(`https://slack.com/api/conversations.history?channel=${channel}&limit=${limit}`, {
    headers: {
      'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
  });
  const data = await res.json();
  if (!data.ok) {
    console.error('[Slack] History Error:', data.error);
    return [];
  }
  return data.messages || [];
}

/**
 * 최근 대화에서 Q&A 쌍을 추출하여 대화 맥락 문자열로 변환
 */
export function buildConversationContext(messages) {
  const qaPairs = [];
  for (const msg of messages.reverse()) {
    if (msg.bot_id && msg.text) {
      const match = msg.text.match(/^>\s*💬\s*\*(.+?)\*\n\n([\s\S]+)$/);
      if (match) {
        qaPairs.push({ question: match[1], answer: match[2] });
      }
    }
  }
  if (qaPairs.length === 0) return '';
  const history = qaPairs
    .slice(-5)
    .map(qa => `사용자: ${qa.question}\n디안봇: ${qa.answer}`)
    .join('\n\n');
  return `[이전 대화]\n${history}\n\n`;
}

export function fabricInfoBlock(fabricName, details) {
  return [
    { type: 'header', text: { type: 'plain_text', text: `🧵 ${fabricName}`, emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: details } },
    { type: 'divider' }
  ];
}
