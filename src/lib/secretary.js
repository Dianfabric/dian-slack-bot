import Anthropic from '@anthropic-ai/sdk';
import { getVaultFile, putVaultFile, appendVaultFile, listVaultDir, kstToday, kstTime } from './vault';
import { getChannelHistory, sendSlackMessage } from './slack';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 유대현 섹션 경로 (세컨드 브레인 볼트 내)
const BASE = 'wiki/일지/유대현';

const SECRETARY_SYSTEM = `너는 디안(DIAN) 유대현 과장의 개인 업무 비서 봇이야.
유대현 과장이 슬랙 DM으로 보내는 내용을 Obsidian 볼트(회사 세컨드 브레인)의 "유대현 섹션"에 정리하고, 질문에 답한다.

## 볼트 구조 (유대현 섹션 = ${BASE}/)
- \`${BASE}/YYYY-MM-DD.md\` — 일일 업무일지 (시간순 한 줄씩 누적)
- \`${BASE}/이슈/{이슈명}.md\` — 진행 상태가 있는 이슈 노트
- \`${BASE}/할일.md\` — 체크박스 할일 목록

## 메시지 분류 → actions
1. **업무 기록** ("A거래처 미팅함", "샘플북 3개 대여 나감") → \`log\` 액션. 간결한 한 줄로 정리. 거래처·원단·시스템 이름은 [[위키링크]]로.
2. **이슈** (문제 발생, 클레임, 추적 필요한 건) → \`issue\` 액션 + \`log\` 액션 둘 다. 기존 이슈 목록에 같은 건이 있으면 그 파일명 그대로 사용해 내용을 갱신(기존 내용 유지 + 새 경과 추가), 없으면 새로 생성.
   이슈 파일 형식:
   ---
   type: 이슈
   visibility: internal
   status: 진행중 | 완료 | 보류
   created: YYYY-MM-DD
   updated: YYYY-MM-DD
   ---
   # 이슈명
   ## 내용
   ## 경과
   - YYYY-MM-DD 경과 한 줄
3. **할일** ("~해야 해", "내일 ~하기", "~ 완료했어") → \`todo\` 액션으로 할일.md 전체를 갱신 (- [ ] / - [x] 체크박스, 완료된 건 체크 처리).
4. **질문/조회** ("어제 뭐 했지?", "그 이슈 어떻게 됐어?") → 액션 없이 제공된 컨텍스트 기반으로 reply에 답변.
5. 하나의 메시지에 여러 성격이 섞이면 액션을 복수로.

## 규칙
- reply는 슬랙 DM 답장: 한국어, 간결, 비서답게 확인·요약 위주. 기록했으면 뭘 어디에 기록했는지 짧게 확인해줘.
- 날짜 해석: 오늘 날짜는 컨텍스트에 제공됨. "어제", "내일" 등은 그 기준으로 계산.
- log 텍스트에 시간(HH:MM)은 붙이지 마 (시스템이 자동으로 붙임).
- 이슈 파일명(file)은 한글 OK, 공백은 -로, .md 제외한 이름만.
- 원단명이 언급되면 브랜드가 불명확할 때 단정하지 말고 reply에서 브랜드를 되물어.
- 확실하지 않은 내용을 지어내지 마. 컨텍스트에 없으면 없다고 답해.`;

const SECRETARY_TOOL = {
  name: 'secretary_output',
  description: '비서 봇의 답장과 볼트 기록 액션',
  input_schema: {
    type: 'object',
    properties: {
      reply: { type: 'string', description: '슬랙 DM 답장 (한국어)' },
      actions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['log', 'issue', 'todo'] },
            text: { type: 'string', description: 'log: 일지에 추가할 한 줄' },
            file: { type: 'string', description: 'issue: 이슈 파일명 (.md 제외)' },
            content: { type: 'string', description: 'issue/todo: 파일 전체 마크다운' },
          },
          required: ['type'],
        },
      },
    },
    required: ['reply', 'actions'],
  },
};

