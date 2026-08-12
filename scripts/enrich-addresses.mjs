#!/usr/bin/env node
/**
 * 좌표는 있는데 주소가 빈 레코드를 역지오코딩으로 채운다.
 *
 * OSM `amenity=toilets` 는 좌표는 정확하지만 `addr:*` 태그가 거의 없다
 * (전국 수집 표본에서 주소 보유 9%). 앱 카드에 주소가 안 뜨면
 * "여기가 어디지?" 를 사용자가 지도로 되짚어야 해서, 특히 시니어에게 불친절하다.
 *
 * 사용법:
 *   KAKAO_REST_API_KEY=xxx node scripts/enrich-addresses.mjs            # osm 소스
 *   KAKAO_REST_API_KEY=xxx node scripts/enrich-addresses.mjs --source public-csv
 *
 * 옵션:
 *   --source <이름>    대상 raw 소스 (기본 osm)
 *   --limit <n>        앞 n건만 (테스트/키 절약)
 *   --provider <이름>  kakao | vworld | nominatim (기본 auto)
 *
 * 결과는 같은 raw 파일에 다시 쓴다. 캐시가 있어 재실행하면 이어서 진행한다.
 * 완료 후 npm run build:dataset 으로 병합해야 앱에 반영된다.
 */
import { argOf, readRaw, writeRaw } from "./lib/dataset.mjs";
import {
  QuotaExhaustedError,
  resolveProvider,
  reverseGeocodeAll,
} from "./lib/geocode.mjs";

const SOURCE = String(argOf("source", "osm"));
const LIMIT = Number(argOf("limit", Infinity));
const PROVIDER_NAME = argOf("provider", "auto");

async function main() {
  const records = readRaw(SOURCE);
  if (records.length === 0) {
    console.error(
      `❌ data/raw/${SOURCE}.json 이 비어 있습니다. 먼저 수집하세요 (npm run fetch:${SOURCE}).`
    );
    process.exit(1);
  }

  // 주소가 비었고 좌표는 있는 것만 대상
  const targets = [];
  records.forEach((rec, i) => {
    if (rec.address) return;
    if (!Number.isFinite(rec.latitude) || !Number.isFinite(rec.longitude)) return;
    targets.push({ i, lat: rec.latitude, lng: rec.longitude });
  });

  const pending = Number.isFinite(LIMIT) ? targets.slice(0, LIMIT) : targets;
  console.log(
    `📍 ${SOURCE}: 전체 ${records.length}건 중 주소 없음 ${targets.length}건` +
      `${pending.length !== targets.length ? ` → 이번 실행 ${pending.length}건` : ""}`
  );
  if (pending.length === 0) {
    console.log("✅ 채울 주소가 없습니다.");
    return;
  }

  let provider;
  try {
    provider = resolveProvider(PROVIDER_NAME);
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
  console.log(`🌐 역지오코딩 제공자: ${provider.name}`);
  if (provider.name === "nominatim")
    console.log(
      `   ⚠️ 초당 1건 제한이라 약 ${((pending.length * 1.1) / 3600).toFixed(1)}시간 걸립니다.`
    );

  let lastLog = 0;
  let result;
  try {
    result = await reverseGeocodeAll(
      pending.map(({ lat, lng }) => ({ lat, lng })),
      {
        provider,
        onProgress: (done, total, stats) => {
          if (done - lastLog >= 500 || done === total) {
            lastLog = done;
            console.log(
              `   … ${done}/${total} — 캐시 ${stats.cached}, 신규 ${stats.fetched}, 실패 ${stats.failed}`
            );
          }
        },
      }
    );
  } catch (e) {
    if (e instanceof QuotaExhaustedError) {
      console.error(
        `\n⛔ 한도/인증 문제로 중단: ${e.message}\n` +
          "   받은 주소는 캐시에 저장됐습니다. 한도 회복 후 다시 실행하면 이어집니다."
      );
      process.exit(2);
    }
    throw e;
  }

  let filled = 0;
  result.results.forEach((addr, k) => {
    if (!addr) return;
    records[pending[k].i].address = addr;
    filled++;
  });

  writeRaw(SOURCE, records);
  const total = records.filter((r) => r.address).length;
  console.log(
    `\n✅ 주소 ${filled}건 채움 → ${SOURCE} 전체 주소 보유 ${total}/${records.length}건` +
      ` (${Math.round((total / records.length) * 100)}%)`
  );
  console.log("   다음: npm run build:dataset 으로 병합하세요.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
