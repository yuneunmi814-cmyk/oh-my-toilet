/**
 * 주소 → 좌표 변환(지오코딩) 공용 모듈.
 *
 * 전국공중화장실표준데이터(15012892)는 2025년 2월부터 WGS84 좌표 제공이
 * 중단됐다. 그래서 주소밖에 없는 소스는 이 모듈로 좌표를 만들어야 한다.
 *
 * 제공자(--provider 로 선택, 기본 auto):
 *   kakao      KAKAO_REST_API_KEY   일 10만건, 도로명·지번 모두 정확. 권장.
 *   vworld     VWORLD_API_KEY       국토부 공식. 도로명주소에 강함.
 *   nominatim  키 불필요            초당 1건 제한 + 국내 커버리지 약함. 최후수단.
 *
 * auto 는 환경변수가 있는 제공자를 우선순위대로 고른다.
 *
 * 결과는 scripts/.geocode-cache.json 에 영구 저장되어, 중간에 멈춰도
 * 다시 실행하면 이어서 진행한다. 실패(null)도 캐싱해 헛된 재시도를 막는다.
 * (캐시를 비우려면 그 파일을 지우면 된다.)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isInKorea, sleep } from "./dataset.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.resolve(__dirname, "../.geocode-cache.json");

/** 일일 한도 초과 등으로 더 진행해도 소용없을 때 던지는 에러 */
export class QuotaExhaustedError extends Error {}

const PROVIDERS = {
  kakao: {
    env: "KAKAO_REST_API_KEY",
    concurrency: 5,
    minIntervalMs: 0,
    lookup: kakaoLookup,
    reverse: kakaoReverse,
  },
  vworld: {
    env: "VWORLD_API_KEY",
    concurrency: 4,
    minIntervalMs: 0,
    lookup: vworldLookup,
    reverse: vworldReverse,
  },
  nominatim: {
    env: null,
    concurrency: 1,
    minIntervalMs: 1100, // 이용약관상 초당 1건
    lookup: nominatimLookup,
    reverse: nominatimReverse,
  },
};

export function resolveProvider(requested = "auto") {
  if (requested !== "auto") {
    const p = PROVIDERS[requested];
    if (!p) throw new Error(`알 수 없는 지오코딩 제공자: ${requested}`);
    if (p.env && !process.env[p.env])
      throw new Error(`${requested} 사용에는 환경변수 ${p.env} 가 필요합니다.`);
    return { name: requested, ...p };
  }
  for (const name of ["kakao", "vworld", "nominatim"]) {
    const p = PROVIDERS[name];
    if (!p.env || process.env[p.env]) return { name, ...p };
  }
  throw new Error("사용 가능한 지오코딩 제공자가 없습니다.");
}

export function loadCache() {
  if (!fs.existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  } catch {
    console.warn("⚠️  지오코딩 캐시가 손상되어 새로 시작합니다.");
    return {};
  }
}

export function saveCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), "utf8");
}

/**
 * 여러 레코드를 동시에 지오코딩한다.
 *
 * @param items   [{ address, name }] — name 은 주소 검색 실패 시 키워드 검색에 쓰임
 * @param opts    { provider, onProgress, cache }
 * @returns       items 와 같은 순서의 [{ lat, lng } | null]
 */
