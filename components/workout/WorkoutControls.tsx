import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { Activity, Flame, Footprints, Pause, Play, Square } from 'lucide-react-native';
import { WorkoutType, WorkoutStatus } from '@/types/workout';
import { FONT_FAMILY, PALETTE, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';

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
  if (status === 'idle') {
    const types: { key: WorkoutType; label: string }[] = [
      { key: 'walk', label: 'Jalan' },
      { key: 'jog', label: 'Jogging' },
      { key: 'run', label: 'Lari' },
    ];

    const renderTypeIcon = (type: WorkoutType, active: boolean) => {
      const color = active ? PALETTE.onInverse : PALETTE.onSurfaceVariant;
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
                  isSelected && styles.typeChipActive,
                  pressed && { opacity: 0.78 },
                ]}
                onPress={() => onSelectType(key)}
              >
                {renderTypeIcon(key, isSelected)}
                <Text style={[styles.typeText, isSelected && styles.typeTextActive]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Single Electric Lime Pill CTA */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mulai aktivitas olahraga"
          style={({ pressed }) => [
            styles.limePrimaryButton,
            pressed && { backgroundColor: PALETTE.primaryDeep },
          ]}
          onPress={onStart}
        >
          <Play size={18} strokeWidth={2} color={PALETTE.onPrimary} />
          <Text style={styles.limePrimaryText}>Mulai Aktivitas</Text>
        </Pressable>
      </View>
    );
  }

  if (status === 'recording') {
    return (
      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Jeda aktivitas"
          style={({ pressed }) => [
            styles.inkPrimaryButton,
            pressed && { opacity: 0.85 },
          ]}
          onPress={onPause}
        >
          <Pause size={18} strokeWidth={2} color={PALETTE.onInverse} />
          <Text style={styles.inkPrimaryText}>Jeda Sesi</Text>
        </Pressable>
      </View>
    );
  }

  if (status === 'paused') {
    return (
      <View style={styles.pausedActionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Selesaikan aktivitas"
          style={({ pressed }) => [
            styles.inkSecondaryButton,
            pressed && { opacity: 0.85 },
          ]}
          onPress={onStop}
        >
          <Square size={16} strokeWidth={2} color={PALETTE.onInverse} />
          <Text style={styles.inkPrimaryText}>Selesai</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Lanjutkan aktivitas"
          style={({ pressed }) => [
            styles.limeResumeButton,
            pressed && { backgroundColor: PALETTE.primaryDeep },
          ]}
          onPress={onResume}
        >
          <Play size={18} strokeWidth={2} color={PALETTE.onPrimary} />
          <Text style={styles.limePrimaryText}>Lanjutkan</Text>
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
    backgroundColor: PALETTE.surfaceAlt,
    gap: 6,
  },
  typeChipActive: {
    backgroundColor: PALETTE.surfaceInverse,
  },
  typeText: {
    ...TYPOGRAPHY.labelMd,
    color: PALETTE.onSurfaceVariant,
  },
  typeTextActive: {
    color: PALETTE.onInverse,
  },
  limePrimaryButton: {
    backgroundColor: PALETTE.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: RADIUS.full,
    gap: SPACING.sm,
  },
  limePrimaryText: {
    fontFamily: FONT_FAMILY.displaySemiBold,
    color: PALETTE.onPrimary,
    fontSize: 15,
    letterSpacing: -0.15,
  },
  actionRow: {
    width: '100%',
    alignItems: 'center',
  },
  inkPrimaryButton: {
    backgroundColor: PALETTE.surfaceInverse,
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
    color: PALETTE.onInverse,
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
    backgroundColor: PALETTE.surfaceInverse,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: RADIUS.full,
    gap: SPACING.sm,
  },
  limeResumeButton: {
    flex: 1.4,
    backgroundColor: PALETTE.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: RADIUS.full,
    gap: SPACING.sm,
  },
});
