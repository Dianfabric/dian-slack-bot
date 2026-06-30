// QBH (千百汇) — 로그인→토큰→/Stock/MyCompanyList. 단위: 미터.
import { numFrom } from './units.js';

const SAAS = 'http://m.saas.buyizaixian.com';
const API = 'http://api.saas.buyizaixian.com';

async function login(env) {
  const r = await fetch(`${SAAS}/Login/Account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
    body: new URLSearchParams({ LoginId: env.QBH_LOGIN_ID, Password: env.QBH_LOGIN_PW }),
  });
  const setc = r.headers.getSetCookie();
  const tok = (setc.map((c) => c.split(';')[0]).find((c) => c.startsWith('mobile.token=')) || '')
    .split('=').slice(1).join('=');
  if (!tok) throw new Error('QBH 로그인 실패');
  return tok;
}

export async function check(terms = [], env = process.env) {
  if (!terms.length) return [];
  const tok = await login(env);
  const out = [];
  await Promise.all(terms.map(async (t) => {
    try {
      const url = `${API}/Stock/MyCompanyList?searchkey=${encodeURIComponent(t)}&token=${encodeURIComponent(tok)}&source=mobile`;
      const text = await (await fetch(url)).text();
      if (!text) return;
      const j = JSON.parse(text);
      for (const d of ((j.Data && j.Data.data) || [])) {
        out.push({ supplier: 'QBH', code: d.bianhao, meters: numFrom(d.Canshu11), maxRollM: numFrom(d.Canshu12), transitM: numFrom(d.Canshu13) });
      }
    } catch { /* 스킵 */ }
  }));
  return out;
}
