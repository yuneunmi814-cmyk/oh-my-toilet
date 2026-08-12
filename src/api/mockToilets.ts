import type { Toilet } from "@/types/toilet";

/**
 * 서울 시청 주변 목업 데이터.
 * API 키가 없을 때 앱이 그대로 동작하도록 하는 용도.
 */
export const MOCK_TOILETS: Toilet[] = [
  {
    id: "mock-1",
    name: "서울시청 개방화장실",
    address: "서울 중구 세종대로 110",
    latitude: 37.5663,
    longitude: 126.9779,
    openHours: "09:00~18:00",
    hasDisabledStall: true,
    isUnisex: false,
    managedBy: "서울특별시청",
    source: "mock",
  },
  {
    id: "mock-2",
    name: "청계광장 공중화장실",
    address: "서울 중구 태평로1가",
    latitude: 37.5691,
    longitude: 126.9779,
    openHours: "상시개방",
    hasDisabledStall: true,
    source: "mock",
  },
  {
    id: "mock-3",
    name: "덕수궁 앞 공중화장실",
    address: "서울 중구 세종대로 99",
    latitude: 37.5658,
    longitude: 126.9751,
    openHours: "05:00~23:00",
    hasDisabledStall: false,
    source: "mock",
  },
  {
    id: "mock-4",
    name: "롯데백화점 본점 개방화장실",
    address: "서울 중구 남대문로 81",
    latitude: 37.5660,
    longitude: 126.9827,
    openHours: "10:30~20:00",
    hasDisabledStall: true,
    type: "open",
    host: "롯데백화점",
    source: "mock",
  },
  {
    id: "mock-5",
    name: "광화문광장 공중화장실",
    address: "서울 종로구 세종로",
    latitude: 37.5725,
    longitude: 126.9769,
    openHours: "상시개방",
    hasDisabledStall: true,
    source: "mock",
  },
];
