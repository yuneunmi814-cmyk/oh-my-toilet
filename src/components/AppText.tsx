import { StyleSheet, Text, type TextProps } from "react-native";
import { useSettings } from "@/store/settings";

/**
 * 큰 글씨 모드 배율(fontScale)을 자동으로 반영하는 Text.
 * 스타일에 지정된 fontSize에 배율을 곱해 덮어쓴다.
 * 화면 텍스트에는 기본 Text 대신 이 컴포넌트를 쓴다.
 */
export function AppText({ style, ...rest }: TextProps) {
  const { fontScale } = useSettings();
  const flat = StyleSheet.flatten(style) ?? {};
  const scaled =
    typeof flat.fontSize === "number"
      ? { fontSize: Math.round(flat.fontSize * fontScale) }
      : null;
  return <Text {...rest} style={[style, scaled]} />;
}
