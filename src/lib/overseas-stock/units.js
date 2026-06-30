// 단위 변환·파싱. 중국/Symphony 사이트는 미터(M), 디안은 야드(Y) 판매. 1 m = 1.0936133 yd
export const M_TO_Y = 1.0936133;
export const toY = (m) => Math.round((Number(m) || 0) * M_TO_Y * 10) / 10;
export const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
export const numFrom = (s) => {
  const m = String(s ?? '').match(/-?[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
};
