#!/usr/bin/env node
/**
 * OpenStreetMap(Overpass API) → data/raw/osm.json
 *
 * OSM 의 `amenity=toilets` 는 좌표가 데이터에 들어 있어 지오코딩이 필요 없다.
 * 그래서 API 키도, 포털 로그인도 없이 지금 바로 전국 데이터를 받을 수 있다.
 * (유럽의 화장실 앱들이 콜드스타트 데이터로 쓰는 그 소스다.)
 *
 * 대신 이름·주소·개방시간 결측이 많아, 표준데이터 CSV 가 준비되면
 * build-dataset 병합 단계에서 신뢰도 높은 소스가 우선한다.
 *
 * 사용법:
 *   node scripts/sources/osm.mjs                    # 전국
 *   node scripts/sources/osm.mjs --bbox 37,126,38,128
 *   node scripts/sources/osm.mjs --refresh          # 타일 캐시 무시하고 재수집
 *
 * 넓은 영역은 Overpass 가 타임아웃 나므로 큰 타일로 시작해서 실패하면
 * 4등분으로 쪼개 재시도한다(적응형 분할). 타일 결과는 캐시되어 이어받는다.
 */
import fs from "node:fs";
import path from "node:path";
import {
  RAW_DIR,
  argOf,
  isInKorea,
  normalizeOpenHours,
  sleep,
  writeRaw,
} from "../lib/dataset.mjs";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
];

// 대한민국 전체 (제주·울릉/독도 포함)
const KOREA_BBOX = [33.0, 124.5, 38.7, 132.0];
const TILE_CACHE = path.join(RAW_DIR, ".osm-tiles.json");
const MAX_DEPTH = 4; // 분할 한계 (2°→0.125°)
const REFRESH = !!argOf("refresh", false);

function bboxArg() {
  const raw = argOf("bbox", null);
  if (!raw || raw === true) return KOREA_BBOX;
  const parts = String(raw).split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    console.error("❌ --bbox 형식: --bbox 남위,서경,북위,동경 (예: 37,126,38,128)");
    process.exit(1);
  }
  return parts;
}

function loadTileCache() {
  if (REFRESH || !fs.existsSync(TILE_CACHE)) return {};
  try {
    return JSON.parse(fs.readFileSync(TILE_CACHE, "utf8"));
  } catch {
    return {};
  }
}
function saveTileCache(cache) {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.writeFileSync(TILE_CACHE, JSON.stringify(cache), "utf8");
}

function query(s, w, n, e) {
  return `[out:json][timeout:120];
(
  node["amenity"="toilets"](${s},${w},${n},${e});
  way["amenity"="toilets"](${s},${w},${n},${e});
);
out center tags;`;
}

/** 한 타일 조회. 성공 시 elements 배열, 타임아웃/과부하면 null (→ 분할 신호) */
async function fetchTile(s, w, n, e) {
  const body = query(s, w, n, e);
  for (let attempt = 0; attempt < ENDPOINTS.length * 2; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "oh-my-toilet/0.1 (public toilet finder)",
        },
        body: `data=${encodeURIComponent(body)}`,
      });
      // 429=요청 과다, 504=타임아웃 → 잠시 쉬었다 다른 엔드포인트로
      if (res.status === 429 || res.status === 504) {
        await sleep(3000 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        await sleep(1500);
        continue;
      }
      const json = await res.json();
      if (Array.isArray(json.elements)) return json.elements;
      return null;
    } catch {
      await sleep(1500 * (attempt + 1));
    }
  }
  return null; // 전부 실패 → 더 작게 쪼개서 재시도
}

/** 적응형 분할 수집 */
async function collect(bbox, cache, depth = 0, acc = []) {
  const [s, w, n, e] = bbox;
  const key = bbox.map((v) => v.toFixed(3)).join(",");

  if (cache[key]) {
    acc.push(...cache[key]);
    process.stdout.write(`  ↺ 캐시 ${key} (${cache[key].length}건)\n`);
    return acc;
  }

  const elements = await fetchTile(s, w, n, e);

  if (elements === null) {
    if (depth >= MAX_DEPTH) {
      console.warn(`  ⚠️ 포기: ${key} (분할 한계 도달)`);
      return acc;
    }
    const midLat = (s + n) / 2;
    const midLng = (w + e) / 2;
    console.log(`  ✂️  분할 ${key}`);
    for (const sub of [
      [s, w, midLat, midLng],
      [s, midLng, midLat, e],
      [midLat, w, n, midLng],
      [midLat, midLng, n, e],
    ]) {
      await collect(sub, cache, depth + 1, acc);
    }
    return acc;
  }

  cache[key] = elements;
  saveTileCache(cache);
  acc.push(...elements);
  console.log(`  ✓ ${key} → ${elements.length}건 (누적 ${acc.length})`);
  await sleep(1200); // Overpass 예의상 간격
  return acc;
}

