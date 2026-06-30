// 학동역 점심봇 - 카카오 로컬 API로 사무실 700m 내 음식점 수집
// 카테고리 검색이 호출당 최대 45개라, 격자(grid)로 잘게 나눠 검색 후 병합/중복제거.
// 각 결과의 좌표로 사무실에서의 직선거리(haversine)를 직접 계산해 700m로 필터.
// 실행: KAKAO_REST_KEY=키 node scripts/collect-restaurants.mjs
// 출력: scripts/lunchbot_restaurants.csv  +  src/lib/lunch-restaurants.json (봇이 사용)

import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.KAKAO_REST_KEY;
const OFFICE = '서울 강남구 학동로 224'; // 삼환아르누보Ⅲ (디안 사무실)
const RADIUS = 700;                       // 도보 약 10분
const WALK_M_PER_MIN = 66;
const GRID_STEP = 200;                    // 격자 간격(m)
const TILE_RADIUS = 230;                  // 타일별 검색 반경(m, 약간 겹침)
// 점심에 안 어울리는 분류는 기본 풀에서 제외(베이커리/카페·술집)
const EXCLUDE_CATEGORIES = new Set(['간식', '술집']);

if (!KEY) { console.error('❌ KAKAO_REST_KEY 환경변수가 없습니다.'); process.exit(1); }
const headers = { Authorization: `KakaoAK ${KEY}` };

async function geocode(query) {
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`주소검색 실패 ${r.status}: ${await r.text()}`);
  const j = await r.json();
  if (!j.documents?.length) throw new Error('주소를 찾지 못했습니다.');
  return { x: Number(j.documents[0].x), y: Number(j.documents[0].y), addr: j.documents[0].address_name };
}

// 한 좌표 기준 음식점(FD6) 검색 (페이지네이션)
async function searchTile(x, y, radius) {
  const out = [];
  for (let page = 1; page <= 45; page++) {
    const url = `https://dapi.kakao.com/v2/local/search/category.json`
      + `?category_group_code=FD6&x=${x}&y=${y}&radius=${radius}&sort=distance&size=15&page=${page}`;
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`카테고리검색 실패 ${r.status}: ${await r.text()}`);
    const j = await r.json();
    out.push(...j.documents);
    if (j.meta.is_end) break;
  }
  return out;
}

// 위경도 → 미터(haversine)
function distMeters(lng1, lat1, lng2, lat2) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function bigCategory(catName) {
  const parts = (catName || '').split('>').map((s) => s.trim());
  return parts[1] || parts[0] || '';
}
function noteOf(catName) {
  const parts = (catName || '').split('>').map((s) => s.trim());
  const last = parts[parts.length - 1];
  return last && last !== '음식점' && last !== bigCategory(catName) ? last : '';
}

(async () => {
  console.log(`📍 사무실 좌표 변환: ${OFFICE}`);
  const { x: cx, y: cy, addr } = await geocode(OFFICE);
  console.log(`   → ${addr} (x=${cx}, y=${cy})`);

  // 격자 오프셋(m) → 경위도 변환
  const mPerLat = 111320;
  const mPerLng = 111320 * Math.cos((cy * Math.PI) / 180);
  const steps = [];
  for (let d = -600; d <= 600; d += GRID_STEP) steps.push(d);

  console.log(`🔍 격자 ${steps.length}x${steps.length}개 타일 검색 중...`);
  const byId = new Map();
  for (const dy of steps) {
    for (const dx of steps) {
      const tx = cx + dx / mPerLng;
      const ty = cy + dy / mPerLat;
      const docs = await searchTile(tx, ty, TILE_RADIUS);
      for (const p of docs) if (!byId.has(p.id)) byId.set(p.id, p);
    }
  }

  // 중심에서 직선거리 계산 + 700m 필터
  let rows = [...byId.values()]
    .map((p) => {
      const dist = distMeters(cx, cy, Number(p.x), Number(p.y));
      return { ...p, _dist: dist, _walk: Math.max(1, Math.round(dist / WALK_M_PER_MIN)) };
    })
    .filter((p) => p._dist <= RADIUS)
    .sort((a, b) => a._dist - b._dist);

  console.log(`✅ 700m 내 음식점 ${rows.length}곳 수집 (중복제거 후)`);

  // CSV (전체, 참고용)
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const head = ['가게명', '분류', '대표카테고리', '도보(분)', '거리(m)', '전화', '도로명주소', '지도링크'];
  const csv = [head.map(esc).join(',')];
  for (const p of rows) {
    csv.push([p.place_name, bigCategory(p.category_name), p.category_name, p._walk, p._dist,
      p.phone, p.road_address_name || p.address_name, p.place_url].map(esc).join(','));
  }
  fs.writeFileSync(path.join(import.meta.dirname, 'lunchbot_restaurants.csv'), '﻿' + csv.join('\r\n'), 'utf8');

  // 봇용 JSON (점심에 맞는 것만)
  const lunch = rows
    .filter((p) => !EXCLUDE_CATEGORIES.has(bigCategory(p.category_name)))
    .map((p) => ({
      name: p.place_name,
      category: bigCategory(p.category_name) || '음식점',
      note: noteOf(p.category_name),
      walk: p._walk,
      map: p.place_url,
    }));
  const jsonPath = path.join(import.meta.dirname, '..', 'src', 'lib', 'lunch-restaurants.json');
  fs.writeFileSync(jsonPath, JSON.stringify(lunch, null, 2), 'utf8');
  console.log(`🍱 봇 데이터 ${lunch.length}곳 → src/lib/lunch-restaurants.json (베이커리·술집 ${rows.length - lunch.length}곳 제외)`);

  // 분류 분포
  const byCat = {};
  for (const p of lunch) byCat[p.category] = (byCat[p.category] || 0) + 1;
  console.log('📊 점심 풀 분포:', Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}(${v})`).join(', '));
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
