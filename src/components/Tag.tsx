import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { AppText as Text } from "@/components/AppText";
import { AppIcon, type IconName } from "@/components/AppIcon";
import { colors, fontSize } from "@/theme";

interface Props {
  icon: IconName;
  label: string;
  color?: string;
  bold?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** 아이콘 + 라벨의 정보 배지 (화장실 카드 시설 표시 등). */
export function Tag({ icon, label, color = colors.textMuted, bold, style }: Props) {
  return (
    <View style={[styles.tag, style]}>
      <AppIcon name={icon} size={fontSize.sm} color={color} />
      <Text style={[styles.label, { color }, bold && styles.bold]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { flexDirection: "row", alignItems: "center", gap: 3 },
  label: { fontSize: fontSize.sm },
  bold: { fontWeight: "700" },
});
