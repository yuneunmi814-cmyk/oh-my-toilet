import { router } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ToiletCard } from "@/components/ToiletCard";
import { useLocation } from "@/hooks/useLocation";
import { useNearbyToilets } from "@/hooks/useNearbyToilets";
import { colors, fontSize, radius, spacing } from "@/theme";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { coords, status, refresh } = useLocation();
  const { toilets, loading, reload } = useNearbyToilets(coords);

  // 위치 권한 거부 상태
  if (status === "denied") {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyEmoji}>📍</Text>
        <Text style={styles.emptyTitle}>위치 권한이 필요해요</Text>
        <Text style={styles.emptyDesc}>
          가까운 화장실을 찾으려면{"\n"}위치 접근을 허용해 주세요.
        </Text>
        <Pressable style={styles.button} onPress={refresh}>
          <Text style={styles.buttonText}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }

  // 최초 위치 로딩
  if (status === "loading" || (status === "idle" && !coords)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.emptyDesc}>내 위치를 확인하는 중…</Text>
      </View>
    );
  }

  const nearest = toilets[0];

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <FlatList
        data={toilets}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} />
        }
        ListHeaderComponent={
          <View>
            {nearest ? (
              <View style={styles.hero}>
                <Text style={styles.heroLabel}>가장 가까운 화장실</Text>
                <Text style={styles.heroName}>{nearest.name}</Text>
                <Text style={styles.heroMeta}>
                  여기서 {Math.round(nearest.distanceMeters)}m
                </Text>
              </View>
            ) : null}
            <View style={styles.navRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.navButton,
                  pressed && styles.navButtonPressed,
                ]}
                onPress={() => router.push("/map")}
                accessibilityRole="button"
                accessibilityLabel="지도로 보기"
              >
                <Text style={styles.navButtonText}>🗺️  지도</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.navButton,
                  pressed && styles.navButtonPressed,
                ]}
                onPress={() => router.push("/favorites")}
                accessibilityRole="button"
                accessibilityLabel="즐겨찾기"
              >
                <Text style={styles.navButtonText}>⭐  즐겨찾기</Text>
              </Pressable>
            </View>
          </View>
        }
        renderItem={({ item }) => <ToiletCard toilet={item} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.center}>
              <Text style={styles.emptyEmoji}>🚽</Text>
              <Text style={styles.emptyTitle}>
                주변 화장실을 찾지 못했어요
              </Text>
            </View>
          ) : null
        }
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
  hero: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  heroLabel: { color: "#D1FAE5", fontSize: fontSize.sm, fontWeight: "700" },
  heroName: {
    color: "#fff",
    fontSize: fontSize.xl,
    fontWeight: "800",
    marginTop: spacing.xs,
  },
  heroMeta: { color: "#ECFDF5", fontSize: fontSize.md, marginTop: spacing.xs },
  navRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  navButton: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  navButtonPressed: { backgroundColor: colors.card },
  navButtonText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: "800",
  },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 26,
  },
  button: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
  },
  buttonText: { color: "#fff", fontSize: fontSize.md, fontWeight: "700" },
});
