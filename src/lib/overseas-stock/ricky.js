// RICKY (祥睿) — 무인증 API (companyId=3450). 단위: 미터.
import { numFrom } from './units.js';

const BASE = 'http://queryapi.buyizaixian.com';

export async function check(terms = []) {
  const out = [];
  await Promise.all(terms.map(async (t) => {
    try {
      const url = `${BASE}/fabrics/list?companyId=3450&searchkey=${encodeURIComponent(t)}&openid=dian`;
      const text = await (await fetch(url)).text();
      if (!text) return;
      const j = JSON.parse(text);
      for (const d of (j.data || [])) {
        out.push({ supplier: 'RICKY', code: d.bianhao, meters: numFrom(d.Zongkucun), maxRollM: numFrom(d.ZuidaJuan), transitM: numFrom(d.CanshuA) });
      }
    } catch { /* 스킵 */ }
  }));
  return out;
}
