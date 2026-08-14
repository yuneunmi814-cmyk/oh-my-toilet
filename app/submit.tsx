import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText as Text } from "@/components/AppText";
import { useLocation } from "@/hooks/useLocation";
import { useSubmissions } from "@/store/submissions";
import { colors, fontSize, radius, spacing } from "@/theme";
import type { ToiletType } from "@/types/toilet";

/** 사용자 제보 폼: 산책 중 발견한 화장실을 현재 위치로 등록한다. */
export default function SubmitScreen() {
  const insets = useSafeAreaInsets();
  const { coords, status, refresh } = useLocation();
  const { addSubmission, submissions } = useSubmissions();

  const [name, setName] = useState("");
  const [type, setType] = useState<ToiletType>("public");
  const [host, setHost] = useState("");
  const [openHours, setOpenHours] = useState("");
  const [hasDisabledStall, setHasDisabledStall] = useState(false);

  const canSubmit = name.trim().length > 0 && !!coords;

  const submit = () => {
    if (!coords) {
      Alert.alert("위치를 확인할 수 없어요", "위치 권한을 허용한 뒤 다시 시도해 주세요.");
      return;
    }
    if (!name.trim()) {
      Alert.alert("이름을 입력해 주세요", "예: 용두천 산책로 개방화장실");
      return;
    }
    addSubmission({
      id: `user-${Date.now()}`,
      name: name.trim(),
      address: "",
      latitude: coords.latitude,
      longitude: coords.longitude,
      openHours: openHours.trim() || undefined,
      hasDisabledStall,
      type,
      host: type === "open" && host.trim() ? host.trim() : undefined,
      source: "user",
    });
    Alert.alert("제보 완료 🎉", "목록과 지도에 바로 반영됐어요. 고마워요!", [
      { text: "확인", onPress: () => router.back() },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.intro}>
        지금 내 위치에 있는 화장실을 제보해요.{"\n"}
        공공데이터에 아직 없는 곳을 함께 채워가요.
      </Text>

      {submissions.length > 0 ? (
        <Pressable
          style={styles.manageLink}
          onPress={() => router.push("/my-submissions")}
          accessibilityRole="button"
        >
          <Text style={styles.manageLinkText}>
            📋 내가 제보한 곳 {submissions.length}곳 관리 →
          </Text>
        </Pressable>
      ) : null}

      {/* 위치 상태 */}
      <View style={styles.locBox}>
        {coords ? (
          <Text style={styles.locOk}>
            📍 현재 위치로 등록됩니다{"\n"}
            <Text style={styles.locCoord}>
              {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
            </Text>
          </Text>
        ) : (
          <Pressable onPress={refresh}>
            <Text style={styles.locWarn}>
              📍 위치를 확인하는 중… (안 되면 눌러서 다시 시도)
            </Text>
          </Pressable>
        )}
      </View>

      {/* 이름 */}
      <Text style={styles.label}>화장실 이름 *</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="예: 용두천 산책로 개방화장실"
        placeholderTextColor={colors.textMuted}
      />

      {/* 유형 */}
      <Text style={styles.label}>유형</Text>
      <View style={styles.typeRow}>
        {(
          [
            { key: "public", label: "🚻 공중화장실" },
            { key: "open", label: "🏬 개방화장실" },
          ] as const
        ).map((opt) => (
          <Pressable
            key={opt.key}
            onPress={() => setType(opt.key)}
            style={[styles.typeBtn, type === opt.key && styles.typeBtnOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: type === opt.key }}
          >
            <Text
              style={[styles.typeLabel, type === opt.key && styles.typeLabelOn]}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* 제휴처 (개방화장실일 때만) */}
      {type === "open" ? (
        <>
          <Text style={styles.label}>제휴처 (선택)</Text>
          <TextInput
            style={styles.input}
            value={host}
            onChangeText={setHost}
            placeholder="예: 롯데마트, 용두시티"
            placeholderTextColor={colors.textMuted}
          />
        </>
      ) : null}

      {/* 개방시간 */}
      <Text style={styles.label}>개방시간 (선택)</Text>
      <TextInput
        style={styles.input}
        value={openHours}
        onChangeText={setOpenHours}
        placeholder="예: 06:00-23:00, 상시개방"
        placeholderTextColor={colors.textMuted}
      />

      {/* 장애인칸 */}
      <View style={styles.switchRow}>
        <Text style={styles.label}>♿ 장애인 화장실 있음</Text>
        <Switch
          value={hasDisabledStall}
          onValueChange={setHasDisabledStall}
          trackColor={{ true: colors.primary }}
        />
      </View>

      {/* 제출 */}
      <Pressable
        style={[styles.submit, !canSubmit && styles.submitDisabled]}
        onPress={submit}
        disabled={!canSubmit}
        accessibilityRole="button"
      >
        <Text style={styles.submitText}>제보하기</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md },
  intro: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    lineHeight: 26,
    marginBottom: spacing.md,
  },
  manageLink: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  manageLinkText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: "700",
  },
  locBox: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  locOk: { fontSize: fontSize.md, color: colors.text, lineHeight: 26 },
  locCoord: { fontSize: fontSize.sm, color: colors.textMuted },
  locWarn: { fontSize: fontSize.md, color: colors.accent },
  label: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  typeRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  typeBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  typeBtnOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  typeLabel: { fontSize: fontSize.md, fontWeight: "700", color: colors.textMuted },
  typeLabelOn: { color: "#fff" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xl,
  },
  submit: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  submitDisabled: { backgroundColor: colors.border },
  submitText: { color: "#fff", fontSize: fontSize.lg, fontWeight: "800" },
});
