import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Activity, AlertCircle, Flame, Footprints, Music, Share2 } from 'lucide-react-native';
import { getWorkoutById } from '@/services/database/workout-repo';
import { normalizeWorkoutSoundtracks } from '@/services/spotify/workout-soundtrack';
import { WorkoutRecord } from '@/types/workout';
import { WorkoutMap } from '@/components/map/WorkoutMap';
import { SplitsTable } from '@/components/workout/SplitsTable';
import { ShareWorkoutModal } from '@/components/workout/ShareWorkoutModal';
import {
  formatDuration,
  formatElevationMeters,
  formatPace,
  formatSteps,
} from '@/services/location/metrics';
import { FONT_FAMILY, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';
import { getActivityLabel } from '@/constants/i18n';
import { usePreferences } from '@/context/AppPreferencesContext';
import { SpotifyAttribution } from '@/components/spotify/SpotifyAttribution';
import { KickerText } from '@/components/ui/EditorialPrimitives';

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { palette, isDark, locale, t } = usePreferences();
  const [workout, setWorkout] = useState<WorkoutRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    (async () => {
      if (!id) return;
      try {
        setIsLoading(true);
        const data = await getWorkoutById(id);
        setWorkout(data);
      } catch (err) {
        console.error('Gagal memuat detail workout:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [id]);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: palette.surface }]}>
        <ActivityIndicator size="large" color={palette.accent} />
      </View>
    );
  }

  if (!workout) {
    return (
      <View style={[styles.notFoundContainer, { backgroundColor: palette.surface }]}>
        <AlertCircle size={40} strokeWidth={2} color={palette.onSurfaceVariant} />
        <Text style={[styles.notFoundText, { color: palette.onSurfaceVariant }]}>
          {t.workoutDetail.notFound}
        </Text>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.backBtn,
            { backgroundColor: palette.actionPrimary },
            pressed && { opacity: 0.85 },
          ]}
          onPress={() => router.back()}
        >
          <Text style={[styles.backBtnText, { color: palette.onActionPrimary }]}>
            {t.common.back}
          </Text>
        </Pressable>
      </View>
    );
  }

  const dateStr = new Date(workout.startTime).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = new Date(workout.startTime).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const distKm = (workout.distanceMeters / 1000).toFixed(2);
  const centerCoord =
    workout.routePoints.length > 0
      ? {
          latitude: workout.routePoints[0].latitude,
          longitude: workout.routePoints[0].longitude,
        }
      : null;

  const typeLabel = getActivityLabel(workout.type, t, true);
  const darkSurfaceBorder = isDark ? { borderWidth: 1, borderColor: palette.border } : undefined;

  const renderBadgeIcon = () => {
    if (workout.type === 'walk') {
      return <Footprints size={14} strokeWidth={2} color={palette.onActionPrimary} />;
    }
    if (workout.type === 'jog') {
      return <Activity size={14} strokeWidth={2} color={palette.onActionPrimary} />;
    }
    return <Flame size={14} strokeWidth={2} color={palette.onActionPrimary} />;
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: palette.surface }]}
      contentContainerStyle={[
        styles.content,
        workout.isIndoor && styles.contentIndoor,
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Rounded Map Route Card (omitted for GPS-free indoor workouts) */}
      {!workout.isIndoor && (
        <View style={styles.mapWrapper}>
          <View
            style={[
              styles.mapCard,
              { backgroundColor: palette.surfaceAlt },
              darkSurfaceBorder,
            ]}
          >
            <WorkoutMap
              currentLocation={centerCoord}
              routeCoordinates={workout.routePoints}
              isTracking={false}
            />
          </View>
        </View>
      )}

      {/* Editorial Title & Type Chip */}
      <View style={styles.headerBox}>
        <View style={styles.chipsRow}>
          <View style={[styles.typeChip, { backgroundColor: palette.actionPrimary }]}>
            {renderBadgeIcon()}
            <Text style={[styles.typeChipText, { color: palette.onActionPrimary }]}>
              {typeLabel}
            </Text>
          </View>
          {workout.isIndoor && (
            <View
              style={[
                styles.indoorChip,
                { backgroundColor: palette.surfaceAlt },
                darkSurfaceBorder,
              ]}
            >
              <Text style={[styles.indoorChipText, { color: palette.onSurfaceVariant }]}>
                {t.workoutDetail.indoorBadge}
              </Text>
            </View>
          )}
        </View>

        <Text style={[styles.title, { color: palette.onSurface }]}>{workout.title}</Text>
        <KickerText style={styles.dateKicker}>
          {dateStr} · {timeStr}
        </KickerText>
      </View>

      {/* Data Strip Metrics Card */}
      <View
        style={[
          styles.statsCard,
          { backgroundColor: palette.surfaceAlt },
          darkSurfaceBorder,
        ]}
      >
        <KickerText style={{ marginBottom: 4 }}>{t.workoutDetail.distanceKicker}</KickerText>
        <View style={styles.heroRow}>
          <Text style={[styles.mainStatVal, { color: palette.accent }]}>{distKm}</Text>
          <Text style={[styles.mainStatUnit, { color: palette.onSurfaceVariant }]}>
            {t.common.kmUnit.toUpperCase()}
          </Text>
        </View>

        <View style={[styles.hairline, { backgroundColor: palette.border }]} />

        <View style={styles.subStatsRow}>
          <View style={styles.subStat}>
            <KickerText style={{ marginBottom: 4 }}>
              {t.workoutDetail.avgPaceKicker}
            </KickerText>
            <Text style={[styles.subStatVal, { color: palette.onSurface }]}>
              {formatPace(workout.avgPaceSecondsPerKm)}
            </Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: palette.border }]} />
          <View style={styles.subStat}>
            <KickerText style={{ marginBottom: 4 }}>{t.workoutDetail.timeKicker}</KickerText>
            <Text style={[styles.subStatVal, { color: palette.onSurface }]}>
              {formatDuration(workout.durationSeconds)}
            </Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: palette.border }]} />
          <View style={styles.subStat}>
            <KickerText style={{ marginBottom: 4 }}>
              {t.workoutDetail.caloriesKicker}
            </KickerText>
            <Text style={[styles.subStatVal, { color: palette.onSurface }]}>
              {workout.caloriesKcal} {t.common.kcalUnit}
            </Text>
          </View>
        </View>

        <View style={[styles.hairline, { backgroundColor: palette.border }]} />

        <View style={styles.subStatsRow}>
          <View style={styles.subStat}>
            <KickerText style={{ marginBottom: 4 }}>
              {t.workoutDetail.totalStepsKicker}
            </KickerText>
            <Text style={[styles.subStatVal, { color: palette.onSurface }]}>
              {formatSteps(workout.steps ?? 0)}
            </Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: palette.border }]} />
          <View style={styles.subStat}>
            <KickerText style={{ marginBottom: 4 }}>
              {t.workoutDetail.avgCadenceKicker}
            </KickerText>
            <Text style={[styles.subStatVal, { color: palette.onSurface }]}>
              {workout.avgCadenceSpm ?? 0} {t.common.spmUnit}
            </Text>
          </View>
          {!workout.isIndoor && (
            <>
              <View style={[styles.statDivider, { backgroundColor: palette.border }]} />
              <View style={styles.subStat}>
                <KickerText style={{ marginBottom: 4 }}>
                  {t.workoutDetail.elevationKicker}
                </KickerText>
                <Text style={[styles.subStatVal, { color: palette.onSurface }]}>
                  {formatElevationMeters(workout.elevationGainMeters ?? 0)}
                </Text>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Single Primary Lime CTA untuk Share Sosial */}
      <Pressable
        accessibilityRole="button"
        onPress={() => setShowShareModal(true)}
        style={({ pressed }) => [
          styles.shareCtaBtn,
          { backgroundColor: pressed ? palette.primaryDeep : palette.primary },
        ]}
      >
        <Share2 size={18} strokeWidth={2.2} color={palette.onPrimary} />
        <Text style={[styles.shareCtaText, { color: palette.onPrimary }]}>
          {t.workoutDetail.shareCta}
        </Text>
      </Pressable>

      {/* Soundtrack Dark Ink Card */}
      {(() => {
        const workoutSoundtracks = normalizeWorkoutSoundtracks(workout);
        if (workoutSoundtracks.length === 0) return null;
        return (
          <View
            style={[
              styles.soundtrackCard,
              { backgroundColor: palette.surfaceFeature },
              darkSurfaceBorder,
            ]}
          >
            <View style={styles.soundtrackHeader}>
              <View style={styles.soundtrackHeaderTitleGroup}>
                <KickerText inverse style={{ color: palette.primary }}>
                  {t.workoutDetail.soundtrackKicker}
                </KickerText>
                <Text
                  style={[
                    styles.soundtrackCountSubtitle,
                    { color: palette.onFeatureMuted },
                  ]}
                >
                  {t.workoutDetail.soundtracksTitle(workoutSoundtracks.length)}
                </Text>
              </View>
              <SpotifyAttribution size="small" variant="dark" />
            </View>

            <View style={styles.soundtrackTrackList}>
              {workoutSoundtracks.map((track, idx) => (
                <View
                  key={`${track.trackId ?? track.trackName}-${idx}`}
                  style={[
                    styles.soundtrackContent,
                    idx > 0 && styles.soundtrackRowDivider,
                  ]}
                >
                  <View style={styles.soundtrackThumb}>
                    {idx === 0 ? (
                      <Music size={17} strokeWidth={2} color={palette.spotifyGreen} />
                    ) : (
                      <Text
                        style={[
                          styles.soundtrackIndexText,
                          { color: palette.onFeatureMuted },
                        ]}
                      >
                        {String(idx + 1).padStart(2, '0')}
                      </Text>
                    )}
                  </View>
                  <View style={styles.soundtrackTrackMeta}>
                    <Text
                      style={[styles.soundtrackTitle, { color: palette.onFeature }]}
                      numberOfLines={1}
                    >
                      {track.trackName}
                    </Text>
                    <Text
                      style={[styles.soundtrackArtist, { color: palette.onFeatureMuted }]}
                      numberOfLines={1}
                    >
                      {track.artist}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        );
      })()}

      {/* Splits Table */}
      <View style={styles.splitsSection}>
        <KickerText style={{ marginBottom: 4 }}>{t.workoutDetail.splitsKicker}</KickerText>
        <Text style={[styles.sectionHeading, { color: palette.onSurface }]}>
          {t.workoutDetail.splitsHeading}
        </Text>
        <SplitsTable splits={workout.splits} />
      </View>

      <ShareWorkoutModal
        visible={showShareModal}
        workout={workout}
        onClose={() => setShowShareModal(false)}
      />
    </ScrollView>
  );
}

const screenHeight = Dimensions.get('window').height;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: SPACING.sm,
    paddingBottom: 48,
  },
  contentIndoor: {
    paddingTop: SPACING.md,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.gutter,
  },
  notFoundText: {
    ...TYPOGRAPHY.headlineSm,
    marginTop: SPACING.md,
    marginBottom: SPACING.xl,
  },
  backBtn: {
    height: 44,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    ...TYPOGRAPHY.labelMd,
    fontFamily: FONT_FAMILY.bodySemiBold,
  },
  mapWrapper: {
    paddingHorizontal: SPACING.gutter,
    marginBottom: SPACING.xl,
  },
  mapCard: {
    height: screenHeight * 0.34,
    width: '100%',
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  headerBox: {
    paddingHorizontal: SPACING.gutter,
    marginBottom: SPACING.xl,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACING.md,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
    gap: 5,
  },
  indoorChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
  },
  indoorChipText: {
    ...TYPOGRAPHY.caption,
  },
  typeChipText: {
    ...TYPOGRAPHY.caption,
  },
  title: {
    ...TYPOGRAPHY.displayMd,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.84,
  },
  dateKicker: {
    marginTop: 6,
  },
  statsCard: {
    marginHorizontal: SPACING.gutter,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.cardPadding,
    marginBottom: SPACING.md,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.sm,
  },
  mainStatVal: {
    ...TYPOGRAPHY.displayXl,
    fontSize: 60,
    lineHeight: 62,
  },
  mainStatUnit: {
    ...TYPOGRAPHY.headlineSm,
  },
  hairline: {
    height: 1,
    marginVertical: SPACING.lg,
  },
  subStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subStat: {
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 30,
    marginHorizontal: SPACING.sm,
  },
  subStatVal: {
    ...TYPOGRAPHY.numeralIdle,
    fontSize: 18,
  },
  shareCtaBtn: {
    marginHorizontal: SPACING.gutter,
    marginBottom: SPACING.xl,
    height: 50,
    borderRadius: RADIUS.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  shareCtaText: {
    ...TYPOGRAPHY.labelMd,
    fontFamily: FONT_FAMILY.displaySemiBold,
  },
  soundtrackCard: {
    marginHorizontal: SPACING.gutter,
    marginBottom: SPACING.xl,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.cardPadding,
  },
  soundtrackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  soundtrackHeaderTitleGroup: {
    gap: 2,
  },
  soundtrackCountSubtitle: {
    ...TYPOGRAPHY.caption,
  },
  soundtrackTrackList: {
    gap: SPACING.xs,
  },
  soundtrackContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  soundtrackRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(244, 242, 236, 0.12)',
    paddingTop: 10,
  },
  soundtrackThumb: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(244, 242, 236, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soundtrackIndexText: {
    ...TYPOGRAPHY.numeralSm,
    fontSize: 12,
  },
  soundtrackTrackMeta: {
    marginLeft: SPACING.md,
    flex: 1,
    minWidth: 0,
  },
  soundtrackTitle: {
    ...TYPOGRAPHY.cardTitle,
  },
  soundtrackArtist: {
    ...TYPOGRAPHY.bodySm,
    marginTop: 2,
  },
  splitsSection: {
    paddingHorizontal: SPACING.gutter,
  },
  sectionHeading: {
    ...TYPOGRAPHY.headlineSm,
    marginBottom: SPACING.md,
  },
});
