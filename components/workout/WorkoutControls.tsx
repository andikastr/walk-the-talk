import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { Activity, Flame, Footprints, Pause, Play, Square } from 'lucide-react-native';
import { WorkoutType, WorkoutStatus } from '@/types/workout';
import { FONT_FAMILY, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';
import { getActivityLabel } from '@/constants/i18n';
import { usePreferences } from '@/context/AppPreferencesContext';

interface WorkoutControlsProps {
  status: WorkoutStatus;
  selectedType: WorkoutType;
  onSelectType: (type: WorkoutType) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export function WorkoutControls({
  status,
  selectedType,
  onSelectType,
  onStart,
  onPause,
  onResume,
  onStop,
}: WorkoutControlsProps) {
  const { palette, isDark, t } = usePreferences();

  if (status === 'idle') {
    const types: { key: WorkoutType; label: string }[] = [
      { key: 'walk', label: getActivityLabel('walk', t) },
      { key: 'jog', label: getActivityLabel('jog', t) },
      { key: 'run', label: getActivityLabel('run', t) },
    ];

    const renderTypeIcon = (type: WorkoutType, active: boolean) => {
      const color = active ? palette.onActionPrimary : palette.onSurfaceVariant;
      if (type === 'walk') return <Footprints size={15} strokeWidth={2} color={color} />;
      if (type === 'jog') return <Activity size={15} strokeWidth={2} color={color} />;
      return <Flame size={15} strokeWidth={2} color={color} />;
    };

    return (
      <View style={styles.idleContainer}>
        {/* Chip Selector per DESIGN.md */}
        <View style={styles.typeSelectorRow}>
          {types.map(({ key, label }) => {
            const isSelected = selectedType === key;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                style={({ pressed }) => [
                  styles.typeChip,
                  {
                    backgroundColor: isSelected
                      ? palette.actionPrimary
                      : palette.surfaceAlt,
                  },
                  !isSelected && isDark && { borderWidth: 1, borderColor: palette.border },
                  pressed && { opacity: 0.78 },
                ]}
                onPress={() => onSelectType(key)}
              >
                {renderTypeIcon(key, isSelected)}
                <Text
                  style={[
                    styles.typeText,
                    {
                      color: isSelected
                        ? palette.onActionPrimary
                        : palette.onSurfaceVariant,
                    },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Single Electric Lime Pill CTA */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.controls.startActivityA11y}
          style={({ pressed }) => [
            styles.limePrimaryButton,
            { backgroundColor: pressed ? palette.primaryDeep : palette.primary },
          ]}
          onPress={onStart}
        >
          <Play size={18} strokeWidth={2} color={palette.onPrimary} />
          <Text style={[styles.limePrimaryText, { color: palette.onPrimary }]}>
            {t.controls.startActivity}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (status === 'recording') {
    return (
      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.controls.pauseSessionA11y}
          style={({ pressed }) => [
            styles.inkPrimaryButton,
            { backgroundColor: palette.actionPrimary },
            pressed && { opacity: 0.85 },
          ]}
          onPress={onPause}
        >
          <Pause size={18} strokeWidth={2} color={palette.onActionPrimary} />
          <Text style={[styles.inkPrimaryText, { color: palette.onActionPrimary }]}>
            {t.controls.pauseSession}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (status === 'paused') {
    return (
      <View style={styles.pausedActionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.controls.finishA11y}
          style={({ pressed }) => [
            styles.inkSecondaryButton,
            { backgroundColor: palette.actionPrimary },
            pressed && { opacity: 0.85 },
          ]}
          onPress={onStop}
        >
          <Square size={16} strokeWidth={2} color={palette.onActionPrimary} />
          <Text style={[styles.inkPrimaryText, { color: palette.onActionPrimary }]}>
            {t.controls.finish}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.controls.resumeA11y}
          style={({ pressed }) => [
            styles.limeResumeButton,
            { backgroundColor: pressed ? palette.primaryDeep : palette.primary },
          ]}
          onPress={onResume}
        >
          <Play size={18} strokeWidth={2} color={palette.onPrimary} />
          <Text style={[styles.limePrimaryText, { color: palette.onPrimary }]}>
            {t.controls.resume}
          </Text>
        </Pressable>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  idleContainer: {
    width: '100%',
    gap: SPACING.md,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: RADIUS.full,
    gap: 6,
  },
  typeText: {
    ...TYPOGRAPHY.labelMd,
  },
  limePrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: RADIUS.full,
    gap: SPACING.sm,
  },
  limePrimaryText: {
    fontFamily: FONT_FAMILY.displaySemiBold,
    fontSize: 15,
    letterSpacing: -0.15,
  },
  actionRow: {
    width: '100%',
    alignItems: 'center',
  },
  inkPrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    width: '100%',
    borderRadius: RADIUS.full,
    gap: SPACING.sm,
  },
  inkPrimaryText: {
    fontFamily: FONT_FAMILY.displaySemiBold,
    fontSize: 15,
    letterSpacing: -0.15,
  },
  pausedActionRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    width: '100%',
  },
  inkSecondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: RADIUS.full,
    gap: SPACING.sm,
  },
  limeResumeButton: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: RADIUS.full,
    gap: SPACING.sm,
  },
});
