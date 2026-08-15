import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText as Text } from "@/components/AppText";
import { PRIVACY_SECTIONS, PRIVACY_UPDATED } from "@/content/privacy";
import { colors, fontSize, spacing } from "@/theme";

/** 개인정보처리방침 (앱 내 열람용). */
export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <Text style={styles.updated}>시행일 {PRIVACY_UPDATED}</Text>
      {PRIVACY_SECTIONS.map((s) => (
        <View key={s.heading}>
          <Text style={styles.heading}>{s.heading}</Text>
          <Text style={styles.body}>{s.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md },
  updated: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  heading: {
    fontSize: fontSize.md,
    fontWeight: "800",
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: 26,
  },
});
