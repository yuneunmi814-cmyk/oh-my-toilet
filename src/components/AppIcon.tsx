import { MaterialIcons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import type { StyleProp, TextStyle } from "react-native";
import { useSettings } from "@/store/settings";
import { fontSize } from "@/theme";

type MaterialName = ComponentProps<typeof MaterialIcons>["name"];

/** 앱에서 쓰는 의미 단위 아이콘 이름 → Material Icons 글리프 */
export type IconName =
  | "accessible" // 장애인 화장실
  | "open" // 개방화장실(민간 개방)
  | "customersOnly" // 고객 전용
  | "clock" // 개방시간
  | "star" // 즐겨찾기(켜짐)
  | "starOutline" // 즐겨찾기(꺼짐)
  | "report" // 사용자 제보
  | "restroom" // 공중화장실
  | "map" // 지도
  | "addPlace" // 제보하기
  | "place" // 위치
  | "walk" // 도보
  | "list" // 목록/관리
  | "changingTable" // 기저귀 교환대
  | "paid" // 유료
  | "settings";

const GLYPH: Record<IconName, MaterialName> = {
  accessible: "accessible",
  open: "storefront",
  customersOnly: "shopping-bag",
  clock: "schedule",
  star: "star",
  starOutline: "star-border",
  report: "person-pin-circle",
  restroom: "wc",
  map: "map",
  addPlace: "add-location-alt",
  place: "place",
  walk: "directions-walk",
  list: "checklist",
  changingTable: "baby-changing-station",
  paid: "paid",
  settings: "settings",
};

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

/**
 * 이모지 대신 쓰는 벡터 아이콘. 기기·OS 무관하게 동일하게 그려지고
 * 색은 테마 토큰을, 크기는 큰 글씨 모드(fontScale)를 따른다.
 */
export function AppIcon({ name, size = fontSize.sm, color, style }: Props) {
  const { fontScale } = useSettings();
  return (
    <MaterialIcons
      name={GLYPH[name]}
      size={Math.round(size * fontScale)}
      color={color}
      style={style}
    />
  );
}
