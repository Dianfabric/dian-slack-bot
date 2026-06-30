// RICKY (祥睿) — 무인증 API (companyId=3450). 단위: 미터.
import { numFrom } from './units.js';

const BASE = 'http://queryapi.buyizaixian.com';

export async function check(terms = []) {
  const out = [];
  await Promise.all(terms.map(async (t) => {
    const url = `${BASE}/fabrics/list?companyId=3450&searchkey=${encodeURIComponent(t)}&openid=dian`;
    const r = await fetch(url);
    const j = await r.json();
    for (const d of (j.data || [])) {
      out.push({ supplier: 'RICKY', code: d.bianhao, meters: numFrom(d.Zongkucun), maxRollM: numFrom(d.ZuidaJuan), transitM: numFrom(d.CanshuA) });
    }
  }));
  return out;
}
