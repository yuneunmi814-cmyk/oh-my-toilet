import { ActivityIndicator, StyleSheet, View } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import { AppText as Text } from "@/components/AppText";
import { useLocation } from "@/hooks/useLocation";
import { useNearbyToilets } from "@/hooks/useNearbyToilets";
import { formatDistance, walkingMinutes } from "@/lib/distance";
import { openDirections } from "@/lib/directions";
import { colors, fontSize, spacing } from "@/theme";

export default function MapScreen() {
  const { coords, status } = useLocation();
  const { toilets, loading } = useNearbyToilets(coords);

  if (!coords) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.msg}>
          {status === "denied"
            ? "위치 권한이 필요해요."
            : "내 위치를 확인하는 중…"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        initialRegion={{
          latitude: coords.latitude,
          longitude: coords.longitude,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        }}
        showsUserLocation
        showsMyLocationButton
      >
        {toilets.map((t) => (
          <Marker
            key={t.id}
            coordinate={{ latitude: t.latitude, longitude: t.longitude }}
            title={t.name}
            description={`${formatDistance(t.distanceMeters)} · 도보 ${walkingMinutes(
              t.distanceMeters
            )}분${t.openHours ? ` · ${t.openHours}` : ""}`}
            pinColor={colors.primary}
            onCalloutPress={() => openDirections(t)}
          />
        ))}
      </MapView>

      {loading ? (
        <View style={styles.badge}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.badgeText}>화장실 불러오는 중…</Text>
        </View>
      ) : (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            내 주변 화장실 {toilets.length}곳 · 핀을 눌러 길찾기
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  msg: {
    marginTop: spacing.md,
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  badge: {
    position: "absolute",
    top: spacing.md,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primaryDark,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
  },
  badgeText: { color: "#fff", fontSize: fontSize.sm, fontWeight: "700" },
});
