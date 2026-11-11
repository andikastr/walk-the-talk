import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { formatDuration, formatPace, formatSteps } from '@/services/location/metrics';
import { FONT_FAMILY, PALETTE, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';

interface LiveStatsHUDProps {
  durationSeconds: number;
  distanceMeters: number;
  avgPaceSeconds: number;
  currentPaceSeconds: number;
  caloriesKcal: number;
  steps?: number;
  cadenceSpm?: number;
}

/**
 * High-contrast editorial HUD pada warm paper-alt (#EBE8E0) dengan angka hero Ember
 * dan angka sekunder Space Grotesk tabular-nums sesuai DESIGN.md.
 */
export function LiveStatsHUD({
  durationSeconds,
  distanceMeters,
  avgPaceSeconds,
  caloriesKcal,
  steps = 0,
  cadenceSpm = 0,
}: LiveStatsHUDProps) {
  const distanceKm = (distanceMeters / 1000).toFixed(2);

  return (
    <View style={styles.container}>
      <View style={styles.heroRow}>
        <View>
          <Text style={styles.kicker}>JARAK TEMPUH</Text>
          <View style={styles.heroValueRow}>
            <Text style={styles.primaryValue} numberOfLines={1} adjustsFontSizeToFit>
              {distanceKm}
            </Text>
            <Text style={styles.primaryUnit}>KM</Text>
          </View>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.metricsRow}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>WAKTU</Text>
          <Text style={styles.metricValue}>{formatDuration(durationSeconds)}</Text>
        </View>

        <View style={styles.vertDivider} />

        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>AVG PACE</Text>
          <Text style={styles.metricValue}>{formatPace(avgPaceSeconds)}</Text>
        </View>

        <View style={styles.vertDivider} />

        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>KALORI</Text>
          <Text style={styles.metricValue}>
            {caloriesKcal}
            <Text style={styles.subUnit}> kcal</Text>
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.metricsRow}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>LANGKAH</Text>
          <Text style={styles.metricValue}>{formatSteps(steps)}</Text>
        </View>

        <View style={styles.vertDivider} />

        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>KADENS</Text>
          <Text style={styles.metricValue}>
            {cadenceSpm}
            <Text style={styles.subUnit}> spm</Text>
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: PALETTE.surfaceAlt,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.cardPadding,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  kicker: {
    ...TYPOGRAPHY.labelUppercase,
    color: PALETTE.onSurfaceVariant,
    marginBottom: SPACING.xs,
  },
  heroValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.sm,
  },
  primaryValue: {
    fontFamily: FONT_FAMILY.displayBold,
    fontSize: 52,
    lineHeight: 54,
    letterSpacing: -2.08,
    color: PALETTE.accent,
    fontVariant: ['tabular-nums'],
  },
  primaryUnit: {
    ...TYPOGRAPHY.headlineSm,
    color: PALETTE.onSurfaceVariant,
  },
  divider: {
    height: 1,
    backgroundColor: PALETTE.border,
    marginVertical: SPACING.sm,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricItem: {
    flex: 1,
    alignItems: 'flex-start',
  },
  vertDivider: {
    width: 1,
    height: 28,
    backgroundColor: PALETTE.border,
    marginHorizontal: SPACING.sm,
  },
  metricLabel: {
    ...TYPOGRAPHY.caption,
    color: PALETTE.onSurfaceVariant,
    marginBottom: 4,
  },
  metricValue: {
    ...TYPOGRAPHY.numeralSm,
    fontSize: 19,
    color: PALETTE.onSurface,
  },
  subUnit: {
    ...TYPOGRAPHY.bodySm,
    color: PALETTE.onSurfaceVariant,
  },
});
