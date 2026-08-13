/**
 * 데이터 파이프라인 공용 유틸.
 *
 * 파이프라인 구조:
 *   scripts/sources/*.mjs  →  data/raw/<source>.json   (소스별 독립 수집)
 *   scripts/build-dataset.mjs  →  src/data/toilets.json (병합·중복제거·정규화)
 *
 * 소스 스크립트는 절대 src/data/toilets.json 을 직접 쓰지 않는다.
 * (예전에는 각 스크립트가 직접 써서 서로의 결과를 덮어썼다.)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "../..");
export const RAW_DIR = path.resolve(ROOT, "data/raw");
export const OUT_PATH = path.resolve(ROOT, "src/data/toilets.json");
export const REGION_DIR = path.resolve(ROOT, "src/data/regions");

/**
 * 지역 타일 한 변의 크기(도).
 * 전국 4.8만 건을 한 파일로 두면 12MB 라 앱 시작이 무거워진다.
 * 0.5°(위도 기준 약 55km) 격자로 쪼개서 사용자 주변 타일만 읽는다.
 */
export const TILE_SIZE = 0.5;

/** 좌표 → 타일 키 (파일명으로도 쓰인다) */
export function tileKey(lat, lng) {
  return `${Math.floor(lat / TILE_SIZE)}_${Math.floor(lng / TILE_SIZE)}`;
}

/** 소스 신뢰도 — 중복 시 높은 쪽을 남긴다. */
export const SOURCE_RANK = {
  jecheon: 100, // 지자체 공식 안내 페이지 (개방시간·연락처까지 검증됨)
  "public-csv": 80, // 전국공중화장실표준데이터 + 지오코딩
  osm: 50, // OpenStreetMap (좌표는 정확하나 속성 결측 많음)
};

