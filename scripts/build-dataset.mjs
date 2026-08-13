#!/usr/bin/env node
/**
 * data/raw/*.json (소스별 수집 결과) → src/data/toilets.json (앱 번들 데이터)
 *
 * 하는 일:
 *   1) 소스별 raw 파일을 모두 읽어
 *   2) 좌표 이상치를 걸러내고 (국내 밖 = 지오코딩 오류)
 *   3) 같은 화장실을 하나로 합치고 (소스 신뢰도 순, 결측 필드는 병합)
 *   4) 앱이 쓰는 형태로 정규화해 저장한다.
 *
 * 소스별 수집과 병합을 분리한 이유: 예전에는 각 수집 스크립트가
 * src/data/toilets.json 을 직접 덮어써서, 하나를 돌리면 다른 소스의
 * 결과가 통째로 날아갔다.
 *
 * 사용법:
 *   node scripts/build-dataset.mjs                  # 전체 소스 병합
 *   node scripts/build-dataset.mjs --only jecheon,osm
 *   node scripts/build-dataset.mjs --sido 서울       # 주소 접두어로 필터
 *   node scripts/build-dataset.mjs --dry-run        # 저장하지 않고 통계만
 */
import fs from "node:fs";
import path from "node:path";
import {
  OUT_PATH,
  REGION_DIR,
  ROOT,
  SOURCE_RANK,
  TILE_SIZE,
  argOf,
  dedupe,
  listRawSources,
  normalizeRecord,
  readRaw,
  tileKey,
} from "./lib/dataset.mjs";

const ONLY = argOf("only", null);
const SIDO = argOf("sido", null);
const DRY = !!argOf("dry-run", false);

function main() {
  const available = listRawSources();
  if (available.length === 0) {
    console.error(
      "❌ data/raw 에 수집된 데이터가 없습니다.\n" +
        "   먼저 소스를 하나 이상 수집하세요:\n" +
        "     npm run fetch:osm       (키 불필요 — 좌표 내장)\n" +
        "     npm run fetch:jecheon   (제천 개방화장실)\n" +
        "     npm run fetch:csv -- --csv <경로>  (전국표준데이터 + 지오코딩)"
    );
    process.exit(1);
  }

  const wanted =
    ONLY && ONLY !== true ? String(ONLY).split(",").map((s) => s.trim()) : available;
  const sources = wanted.filter((s) => {
    if (!available.includes(s)) {
      console.warn(`⚠️  건너뜀: data/raw/${s}.json 없음`);
      return false;
    }
    return true;
  });

  console.log(`📦 병합 대상 소스: ${sources.join(", ")}`);

  const all = [];
  const perSource = {};
  let dropped = 0;

  for (const source of sources) {
    const raw = readRaw(source);
    let kept = 0;
    for (const rec of raw) {
      const norm = normalizeRecord(rec);
      if (!norm) {
        dropped++;
        continue;
      }
      if (SIDO && SIDO !== true && !norm.address.startsWith(String(SIDO))) continue;
      norm.__source = source;
      all.push(norm);
      kept++;
    }
    perSource[source] = { raw: raw.length, kept };
    console.log(
      `   ${source}: ${raw.length}건 읽음 → ${kept}건 유효` +
        `${SOURCE_RANK[source] ? ` (신뢰도 ${SOURCE_RANK[source]})` : ""}`
    );
  }

  if (dropped > 0)
    console.log(`   ⚠️ 좌표 이상으로 제외: ${dropped}건 (국내 범위 밖 또는 결측)`);

  console.log(`\n🔀 중복 제거 중… (입력 ${all.length}건)`);
  const merged = dedupe(all);
  const mergedCount = all.length - merged.length;
  console.log(`   중복 ${mergedCount}건 통합 → ${merged.length}건`);

  /*
   * 앱 번들 축소.
   *
   * 레코드가 4만 건을 넘으면서 필드 "이름"이 값만큼 비싸졌다.
   * (`hasChangingTable` 키 하나가 4.7만 번 반복되며 1MB를 차지)
   * 그래서 값이 없는 것과 의미가 같은 필드는 아예 빼고, 앱에서 기본값으로 읽는다.
   *   - 불리언: 참일 때만 저장 (거짓 = 없음 = 해당 없음)
   *   - isFree: 유료일 때만 저장 (공중화장실법상 무료가 원칙)
   *   - source: publicData 는 기본값이라 생략
   *   - 좌표: 소수 5자리(약 1m)면 화장실 찾기에 충분
   */
  const compact = (rec) => {
    const { __source, __mergedFrom, ...r } = rec;
    const out = {
      id: r.id,
      name: r.name,
      latitude: Number(r.latitude.toFixed(5)),
      longitude: Number(r.longitude.toFixed(5)),
    };
    if (r.address) out.address = r.address;
    if (r.openHours) out.openHours = r.openHours;
    if (r.type && r.type !== "public") out.type = r.type;
    if (r.host) out.host = r.host;
    if (r.floor) out.floor = r.floor;
    if (r.managedBy) out.managedBy = r.managedBy;
    if (r.phone) out.phone = r.phone;
    if (r.hasDisabledStall) out.hasDisabledStall = true;
    if (r.isUnisex) out.isUnisex = true;
    if (r.hasChangingTable) out.hasChangingTable = true;
    if (r.customersOnly) out.customersOnly = true;
    if (r.isFree === false) out.isFree = false;
    if (r.source && r.source !== "publicData") out.source = r.source;
    return out;
  };

  // 내부 필드 제거 + 안정적인 정렬(위도→경도)로 diff 최소화
  const final = merged
    .map(compact)
    .sort((a, b) => a.latitude - b.latitude || a.longitude - b.longitude);

  const stats = {
    총건수: final.length,
    이름있음: final.filter(
      (t) => t.name !== "공중화장실" && t.name !== "이름 없는 화장실"
    ).length,
    주소있음: final.filter((t) => t.address).length,
    개방시간: final.filter((t) => t.openHours).length,
    장애인칸: final.filter((t) => t.hasDisabledStall).length,
    기저귀교환대: final.filter((t) => t.hasChangingTable).length,
    // 무료는 기본값이라 저장하지 않는다 — 유료로 확인된 곳만 센다
    유료: final.filter((t) => t.isFree === false).length,
    고객전용: final.filter((t) => t.customersOnly).length,
    개방화장실: final.filter((t) => t.type === "open").length,
  };
  console.log("\n📊 최종 데이터셋");
  for (const [k, v] of Object.entries(stats)) {
    const pct = k === "총건수" ? "" : ` (${Math.round((v / final.length) * 100)}%)`;
    console.log(`   ${k}: ${v}${pct}`);
  }

  if (DRY) {
    console.log("\n🧪 --dry-run 이므로 저장하지 않았습니다.");
    return;
  }

  writeRegionTiles(final);
}

