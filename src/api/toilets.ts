import type { Coords } from "@/hooks/useLocation";
import { TILE_COUNTS, TILE_LOADERS, TILE_SIZE } from "@/data/regions";
import { haversineMeters } from "@/lib/distance";
import type { Toilet, ToiletWithDistance } from "@/types/toilet";
import { MOCK_TOILETS } from "./mockToilets";

/**
 * 화장실 데이터 소스.
 *
 * 전국 4.8만 건을 한 파일로 두면 12MB 라 앱을 켤 때마다 통째로 파싱해야 했다.
 * 그래서 파이프라인(scripts/build-dataset.mjs)이 0.5° 격자로 쪼개 두고,
 * 여기서는 사용자가 있는 타일만 읽는다. 한 번 읽은 타일은 캐시에 남는다.
 *
 * 데이터 생성은 README 의 "데이터 파이프라인" 참고.
 */

/** 타일 경계에서 이 거리 안쪽이면 이웃 타일도 함께 읽는다 */
const EDGE_MARGIN_M = 3000;

const DEG_LAT_M = 111_000;

const cache = new Map<string, Toilet[]>();

/** 데이터셋이 준비돼 있는지 (파이프라인 미실행이면 목업으로 폴백) */
export const isUsingRealData = Object.keys(TILE_COUNTS).length > 0;

function loadTile(key: string): Toilet[] {
  const cached = cache.get(key);
  if (cached) return cached;
  const loader = TILE_LOADERS[key];
  if (!loader) return [];
  const data = loader();
  cache.set(key, data);
  return data;
}

/**
 * 읽어야 할 타일 키 목록.
 *
 * 기본은 사용자가 선 타일 하나. 다만 타일 경계 근처에 서 있으면 바로 옆
 * 타일의 화장실이 더 가까울 수 있어서, 경계까지 3km 안쪽이면 그쪽 이웃도 읽는다.
 * (타일 한 변이 약 50km 라 대부분은 한 장만 읽는다.)
 */
function tilesToLoad({ latitude, longitude }: Coords): string[] {
  const x = Math.floor(latitude / TILE_SIZE);
  const y = Math.floor(longitude / TILE_SIZE);

  const lngMeter = DEG_LAT_M * Math.cos((latitude * Math.PI) / 180);
  const south = (latitude - x * TILE_SIZE) * DEG_LAT_M;
  const north = ((x + 1) * TILE_SIZE - latitude) * DEG_LAT_M;
  const west = (longitude - y * TILE_SIZE) * lngMeter;
  const east = ((y + 1) * TILE_SIZE - longitude) * lngMeter;

  const dx = [0];
  if (south < EDGE_MARGIN_M) dx.push(-1);
  if (north < EDGE_MARGIN_M) dx.push(1);
  const dy = [0];
  if (west < EDGE_MARGIN_M) dy.push(-1);
  if (east < EDGE_MARGIN_M) dy.push(1);

  const keys: string[] = [];
  for (const i of dx)
    for (const j of dy) {
      const key = `${x + i}_${y + j}`;
      if (TILE_COUNTS[key]) keys.push(key);
    }
  return keys;
}

/**
 * 현재 위치에서 가까운 화장실을 거리순으로 반환한다.
 * @param extra 데이터셋에 합쳐서 보여줄 추가 화장실 (예: 사용자 제보)
 */
export async function getNearbyToilets(
  coords: Coords,
  extra: Toilet[] = [],
  limit = 20
): Promise<ToiletWithDistance[]> {
  // 파이프라인을 아직 안 돌린 개발 환경에서만 목업으로 폴백한다.
  // 실데이터가 있는데 주변 타일이 비면(해외 등) 빈 목록이 맞다 —
  // 엉뚱한 지역 화장실을 "가까운 곳"이라고 보여주면 안 된다.
  const pool = isUsingRealData
    ? tilesToLoad(coords).flatMap(loadTile)
    : MOCK_TOILETS;

  return [...pool, ...extra]
    .map((t) => ({
      ...t,
      distanceMeters: haversineMeters(
        coords.latitude,
        coords.longitude,
        t.latitude,
        t.longitude
      ),
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);
}
