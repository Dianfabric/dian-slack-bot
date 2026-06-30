// Symphony mills (Love Home Fabrics) — ID/PW 완전 자동: authenticate→customers→colorstock. 단위: 미터.
const API = 'https://api.lovehomefabrics.com';
const BRAND = 'symphonymills';
const HUB = 'asia_pacific';

const baseH = (tok, cid) => ({
  'BRAND-CONTEXT': BRAND,
  'HUB-CONTEXT': HUB,
  'Accept-Language': 'en',
  ...(tok ? { 'LOVEHOMEFABRICS-ACCESSTOKEN': tok } : {}),
  ...(cid ? { 'CUSTOMER-CONTEXT': cid } : {}),
});

async function login(env) {
  const r = await fetch(`${API}/authenticate`, {
    method: 'POST',
    headers: { ...baseH(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.SYMPHONY_LOGIN_ID, password: env.SYMPHONY_LOGIN_PW }),
  });
  if (!r.ok) throw new Error(`Symphony 인증 실패 (${r.status})`);
  const { token } = await r.json();
  const cj = await (await fetch(`${API}/customers`, { headers: baseH(token) })).json();
  const cid = cj.customers?.[0]?.id;
  if (!token || !cid) throw new Error('Symphony 토큰/고객ID 실패');
  return { token, cid };
}

export async function check(slugs = [], env = process.env) {
  if (!slugs.length) return [];
  const { token, cid } = await login(env);
  const out = [];
  await Promise.all(slugs.map(async (s) => {
   try {
    const slug = String(s).toLowerCase().trim().replace(/\s+/g, '-');
    const r = await fetch(`${API}/articles/${encodeURIComponent(slug)}/colorstock`, { headers: baseH(token, cid) });
    if (!r.ok) return;
    const j = await r.json();
    for (const c of (j.colorStockLevels || [])) {
      out.push({
        supplier: 'SYMPHONY',
        code: `${slug}-${c.color?.name}`,
        meters: c.stockLevel?.totalStock?.value || 0,
        rolls: c.stockLevel?.rollsInStock,
        transitM: c.stockLevelInTransit?.totalStock?.value || 0,
        chinaM: c.stockLevelInChina?.totalStock?.value || 0,
      });
    }
   } catch { /* 이 제품 실패 시 스킵 */ }
  }));
  return out;
}
