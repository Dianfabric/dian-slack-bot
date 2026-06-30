// 해외 4개 공급처 동시(병렬) 재고 조회 + 포맷
import * as ricky from './ricky.js';
import * as ek from './ek.js';
import * as qbh from './qbh.js';
import * as symphony from './symphony.js';
import { toY, r1 } from './units.js';

const NAMES = ['RICKY', 'EK', 'QBH', 'SYMPHONY'];

// grouped = { RICKY:[코드], EK:[시리즈], QBH:[코드], SYMPHONY:[slug] }
export async function checkAll(grouped, env = process.env) {
  const settled = await Promise.allSettled([
    ricky.check(grouped.RICKY || []),
    ek.check(grouped.EK || [], env),
    qbh.check(grouped.QBH || [], env),
    symphony.check(grouped.SYMPHONY || [], env),
  ]);
  const items = [];
  const errors = [];
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') items.push(...s.value);
    else errors.push(`${NAMES[i]}: ${s.reason?.message || s.reason}`);
  });
  return { items, errors };
}

// 한 줄 포맷: 품명-색상  XXXY(XXXM) · 최대롤 · 입고중 · (Symphony 롤·중국)
export function fmtItem(it) {
  let s = `${it.code}: ${toY(it.meters)}Y(${r1(it.meters)}M)`;
  if (it.rolls != null) s += ` ·${it.rolls}롤`;
  if (it.maxRollM) s += ` ·최대롤 ${toY(it.maxRollM)}Y`;
  if (it.transitM) s += ` ·입고중 ${toY(it.transitM)}Y`;
  if (it.chinaM) s += ` ·중국 ${toY(it.chinaM)}Y`;
  if (toY(it.meters) === 0 && !it.transitM) s += ' ⛔품절';
  return s;
}

export { NAMES };