/**
 * 이름 태그에 정보가 없는 값들.
 * "화장실", "장애인용 화장실" 같은 건 이름이 아니라 분류라서, 카드에 그대로 띄우면
 * 옆 화장실과 구분이 안 되고 "장애인 전용"으로 오해될 수도 있다. 기본값으로 되돌린다.
 */
const GENERIC_NAME_RE =
  /^(공중|공용|공공|간이|이동식|장애인용?|남자|여자|남녀공용)?\s*(화장실|toilet|wc|restroom)s?$/i;

const DEFAULT_NAME = "공중화장실";

/** OSM element → 앱 레코드 */
function toRecord(el) {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!isInKorea(lat, lng)) return null;

  const t = el.tags ?? {};
  // 사유·비공개 화장실은 앱에 띄우면 안 된다
  if (["private", "no", "permissive_no"].includes(t.access)) return null;

  const rawName = (t["name:ko"] || t.name || "").trim();
  const name = !rawName || GENERIC_NAME_RE.test(rawName) ? DEFAULT_NAME : rawName;

  const addr = [
    t["addr:province"],
    t["addr:city"],
    t["addr:district"],
    t["addr:street"],
    t["addr:housenumber"],
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const rec = {
    id: `osm-${el.type}-${el.id}`,
    name,
    address: t["addr:full"] || addr || "",
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lng.toFixed(6)),
    source: "osm",
    // OSM 은 공중/개방 구분 태그가 없어 type 은 비워 두고 병합 단계에 맡긴다
  };
  const hours = normalizeOpenHours(t.opening_hours);
  if (hours) rec.openHours = hours;
  if (t.wheelchair === "yes") rec.hasDisabledStall = true;
  if (t.unisex === "yes") rec.isUnisex = true;
  if (t.changing_table === "yes") rec.hasChangingTable = true;
  // fee=no 는 "무료임이 확인됨" — 태그가 없는 것(정보 없음)과 구분해서 담는다
  if (t.fee === "no") rec.isFree = true;
  else if (t.fee === "yes") rec.isFree = false;
  // 고객 전용은 누구나 쓰는 화장실이 아니라 거절당할 수 있어 따로 표시한다
  if (t.access === "customers") rec.customersOnly = true;
  if (t.level !== undefined && t.level !== "") {
    const lv = Number(t.level);
    // OSM level 은 0 이 지상 1층 기준이라 한국식 층수로 옮긴다
    if (Number.isFinite(lv))
      rec.floor = lv < 0 ? `지하 ${Math.abs(lv)}층` : `${lv + 1}층`;
  }
  if (t.operator) rec.managedBy = t.operator;
  if (t.phone || t["contact:phone"]) rec.phone = t.phone || t["contact:phone"];
  return rec;
}

async function main() {
  const bbox = bboxArg();
  console.log(
    `🌍 OSM Overpass 수집 시작 — bbox [${bbox.join(", ")}]${
      REFRESH ? " (캐시 무시)" : ""
    }`
  );

  const cache = loadTileCache();
  // 전국은 2° 타일로 먼저 나눠서 시작 (한 번에 요청하면 대부분 타임아웃)
  const [s, w, n, e] = bbox;
  const STEP = 2;
  const tiles = [];
  for (let la = s; la < n; la += STEP) {
    for (let lo = w; lo < e; lo += STEP) {
      tiles.push([la, lo, Math.min(la + STEP, n), Math.min(lo + STEP, e)]);
    }
  }
  console.log(`🧩 ${tiles.length}개 타일로 분할`);

  const elements = [];
  for (const t of tiles) await collect(t, cache, 0, elements);

  // element id 기준 1차 중복 제거 (타일 경계에서 중복 수집됨)
  const seen = new Set();
  const records = [];
  let skipped = 0;
  for (const el of elements) {
    const k = `${el.type}/${el.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const rec = toRecord(el);
    if (rec) records.push(rec);
    else skipped++;
  }

  const out = writeRaw("osm", records);
  console.log(
    `\n✅ OSM ${records.length}건 저장 (제외 ${skipped}건: 사유화장실/좌표이상)\n   → ${path.relative(
      process.cwd(),
      out
    )}`
  );
  console.log("   다음: npm run build:dataset 으로 병합하세요.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