export function argOf(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith("--") ? true : v;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 소스별 raw 파일 읽기 (없으면 빈 배열) */
export function readRaw(source) {
  const p = path.join(RAW_DIR, `${source}.json`);
  if (!fs.existsSync(p)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn(`⚠️  ${source}.json 파싱 실패 — 빈 배열로 처리: ${e.message}`);
    return [];
  }
}

/** 소스별 raw 파일 쓰기 */
export function writeRaw(source, records) {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const p = path.join(RAW_DIR, `${source}.json`);
  fs.writeFileSync(p, JSON.stringify(records, null, 0), "utf8");
  return p;
}

/**
 * 사용 가능한 raw 소스 목록.
 * 숨김 캐시(.osm-tiles.json)와 부산물(*.failures.json)은 소스가 아니므로 제외한다.
 */
export function listRawSources() {
  if (!fs.existsSync(RAW_DIR)) return [];
  return fs
    .readdirSync(RAW_DIR)
    .filter(
      (f) =>
        f.endsWith(".json") && !f.startsWith(".") && !f.endsWith(".failures.json")
    )
    .map((f) => f.replace(/\.json$/, ""));
}

/** 두 좌표 사이 거리 (m) */
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** 대한민국 영역 대략 검증 — 지오코딩 오류(엉뚱한 좌표) 걸러내기 */
export function isInKorea(lat, lng) {
  return lat >= 33.0 && lat <= 38.7 && lng >= 124.5 && lng <= 132.0;
}

const OSM_DAY_KO = {
  Mo: "월",
  Tu: "화",
  We: "수",
  Th: "목",
  Fr: "금",
  Sa: "토",
  Su: "일",
};

/**
 * OSM `opening_hours` → 앱이 쓰는 한국어 개방시간 표기.
 *
 * OSM 값의 90%가 "24/7", "Mo-Su 09:00-18:00" 같은 OSM 문법인데,
 * 그대로 두면 (1) 시니어에게 안 읽히고 (2) openNow 가 요일 제한을 놓쳐
 * 평일만 여는 곳을 토요일에 "개방중"으로 잘못 판정한다.
 *
 * 변환 예:
 *   "24/7"                → "상시개방"
 *   "Mo-Su 09:00-18:00"   → "09:00~18:00(매일)"
 *   "Mo-Fr 09:00-18:00"   → "09:00~18:00(평일)"
 *   "Mo-Sa 09:00-18:00"   → "09:00~18:00(월~토)"
 *
 * 해석할 수 없는 값(계절 표기 등)은 null 을 돌려준다 — 읽히지 않는 원문을
 * 그대로 띄우느니 개방시간 없음으로 두는 편이 낫다.
 */
export function normalizeOpenHours(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  if (/^24\/7$/i.test(s)) return "상시개방";
  // 이미 한국어 표기(제천 등)면 그대로 둔다
  if (/[가-힣]/.test(s)) return s;

  const m = s.match(
    /^(?:(Mo|Tu|We|Th|Fr|Sa|Su)\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su)\s+)?(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/i
  );
  if (!m) return null;

  const [, from, to, start, end] = m;
  const range = `${start}~${end}`;
  if (!from) return `${range}(매일)`;

  const cap = (x) => x[0].toUpperCase() + x.slice(1).toLowerCase();
  const f = cap(from);
  const t = cap(to);
  if (f === "Mo" && t === "Su") return `${range}(매일)`;
  if (f === "Mo" && t === "Fr") return `${range}(평일)`;
  return `${range}(${OSM_DAY_KO[f]}~${OSM_DAY_KO[t]})`;
}

/** 이름 정규화 — 중복 판정용 (공백/괄호/접미어 제거) */
export function normalizeName(name) {
  return String(name ?? "")
    .replace(/\(.*?\)/g, "")
    .replace(/(공중)?화장실|공공|개방/g, "")
    .replace(/[\s·・.,\-_()[\]]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * 레코드 정규화 — 앱의 Toilet 타입에 맞춘 형태로 변환.
 * 잘못된 좌표는 null 을 돌려준다(호출부에서 제외).
 */
export function normalizeRecord(rec) {
  const lat = Number(rec.latitude);
  const lng = Number(rec.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!isInKorea(lat, lng)) return null;

  const out = {
    id: rec.id,
    name: String(rec.name ?? "").trim() || "이름 없는 화장실",
    address: String(rec.address ?? "").trim(),
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lng.toFixed(6)),
    source: rec.source ?? "publicData",
  };
  if (rec.openHours) out.openHours = String(rec.openHours).trim();
  if (rec.hasDisabledStall !== undefined)
    out.hasDisabledStall = !!rec.hasDisabledStall;
  if (rec.isUnisex !== undefined) out.isUnisex = !!rec.isUnisex;
  if (rec.hasChangingTable !== undefined)
    out.hasChangingTable = !!rec.hasChangingTable;
  if (rec.isFree !== undefined) out.isFree = !!rec.isFree;
  if (rec.customersOnly !== undefined) out.customersOnly = !!rec.customersOnly;
  if (rec.floor) out.floor = String(rec.floor).trim();
  if (rec.type) out.type = rec.type;
  if (rec.host) out.host = String(rec.host).trim();
  if (rec.managedBy) out.managedBy = String(rec.managedBy).trim();
  if (rec.phone) out.phone = String(rec.phone).trim();
  return out;
}

/** 중복 통합 시 신뢰도 낮은 쪽에서 살려 올 필드 */
const MERGEABLE_FIELDS = [
  "address",
  "openHours",
  "phone",
  "managedBy",
  "host",
  "type",
  "hasDisabledStall",
  "isUnisex",
  "hasChangingTable",
  "isFree",
  "customersOnly",
  "floor",
];

/**
 * 중복 제거.
 *
 * 같은 화장실이 여러 소스에 들어 있을 수 있다(예: 제천 개방화장실이
 * 표준데이터 CSV 에도 있음). 판정 기준:
 *   - 15m 이내면 이름과 무관하게 동일
 *   - 60m 이내면서 정규화된 이름이 서로 포함 관계면 동일
 *
 * 좌표를 100m 격자로 버킷팅해 인접 버킷만 비교한다(전수 비교 회피).
 * 남길 레코드는 SOURCE_RANK 가 높은 쪽이며, 낮은 쪽의 결측 필드는 병합한다.
 */
export function dedupe(records, { sameMeters = 15, nameMeters = 60 } = {}) {
  const CELL = 0.001; // 위도 0.001° ≈ 111m
  const buckets = new Map();
  const kept = [];

  const rank = (r) => SOURCE_RANK[r.__source] ?? 0;
  const key = (lat, lng) =>
    `${Math.floor(lat / CELL)}:${Math.floor(lng / CELL)}`;

  // 신뢰도 높은 소스가 먼저 자리를 잡도록 정렬
  const ordered = [...records].sort((a, b) => rank(b) - rank(a));

  for (const rec of ordered) {
    const bLat = Math.floor(rec.latitude / CELL);
    const bLng = Math.floor(rec.longitude / CELL);
    let dup = null;

    outer: for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const list = buckets.get(`${bLat + dx}:${bLng + dy}`);
        if (!list) continue;
        for (const other of list) {
          const d = haversineMeters(
            rec.latitude,
            rec.longitude,
            other.latitude,
            other.longitude
          );
          if (d <= sameMeters) {
            dup = other;
            break outer;
          }
          if (d <= nameMeters) {
            const a = normalizeName(rec.name);
            const b = normalizeName(other.name);
            if (a && b && (a.includes(b) || b.includes(a))) {
              dup = other;
              break outer;
            }
          }
        }
      }
    }

    if (dup) {
      // 신뢰도 낮은 쪽에만 있는 정보는 살려서 병합
      for (const f of MERGEABLE_FIELDS) {
        if (dup[f] === undefined && rec[f] !== undefined) dup[f] = rec[f];
      }
      dup.__mergedFrom = [...(dup.__mergedFrom ?? []), rec.__source];
      continue;
    }

    kept.push(rec);
    const k = key(rec.latitude, rec.longitude);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(rec);
  }

  return kept;
}
