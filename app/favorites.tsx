import { useMemo } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText as Text } from "@/components/AppText";
import { AppIcon } from "@/components/AppIcon";
import { ToiletCard } from "@/components/ToiletCard";
import { useLocation } from "@/hooks/useLocation";
import { haversineMeters } from "@/lib/distance";
import { useFavorites } from "@/store/favorites";
import { colors, fontSize, spacing } from "@/theme";

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const { favorites } = useFavorites();
  const { coords } = useLocation();

  // 현재 위치를 알면 거리 계산 후 가까운 순으로 정렬한다.
  const items = useMemo(() => {
    if (!coords) return favorites;
    return favorites
      .map((t) => ({
        ...t,
        distanceMeters: haversineMeters(
          coords.latitude,
          coords.longitude,
          t.latitude,
          t.longitude
        ),
      }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }, [favorites, coords]);

  if (favorites.length === 0) {
    return (
      <View style={styles.center}>
        <AppIcon name="starOutline" size={56} color={colors.textMuted} />
        <Text style={styles.title}>저장한 화장실이 없어요</Text>
        <Text style={styles.desc}>
          자주 가는 곳이나 미리 알아두고 싶은{"\n"}
          화장실의 별 아이콘을 눌러 저장해 두세요.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <FlatList
        data={items}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <ToiletCard toilet={item} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.md },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: colors.bg,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
    marginTop: spacing.md,
  },
  desc: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 26,
  },
});
