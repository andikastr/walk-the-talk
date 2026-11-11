import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { formatDuration, formatPace, formatSteps } from '@/services/location/metrics';
import { FONT_FAMILY, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';
import { usePreferences } from '@/context/AppPreferencesContext';

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
 * High-contrast editorial HUD dengan angka hero Ember
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
  const { palette, isDark, t } = usePreferences();
  const distanceKm = (distanceMeters / 1000).toFixed(2);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: palette.surfaceAlt },
        isDark && { borderWidth: 1, borderColor: palette.border },
      ]}
    >
      <View style={styles.heroRow}>
        <View>
          <Text style={[styles.kicker, { color: palette.onSurfaceVariant }]}>
            {t.hud.distanceKicker}
          </Text>
          <View style={styles.heroValueRow}>
            <Text
              style={[styles.primaryValue, { color: palette.accent }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {distanceKm}
            </Text>
            <Text style={[styles.primaryUnit, { color: palette.onSurfaceVariant }]}>
              {t.common.kmUnit.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: palette.border }]} />

      <View style={styles.metricsRow}>
        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: palette.onSurfaceVariant }]}>
            {t.hud.time}
          </Text>
          <Text style={[styles.metricValue, { color: palette.onSurface }]}>
            {formatDuration(durationSeconds)}
          </Text>
        </View>

        <View style={[styles.vertDivider, { backgroundColor: palette.border }]} />

        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: palette.onSurfaceVariant }]}>
            {t.hud.avgPace}
          </Text>
          <Text style={[styles.metricValue, { color: palette.onSurface }]}>
            {formatPace(avgPaceSeconds)}
          </Text>
        </View>

        <View style={[styles.vertDivider, { backgroundColor: palette.border }]} />

        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: palette.onSurfaceVariant }]}>
            {t.hud.calories}
          </Text>
          <Text style={[styles.metricValue, { color: palette.onSurface }]}>
            {caloriesKcal}
            <Text style={[styles.subUnit, { color: palette.onSurfaceVariant }]}>
              {' '}
              {t.common.kcalUnit}
            </Text>
          </Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: palette.border }]} />

      <View style={styles.metricsRow}>
        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: palette.onSurfaceVariant }]}>
            {t.hud.steps}
          </Text>
          <Text style={[styles.metricValue, { color: palette.onSurface }]}>
            {formatSteps(steps)}
          </Text>
        </View>

        <View style={[styles.vertDivider, { backgroundColor: palette.border }]} />

        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: palette.onSurfaceVariant }]}>
            {t.hud.cadence}
          </Text>
          <Text style={[styles.metricValue, { color: palette.onSurface }]}>
            {cadenceSpm}
            <Text style={[styles.subUnit, { color: palette.onSurfaceVariant }]}>
              {' '}
              {t.common.spmUnit}
            </Text>
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
    fontVariant: ['tabular-nums'],
  },
  primaryUnit: {
    ...TYPOGRAPHY.headlineSm,
  },
  divider: {
    height: 1,
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
    marginHorizontal: SPACING.sm,
  },
  metricLabel: {
    ...TYPOGRAPHY.caption,
    marginBottom: 4,
  },
  metricValue: {
    ...TYPOGRAPHY.numeralSm,
    fontSize: 19,
  },
  subUnit: {
    ...TYPOGRAPHY.bodySm,
  },
});
