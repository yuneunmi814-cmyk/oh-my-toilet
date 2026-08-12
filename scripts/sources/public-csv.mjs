#!/usr/bin/env node
/**
 * 전국공중화장실표준데이터 CSV → 지오코딩 → data/raw/public-csv.json
 *
 * 배경: 이 데이터셋(공공데이터포털 15012892)은 2025년 2월부터 WGS84 좌표
 * 제공이 중단됐고 오픈API 없이 CSV 다운로드만 된다. 위치 기반 앱에 쓰려면
 * 주소를 좌표로 바꿔야 하는데, 그 변환이 이 스크립트다.
 *
 * 준비물:
 *   1) CSV — https://www.data.go.kr/data/15012892/standard.do (포털 로그인 필요)
 *   2) 지오코딩 키 — 아래 중 하나 (없으면 nominatim 폴백, 매우 느림)
 *        KAKAO_REST_API_KEY   https://developers.kakao.com  (일 10만건, 권장)
 *        VWORLD_API_KEY       https://www.vworld.kr
 *
 * 사용법:
 *   KAKAO_REST_API_KEY=xxx node scripts/sources/public-csv.mjs \
 *     --csv ~/Downloads/전국공중화장실표준데이터.csv
 *
 * 옵션:
 *   --csv <path>       입력 CSV (필수)
 *   --sido <이름>      시도 필터 (예: 서울특별시) — 번들 축소·키 절약용
 *   --limit <n>        앞 n건만 (테스트)
 *   --provider <이름>  kakao | vworld | nominatim (기본 auto)
 *
 * 중간에 멈춰도 scripts/.geocode-cache.json 덕에 재실행하면 이어서 진행한다.
 * 일일 한도에 걸리면 거기까지 저장하고 종료하므로, 다음 날 다시 돌리면 된다.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { RAW_DIR, ROOT, argOf, writeRaw } from "../lib/dataset.mjs";
import {
  QuotaExhaustedError,
  geocodeAll,
  resolveProvider,
} from "../lib/geocode.mjs";

const CSV_PATH = argOf("csv", null);
const SIDO = argOf("sido", null);
const LIMIT = Number(argOf("limit", Infinity));
const PROVIDER_NAME = argOf("provider", "auto");

if (!CSV_PATH || CSV_PATH === true) {
  console.error(
    "❌ --csv <경로> 가 필요합니다.\n" +
      "   공공데이터포털에서 '전국공중화장실표준데이터' CSV 를 받아주세요:\n" +
      "   https://www.data.go.kr/data/15012892/standard.do"
  );
  process.exit(1);
}
if (!fs.existsSync(CSV_PATH)) {
  console.error(`❌ CSV 파일을 찾을 수 없습니다: ${CSV_PATH}`);
  process.exit(1);
}

// ───────── CSV 읽기 (공공데이터는 EUC-KR 로 내려오는 경우가 많다) ─────────
function readCsvText(file) {
  const buf = fs.readFileSync(file);
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf)
    return buf.slice(3).toString("utf8");
  const utf8 = buf.toString("utf8");
  if (!utf8.includes("�")) return utf8;

  console.log("ℹ️  UTF-8 디코딩 실패 → EUC-KR 변환 시도");
  for (const enc of ["EUC-KR", "CP949"]) {
    try {
      return execFileSync("iconv", ["-f", enc, "-t", "UTF-8", file], {
        maxBuffer: 1024 * 1024 * 1024,
      }).toString("utf8");
    } catch {
      /* 다음 인코딩 시도 */
    }
  }
  console.warn("⚠️  인코딩 변환 실패. CSV 를 UTF-8 로 저장 후 다시 실행하세요.");
  return utf8;
}

/** 따옴표·줄바꿈을 처리하는 최소 CSV 파서 */
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
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
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

/** 헤더 부분매칭 — 데이터셋 버전마다 컬럼명이 조금씩 다르다 */
function findCol(headers, ...needles) {
  return headers.findIndex((h) => {
    const s = String(h).replace(/\s/g, "");
    return needles.every((n) => s.includes(n));
  });
}

const toNum = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const yes = (v) => /^(y|yes|1|o|있음|설치|공용)/i.test(String(v ?? "").trim());

