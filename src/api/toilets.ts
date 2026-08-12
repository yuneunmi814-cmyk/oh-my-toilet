import type { Coords } from "@/hooks/useLocation";
import bundledData from "@/data/toilets.json";
import { haversineMeters } from "@/lib/distance";
import type { Toilet, ToiletWithDistance } from "@/types/toilet";
import { MOCK_TOILETS } from "./mockToilets";

/**
 * 화장실 데이터 소스.
 *
 * 이 파일은 데이터 파이프라인이 생성한다. 소스별로 data/raw/*.json 에 수집한 뒤
 * scripts/build-dataset.mjs 가 병합·중복제거해서 여기에 쓴다:
 *   - OSM Overpass (좌표 내장, 키 불필요)
 *   - 전국공중화장실표준데이터 CSV + 지오코딩
 *     (이 데이터셋은 2025년 2월부터 좌표 제공이 중단돼 주소→좌표 변환이 필요하다)
 *   - 지자체 개방화장실 공식 페이지 (제천 등)
 * 자세한 실행법은 README 의 "데이터 파이프라인" 참고.
 *
 * 데이터셋이 비어 있으면(파이프라인 미실행) 목업으로 폴백한다.
 */
const DATASET = bundledData as Toilet[];

function toiletSource(): Toilet[] {
  return DATASET.length > 0 ? DATASET : MOCK_TOILETS;
}

/** 현재 데이터가 실데이터(공공데이터 기반)인지 여부 */
export const isUsingRealData = DATASET.length > 0;

/**
 * 현재 위치에서 가까운 화장실을 거리순으로 반환한다.
 * (데이터셋 전체를 클라이언트에서 거리 계산 후 정렬)
 * @param extra 데이터셋에 합쳐서 보여줄 추가 화장실 (예: 사용자 제보)
 */
export async function getNearbyToilets(
  coords: Coords,
  extra: Toilet[] = [],
  limit = 20
): Promise<ToiletWithDistance[]> {
  return [...toiletSource(), ...extra]
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
