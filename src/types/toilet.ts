/** 화장실 유형: 공중화장실 vs 개방화장실(민간 협약 개방) */
export type ToiletType = "public" | "open";

/** 앱 내부에서 사용하는 정규화된 화장실 정보 */
export interface Toilet {
  /** 고유 id (공공데이터에는 없어서 좌표+이름으로 생성) */
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  /** 개방시간 (예: "상시개방", "09:00~18:00") */
  openHours?: string;
  /** 장애인용 화장실 보유 여부 */
  hasDisabledStall?: boolean;
  /** 남녀공용 여부 */
  isUnisex?: boolean;
  /** 기저귀 교환대 보유 여부 */
  hasChangingTable?: boolean;
  /** 무료 여부 (true=무료 확인됨, false=유료, undefined=정보 없음) */
  isFree?: boolean;
  /**
   * 고객 전용 화장실 (카페·매장 등).
   * 누구나 쓸 수 있는 개방화장실과 달리 이용을 거절당할 수 있어 별도 표시한다.
   */
  customersOnly?: boolean;
  /** 층 정보 (예: "지하 1층", "3층") — 건물 안 화장실 찾을 때 필요 */
  floor?: string;
  /**
   * 공중화장실 / 개방화장실 구분.
   * 번들 축소를 위해 기본값("public")은 데이터에서 생략된다 — 없으면 공중화장실.
   */
  type?: ToiletType;
  /** 개방화장실일 때 제휴처 (예: "롯데마트", "용두시티") */
  host?: string;
  /** 관리기관/전화 */
  managedBy?: string;
  phone?: string;
  /**
   * 데이터 출처 (user = 사용자 제보).
   * 번들 축소를 위해 기본값("publicData")은 데이터에서 생략된다.
   */
  source?: "publicData" | "osm" | "mock" | "user";
}

/** 거리 정보가 붙은 화장실 (홈 화면 리스트용) */
export interface ToiletWithDistance extends Toilet {
  /** 현재 위치로부터의 직선거리 (m) */
  distanceMeters: number;
}
