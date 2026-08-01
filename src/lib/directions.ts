import { Linking } from "react-native";
import type { Toilet } from "@/types/toilet";

/**
 * 카카오맵 길찾기로 연결한다. 앱이 없으면 브라우저 카카오맵으로 폴백된다.
 * (추후 사용자 기본 지도앱 선택 기능으로 확장 가능)
 */
export function openDirections(toilet: Pick<Toilet, "name" | "latitude" | "longitude">) {
  const url = `https://map.kakao.com/link/to/${encodeURIComponent(
    toilet.name
  )},${toilet.latitude},${toilet.longitude}`;
  Linking.openURL(url).catch(() => {});
}
