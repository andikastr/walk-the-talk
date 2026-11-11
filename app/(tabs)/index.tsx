import React, { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Activity,
  ArrowUpRight,
  BarChart2,
  Footprints,
  Music,
  SlidersHorizontal,
} from 'lucide-react-native';
import { FONT_FAMILY, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';
import {
  getRecentWorkouts,
  getWeeklyDailySummary,
  getWorkoutStats,
  WeeklyDailySummaryResult,
  WeeklyDayBucketInput,
  WorkoutSummary,
} from '@/services/database/workout-repo';
import { WorkoutStats } from '@/types/workout';
import { formatDuration, formatSteps } from '@/services/location/metrics';
import { RunnerMiniPlayer } from '@/components/spotify/RunnerMiniPlayer';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';
import { useSpotifyPlayerFocus } from '@/hooks/useSpotifyPlayer';
import { usePreferences } from '@/context/AppPreferencesContext';
import { useAppUpdates } from '@/hooks/useAppUpdates';
import { PreferencesModal } from '@/components/ui/PreferencesModal';
import {
  ActivityRowCard,
  IconCircleButton,
  KickerText,
  TopAppBar,
} from '@/components/ui/EditorialPrimitives';

interface LocalDayBucket extends WeeklyDayBucketInput {
  dayOfWeek: number;
  isToday: boolean;
}

function buildLast7DayBuckets(): LocalDayBucket[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const buckets: LocalDayBucket[] = [];
  for (let i = 6; i >= 0; i--) {
    const start = new Date(today);
    start.setDate(today.getDate() - i);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    const yyyy = start.getFullYear();
    const mm = String(start.getMonth() + 1).padStart(2, '0');
    const dd = String(start.getDate()).padStart(2, '0');

    buckets.push({
      key: `${yyyy}-${mm}-${dd}`,
      startMs: start.getTime(),
      endMs: end.getTime(),
      dayOfWeek: start.getDay(),
      isToday: i === 0,
    });
  }
  return buckets;
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useSpotifyAuth();
  const { palette, isDark, t } = usePreferences();
  const { isUpdatePending } = useAppUpdates();
  useSpotifyPlayerFocus();

  const [preferencesVisible, setPreferencesVisible] = useState(false);
  const [stats, setStats] = useState<WorkoutStats>({
    totalDistanceMeters: 0,
    totalDurationSeconds: 0,
    totalWorkouts: 0,
    totalCaloriesKcal: 0,
    totalSteps: 0,
  });
  const [recentWorkouts, setRecentWorkouts] = useState<WorkoutSummary[]>([]);
  const [weeklyState, setWeeklyState] = useState<{
    buckets: LocalDayBucket[];
    summary: WeeklyDailySummaryResult;
  }>(() => ({
    buckets: buildLast7DayBuckets(),
    summary: { byKey: {}, totalMeters: 0, totalSessions: 0 },
  }));
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const buckets = buildLast7DayBuckets();
      const [loadedStats, loadedRecent, loadedWeekly] = await Promise.all([
        getWorkoutStats(),
        getRecentWorkouts(5),
        getWeeklyDailySummary(buckets),
      ]);
      setStats(loadedStats);
      setRecentWorkouts(loadedRecent);
      setWeeklyState({ buckets, summary: loadedWeekly });
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Hitung bar chart harian dari hasil agregasi SQL 7 hari terakhir
  const { weeklyBars, weeklyKm, weeklySessions } = useMemo(() => {
    const barsWithKm = weeklyState.buckets.map((bucket) => ({
      key: bucket.key,
      label: t.weekdaysShort[bucket.dayOfWeek],
      km: (weeklyState.summary.byKey[bucket.key]?.totalMeters || 0) / 1000,
      isToday: bucket.isToday,
    }));

    const maxKm = Math.max(...barsWithKm.map((b) => b.km), 1);

    return {
      weeklyBars: barsWithKm.map((b) => ({
        ...b,
        ratio: b.km > 0 ? Math.max(b.km / maxKm, 0.14) : 0,
      })),
      weeklyKm: (weeklyState.summary.totalMeters / 1000).toFixed(1),
      weeklySessions: weeklyState.summary.totalSessions,
    };
  }, [t.weekdaysShort, weeklyState]);

  const handleOpenWorkout = useCallback(
    (workout: WorkoutSummary) => {
      router.push(`/workout/${workout.id}` as any);
    },
    [router]
  );

  const totalKm = (stats.totalDistanceMeters / 1000).toFixed(1);
  const darkSurfaceBorder = isDark ? { borderWidth: 1, borderColor: palette.border } : undefined;

  return (
    <View style={[styles.container, { backgroundColor: palette.surface }]}>
      <ScrollView
        style={[styles.container, { backgroundColor: palette.surface }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.accent}
          />
        }
      >
        {/* Editorial Top App Bar */}
        <TopAppBar
          kicker={t.home.kicker}
          title={
            user?.display_name
              ? t.home.greetingNamed(user.display_name)
              : t.home.greetingDefault
          }
          avatarUrl={user?.images?.[0]?.url}
          rightActions={
            <>
              <IconCircleButton
                accessibilityLabel={t.home.openSpotifyA11y}
                icon={<Music size={18} strokeWidth={2} color={palette.onSurface} />}
                onPress={() => router.push('/music' as any)}
              />
              <IconCircleButton
                accessibilityLabel={t.home.openPreferencesA11y}
                showBadgeDot={isUpdatePending}
                icon={
                  <SlidersHorizontal size={18} strokeWidth={2} color={palette.onSurface} />
                }
                onPress={() => setPreferencesVisible(true)}
              />
            </>
          }
        />

        <View style={styles.bodyPadding}>
          {/* Hero Data Strip + 7-Day Activity Bar Chart */}
          <View
            style={[
              styles.dataStripCard,
              { backgroundColor: palette.surfaceAlt },
              darkSurfaceBorder,
            ]}
          >
            <View style={styles.stripHeaderRow}>
              <KickerText>{t.home.totalDistanceLabel}</KickerText>
              <View style={[styles.sessionChip, { backgroundColor: palette.actionPrimary }]}>
                <Text style={[styles.sessionChipText, { color: palette.onActionPrimary }]}>
                  {t.home.sessionsCount(stats.totalWorkouts)}
                </Text>
              </View>
            </View>

            <View style={styles.heroMetricRow}>
              <Text
                style={[styles.heroNumeral, { color: palette.accent }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {totalKm}
              </Text>
              <Text style={[styles.heroUnit, { color: palette.onSurfaceVariant }]}>
                {t.common.kmUnit.toUpperCase()}
              </Text>
            </View>

            <View style={[styles.hairline, { backgroundColor: palette.border }]} />

            <View style={styles.subMetricsRow}>
              <View style={styles.subMetricCell}>
                <KickerText style={styles.microLabel}>{t.home.durationLabel}</KickerText>
                <Text style={[styles.subNumeral, { color: palette.onSurface }]}>
                  {formatDuration(stats.totalDurationSeconds)}
                </Text>
              </View>

              <View style={styles.subMetricCell}>
                <KickerText style={styles.microLabel}>{t.home.caloriesLabel}</KickerText>
                <Text style={[styles.subNumeral, { color: palette.onSurface }]}>
                  {stats.totalCaloriesKcal}
                </Text>
              </View>

              <View style={styles.subMetricCell}>
                <KickerText style={styles.microLabel}>{t.home.stepsLabel}</KickerText>
                <Text style={[styles.subNumeral, { color: palette.onSurface }]}>
                  {formatSteps(stats.totalSteps)}
                </Text>
              </View>

              <View style={styles.subMetricCell}>
                <KickerText style={styles.microLabel}>{t.home.sevenDaysLabel}</KickerText>
                <Text style={[styles.subNumeral, { color: palette.onSurface }]}>
                  {weeklyKm} {t.common.kmUnit}
                </Text>
              </View>
            </View>

            <View style={[styles.hairline, { backgroundColor: palette.border }]} />

            {/* 7-Day Vertical Bar Strip */}
            <View style={styles.barsRow}>
              {weeklyBars.map((bar) => (
                <View key={bar.key} style={styles.barCol}>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        bar.km > 0
                          ? {
                              height: `${Math.round(bar.ratio * 100)}%`,
                              backgroundColor: palette.actionPrimary,
                            }
                          : {
                              height: 4,
                              backgroundColor: palette.neutralSoft,
                            },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.barLabel,
                      { color: bar.isToday ? palette.onSurface : palette.onSurfaceVariant },
                    ]}
                  >
                    {bar.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* 2-Column Bento Tiles: Single Lime Tile + Paper-Alt Summary Tile */}
          <View style={styles.bentoGrid}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.home.startRunA11y}
              onPress={() => router.push('/record' as any)}
              style={({ pressed }) => [
                styles.limeTile,
                { backgroundColor: pressed ? palette.primaryDeep : palette.primary },
              ]}
            >
              <View style={styles.tileTopRow}>
                <Footprints size={18} strokeWidth={2} color={palette.onPrimary} />
                <KickerText style={{ color: 'rgba(14, 15, 12, 0.6)' }}>
                  {t.home.newSessionKicker}
                </KickerText>
              </View>
              <View>
                <Text style={[styles.limeTileTitle, { color: palette.onPrimary }]}>
                  {t.home.startRunTitle}
                </Text>
                <View style={styles.tileBottomRow}>
                  <Text style={styles.limeTileSub}>{t.home.startRunSub}</Text>
                  <ArrowUpRight size={14} strokeWidth={2} color={palette.onPrimary} />
                </View>
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.home.thisWeekA11y}
              onPress={() => router.push('/history' as any)}
              style={({ pressed }) => [
                styles.paperTile,
                { backgroundColor: palette.surfaceAlt },
                darkSurfaceBorder,
                pressed && { opacity: 0.8 },
              ]}
            >
              <View style={styles.tileTopRow}>
                <BarChart2 size={18} strokeWidth={2} color={palette.onSurface} />
                <KickerText>{t.home.thisWeekKicker}</KickerText>
              </View>
              <View>
                <View style={styles.tileStatRow}>
                  <Text style={[styles.tileStatNumeral, { color: palette.onSurface }]}>
                    {weeklySessions}
                  </Text>
                  <Text style={[styles.tileStatUnit, { color: palette.onSurfaceVariant }]}>
                    {t.common.sessionsUnit}
                  </Text>
                </View>
                <View style={styles.tileBottomRow}>
                  <Text style={[styles.tileSubMuted, { color: palette.onSurfaceVariant }]}>
                    {t.home.thisWeekRecorded(weeklyKm)}
                  </Text>
                  <ArrowUpRight size={14} strokeWidth={2} color={palette.onSurface} />
                </View>
              </View>
            </Pressable>
          </View>

          {/* Dark Ink Spotify Runner Mini Player */}
          <View style={styles.miniPlayerWrap}>
            <RunnerMiniPlayer />
          </View>

          {/* Recent Activities Section */}
          <View style={styles.sectionHeader}>
            <View>
              <KickerText>{t.home.recentLogKicker}</KickerText>
              <Text style={[styles.sectionTitle, { color: palette.onSurface }]}>
                {t.home.recentTitle}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/history' as any)}
              style={({ pressed }) => [
                styles.seeAllPill,
                { backgroundColor: palette.surfaceAlt },
                darkSurfaceBorder,
                pressed && { opacity: 0.72 },
              ]}
            >
              <Text style={[styles.seeAllText, { color: palette.onSurface }]}>
                {t.common.all}
              </Text>
            </Pressable>
          </View>

          {recentWorkouts.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: palette.surfaceAlt },
                darkSurfaceBorder,
              ]}
            >
              <Activity size={28} strokeWidth={2} color={palette.onSurfaceVariant} />
              <Text style={[styles.emptyTitle, { color: palette.onSurface }]}>
                {t.home.emptyTitle}
              </Text>
              <Text style={[styles.emptyDesc, { color: palette.onSurfaceVariant }]}>
                {t.home.emptyDesc}
              </Text>
            </View>
          ) : (
            recentWorkouts.map((workout) => (
              <ActivityRowCard
                key={workout.id}
                workout={workout}
                dateFormat="short"
                onPress={handleOpenWorkout}
              />
            ))
          )}
        </View>
      </ScrollView>

      <PreferencesModal
        visible={preferencesVisible}
        onClose={() => setPreferencesVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 112,
  },
  bodyPadding: {
    paddingHorizontal: SPACING.gutter,
  },
  dataStripCard: {
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.cardPadding,
  },
  stripHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  sessionChip: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sessionChipText: {
    ...TYPOGRAPHY.caption,
  },
  heroMetricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.sm,
  },
  heroNumeral: {
    ...TYPOGRAPHY.displayHero,
  },
  heroUnit: {
    ...TYPOGRAPHY.headlineMd,
  },
  hairline: {
    height: 1,
    marginVertical: SPACING.lg,
  },
  subMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: SPACING.md,
  },
  subMetricCell: {
    width: '50%',
  },
  microLabel: {
    marginBottom: 4,
  },
  subNumeral: {
    ...TYPOGRAPHY.numeralIdle,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    height: 68,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    height: '100%',
  },
  barTrack: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  barLabel: {
    ...TYPOGRAPHY.caption,
  },
  bentoGrid: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  limeTile: {
    flex: 1,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.tilePadding,
    minHeight: 132,
    justifyContent: 'space-between',
  },
  paperTile: {
    flex: 1,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.tilePadding,
    minHeight: 132,
    justifyContent: 'space-between',
  },
  tileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  limeTileTitle: {
    fontFamily: FONT_FAMILY.displayBold,
    fontSize: 24,
    lineHeight: 26,
    letterSpacing: -0.72,
  },
  limeTileSub: {
    ...TYPOGRAPHY.labelSm,
    color: 'rgba(14, 15, 12, 0.65)',
  },
  tileBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  tileStatRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  tileStatNumeral: {
    ...TYPOGRAPHY.displayMd,
  },
  tileStatUnit: {
    ...TYPOGRAPHY.bodySm,
  },
  tileSubMuted: {
    ...TYPOGRAPHY.labelSm,
  },
  miniPlayerWrap: {
    marginTop: SPACING.md,
    marginBottom: SPACING.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    ...TYPOGRAPHY.headlineSm,
    marginTop: 2,
  },
  seeAllPill: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  seeAllText: {
    ...TYPOGRAPHY.labelSm,
  },
  emptyCard: {
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.xxl,
    alignItems: 'center',
  },
  emptyTitle: {
    ...TYPOGRAPHY.headlineSm,
    marginTop: SPACING.md,
  },
  emptyDesc: {
    ...TYPOGRAPHY.bodySm,
    textAlign: 'center',
    marginTop: 6,
  },
});
