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
import { RAW_DIR, ROOT, argOf, readRaw, writeRaw } from "../lib/dataset.mjs";
import {
  QuotaExhaustedError,
  geocodeAll,
  resolveProvider,
} from "../lib/geocode.mjs";

const CSV_PATH = argOf("csv", null);
const SIDO = argOf("sido", null);
const LIMIT = Number(argOf("limit", Infinity));
const PROVIDER_NAME = argOf("provider", "auto");
/** 지난 실행에서 좌표를 못 찾은 건만 다시 시도하고, 기존 결과에 합친다 */
const RETRY_FAILED = !!argOf("retry-failed", false);

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

  // 공공데이터 CSV 는 CP949 가 많다. EUC-KR 로 먼저 시도하되,
  // 확장 한자·특수문자에서 깨지면(Illegal byte sequence) CP949 로 넘어간다.
  for (const enc of ["EUC-KR", "CP949"]) {
    try {
      const text = execFileSync("iconv", ["-f", enc, "-t", "UTF-8", file], {
        maxBuffer: 1024 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"], // iconv 경고를 화면에 흘리지 않는다
      }).toString("utf8");
      console.log(`ℹ️  ${enc} → UTF-8 변환 완료`);
      return text;
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

/**
 * 헤더에서 컬럼 위치를 찾는다.
 *
 * 데이터셋 버전마다 컬럼명이 조금씩 달라서(예: 화장실소유구분 vs 화장실소유구분명)
 * 부분매칭이 필요하지만, 부분매칭만 하면 "구분명"이 "화장실소유구분명"에도 걸린다.
 * 그래서 정확히 일치하는 컬럼을 먼저 찾고, 없을 때만 부분매칭으로 넘어간다.
 */
function findCol(headers, ...needles) {
  const norm = headers.map((h) => String(h).replace(/\s/g, ""));
  if (needles.length === 1) {
    const exact = norm.indexOf(needles[0]);
    if (exact >= 0) return exact;
  }
  return norm.findIndex((s) => needles.every((n) => s.includes(n)));
}

const toNum = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const yes = (v) => /^(y|yes|1|o|있음|설치|공용)/i.test(String(v ?? "").trim());

/**
 * 개방시간 정규화.
 *
 * 이 데이터셋은 개방시간이 두 컬럼에 나뉘어 있고, 앞 컬럼은 시간이 아니라 분류다.
 *   개방시간     = 상시 | 정시 | 불규칙 | 미개방
 *   개방시간상세 = "09:00~18:00", "24시간", "(평일)09:00~18:00", "9시간" …(60%만 채워짐)
 *
 * "상시" 2만여 건은 상세가 비어 있어서, 상세만 읽으면 "24시간 개방"이라는
 * 정보를 통째로 잃는다. 그래서 두 컬럼을 같이 본다.
 *
 * @returns 앱 표기 문자열, 또는 null(정보 없음), 또는 false(미개방)
 */
function normalizeCsvHours(category, detail) {
  const c = (category ?? "").trim();
  const d = (detail ?? "").trim();

  if (c === "미개방" || d === "미개방") return false;

  const always = /^(상시|24시간|24시|연중무휴|항상)$/;
  if (always.test(c) || always.test(d)) return "상시개방";

  if (d) {
    // "9시간" 처럼 길이만 적힌 값은 언제 여는지 알 수 없어 버린다
    if (/^\d+\s*시간$/.test(d)) return c === "상시" ? "상시개방" : null;

    // "(평일)09:00~18:00" → "09:00~18:00(평일)" 로 자리 옮기고 구분자 통일
    const dayTag = d.match(/\((평일|주말|공휴일)\)/);
    const range = d.match(/(\d{1,2}:\d{2})\s*[~\-–]\s*(\d{1,2}:\d{2})/);
    if (range) {
      const body = `${range[1]}~${range[2]}`;
      // 00:00~24:00 은 사실상 상시개방
      if (body === "00:00~24:00") return "상시개방";
      return dayTag ? `${body}(${dayTag[1]})` : body;
    }
    // 시간 범위가 없지만 여러 요일 규칙이 적힌 복잡한 값은 원문을 그대로 보여준다
    if (/\d{1,2}:\d{2}/.test(d)) return d;
  }

  if (c === "상시") return "상시개방";
  return null;
}

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
    openHoursDetail: findCol(headers, "개방시간상세"),
    // 공중/개방 구분은 '구분명'(공중화장실/개방화장실/간이/이동)에 있다.
    // 다만 이건 법적 분류라서, 구청 소유 공원 화장실도 '개방화장실'로 등록된다.
    // 앱 배지가 뜻하는 "민간이 열어준 화장실"인지는 '화장실소유구분명'을 봐야 한다.
    category: findCol(headers, "구분명"),
    ownership: findCol(headers, "화장실소유구분"),
    disabledM: findCol(headers, "남성용", "장애인", "대변기"),
    disabledF: findCol(headers, "여성용", "장애인", "대변기"),
    unisex: findCol(headers, "남녀공용"),
    changingTable: findCol(headers, "기저귀교환대"),
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
  let closed = 0;
  let records = rows.slice(1).map((r) => {
    const road = get(r, col.roadAddr);
    const jibun = get(r, col.jibunAddr);
    const hours = normalizeCsvHours(
      get(r, col.openHours),
      get(r, col.openHoursDetail)
    );
    return {
      name: get(r, col.name) || "공중화장실",
      address: road || jibun,
      openHours: hours === false ? null : hours,
      isClosed: hours === false,
      hasDisabledStall:
        toNum(r[col.disabledM]) > 0 || toNum(r[col.disabledF]) > 0,
      isUnisex: col.unisex >= 0 ? yes(r[col.unisex]) : false,
      hasChangingTable:
        col.changingTable >= 0 ? yes(r[col.changingTable]) : undefined,
      // 공중화장실법상 공중·개방화장실은 무료가 원칙이라 무료로 본다
      isFree: true,
      managedBy: get(r, col.managedBy),
      phone: get(r, col.phone),
      /*
       * 앱의 "🏬 개방" 배지는 이용자에게 "여긴 남의 가게·건물 화장실이라
       * 영업시간에 묶이고 양해를 구해야 할 수 있다"는 뜻으로 읽힌다.
       * 그래서 법적 분류(구분명)만으로는 부족하고 소유 주체까지 봐야 한다.
       * 구청 소유 공원 화장실도 법적으로는 '개방화장실'로 등록되기 때문이다.
       * (성동구는 214곳 전부를 개방화장실로 등록했지만 150곳이 공공 소유다)
       */
      type:
        get(r, col.category).includes("개방") &&
        get(r, col.ownership).includes("민간")
          ? "open"
          : "public",
    };
  });

  const before = records.length;
  // 미개방으로 표기된 화장실은 찾아가도 못 쓴다 — 앱에 띄우지 않는다
  closed = records.filter((x) => x.isClosed).length;
  records = records.filter((x) => !x.isClosed);
  records = records.filter((x) => x.address);

  /*
   * 주소가 시도명 하나뿐인 행은 버린다.
   * 지오코딩하면 실패가 아니라 그 시도의 "중심점"이 돌아오는데,
   * 실제 위치와 수 km 떨어진 좌표가 아무 경고 없이 진짜처럼 박힌다.
   * (실례: 강남 개포동 화장실이 서울시청 앞에 찍혔다)
   * 좌표가 없는 것보다 틀린 좌표가 더 나쁘다.
   */
  const SIDO_ONLY =
    /^(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원(특별자치)?도|충청[북남]도|전라[북남]도|전북특별자치도|전남광주통합특별시|경상[북남]도|제주(특별자치)?도)$/;
  const vague = records.filter((x) => SIDO_ONLY.test(x.address.trim())).length;
  records = records.filter((x) => !SIDO_ONLY.test(x.address.trim()));
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
  // 실패분 재시도: 지난 실행의 failures 목록에 있는 건만 남긴다
  const failPath = path.join(RAW_DIR, "public-csv.failures.json");
  let previous = [];
  if (RETRY_FAILED) {
    if (!fs.existsSync(failPath)) {
      console.error(`❌ ${failPath} 가 없습니다. 먼저 일반 실행을 하세요.`);
      process.exit(1);
    }
    const failed = new Set(
      JSON.parse(fs.readFileSync(failPath, "utf8")).map(
        (f) => `${f.name}|${f.address}`
      )
    );
    records = records.filter((x) => failed.has(`${x.name}|${x.address}`));
    previous = readRaw("public-csv");
    console.log(
      `🔁 실패분 재시도 모드 — 대상 ${records.length}건 (기존 성공분 ${previous.length}건은 유지)`
    );
  }

  if (Number.isFinite(LIMIT)) records = records.slice(0, LIMIT);

  console.log(
    `📊 ${before}행 → 대상 ${records.length}건` +
      `${SIDO && SIDO !== true ? ` (시도=${SIDO})` : " (전국)"}` +
      `${closed ? ` / 미개방 제외 ${closed}건` : ""}` +
      `${vague ? ` / 주소부실 제외 ${vague}건` : ""}`
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
      hasChangingTable: rec.hasChangingTable,
      isFree: rec.isFree,
      type: rec.type,
      managedBy: rec.managedBy || undefined,
      phone: rec.phone || undefined,
      source: "publicData",
    });
  });

  // 재시도 모드면 기존 성공분 뒤에 새로 건진 것만 덧붙인다
  const merged = RETRY_FAILED ? [...previous, ...out] : out;
  const outPath = writeRaw("public-csv", merged);
  console.log(
    `\n✅ ${out.length}건 좌표 확보 (실패 ${failures.length}건, 캐시적중 ${stats.cached}건)` +
      (RETRY_FAILED ? `\n   누적 ${merged.length}건` : "") +
      `\n   → ${path.relative(ROOT, outPath)}`
  );

  if (failures.length) {
    fs.writeFileSync(failPath, JSON.stringify(failures, null, 2), "utf8");
    console.log(
      `   ⚠️ 실패 목록: ${path.relative(ROOT, failPath)}\n` +
        "      (주소가 옛 지번이거나 오타인 경우가 대부분입니다)"
    );
  } else if (fs.existsSync(failPath)) {
    fs.rmSync(failPath);
  }
  console.log("   다음: npm run build:dataset 으로 병합하세요.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
