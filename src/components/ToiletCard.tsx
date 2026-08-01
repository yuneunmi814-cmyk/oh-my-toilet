import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatDistance, walkingMinutes } from "@/lib/distance";
import { openDirections } from "@/lib/directions";
import { useFavorites } from "@/store/favorites";
import { colors, fontSize, radius, spacing } from "@/theme";
import type { Toilet } from "@/types/toilet";

interface Props {
  /** 홈/지도에서는 거리가 있고, 즐겨찾기에서는 없을 수 있다. */
  toilet: Toilet & { distanceMeters?: number };
}

/** 화장실 한 칸. 본문 탭 → 길찾기, 별 탭 → 즐겨찾기 토글. */
export function ToiletCard({ toilet }: Props) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const fav = isFavorite(toilet.id);
  const hasDistance = typeof toilet.distanceMeters === "number";

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => openDirections(toilet)}
      accessibilityRole="button"
      accessibilityLabel={`${toilet.name}${
        hasDistance
          ? `, ${formatDistance(toilet.distanceMeters!)}, 도보 ${walkingMinutes(
              toilet.distanceMeters!
            )}분`
          : ""
      }. 길찾기 열기`}
    >
      <View style={styles.row}>
        <Text style={styles.name} numberOfLines={1}>
          {toilet.name}
        </Text>
        {hasDistance ? (
          <Text style={styles.distance}>
            {formatDistance(toilet.distanceMeters!)}
          </Text>
        ) : null}
        <Pressable
          onPress={() => toggleFavorite(toilet)}
          hitSlop={10}
          style={styles.starButton}
          accessibilityRole="button"
          accessibilityLabel={fav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
        >
          <Text style={[styles.star, fav && styles.starOn]}>
            {fav ? "⭐" : "☆"}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.address} numberOfLines={1}>
        {toilet.address || "주소 정보 없음"}
      </Text>

      <View style={styles.tags}>
        {hasDistance ? (
          <Text style={styles.walk}>
            🚶 도보 약 {walkingMinutes(toilet.distanceMeters!)}분
          </Text>
        ) : null}
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
    marginRight: spacing.sm,
  },
  starButton: { paddingHorizontal: spacing.xs },
  star: { fontSize: fontSize.xl, color: colors.textMuted },
  starOn: { color: colors.accent },
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
