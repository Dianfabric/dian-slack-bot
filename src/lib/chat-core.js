import { askDianBot } from './ai';
import { buildSheetContext } from './sheet-context';
import { buildStockContext } from './stock-context';

/**
 * 플랫폼(슬랙/카톡/웹) 무관 핵심 응답 함수.
 * 어댑터가 메시지와 옵션만 넘기면 시트 조회 + AI 호출까지 처리.
 *
 * @param {Object} params
 * @param {string} params.userMessage - 사용자 입력
 * @param {string} [params.history=''] - 이전 대화 컨텍스트 (어댑터가 만든 문자열)
 * @param {'auto'|'all'|string[]} [params.sheetMode='auto'] - 어떤 시트를 참조할지
 * @param {string} [params.fallbackPrompt] - userMessage가 비었을 때 사용할 기본 프롬프트
 * @returns {Promise<{answer: string, contextLength: number}>}
 */
export async function answer({ userMessage, history = '', sheetMode = 'auto', fallbackPrompt }) {
  const prompt = userMessage || fallbackPrompt || '';
  if (!prompt) return { answer: '', contextLength: 0 };

  const [sheetContext, stockContext] = await Promise.all([
    buildSheetContext(prompt, sheetMode),
    buildStockContext(prompt).catch((e) => { console.error('[Core] overseas stock fail:', e.message); return ''; }),
  ]);
  // 해외 재고를 찾았으면 무거운 시트 덤프 생략(토큰/비용 절감). 재고답변은 실시간 API로 충분.
  const context = history + stockContext + (stockContext ? '' : sheetContext);

  console.log('[Core] prompt:', prompt.slice(0, 80), '| context length:', context.length);
  const text = await askDianBot(prompt, context);
  console.log('[Core] AI response length:', text.length);

  return { answer: text, contextLength: context.length };
}
