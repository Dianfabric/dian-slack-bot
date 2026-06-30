// EK / EK UNIQUE — 로그인→/Product/List 시리즈 검색. 단위: 미터.
import { numFrom } from './units.js';

const BASE = 'http://en.online.ektextile.com';

async function login(env) {
  const r = await fetch(`${BASE}/Login/Index`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ LoginId: env.EK_LOGIN_ID, Password: env.EK_LOGIN_PW, ReturnUrl: '' }),
  });
  const cookies = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  if (!cookies) throw new Error('EK 로그인 실패');
  return cookies;
}

export async function check(terms = [], env = process.env) {
  if (!terms.length) return [];
  const cookie = await login(env);
  const out = [];
  await Promise.all(terms.map(async (t) => {
    const series = String(t).split('-')[0];
    const r = await fetch(`${BASE}/Product/List`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', Cookie: cookie },
      body: new URLSearchParams({ PageIndex: '1', PageSize: '200', Type: '', Series: '', Search: series }),
    });
    const j = await r.json();
    for (const d of (j.Data || [])) {
      out.push({ supplier: 'EK', code: d.Bianhao, meters: numFrom(d.Canshu11), maxRollM: numFrom(d.Canshu12), transitM: numFrom(d.Canshu13) });
    }
  }));
  return out;
}
