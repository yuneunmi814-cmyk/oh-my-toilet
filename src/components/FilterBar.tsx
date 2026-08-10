import { Pressable, StyleSheet, View } from "react-native";
import { AppText as Text } from "@/components/AppText";
import { colors, fontSize, radius, spacing } from "@/theme";

export interface FilterChip {
  key: string;
  label: string;
}

interface Props {
  chips: FilterChip[];
  /** 활성화된 필터 키 → boolean */
  active: Record<string, boolean>;
  onToggle: (key: string) => void;
}

/** 토글형 필터 칩 가로 줄. 시니어 가독성을 위해 크게. */
export function FilterBar({ chips, active, onToggle }: Props) {
  return (
    <View style={styles.row}>
      {chips.map((chip) => {
        const on = !!active[chip.key];
        return (
          <Pressable
            key={chip.key}
            onPress={() => onToggle(chip.key)}
            style={[styles.chip, on && styles.chipOn]}
            accessibilityRole="switch"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${chip.label} 필터`}
          >
            <Text style={[styles.label, on && styles.labelOn]}>
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  chipOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.textMuted,
  },
  labelOn: { color: "#fff" },
});