/**
 * 지역 타일로 나눠 저장한다.
 *
 * 전국을 한 파일로 두면 12MB 라 앱 시작할 때 통째로 파싱해야 한다.
 * 0.5° 격자로 쪼개면 사용자가 있는 타일(+ 가까운 이웃)만 읽으면 된다.
 * 함께 만드는 index.ts 는 Metro 가 정적으로 분석할 수 있는 require 맵이라
 * 각 타일이 "처음 필요할 때" 파싱된다.
 */
function writeRegionTiles(records) {
  fs.rmSync(REGION_DIR, { recursive: true, force: true });
  fs.mkdirSync(REGION_DIR, { recursive: true });

  const tiles = new Map();
  for (const rec of records) {
    const k = tileKey(rec.latitude, rec.longitude);
    if (!tiles.has(k)) tiles.set(k, []);
    tiles.get(k).push(rec);
  }

  const meta = {};
  let maxKb = 0;
  for (const [k, list] of [...tiles].sort()) {
    const file = path.join(REGION_DIR, `${k}.json`);
    fs.writeFileSync(file, JSON.stringify(list), "utf8");
    const kb = Math.round(fs.statSync(file).size / 1024);
    maxKb = Math.max(maxKb, kb);
    meta[k] = list.length;
  }

  // Metro 는 require 경로가 정적이어야 번들에 포함하므로 맵을 생성해 둔다
  const keys = Object.keys(meta).sort();
  const lines = keys.map(
    (k) => `  "${k}": () => require("./${k}.json") as Toilet[],`
  );
  fs.writeFileSync(
    path.join(REGION_DIR, "index.ts"),
    `// 이 파일은 scripts/build-dataset.mjs 가 생성합니다. 직접 수정하지 마세요.\n` +
      `import type { Toilet } from "@/types/toilet";\n\n` +
      `/** 타일 한 변 크기(도) — 파이프라인의 TILE_SIZE 와 같아야 한다 */\n` +
      `export const TILE_SIZE = ${TILE_SIZE};\n\n` +
      `/** 타일별 화장실 수 (로드하지 않고도 존재 여부를 알 수 있다) */\n` +
      `export const TILE_COUNTS: Record<string, number> = ${JSON.stringify(
        meta,
        null,
        2
      )};\n\n` +
      `/** 타일 키 → 데이터 로더. 호출할 때 비로소 파싱된다. */\n` +
      `export const TILE_LOADERS: Record<string, () => Toilet[]> = {\n${lines.join(
        "\n"
      )}\n};\n`,
    "utf8"
  );

  // 전국 단일 파일은 더 이상 쓰지 않는다 (남아 있으면 번들에 중복 포함된다)
  if (fs.existsSync(OUT_PATH)) fs.rmSync(OUT_PATH);

  const totalKb = Math.round(
    keys.reduce(
      (s, k) => s + fs.statSync(path.join(REGION_DIR, `${k}.json`)).size,
      0
    ) / 1024
  );
  console.log(
    `\n✅ 저장 완료 → ${path.relative(ROOT, REGION_DIR)}/ ` +
      `(${keys.length}개 타일, 합계 ${totalKb}KB, 가장 큰 타일 ${maxKb}KB)`
  );
  console.log(`   앱은 사용자 주변 타일만 읽습니다 (시작 시 전량 파싱 없음).`);
}

main();
