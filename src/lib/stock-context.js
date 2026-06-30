// 해외 공급처 실시간 재고 컨텍스트 빌더 (sheet-context.js 와 같은 패턴)
// 1) 재고 질문인지 감지 → 2) 원단 토큰 추출 → 3) 공급처 라우팅(Supabase + Symphony 목록)
// → 4) 4곳 병렬 조회 → 5) 미터→야드 변환해 컨텍스트 문자열 반환 (AI가 사용)
import { checkAll, fmtItem, NAMES } from './overseas-stock/index.js';

const STOCK_KW = ['재고', '몇 야드', '몇야드', '몇 미터', '몇 롤', '몇롤', '입고', '남은', '얼마나', '있어', '있나', 'stock'];

// Symphony 제품 목록 — 권위 출처는 2025 TMS. 우선 알려진 목록(우리가 확인한 것). TMS에서 동기화해 확장.
const SYMPHONY_PRODUCTS = new Set([
  'arctic', 'cannes', 'danube', 'loki', 'palermo', 'tivoli', 'tivoli-performance',
  'yarra', 'zeus', 'zeus-performance', 'alpine', 'alpine-performance', 'amber', 'ammolite', 'andes',
]);

// 원단 코드/제품명 후보 추출 (영문+숫자, 3자 이상). 예: LD1906P, KOSHER, 83100, Arctic, tivoli-performance
function extractTokens(msg) {
  const m = msg.match(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g) || [];
  return [...new Set(m.filter((t) => t.length >= 3 && /[A-Za-z0-9]/.test(t) && !/^\d{1,2}$/.test(t)))];
}

async function lookupSupplier(token) {
  try {
    const u = `${process.env.SUPABASE_URL}/rest/v1/fabrics?select=name,supplier&name=ilike.${encodeURIComponent(token + '%')}&limit=5`;
    const r = await fetch(u, { headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}` } });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows.find((x) => x.supplier)?.supplier || null;
  } catch {
    return null;
  }
}

export async function buildStockContext(userMessage = '') {
  const msg = String(userMessage);
  if (!STOCK_KW.some((k) => msg.toLowerCase().includes(k.toLowerCase()))) return '';
  const tokens = extractTokens(msg);
  if (!tokens.length) return '';

  const grouped = { RICKY: [], EK: [], QBH: [], SYMPHONY: [] };
  const noApi = [];
  await Promise.all(tokens.map(async (t) => {
    const low = t.toLowerCase();
    if (SYMPHONY_PRODUCTS.has(low)) { grouped.SYMPHONY.push(low); return; }
    const sup = await lookupSupplier(t);
    if (!sup) return;
    const S = sup.toUpperCase();
    if (S === 'EK' || S === 'EK UNIQUE') grouped.EK.push(t);
    else if (S === 'RICKY') grouped.RICKY.push(t);
    else if (S === 'QBH') grouped.QBH.push(t);
    else noApi.push(`${t}=${sup}`);
  }));

  const hasAny = Object.values(grouped).some((a) => a.length);
  if (!hasAny && !noApi.length) return '';

  let ctx = '';
  if (hasAny) {
    const { items, errors } = await checkAll(grouped);
    if (items.length) {
      ctx += '\n[해외 공급처 실시간 재고] (길이는 야드Y 기준, 괄호 안은 원본 미터M)\n';
      for (const sup of NAMES) {
        const g = items.filter((it) => it.supplier === sup);
        if (!g.length) continue;
        ctx += `### ${sup}\n` + g.map(fmtItem).join('\n') + '\n';
      }
      ctx += '※ 재고 안내는 야드(Y) 기준으로. 품절(0)·입고중 명확히. 미터(M)는 참고용.\n';
      if (errors.length) ctx += '(일부 조회 실패: ' + errors.join(', ') + ')\n';
    }
  }
  if (noApi.length) ctx += `\n[참고] 실시간 재고 API 미지원 공급처(국내재고/수동 확인 필요): ${noApi.join(', ')}\n`;
  return ctx;
}