export async function geocodeAll(items, opts = {}) {
  const provider = opts.provider ?? resolveProvider();
  const cache = opts.cache ?? loadCache();
  const results = new Array(items.length).fill(null);
  const stats = { cached: 0, fetched: 0, failed: 0, provider: provider.name };

  let cursor = 0;
  let dirty = 0;
  let lastCall = 0;
  let quotaHit = null;

  async function worker() {
    while (cursor < items.length && !quotaHit) {
      const i = cursor++;
      const { address, name } = items[i];
      const cacheKey = `${provider.name}|${address}`;

      if (cacheKey in cache) {
        results[i] = cache[cacheKey];
        stats.cached++;
        if (!results[i]) stats.failed++;
        opts.onProgress?.(stats.cached + stats.fetched, items.length, stats);
        continue;
      }

      // 제공자별 최소 호출 간격 (nominatim 초당 1건 등)
      if (provider.minIntervalMs > 0) {
        const wait = provider.minIntervalMs - (Date.now() - lastCall);
        if (wait > 0) await sleep(wait);
        lastCall = Date.now();
      }

      let coord;
      try {
        coord = await provider.lookup(address, name);
      } catch (e) {
        if (e instanceof QuotaExhaustedError) {
          quotaHit = e;
          break;
        }
        coord = null;
      }

      // 국내 밖 좌표는 오지오코딩으로 보고 버린다
      if (coord && !isInKorea(coord.lat, coord.lng)) coord = null;

      results[i] = coord;
      cache[cacheKey] = coord; // 실패(null)도 캐싱 — 재시도 방지
      dirty++;
      stats.fetched++;
      if (!coord) stats.failed++;

      if (dirty >= 200) {
        saveCache(cache);
        dirty = 0;
      }
      opts.onProgress?.(stats.cached + stats.fetched, items.length, stats);
    }
  }

  await Promise.all(
    Array.from({ length: provider.concurrency }, () => worker())
  );
  saveCache(cache);

  if (quotaHit) {
    // 여기까지 받은 좌표는 캐시에 남아 있으므로, 한도 회복 후 재실행하면 이어진다.
    throw quotaHit;
  }
  return { results, stats };
}

/**
 * 좌표 → 주소 변환(역지오코딩). OSM 처럼 좌표는 있는데 주소가 빈 소스를 채운다.
 *
 * @param points  [{ lat, lng }]
 * @returns       같은 순서의 [주소문자열 | null]
 */
export async function reverseGeocodeAll(points, opts = {}) {
  const provider = opts.provider ?? resolveProvider();
  if (!provider.reverse)
    throw new Error(`${provider.name} 은 역지오코딩을 지원하지 않습니다.`);
  const cache = opts.cache ?? loadCache();
  const results = new Array(points.length).fill(null);
  const stats = { cached: 0, fetched: 0, failed: 0, provider: provider.name };

  let cursor = 0;
  let dirty = 0;
  let lastCall = 0;
  let quotaHit = null;

  async function worker() {
    while (cursor < points.length && !quotaHit) {
      const i = cursor++;
      const { lat, lng } = points[i];
      // 좌표는 소수 5자리(약 1m)로 반올림해 캐시 적중률을 높인다
      const cacheKey = `rev:${provider.name}|${lat.toFixed(5)},${lng.toFixed(5)}`;

      if (cacheKey in cache) {
        results[i] = cache[cacheKey];
        stats.cached++;
        if (!results[i]) stats.failed++;
        opts.onProgress?.(stats.cached + stats.fetched, points.length, stats);
        continue;
      }

      if (provider.minIntervalMs > 0) {
        const wait = provider.minIntervalMs - (Date.now() - lastCall);
        if (wait > 0) await sleep(wait);
        lastCall = Date.now();
      }

      let addr;
      try {
        addr = await provider.reverse(lat, lng);
      } catch (e) {
        if (e instanceof QuotaExhaustedError) {
          quotaHit = e;
          break;
        }
        addr = null;
      }

      results[i] = addr;
      cache[cacheKey] = addr;
      dirty++;
      stats.fetched++;
      if (!addr) stats.failed++;
      if (dirty >= 200) {
        saveCache(cache);
        dirty = 0;
      }
      opts.onProgress?.(stats.cached + stats.fetched, points.length, stats);
    }
  }

  await Promise.all(
    Array.from({ length: provider.concurrency }, () => worker())
  );
  saveCache(cache);
  if (quotaHit) throw quotaHit;
  return { results, stats };
}

// ───────────────────────── 제공자 구현 ─────────────────────────

const UA = "oh-my-toilet/0.1 (public toilet finder; contact via repo)";

async function httpJson(url, headers = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 429) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        throw new QuotaExhaustedError(
          `인증 실패/한도 초과 (HTTP ${res.status}). API 키와 일일 한도를 확인하세요.`
        );
      }
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      if (e instanceof QuotaExhaustedError) throw e;
      await sleep(400 * (attempt + 1));
    }
  }
  return null;
}

