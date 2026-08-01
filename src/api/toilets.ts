import type { Coords } from "@/hooks/useLocation";
import { haversineMeters } from "@/lib/distance";
import type { Toilet, ToiletWithDistance } from "@/types/toilet";
import { MOCK_TOILETS } from "./mockToilets";

/**
 * 공공데이터포털 전국공중화장실표준데이터 Open API.
 * 활용신청: https://www.data.go.kr/data/15012892/standard.do
 *
 * 표준데이터 API는 좌표 반경 검색을 직접 지원하지 않고 전체 목록을
 * 페이지 단위로 내려준다. MVP에서는 한 페이지를 받아 클라이언트에서
 * 거리순 정렬/필터한다. (지역 확장 시 서버 캐시로 옮기는 것을 권장)
 */
const BASE_URL = "https://api.data.go.kr/openapi/tn_pubr_public_toilet_api";

// .env 의 EXPO_PUBLIC_ 접두 변수는 Expo가 런타임에 주입한다.
const API_KEY = process.env.EXPO_PUBLIC_PUBLIC_DATA_API_KEY ?? "";

/** 공공데이터 원본 레코드 → 앱 내부 타입으로 정규화 */
function normalize(raw: Record<string, any>): Toilet | null {
  const lat = Number(raw.latitude ?? raw.la);
  const lon = Number(raw.longitude ?? raw.lo);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const name = raw.restroomNm ?? raw.toiletNm ?? "이름 없는 화장실";
  const address = raw.roadNmAddr || raw.lotnoAddr || raw.rdnmadr || "";

  return {
    id: `pub-${lat.toFixed(5)}-${lon.toFixed(5)}-${name}`,
    name,
    address,
    latitude: lat,
    longitude: lon,
    openHours: raw.openTime ?? raw.openTimeDetail ?? undefined,
    hasDisabledStall:
      Number(raw.disabledMaleToiletBowlNumber ?? 0) > 0 ||
      Number(raw.disabledFemaleToiletBowlNumber ?? 0) > 0,
    isUnisex: raw.unisexToiletYn === "Y",
    managedBy: raw.instNm ?? undefined,
    phone: raw.phoneNumber ?? undefined,
    source: "publicData",
  };
}

async function fetchFromApi(): Promise<Toilet[]> {
  const params = new URLSearchParams({
    serviceKey: API_KEY,
    pageNo: "1",
    numOfRows: "200",
    type: "json",
  });

  const res = await fetch(`${BASE_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`공공데이터 API 오류: ${res.status}`);

  const json = await res.json();
  const rows: Record<string, any>[] =
    json?.response?.body?.items ?? json?.body?.items ?? [];

  return rows.map(normalize).filter((t): t is Toilet => t !== null);
}

/**
 * 현재 위치에서 가까운 화장실을 거리순으로 반환한다.
 * API 키가 없거나 호출이 실패하면 목업 데이터로 폴백한다.
 */
export async function getNearbyToilets(
  coords: Coords,
  limit = 20
): Promise<ToiletWithDistance[]> {
  let toilets: Toilet[];

  if (API_KEY) {
    try {
      toilets = await fetchFromApi();
    } catch (e) {
      console.warn("[toilets] API 실패, 목업으로 폴백:", e);
      toilets = MOCK_TOILETS;
    }
  } else {
    toilets = MOCK_TOILETS;
  }

  return toilets
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
