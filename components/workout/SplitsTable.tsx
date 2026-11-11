import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { WorkoutSplit } from '@/types/workout';
import { formatDuration, formatPace } from '@/services/location/metrics';
import { FONT_FAMILY, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';
import { usePreferences } from '@/context/AppPreferencesContext';

interface SplitsTableProps {
  splits: WorkoutSplit[];
}

export function SplitsTable({ splits }: SplitsTableProps) {
  const { palette, isDark, t } = usePreferences();

  if (splits.length === 0) {
    return (
      <View
        style={[
          styles.emptyContainer,
          { backgroundColor: palette.surfaceAlt },
          isDark && { borderWidth: 1, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.emptyText, { color: palette.onSurfaceVariant }]}>
          {t.splits.empty}
        </Text>
      </View>
    );
  }

  const fastestPace = Math.min(...splits.map((s) => s.paceSecondsPerKm));

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: palette.surfaceAlt },
        isDark && { borderWidth: 1, borderColor: palette.border },
      ]}
    >
      <View style={[styles.headerRow, { borderBottomColor: palette.border }]}>
        <Text style={[styles.headerCol, styles.colKm, { color: palette.onSurfaceVariant }]}>
          {t.splits.colKm}
        </Text>
        <Text style={[styles.headerCol, styles.colPace, { color: palette.onSurfaceVariant }]}>
          {t.splits.colPace}
        </Text>
        <Text style={[styles.headerCol, styles.colTime, { color: palette.onSurfaceVariant }]}>
          {t.splits.colTime}
        </Text>
      </View>

      {splits.map((split) => {
        const isFastest = split.paceSecondsPerKm === fastestPace;
        return (
          <View
            key={split.kmNumber}
            style={[
              styles.row,
              isFastest && { backgroundColor: palette.surfaceRaised },
            ]}
          >
            <View style={styles.colKmContainer}>
              <Text
                style={[
                  styles.colKmText,
                  { color: palette.onSurface },
                  isFastest && styles.fastestText,
                ]}
              >
                {split.kmNumber}
              </Text>
              {isFastest && (
                <View style={[styles.fastestBadge, { backgroundColor: palette.accent }]} />
              )}
            </View>
            <Text
              style={[
                styles.colPaceText,
                { color: palette.onSurface },
                isFastest && styles.fastestText,
              ]}
            >
              {formatPace(split.paceSecondsPerKm)}
            </Text>
            <Text
              style={[
                styles.colTimeText,
                { color: isFastest ? palette.onSurface : palette.onSurfaceVariant },
                isFastest && styles.fastestText,
              ]}
            >
              {formatDuration(split.durationSeconds)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.xl,
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  headerCol: {
    ...TYPOGRAPHY.labelUppercase,
  },
  colKm: {
    width: 60,
  },
  colPace: {
    flex: 1,
    textAlign: 'center',
  },
  colTime: {
    width: 84,
    textAlign: 'right',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
  },
  colKmContainer: {
    width: 60,
    flexDirection: 'row',
    alignItems: 'center',
  },
  colKmText: {
    fontFamily: FONT_FAMILY.displayMedium,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  fastestBadge: {
    width: 6,
    height: 6,
    borderRadius: RADIUS.full,
    marginLeft: 6,
  },
  colPaceText: {
    flex: 1,
    fontFamily: FONT_FAMILY.displayMedium,
    textAlign: 'center',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  colTimeText: {
    width: 84,
    fontFamily: FONT_FAMILY.displayMedium,
    textAlign: 'right',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  fastestText: {
    fontFamily: FONT_FAMILY.displayBold,
  },
  emptyContainer: {
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...TYPOGRAPHY.bodySm,
  },
});
