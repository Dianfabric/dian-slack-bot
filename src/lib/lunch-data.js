// 학동역(사무실: 학동로 224 삼환아르누보Ⅲ) 도보권 점심 후보
// ⚠️ 시작용 검증 데이터 — 카카오 로컬 API 수집(scripts/collect-restaurants.mjs) 완료 후
//    구글시트 기반으로 교체 예정. 지금은 코드 내장 리스트로 동작.
// 지도링크는 카카오맵 검색 URL이라 항상 안전하게 열립니다.

const mapLink = (name) => `https://map.kakao.com/?q=${encodeURIComponent(name)}`;

export const RESTAURANTS = [
  { name: '진미평양냉면', category: '한식', note: '평양냉면' },
  { name: '홍명',         category: '중식', note: '짜장면·중화요리' },
  { name: '류몽민',       category: '한식', note: '닭갈비' },
  { name: '토가라시',     category: '일식', note: '라멘 (점심 웨이팅)' },
  { name: '히로야',       category: '일식', note: '라멘 (혼밥 가능)' },
  { name: '논현삼겹',     category: '한식', note: '고기구이 (점심 오픈런)' },
  { name: '나베류',       category: '일식', note: '샤브샤브·밀푀유나베' },
].map((r) => ({ ...r, map: mapLink(r.name) }));

// 분류 키워드 → 실제 카테고리 매핑 (사용자가 /점심 한식 처럼 입력)
const CATEGORY_ALIASES = {
  한식: ['한식'], 중식: ['중식'], 일식: ['일식'], 양식: ['양식'],
  분식: ['분식'], 면: ['한식', '일식'], 고기: ['한식'], 라멘: ['일식'],
};

/**
 * 점심 한 곳 무작위 추천.
 * @param {string} filterText - 사용자가 /점심 뒤에 입력한 텍스트(분류 등). 없으면 전체.
 * @returns {{pick: object, pool: object[], filtered: boolean}}
 */
export function pickLunch(filterText = '') {
  const key = (filterText || '').trim();
  let pool = RESTAURANTS;
  let filtered = false;

  if (key) {
    const wanted = CATEGORY_ALIASES[key] || [key];
    const matched = RESTAURANTS.filter(
      (r) => wanted.includes(r.category) || r.name.includes(key) || r.note.includes(key)
    );
    if (matched.length > 0) {
      pool = matched;
      filtered = true;
    }
  }

  const pick = pool[Math.floor(Math.random() * pool.length)];
  return { pick, pool, filtered };
}
