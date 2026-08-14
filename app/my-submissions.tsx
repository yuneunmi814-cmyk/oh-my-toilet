import { Alert, FlatList, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText as Text } from "@/components/AppText";
import { AppIcon } from "@/components/AppIcon";
import { Tag } from "@/components/Tag";
import { openDirections } from "@/lib/directions";
import { useSubmissions } from "@/store/submissions";
import { colors, fontSize, radius, spacing } from "@/theme";

/** 내가 제보한 화장실 목록 — 확인 및 삭제. */
export default function MySubmissionsScreen() {
  const insets = useSafeAreaInsets();
  const { submissions, removeSubmission } = useSubmissions();

  const confirmDelete = (id: string, name: string) =>
    Alert.alert("제보 삭제", `"${name}"을(를) 삭제할까요?`, [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: () => removeSubmission(id) },
    ]);

  if (submissions.length === 0) {
    return (
      <View style={styles.center}>
        <AppIcon name="report" size={56} color={colors.textMuted} />
        <Text style={styles.title}>아직 제보한 곳이 없어요</Text>
        <Text style={styles.desc}>
          산책 중 발견한 화장실을{"\n"}제보하면 여기에 모여요.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <FlatList
        data={submissions}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={styles.count}>내가 제보한 곳 {submissions.length}곳</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <Tag
                icon={item.type === "open" ? "open" : "restroom"}
                label={item.type === "open" ? "개방" : "공중"}
                color={item.type === "open" ? colors.primary : colors.textMuted}
                bold
              />
            </View>
            {item.openHours ? (
              <Tag icon="clock" label={item.openHours} style={styles.metaRow} />
            ) : null}
            {item.host ? (
              <Tag icon="open" label={item.host} style={styles.metaRow} />
            ) : null}
            <Tag
              icon="place"
              label={`${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}`}
              style={styles.metaRow}
            />

            <View style={styles.actions}>
              <Pressable
                style={styles.dirBtn}
                onPress={() => openDirections(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.name} 길찾기`}
              >
                <Text style={styles.dirText}>길찾기</Text>
              </Pressable>
              <Pressable
                style={styles.delBtn}
                onPress={() => confirmDelete(item.id, item.name)}
                accessibilityRole="button"
                accessibilityLabel={`${item.name} 삭제`}
              >
                <Text style={styles.delText}>삭제</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.md },
  count: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
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
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
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
  metaRow: { marginTop: spacing.xs },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  dirBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  dirText: { color: colors.primary, fontSize: fontSize.md, fontWeight: "700" },
  delBtn: {
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  delText: { color: colors.danger, fontSize: fontSize.md, fontWeight: "700" },
});
