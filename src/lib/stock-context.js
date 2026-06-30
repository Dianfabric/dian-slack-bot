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
  // 색상번호(#01·#900) 제거 — 검색 대상은 원단코드뿐. 안 그러면 "900"이 엉뚱한 코드에 매칭됨.
  const cleaned = String(msg).replace(/#\s*\w+/g, ' ');
  const m = cleaned.match(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g) || [];
  return [...new Set(m.filter((t) => t.length >= 3 && !/^\d{1,2}$/.test(t)))];
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

// Symphony는 Supabase에 없음(영문 제품명 별도체계) → Supabase 미스 + 영문단어면 Symphony 후보로 시도.
// Symphony API가 없는 slug는 404로 자동 무시되므로, 목록 하드코딩 없이 전 제품 자동 인식.
const SYMPHONY_STOPWORDS = new Set(['stock', 'fabric', 'color', 'colour', 'yard', 'yards', 'meter', 'meters', 'roll', 'rolls', 'check', 'supplier', 'available', 'item', 'code', 'price', 'order', 'the', 'and', 'for']);
function maybeSymphony(low) {
  return /^[a-z][a-z]{2,24}(-[a-z]+)?$/.test(low) && !SYMPHONY_STOPWORDS.has(low);
}

export async function buildStockContext(userMessage = '') {
  const msg = String(userMessage);
  if (!STOCK_KW.some((k) => msg.toLowerCase().includes(k.toLowerCase()))) return '';
  const tokens = extractTokens(msg);
  if (!tokens.length) return '';

  // Supabase 공급처 라벨은 충돌·오등록이 많아(BOHO가 EK로 잘못 등록 등) 라우팅에 신뢰 불가.
  // → 모든 원단코드를 4곳에 동시 조회. 실제 재고 있는 곳이 정답. 여러 곳이면 AI가 브랜드 구분(안전).
  const grouped = { RICKY: [], EK: [], QBH: [], SYMPHONY: [] };
  for (const t of tokens) {
    const low = t.toLowerCase();
    if (SYMPHONY_STOPWORDS.has(low)) continue; // 노이즈 영단어 제외
    grouped.RICKY.push(t);
    grouped.EK.push(t);
    grouped.QBH.push(t);
    grouped.SYMPHONY.push(low);
  }

  const hasAny = Object.values(grouped).some((a) => a.length);
  if (!hasAny) return '';

  const { items, errors } = await checkAll(grouped);
  if (!items.length) {
    return errors.length ? `\n[해외 재고조회 일부 실패: ${errors.join(', ')}]\n` : '';
  }
  let ctx = '\n[해외 공급처 실시간 재고] (길이는 야드Y 기준, 괄호 안은 원본 미터M)\n';
  const found = NAMES.filter((sup) => items.some((it) => it.supplier === sup));
  for (const sup of found) {
    ctx += `### ${sup}\n` + items.filter((it) => it.supplier === sup).map(fmtItem).join('\n') + '\n';
  }
  ctx += '※ 재고 안내는 야드(Y) 기준. 품절(0)·입고중 명확히. 미터(M)는 참고용.\n';
  if (found.length > 1) ctx += '⚠️ 같은 원단명이 여러 공급처에 있음 → 어느 브랜드인지 사용자에게 확인할 것(단가·원단 다름).\n';
  if (errors.length) ctx += `(일부 공급처 조회 실패: ${errors.join(', ')})\n`;
  return ctx;
}
