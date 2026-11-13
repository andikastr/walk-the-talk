import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import {
  formatDuration,
  formatElevationMeters,
  formatPace,
  formatSteps,
} from '@/services/location/metrics';
import { StepTrackingMode, TrackingMode } from '@/types/workout';
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
  elevationGainMeters?: number;
  floorsClimbed?: number;
  trackingMode?: TrackingMode;
  stepTrackingMode?: StepTrackingMode;
}

/**
 * High-contrast editorial HUD dengan angka hero Ember
 * dan angka sekunder Space Grotesk tabular-nums sesuai DESIGN.md.
 */
export function LiveStatsHUD({
  durationSeconds,
  distanceMeters,
  avgPaceSeconds,
  currentPaceSeconds,
  caloriesKcal,
  steps = 0,
  cadenceSpm = 0,
  elevationGainMeters = 0,
  floorsClimbed = 0,
  trackingMode = 'outdoor',
  stepTrackingMode = 'fallback',
}: LiveStatsHUDProps) {
  const { palette, isDark, t } = usePreferences();
  const distanceKm = (distanceMeters / 1000).toFixed(2);
  const stepSourceLabel =
    stepTrackingMode === 'sensor'
      ? t.record.pedometerSensorTag
      : t.record.pedometerFallbackTag;

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

        <View style={styles.currentPaceBox}>
          <Text style={[styles.kicker, { color: palette.onSurfaceVariant }]}>
            {t.hud.currentPace}
          </Text>
          <Text style={[styles.currentPaceVal, { color: palette.onSurface }]}>
            {formatPace(currentPaceSeconds)}
          </Text>
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
          <View style={styles.stepHeaderRow}>
            <Text style={[styles.metricLabel, { color: palette.onSurfaceVariant, marginBottom: 0 }]}>
              {t.hud.steps}
            </Text>
            <Text style={[styles.sourceTag, { color: palette.onSurfaceVariant }]}>
              · {stepSourceLabel}
            </Text>
          </View>
          <Text style={[styles.metricValue, { color: palette.onSurface, marginTop: 4 }]}>
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

        {trackingMode === 'outdoor' ? (
          <>
            <View style={[styles.vertDivider, { backgroundColor: palette.border }]} />
            <View style={styles.metricItem}>
              <Text style={[styles.metricLabel, { color: palette.onSurfaceVariant }]}>
                {t.hud.elevation}
              </Text>
              <Text style={[styles.metricValue, { color: palette.onSurface }]}>
                {formatElevationMeters(elevationGainMeters)}
                {floorsClimbed > 0 ? (
                  <Text style={[styles.subUnit, { color: palette.onSurfaceVariant }]}>
                    {' '}
                    ({floorsClimbed} {t.hud.floors.toLowerCase()})
                  </Text>
                ) : null}
              </Text>
            </View>
          </>
        ) : floorsClimbed > 0 ? (
          <>
            <View style={[styles.vertDivider, { backgroundColor: palette.border }]} />
            <View style={styles.metricItem}>
              <Text style={[styles.metricLabel, { color: palette.onSurfaceVariant }]}>
                {t.hud.floors}
              </Text>
              <Text style={[styles.metricValue, { color: palette.onSurface }]}>
                {floorsClimbed}
                <Text style={[styles.subUnit, { color: palette.onSurfaceVariant }]}>
                  {' '}
                  {t.hud.floors.toLowerCase()}
                </Text>
              </Text>
            </View>
          </>
        ) : null}
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
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  currentPaceBox: {
    alignItems: 'flex-end',
    paddingBottom: 4,
  },
  currentPaceVal: {
    ...TYPOGRAPHY.numeralSm,
    fontSize: 22,
  },
  stepHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sourceTag: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 10,
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
