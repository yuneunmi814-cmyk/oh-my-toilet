#!/usr/bin/env node
/**
 * 제천시 개방화장실 안내(공식 Notion 페이지) → 좌표 포함 toilets.json 생성.
 *
 * 출처: https://caramel-match-caa.notion.site/3b0ac045c33f49709a835b743864600d
 *  (제천시가 QR코드로 안내하는 공식 개방화장실 현황 페이지)
 *
 * 이 페이지의 표에는 장소명·개방시간·연락처·네이버지도 단축링크(naver.me)가 있다.
 * 각 naver.me 링크를 따라가면 주소와 좌표(웹 메르카토르, EPSG:3857)가 나오므로,
 * 이를 WGS84 위경도로 변환해 앱 데이터셋을 만든다. (카카오 지오코딩 불필요)
 *
 * 결과는 data/raw/jecheon.json 에 저장되고, 앱 데이터는
 * scripts/build-dataset.mjs 가 다른 소스와 병합해 만든다.
 *
 * 사용법:  node scripts/sources/jecheon-notion.mjs
 * 옵션:    --page <notion_page_id>   (기본: 제천 개방화장실 페이지)
 */
import path from "node:path";
import { ROOT, argOf, writeRaw } from "../lib/dataset.mjs";

const RAW_PAGE = argOf("page", "3b0ac045c33f49709a835b743864600d");
const PAGE_ID = String(RAW_PAGE).replace(
  /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
  "$1-$2-$3-$4-$5"
);
const NOTION_HOST = "https://caramel-match-caa.notion.site";

// 공중화장실 성격이 강한 장소(24시간 공공시설)는 public, 나머지는 open으로 분류
const PUBLIC_RE = /공중화장실|공원|광장|근린|시민|솔방죽|엑스포|주차타워|장평천|하소/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 웹 메르카토르(EPSG:3857) → WGS84 위경도 */
function merc2wgs(x, y) {
  const R = 20037508.34;
  const lng = (x / R) * 180;
  const latRad = (y / R) * Math.PI;
  const lat = (180 / Math.PI) * (2 * Math.atan(Math.exp(latRad)) - Math.PI / 2);
  return { lat, lng };
}

/** 표의 한 행에서 셀 텍스트/링크를 역할별로 분류 */
function classifyRow(props) {
  let link = "",
    hours = "",
    phone = "",
    num = "",
    name = "";
  for (const segs of Object.values(props || {})) {
    let text = "";
    let url = "";
    for (const seg of segs) {
      if (typeof seg[0] === "string") text += seg[0];
      if (Array.isArray(seg[1])) {
        for (const f of seg[1]) if (f && f[0] === "a") url = f[1];
      }
    }
    text = text.trim();
    if (url.includes("naver.me")) link = url;
    else if (/^\d+$/.test(text)) num = text;
    else if (/\d{2,3}-\d{3,4}-\d{4}/.test(text)) phone = text;
    else if (/\d{1,2}:\d{2}/.test(text)) hours = text.replace(/\s+/g, " ");
    else if (text && text !== "📍지도") name = text;
  }
  return { link, hours, phone, num, name };
}

/** naver.me 링크 → { lat, lng, address } */
async function resolveNaver(shortUrl) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(shortUrl, {
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      const finalUrl = decodeURIComponent(res.url);
      // /address/LON,LAT,주소 또는 /place/ 뒤의 첫 메르카토르 좌표쌍
      const m = finalUrl.match(/(1\d{7}\.\d+),(\d{7}\.\d+)/);
      if (!m) return null;
      const { lat, lng } = merc2wgs(Number(m[1]), Number(m[2]));
      const addrMatch = finalUrl.match(/,((?:충청북도|충북)[^,?]+)/);
      const address = addrMatch ? addrMatch[1].trim() : "";
      return { lat, lng, address };
    } catch {
      await sleep(600);
    }
  }
  return null;
}

async function main() {
  console.log("📄 Notion 페이지 로드:", PAGE_ID);
  const res = await fetch(`${NOTION_HOST}/api/v3/loadPageChunk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify({
      pageId: PAGE_ID,
      limit: 100,
      cursor: { stack: [] },
      chunkNumber: 0,
      verticalColumns: false,
    }),
  });
  if (!res.ok) throw new Error(`Notion API 오류: ${res.status}`);
  const data = await res.json();
  const blocks = data.recordMap.block;

  const rows = [];
  for (const bv of Object.values(blocks)) {
    const v = bv?.value?.value;
    if (v?.type !== "table_row") continue;
    const r = classifyRow(v.properties);
    if (r.link && r.name) rows.push(r); // 헤더/빈행 제외
  }
  console.log(`🚻 표에서 ${rows.length}곳 발견, 좌표 변환 중…`);

  const out = [];
  for (const r of rows) {
    const geo = await resolveNaver(r.link);
    if (!geo) {
      console.warn(`  ⚠️ 좌표 실패: ${r.name}`);
      continue;
    }
    const type = PUBLIC_RE.test(r.name) ? "public" : "open";
    out.push({
      id: `jecheon-${r.num || out.length + 1}`,
      name: r.name,
      address: geo.address,
      latitude: Number(geo.lat.toFixed(6)),
      longitude: Number(geo.lng.toFixed(6)),
      openHours: r.hours || undefined,
      type,
      phone: r.phone || undefined,
      managedBy: "제천시",
      source: "publicData",
    });
    console.log(`  ✓ ${r.name} (${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)})`);
    await sleep(150);
  }

  const outPath = writeRaw("jecheon", out);
  console.log(
    `\n✅ 완료: ${out.length}/${rows.length}곳 → ${path.relative(ROOT, outPath)}`
  );
  console.log("   다음: npm run build:dataset 으로 병합하세요.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
