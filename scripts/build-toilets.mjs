#!/usr/bin/env node
/**
 * 전국공중화장실표준데이터 CSV → 좌표 포함 toilets.json 생성 파이프라인.
 *
 * 배경: 표준데이터(공공데이터포털 15012892)는 2025년 2월부터 WGS84 좌표
 * 제공이 중단되어, 위치 기반 앱에 쓰려면 주소를 좌표로 변환(지오코딩)해야 한다.
 * 이 스크립트는 CSV의 도로명주소를 카카오 로컬 API로 좌표 변환한다.
 *
 * 사용법:
 *   1) 공공데이터포털에서 CSV 다운로드 (포털 로그인 필요)
 *      https://www.data.go.kr/data/15012892/standard.do
 *   2) 카카오 REST API 키 발급 (https://developers.kakao.com → 앱 → REST API 키)
 *   3) 실행:
 *      KAKAO_REST_API_KEY=xxxx node scripts/build-toilets.mjs \
 *        --csv ~/Downloads/전국공중화장실표준데이터.csv \
 *        --sido "서울특별시"            # (선택) 지역 필터 — 번들 크기 축소용
 *
 * 옵션:
 *   --csv <path>    입력 CSV 경로 (필수)
 *   --out <path>    출력 경로 (기본 src/data/toilets.json)
 *   --sido <name>   시도명으로 필터 (예: "서울특별시"). 생략 시 전국.
 *   --limit <n>     처음 n건만 처리 (테스트용)
 *
 * 재실행 시 scripts/.geocode-cache.json 에 저장된 좌표는 재사용하므로,
 * 중간에 멈춰도 이어서 진행된다.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ---------- 인자 파싱 ----------
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) args[a.slice(2)] = argv[++i] ?? true;
  }
  return args;
}
const args = parseArgs(process.argv.slice(2));
const CSV_PATH = args.csv;
const OUT_PATH = path.resolve(ROOT, args.out ?? "src/data/toilets.json");
const SIDO = args.sido ?? null;
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const CACHE_PATH = path.resolve(__dirname, ".geocode-cache.json");
const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

const CONCURRENCY = 5; // 카카오 API 동시 호출 수 (rate limit 여유 있게)

if (!CSV_PATH) {
  console.error("❌ --csv <경로> 가 필요합니다. (전국공중화장실표준데이터 CSV)");
  process.exit(1);
}
if (!KAKAO_KEY) {
  console.error(
    "❌ 환경변수 KAKAO_REST_API_KEY 가 필요합니다.\n" +
      "   https://developers.kakao.com 에서 REST API 키를 발급받으세요."
  );
  process.exit(1);
}

// ---------- CSV 읽기 (EUC-KR 자동 처리) ----------
function readCsvText(file) {
  const buf = fs.readFileSync(file);
  // UTF-8 BOM
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.slice(3).toString("utf8");
  }
  const utf8 = buf.toString("utf8");
  // 깨진 문자(U+FFFD)가 있으면 EUC-KR로 간주하고 iconv로 변환 (macOS/리눅스 기본 제공)
  if (utf8.includes("�")) {
    console.log("ℹ️  UTF-8 디코딩 실패 → EUC-KR로 변환 시도 (iconv)");
    try {
      return execFileSync("iconv", ["-f", "EUC-KR", "-t", "UTF-8", file], {
        maxBuffer: 1024 * 1024 * 512,
      }).toString("utf8");
    } catch {
      console.warn(
        "⚠️  iconv 변환 실패. CSV를 UTF-8로 저장 후 다시 실행하세요."
      );
    }
  }
  return utf8;
}

// ---------- 최소 CSV 파서 (따옴표/줄바꿈 처리) ----------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------- 헤더 → 컬럼 인덱스 (부분매칭, 버전 차이 허용) ----------
function findCol(headers, ...predicates) {
  return headers.findIndex((h) => {
    const s = h.replace(/\s/g, "");
    return predicates.every((p) => s.includes(p));
  });
}

async function main() {
  console.log(`📄 CSV 읽는 중: ${CSV_PATH}`);
  const rows = parseCsv(readCsvText(CSV_PATH));
  if (rows.length < 2) {
    console.error("❌ CSV에 데이터가 없습니다.");
    process.exit(1);
  }
  const headers = rows[0];
  const col = {
    name: findCol(headers, "화장실명"),
    roadAddr: findCol(headers, "도로명주소"),
    jibunAddr: findCol(headers, "지번주소"),
    openHours: findCol(headers, "개방시간"),
    disabledMale: findCol(headers, "남성용", "장애인", "대변기"),
    disabledFemale: findCol(headers, "여성용", "장애인", "대변기"),
    unisex: findCol(headers, "남녀공용"),
    managedBy: findCol(headers, "관리기관"),
    phone: findCol(headers, "전화번호"),
  };
  if (col.name < 0 || (col.roadAddr < 0 && col.jibunAddr < 0)) {
    console.error("❌ 화장실명/주소 컬럼을 찾지 못했습니다. 헤더:", headers);
    process.exit(1);
  }
  console.log("🔎 컬럼 매핑:", col);

  // 데이터 행 → 원시 레코드
  let records = rows.slice(1).map((r) => {
    const road = (r[col.roadAddr] ?? "").trim();
    const jibun = (r[col.jibunAddr] ?? "").trim();
    return {
      name: (r[col.name] ?? "").trim() || "이름 없는 화장실",
      address: road || jibun,
      openHours: col.openHours >= 0 ? (r[col.openHours] ?? "").trim() : "",
      hasDisabledStall:
        toNum(r[col.disabledMale]) > 0 || toNum(r[col.disabledFemale]) > 0,
      isUnisex: col.unisex >= 0 ? /y|1|공용/i.test(r[col.unisex] ?? "") : false,
      managedBy: col.managedBy >= 0 ? (r[col.managedBy] ?? "").trim() : "",
      phone: col.phone >= 0 ? (r[col.phone] ?? "").trim() : "",
    };
  });

  records = records.filter((x) => x.address);
  if (SIDO) records = records.filter((x) => x.address.startsWith(SIDO));
  if (Number.isFinite(LIMIT)) records = records.slice(0, LIMIT);
  console.log(
    `📊 대상 ${records.length}건${SIDO ? ` (시도=${SIDO})` : " (전국)"}`
  );

  // 지오코딩 캐시 로드
  const cache = fs.existsSync(CACHE_PATH)
    ? JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"))
    : {};
  let cacheDirty = 0;

  const out = [];
  let done = 0;
  let failed = 0;

  // 동시성 제한 풀
  async function worker(rec) {
    const coord = await geocode(rec.address, rec.name, cache);
    done++;
    if (done % 200 === 0) {
      console.log(`  … ${done}/${records.length} 처리`);
      flushCache(cache);
    }
    if (!coord) {
      failed++;
      return;
    }
    out.push({
      id: `pub-${coord.lat.toFixed(5)}-${coord.lng.toFixed(5)}-${rec.name}`,
      name: rec.name,
      address: rec.address,
      latitude: coord.lat,
      longitude: coord.lng,
      openHours: rec.openHours || undefined,
      hasDisabledStall: rec.hasDisabledStall,
      isUnisex: rec.isUnisex,
      managedBy: rec.managedBy || undefined,
      phone: rec.phone || undefined,
      source: "publicData",
    });
  }

  // 지오코딩 함수 (캐시 → 주소검색 → 키워드검색)
  async function geocode(address, name, cache) {
    if (cache[address] !== undefined) return cache[address];
    let coord = await kakaoAddress(address);
    if (!coord) coord = await kakaoKeyword(`${name} ${address}`);
    cache[address] = coord; // null도 캐싱해 재시도 방지
    cacheDirty++;
    return coord;
  }

  // 풀 실행
  const queue = [...records];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) await worker(queue.shift());
    })
  );

  flushCache(cache);

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out), "utf8");
  console.log(
    `\n✅ 완료: ${out.length}건 좌표 확보, ${failed}건 실패 → ${path.relative(
      ROOT,
      OUT_PATH
    )}`
  );

  function flushCache() {
    if (cacheDirty > 0) {
      fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), "utf8");
      cacheDirty = 0;
    }
  }
}

function toNum(v) {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// ---------- 카카오 로컬 API ----------
async function kakaoAddress(query) {
  return kakaoCall(
    `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(
      query
    )}`
  );
}
async function kakaoKeyword(query) {
  return kakaoCall(
    `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(
      query
    )}`
  );
}
async function kakaoCall(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
      });
      if (res.status === 429) {
        await sleep(1000 * (attempt + 1)); // rate limit → 백오프
        continue;
      }
      if (!res.ok) return null;
      const json = await res.json();
      const doc = json.documents?.[0];
      if (!doc) return null;
      return { lat: Number(doc.y), lng: Number(doc.x) };
    } catch {
      await sleep(500);
    }
  }
  return null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
