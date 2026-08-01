import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatDistance, walkingMinutes } from "@/lib/distance";
import { openDirections } from "@/lib/directions";
import { colors, fontSize, radius, spacing } from "@/theme";
import type { ToiletWithDistance } from "@/types/toilet";

interface Props {
  toilet: ToiletWithDistance;
}

/** 홈 리스트의 화장실 한 칸. 탭하면 지도앱 길찾기로 연결. */
export function ToiletCard({ toilet }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => openDirections(toilet)}
      accessibilityRole="button"
      accessibilityLabel={`${toilet.name}, ${formatDistance(
        toilet.distanceMeters
      )}, 도보 ${walkingMinutes(toilet.distanceMeters)}분. 길찾기 열기`}
    >
      <View style={styles.row}>
        <Text style={styles.name} numberOfLines={1}>
          {toilet.name}
        </Text>
        <Text style={styles.distance}>
          {formatDistance(toilet.distanceMeters)}
        </Text>
      </View>

      <Text style={styles.address} numberOfLines={1}>
        {toilet.address || "주소 정보 없음"}
      </Text>

      <View style={styles.tags}>
        <Text style={styles.walk}>
          🚶 도보 약 {walkingMinutes(toilet.distanceMeters)}분
        </Text>
        {toilet.openHours ? (
          <Text style={styles.tag}>🕒 {toilet.openHours}</Text>
        ) : null}
        {toilet.hasDisabledStall ? (
          <Text style={styles.tag}>♿ 장애인</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.6 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.text,
    marginRight: spacing.sm,
  },
  distance: {
    fontSize: fontSize.lg,
    fontWeight: "800",
    color: colors.primary,
  },
  address: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  walk: { fontSize: fontSize.sm, color: colors.text, fontWeight: "600" },
  tag: { fontSize: fontSize.sm, color: colors.textMuted },
});
