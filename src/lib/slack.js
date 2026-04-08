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

export function fabricInfoBlock(fabricName, details) {
  return [
    { type: 'header', text: { type: 'plain_text', text: `🧵 ${fabricName}`, emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: details } },
    { type: 'divider' }
  ];
}
