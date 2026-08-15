import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText as Text } from "@/components/AppText";
import { AppIcon, type IconName } from "@/components/AppIcon";
import { useSettings } from "@/store/settings";
import { colors, fontSize, radius, spacing } from "@/theme";

const POINTS: { icon: IconName; text: string }[] = [
  { icon: "place", text: "가까운 화장실을 찾는 데에만 위치를 씁니다." },
  { icon: "restroom", text: "위치는 기기 안에서만 쓰이고 서버로 보내지 않아요." },
  { icon: "star", text: "회원가입 없이 바로 쓰고, 저장한 정보는 언제든 지울 수 있어요." },
];

/** 첫 진입 시 위치정보 이용 동의 화면 (위치정보법상 사전 동의). */
export function LocationConsent() {
  const insets = useSafeAreaInsets();
  const { setLocationConsent, locationConsent } = useSettings();

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg },
      ]}
    >
      <View style={styles.body}>
        <AppIcon name="place" size={64} color={colors.primary} />
        <Text style={styles.title}>위치정보 이용 동의</Text>
        <Text style={styles.desc}>
          Oh My Toilet은 지금 내 주변의 화장실을 찾아드려요.
        </Text>

        <View style={styles.points}>
          {POINTS.map((p) => (
            <View key={p.icon} style={styles.point}>
              <AppIcon name={p.icon} size={fontSize.lg} color={colors.primary} />
              <Text style={styles.pointText}>{p.text}</Text>
            </View>
          ))}
        </View>

        <Pressable onPress={() => router.push("/privacy")}>
          <Text style={styles.link}>개인정보처리방침 보기</Text>
        </Pressable>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={styles.agree}
          onPress={() => setLocationConsent(true)}
          accessibilityRole="button"
        >
          <Text style={styles.agreeText}>동의하고 시작하기</Text>
        </Pressable>
        {locationConsent === false ? (
          <Text style={styles.declined}>
            동의하지 않으면 화장실 찾기를 이용할 수 없어요.
          </Text>
        ) : (
          <Pressable onPress={() => setLocationConsent(false)}>
            <Text style={styles.decline}>동의하지 않음</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.lg,
    justifyContent: "space-between",
  },
  body: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: {
    fontSize: fontSize.xl,
    fontWeight: "800",
    color: colors.text,
    marginTop: spacing.md,
  },
  desc: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 26,
  },
  points: {
    alignSelf: "stretch",
    gap: spacing.md,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  point: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  pointText: { flex: 1, fontSize: fontSize.md, color: colors.text, lineHeight: 24 },
  link: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  actions: { gap: spacing.md, alignItems: "center" },
  agree: {
    alignSelf: "stretch",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  agreeText: { color: "#fff", fontSize: fontSize.lg, fontWeight: "800" },
  decline: { fontSize: fontSize.md, color: colors.textMuted, padding: spacing.sm },
  declined: {
    fontSize: fontSize.sm,
    color: colors.danger,
    textAlign: "center",
  },
});