/** 카카오 로컬 API — 주소검색 후 실패하면 키워드검색으로 폴백 */
async function kakaoLookup(address, name) {
  const key = process.env.KAKAO_REST_API_KEY;
  const headers = { Authorization: `KakaoAK ${key}` };

  const byAddress = await httpJson(
    `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(
      address
    )}`,
    headers
  );
  const a = byAddress?.documents?.[0];
  if (a) return { lat: Number(a.y), lng: Number(a.x) };

  // 주소가 옛 지번이거나 오타인 경우가 잦아 "이름 주소"로 장소 검색을 한 번 더
  if (name) {
    const byKeyword = await httpJson(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(
        `${name} ${address}`
      )}`,
      headers
    );
    const k = byKeyword?.documents?.[0];
    if (k) return { lat: Number(k.y), lng: Number(k.x) };
  }
  return null;
}

/** VWorld 지오코더 — 도로명(ROAD) 실패 시 지번(PARCEL) 재시도 */
async function vworldLookup(address) {
  const key = process.env.VWORLD_API_KEY;
  for (const type of ["ROAD", "PARCEL"]) {
    const json = await httpJson(
      `https://api.vworld.kr/req/address?service=address&request=getCoord&version=2.0` +
        `&crs=EPSG:4326&type=${type}&format=json&key=${key}` +
        `&address=${encodeURIComponent(address)}`
    );
    const status = json?.response?.status;
    if (status === "ERROR") {
      const msg = json.response?.error?.text ?? "";
      if (/key|권한|초과/i.test(msg)) throw new QuotaExhaustedError(msg);
    }
    const p = json?.response?.result?.point;
    if (p) return { lat: Number(p.y), lng: Number(p.x) };
  }
  return null;
}

/** OSM Nominatim — 키 불필요하지만 초당 1건 + 국내 주소 커버리지 약함 */
async function nominatimLookup(address) {
  const json = await httpJson(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=kr` +
      `&q=${encodeURIComponent(address)}`,
    { "User-Agent": UA }
  );
  const hit = Array.isArray(json) ? json[0] : null;
  if (!hit) return null;
  return { lat: Number(hit.lat), lng: Number(hit.lon) };
}

// ───────────────────── 역지오코딩 (좌표 → 주소) ─────────────────────

/** 카카오 coord2address — 도로명주소 우선, 없으면 지번주소 */
async function kakaoReverse(lat, lng) {
  const json = await httpJson(
    `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`,
    { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` }
  );
  const doc = json?.documents?.[0];
  if (!doc) return null;
  return doc.road_address?.address_name || doc.address?.address_name || null;
}

/** VWorld getAddress — 도로명(ROAD) 우선, 실패 시 지번(PARCEL) */
async function vworldReverse(lat, lng) {
  for (const type of ["ROAD", "PARCEL"]) {
    const json = await httpJson(
      `https://api.vworld.kr/req/address?service=address&request=getAddress&version=2.0` +
        `&crs=EPSG:4326&type=${type}&format=json&key=${process.env.VWORLD_API_KEY}` +
        `&point=${lng},${lat}`
    );
    if (json?.response?.status === "ERROR") {
      const msg = json.response?.error?.text ?? "";
      if (/key|권한|초과/i.test(msg)) throw new QuotaExhaustedError(msg);
    }
    const text = json?.response?.result?.[0]?.text;
    if (text) return text;
  }
  return null;
}

/**
 * Nominatim reverse — 키 불필요, 초당 1건.
 *
 * display_name 은 "도로, 동, 구, 시, 대한민국" 처럼 영어식 역순이라 그대로 쓰면
 * 한국 주소로 읽히지 않는다. 구조화된 address 객체를 큰 단위 → 작은 단위로
 * 다시 조립한다.
 */
async function nominatimReverse(lat, lng) {
  const json = await httpJson(
    `https://nominatim.openstreetmap.org/reverse?format=json&zoom=18` +
      `&accept-language=ko&lat=${lat}&lon=${lng}`,
    { "User-Agent": UA }
  );
  const a = json?.address;
  if (!a) return json?.display_name || null;

  const parts = [
    a.province || a.state,
    a.city || a.county || a.town || a.village,
    a.city_district || a.borough,
    a.suburb || a.quarter || a.neighbourhood,
    a.road,
    a.house_number,
  ].filter(Boolean);

  const joined = [...new Set(parts)].join(" ").trim();
  return joined || json?.display_name || null;
}
