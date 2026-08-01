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
  /** 관리기관/전화 */
  managedBy?: string;
  phone?: string;
  /** 데이터 출처 */
  source: "publicData" | "osm" | "mock";
}

/** 거리 정보가 붙은 화장실 (홈 화면 리스트용) */
export interface ToiletWithDistance extends Toilet {
  /** 현재 위치로부터의 직선거리 (m) */
  distanceMeters: number;
}
