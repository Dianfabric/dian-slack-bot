import { getSheetTabs, readSheet } from './sheets';

const SHEET_KEYWORDS = {
  inventory: ['재고', '수량', '입고', '남은', '있어', '몇'],
  orders: ['주문', '견적', '오더', '발주'],
  pricing: ['단가', '가격', '얼마', '비용', '원'],
};

const SHEET_ENV = {
  inventory: 'SHEET_ID_INVENTORY',
  orders: 'SHEET_ID_ORDERS',
  pricing: 'SHEET_ID_PRICING',
};

export async function readAllSheetData(spreadsheetId) {
  const tabs = await getSheetTabs(spreadsheetId);
  const recentTabs = tabs.slice(-6);
  console.log('[Sheets] Found tabs:', tabs.length, '| Reading recent:', recentTabs);
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
  return results.join('');
}

export function selectSheetKinds(userMessage, mode = 'auto') {
  if (mode === 'all') return ['inventory', 'orders', 'pricing'];
  if (Array.isArray(mode)) return mode;
  return Object.entries(SHEET_KEYWORDS)
    .filter(([, kws]) => kws.some(kw => userMessage.includes(kw)))
    .map(([kind]) => kind);
}

export async function buildSheetContext(userMessage, mode = 'auto') {
  const kinds = selectSheetKinds(userMessage, mode);
  const ids = kinds
    .map(k => ({ kind: k, id: process.env[SHEET_ENV[k]] }))
    .filter(x => x.id);

  if (ids.length === 0) return '';

  const results = await Promise.all(
    ids.map(({ kind, id }) =>
      readAllSheetData(id).catch(e => {
        console.error(`[SheetContext] ${kind} read fail:`, e.message);
        return '';
      })
    )
  );
  return results.join('');
}
