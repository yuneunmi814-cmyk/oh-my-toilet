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
  ROOT,
  SOURCE_RANK,
  argOf,
  dedupe,
  listRawSources,
  normalizeRecord,
  readRaw,
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

  // 내부 필드 제거 + 안정적인 정렬(위도→경도)로 diff 최소화
  const final = merged
    .map(({ __source, __mergedFrom, ...rest }) => rest)
    .sort((a, b) => a.latitude - b.latitude || a.longitude - b.longitude);

  const stats = {
    총건수: final.length,
    이름있음: final.filter((t) => t.name !== "공중화장실" && t.name !== "이름 없는 화장실").length,
    주소있음: final.filter((t) => t.address).length,
    개방시간: final.filter((t) => t.openHours).length,
    장애인칸: final.filter((t) => t.hasDisabledStall).length,
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

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(final), "utf8");
  const kb = Math.round(fs.statSync(OUT_PATH).size / 1024);
  console.log(
    `\n✅ 저장 완료 → ${path.relative(ROOT, OUT_PATH)} (${kb}KB, ${final.length}건)`
  );
  if (kb > 4000)
    console.log(
      "   ⚠️ 번들이 큽니다. --sido 로 지역을 좁히거나 원격 데이터 전환을 검토하세요."
    );
}

main();