async function main() {
  console.log(`📄 CSV 읽는 중: ${CSV_PATH}`);
  const rows = parseCsv(readCsvText(CSV_PATH));
  if (rows.length < 2) {
    console.error("❌ CSV 에 데이터 행이 없습니다.");
    process.exit(1);
  }

  const headers = rows[0];
  const col = {
    name: findCol(headers, "화장실명"),
    roadAddr: findCol(headers, "소재지도로명주소"),
    jibunAddr: findCol(headers, "소재지지번주소"),
    openHours: findCol(headers, "개방시간"),
    ownership: findCol(headers, "화장실소유구분"),
    disabledM: findCol(headers, "남성용", "장애인", "대변기"),
    disabledF: findCol(headers, "여성용", "장애인", "대변기"),
    unisex: findCol(headers, "남녀공용"),
    managedBy: findCol(headers, "관리기관"),
    phone: findCol(headers, "전화번호"),
  };
  // 구버전 헤더(소재지 접두어 없음) 대비
  if (col.roadAddr < 0) col.roadAddr = findCol(headers, "도로명주소");
  if (col.jibunAddr < 0) col.jibunAddr = findCol(headers, "지번주소");

  if (col.name < 0 || (col.roadAddr < 0 && col.jibunAddr < 0)) {
    console.error("❌ 화장실명/주소 컬럼을 찾지 못했습니다.\n   헤더:", headers);
    process.exit(1);
  }

  const get = (r, i) => (i >= 0 ? String(r[i] ?? "").trim() : "");

  // 행 → 레코드 (주소 없는 행은 지오코딩 불가라 제외)
  let records = rows.slice(1).map((r) => {
    const road = get(r, col.roadAddr);
    const jibun = get(r, col.jibunAddr);
    const ownership = get(r, col.ownership);
    const rec = {
      name: get(r, col.name) || "공중화장실",
      address: road || jibun,
      openHours: get(r, col.openHours),
      hasDisabledStall:
        toNum(r[col.disabledM]) > 0 || toNum(r[col.disabledF]) > 0,
      isUnisex: col.unisex >= 0 ? yes(r[col.unisex]) : false,
      managedBy: get(r, col.managedBy),
      phone: get(r, col.phone),
      // 소유구분이 '개방화장실'이면 민간 협약 개방 — 앱에서 배지로 구분한다
      type: ownership.includes("개방") ? "open" : "public",
    };
    return rec;
  });

  const before = records.length;
  records = records.filter((x) => x.address);
  if (SIDO && SIDO !== true)
    records = records.filter((x) => x.address.startsWith(String(SIDO)));

  // 같은 주소+이름 중복 행 제거 (표준데이터에 종종 있다)
  const seen = new Set();
  records = records.filter((x) => {
    const k = `${x.address}|${x.name}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (Number.isFinite(LIMIT)) records = records.slice(0, LIMIT);

  console.log(
    `📊 ${before}행 → 대상 ${records.length}건` +
      `${SIDO && SIDO !== true ? ` (시도=${SIDO})` : " (전국)"}`
  );

  // 지오코딩
  let provider;
  try {
    provider = resolveProvider(PROVIDER_NAME);
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
  console.log(`🌐 지오코딩 제공자: ${provider.name}`);
  if (provider.name === "nominatim") {
    const hours = ((records.length * 1.1) / 3600).toFixed(1);
    console.log(
      `   ⚠️ nominatim 은 초당 1건 제한이라 약 ${hours}시간 걸립니다.\n` +
        "      KAKAO_REST_API_KEY 를 설정하면 수십 분으로 줄어듭니다."
    );
  }

  let lastLog = 0;
  let result;
  try {
    result = await geocodeAll(
      records.map((r) => ({ address: r.address, name: r.name })),
      {
        provider,
        onProgress: (done, total, stats) => {
          if (done - lastLog >= 500 || done === total) {
            lastLog = done;
            const pct = Math.round((done / total) * 100);
            console.log(
              `   … ${done}/${total} (${pct}%) — 캐시 ${stats.cached}, 신규 ${stats.fetched}, 실패 ${stats.failed}`
            );
          }
        },
      }
    );
  } catch (e) {
    if (e instanceof QuotaExhaustedError) {
      console.error(
        `\n⛔ 지오코딩 한도/인증 문제로 중단: ${e.message}\n` +
          "   여기까지 받은 좌표는 캐시에 저장됐습니다.\n" +
          "   한도가 회복되면 같은 명령을 다시 실행하면 이어서 진행합니다."
      );
      process.exit(2);
    }
    throw e;
  }

  const { results, stats } = result;
  const out = [];
  const failures = [];
  records.forEach((rec, i) => {
    const coord = results[i];
    if (!coord) {
      failures.push({ name: rec.name, address: rec.address });
      return;
    }
    out.push({
      id: `pub-${coord.lat.toFixed(5)}-${coord.lng.toFixed(5)}`,
      name: rec.name,
      address: rec.address,
      latitude: coord.lat,
      longitude: coord.lng,
      openHours: rec.openHours || undefined,
      hasDisabledStall: rec.hasDisabledStall,
      isUnisex: rec.isUnisex,
      type: rec.type,
      managedBy: rec.managedBy || undefined,
      phone: rec.phone || undefined,
      source: "publicData",
    });
  });

  const outPath = writeRaw("public-csv", out);
  console.log(
    `\n✅ ${out.length}건 좌표 확보 (실패 ${failures.length}건, 캐시적중 ${stats.cached}건)` +
      `\n   → ${path.relative(ROOT, outPath)}`
  );

  if (failures.length) {
    const failPath = path.join(RAW_DIR, "public-csv.failures.json");
    fs.writeFileSync(failPath, JSON.stringify(failures, null, 2), "utf8");
    console.log(
      `   ⚠️ 실패 목록: ${path.relative(ROOT, failPath)}\n` +
        "      (주소가 옛 지번이거나 오타인 경우가 대부분입니다)"
    );
  }
  console.log("   다음: npm run build:dataset 으로 병합하세요.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
