import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { WorkoutSplit } from '@/types/workout';
import { formatDuration, formatPace } from '@/services/location/metrics';
import { FONT_FAMILY, PALETTE, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';

interface SplitsTableProps {
  splits: WorkoutSplit[];
}

export function SplitsTable({ splits }: SplitsTableProps) {
  if (splits.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Belum ada data split kilometer.</Text>
      </View>
    );
  }

  const fastestPace = Math.min(...splits.map((s) => s.paceSecondsPerKm));

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerCol, styles.colKm]}>KM</Text>
        <Text style={[styles.headerCol, styles.colPace]}>PACE</Text>
        <Text style={[styles.headerCol, styles.colTime]}>WAKTU</Text>
      </View>

      {splits.map((split) => {
        const isFastest = split.paceSecondsPerKm === fastestPace;
        return (
          <View key={split.kmNumber} style={[styles.row, isFastest && styles.fastestRow]}>
            <View style={styles.colKmContainer}>
              <Text style={[styles.colKmText, isFastest && styles.fastestText]}>
                {split.kmNumber}
              </Text>
              {isFastest && <View style={styles.fastestBadge} />}
            </View>
            <Text style={[styles.colPaceText, isFastest && styles.fastestText]}>
              {formatPace(split.paceSecondsPerKm)}
            </Text>
            <Text style={[styles.colTimeText, isFastest && styles.fastestText]}>
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
    backgroundColor: PALETTE.surfaceAlt,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.xl,
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.border,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  headerCol: {
    ...TYPOGRAPHY.labelUppercase,
    color: PALETTE.onSurfaceVariant,
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
  fastestRow: {
    backgroundColor: PALETTE.surfaceRaised,
  },
  colKmContainer: {
    width: 60,
    flexDirection: 'row',
    alignItems: 'center',
  },
  colKmText: {
    fontFamily: FONT_FAMILY.displayMedium,
    color: PALETTE.onSurface,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  fastestBadge: {
    width: 6,
    height: 6,
    borderRadius: RADIUS.full,
    backgroundColor: PALETTE.accent,
    marginLeft: 6,
  },
  colPaceText: {
    flex: 1,
    fontFamily: FONT_FAMILY.displayMedium,
    color: PALETTE.onSurface,
    textAlign: 'center',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  colTimeText: {
    width: 84,
    fontFamily: FONT_FAMILY.displayMedium,
    color: PALETTE.onSurfaceVariant,
    textAlign: 'right',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  fastestText: {
    fontFamily: FONT_FAMILY.displayBold,
    color: PALETTE.onSurface,
  },
  emptyContainer: {
    backgroundColor: PALETTE.surfaceAlt,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...TYPOGRAPHY.bodySm,
    color: PALETTE.onSurfaceVariant,
  },
});
