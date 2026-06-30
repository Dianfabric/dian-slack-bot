// 학동역(사무실: 학동로 224 삼환아르누보Ⅲ) 도보권 점심 후보 — 무작위 추천 로직
// 데이터(src/lib/lunch-restaurants.json)는 카카오 로컬 API 수집 결과.
//   재수집/갱신: KAKAO_REST_KEY=키 node scripts/collect-restaurants.mjs
// 지도링크는 각 가게의 카카오 place URL.

import RAW from './lunch-restaurants.json';

export const RESTAURANTS = RAW;

// 사용자가 /점심 뒤에 입력하는 키워드 → 실제 분류 매핑
const CATEGORY_ALIASES = {
  한식: ['한식'], 중식: ['중식'], 일식: ['일식'], 양식: ['양식'],
  분식: ['분식'], 치킨: ['치킨'], 샐러드: ['샐러드'], 도시락: ['도시락'],
  뷔페: ['뷔페'], 샤브샤브: ['샤브샤브'], 샤브: ['샤브샤브'],
  퓨전: ['퓨전요리'], 아시아: ['아시아음식'], 패스트푸드: ['패스트푸드'],
  버거: ['패스트푸드'], 햄버거: ['패스트푸드'],
  고기: ['한식'], 면: ['한식', '일식', '중식'], 라멘: ['일식'], 피자: ['양식'],
};

/**
 * 점심 한 곳 무작위 추천.
 * @param {string} filterText - /점심 뒤 입력 텍스트(분류·키워드). 없으면 전체.
 * @returns {{pick: object, pool: object[], filtered: boolean}}
 */
export function pickLunch(filterText = '') {
  const key = (filterText || '').trim();
  let pool = RESTAURANTS;
  let filtered = false;

  if (key) {
    const wanted = CATEGORY_ALIASES[key] || [key];
    const matched = RESTAURANTS.filter(
      (r) => wanted.includes(r.category) || r.name.includes(key) || (r.note && r.note.includes(key))
    );
    if (matched.length > 0) {
      pool = matched;
      filtered = true;
    }
  }

  const pick = pool[Math.floor(Math.random() * pool.length)];
  return { pick, pool, filtered };
}