/** 유대현 섹션에서 비서 컨텍스트 수집 */
async function buildSecretaryContext(channel, eventTs) {
  const today = kstToday();
  const yesterday = kstToday(-1);

  const [todayNote, yesterdayNote, todo, issueFiles, history] = await Promise.all([
    getVaultFile(`${BASE}/${today}.md`).catch(() => null),
    getVaultFile(`${BASE}/${yesterday}.md`).catch(() => null),
    getVaultFile(`${BASE}/할일.md`).catch(() => null),
    listVaultDir(`${BASE}/이슈`).catch(() => []),
    getChannelHistory(channel, 12).catch(() => []),
  ]);

  // 이슈 내용 (최대 8개)
  const issues = await Promise.all(
    issueFiles.slice(0, 8).map(f =>
      getVaultFile(f.path).then(r => ({ name: f.name, content: r?.content || '' })).catch(() => null)
    )
  );

  // DM 대화 히스토리 (현재 메시지 제외, 오래된 순)
  const transcript = history
    .filter(m => m.ts !== eventTs && m.text)
    .reverse()
    .slice(-10)
    .map(m => `${m.bot_id ? '비서봇' : '유대현'}: ${m.text}`)
    .join('\n');

  let ctx = `[오늘 날짜(KST)] ${today} / 현재 시각 ${kstTime()}\n\n`;
  if (transcript) ctx += `[최근 DM 대화]\n${transcript}\n\n`;
  ctx += `[오늘 일지 ${today}.md]\n${todayNote?.content || '(아직 없음)'}\n\n`;
  ctx += `[어제 일지 ${yesterday}.md]\n${yesterdayNote?.content || '(없음)'}\n\n`;
  ctx += `[할일.md]\n${todo?.content || '(아직 없음)'}\n\n`;
  ctx += `[이슈 목록]\n${issueFiles.map(f => `- ${f.name}`).join('\n') || '(없음)'}\n\n`;
  for (const issue of issues.filter(Boolean)) {
    ctx += `[이슈: ${issue.name}]\n${issue.content}\n\n`;
  }
  return { ctx, today };
}

/** 액션 실행 → 볼트 커밋 */
async function executeActions(actions, today) {
  const done = [];
  for (const action of actions) {
    try {
      if (action.type === 'log' && action.text) {
        const initial = `---\ntype: 일지\nvisibility: internal\ncreated: ${today}\nupdated: ${today}\n---\n\n# ${today} 유대현 업무일지\n\n`;
        await appendVaultFile(
          `${BASE}/${today}.md`,
          `- ${kstTime()} ${action.text}`,
          `일지: ${today} 기록 추가 (비서봇)`,
          initial
        );
        done.push('log');
      } else if (action.type === 'issue' && action.file && action.content) {
        const file = action.file.replace(/\.md$/, '').replace(/[\\/:*?"<>|]/g, '-');
        const path = `${BASE}/이슈/${file}.md`;
        const existing = await getVaultFile(path);
        await putVaultFile(path, action.content, `이슈: ${file} ${existing ? '갱신' : '생성'} (비서봇)`, existing?.sha);
        done.push(`issue:${file}`);
      } else if (action.type === 'todo' && action.content) {
        const path = `${BASE}/할일.md`;
        const existing = await getVaultFile(path);
        await putVaultFile(path, action.content, `할일 갱신 (비서봇)`, existing?.sha);
        done.push('todo');
      }
    } catch (e) {
      console.error('[Secretary] action fail:', action.type, e.message);
      done.push(`${action.type}:FAIL`);
    }
  }
  return done;
}

/** DM 메시지 처리 엔트리포인트 */
export async function handleSecretaryDM(event) {
  const userMessage = (event.text || '').trim();
  if (!userMessage) return;

  console.log(`[Secretary] DM from ${event.user}: "${userMessage}"`);

  try {
    const { ctx, today } = await buildSecretaryContext(event.channel, event.ts);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      system: SECRETARY_SYSTEM,
      tools: [SECRETARY_TOOL],
      tool_choice: { type: 'tool', name: 'secretary_output' },
      messages: [{ role: 'user', content: `${ctx}[유대현 과장의 DM]\n${userMessage}` }],
    });

    const toolUse = response.content.find(b => b.type === 'tool_use');
    if (!toolUse) throw new Error('no tool_use in response');
    const { reply, actions = [] } = toolUse.input;

    const done = await executeActions(actions, today);
    console.log('[Secretary] actions done:', done.join(', ') || '(none)');

    const failed = done.filter(d => d.endsWith(':FAIL'));
    let finalReply = reply;
    if (failed.length > 0) {
      finalReply += `\n\n⚠️ 일부 기록 실패 (${failed.join(', ')}) — 다시 시도해 주세요.`;
    }
    await sendSlackMessage(event.channel, finalReply);
  } catch (error) {
    console.error('[Secretary] Error:', error.message, error.stack);
    await sendSlackMessage(event.channel, '⚠️ 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
  }
}
