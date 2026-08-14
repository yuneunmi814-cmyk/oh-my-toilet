import { Pressable, StyleSheet, View } from "react-native";
import { AppText as Text } from "@/components/AppText";
import { AppIcon } from "@/components/AppIcon";
import { Tag } from "@/components/Tag";
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
          <AppIcon
            name={fav ? "star" : "starOutline"}
            size={fontSize.xl}
            color={fav ? colors.accent : colors.textMuted}
          />
        </Pressable>
      </View>

      <Text style={styles.address} numberOfLines={1}>
        {[toilet.address, toilet.floor].filter(Boolean).join(" · ") ||
          "주소 정보 없음"}
      </Text>

      <View style={styles.tags}>
        {hasDistance ? (
          <Tag
            icon="walk"
            label={`도보 약 ${walkingMinutes(toilet.distanceMeters!)}분`}
            color={colors.text}
            bold
          />
        ) : null}
        {/* 고객 전용은 헛걸음할 수 있으니 가장 먼저 경고한다 */}
        {toilet.customersOnly ? (
          <Tag icon="customersOnly" label="고객 전용" color={colors.danger} bold />
        ) : null}
        {toilet.type === "open" ? (
          <Tag
            icon="open"
            label={`개방${toilet.host ? ` · ${toilet.host}` : ""}`}
            color={colors.primary}
            bold
          />
        ) : null}
        {toilet.openHours ? (
          <Tag icon="clock" label={toilet.openHours} />
        ) : null}
        {toilet.hasDisabledStall ? (
          <Tag icon="accessible" label="장애인" />
        ) : null}
        {toilet.hasChangingTable ? (
          <Tag icon="changingTable" label="기저귀대" />
        ) : null}
        {toilet.isFree === false ? (
          <Tag icon="paid" label="유료" color={colors.danger} bold />
        ) : null}
        {toilet.source === "user" ? (
          <Tag icon="report" label="제보" color={colors.accent} bold />
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
});
