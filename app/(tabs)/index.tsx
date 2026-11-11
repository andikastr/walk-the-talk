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
  Play,
} from 'lucide-react-native';
import { FONT_FAMILY, PALETTE, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';
import { getWorkoutStats, getAllWorkouts } from '@/services/database/workout-repo';
import { WorkoutRecord, WorkoutStats } from '@/types/workout';
import { formatDuration, formatSteps } from '@/services/location/metrics';
import { RunnerMiniPlayer } from '@/components/spotify/RunnerMiniPlayer';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';
import {
  ActivityRowCard,
  IconCircleButton,
  KickerText,
  TopAppBar,
} from '@/components/ui/EditorialPrimitives';

const DAY_INITIALS = ['M', 'S', 'S', 'R', 'K', 'J', 'S'];

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useSpotifyAuth();
  const [stats, setStats] = useState<WorkoutStats>({
    totalDistanceMeters: 0,
    totalDurationSeconds: 0,
    totalWorkouts: 0,
    totalCaloriesKcal: 0,
    totalSteps: 0,
  });
  const [allWorkouts, setAllWorkouts] = useState<
    Omit<WorkoutRecord, 'routePoints' | 'splits'>[]
  >([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [loadedStats, loadedWorkouts] = await Promise.all([
        getWorkoutStats(),
        getAllWorkouts(),
      ]);
      setStats(loadedStats);
      setAllWorkouts(loadedWorkouts);
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

  const recentWorkouts = useMemo(() => allWorkouts.slice(0, 5), [allWorkouts]);

  // Hitung metrik 7 hari terakhir + data bar chart harian
  const { weeklyBars, weeklyKm, weeklySessions } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days: { key: string; label: string; km: number; isToday: boolean }[] = [];
    const dayMap = new Map<string, number>();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      days.push({
        key,
        label: DAY_INITIALS[d.getDay()],
        km: 0,
        isToday: i === 0,
      });
      dayMap.set(key, 0);
    }

    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 6);
    const weekStartMs = weekStart.getTime();

    let totalWeekMeters = 0;
    let totalWeekCount = 0;

    for (const w of allWorkouts) {
      if (w.startTime >= weekStartMs) {
        totalWeekMeters += w.distanceMeters;
        totalWeekCount += 1;
        const d = new Date(w.startTime);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (dayMap.has(key)) {
          dayMap.set(key, (dayMap.get(key) || 0) + w.distanceMeters / 1000);
        }
      }
    }

    const barsWithKm = days.map((d) => ({
      ...d,
      km: dayMap.get(d.key) || 0,
    }));

    const maxKm = Math.max(...barsWithKm.map((b) => b.km), 1);

    return {
      weeklyBars: barsWithKm.map((b) => ({
        ...b,
        ratio: b.km > 0 ? Math.max(b.km / maxKm, 0.14) : 0,
      })),
      weeklyKm: (totalWeekMeters / 1000).toFixed(1),
      weeklySessions: totalWeekCount,
    };
  }, [allWorkouts]);

  const totalKm = (stats.totalDistanceMeters / 1000).toFixed(1);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={PALETTE.accent}
        />
      }
    >
      {/* Editorial Top App Bar */}
      <TopAppBar
        kicker="WALK THE TALK · OVERVIEW"
        title={user?.display_name ? `Halo, ${user.display_name}` : 'Siap Berolahraga'}
        avatarUrl={user?.images?.[0]?.url}
        rightActions={
          <>
            <IconCircleButton
              accessibilityLabel="Buka pemutar Spotify"
              icon={<Music size={18} strokeWidth={2} color={PALETTE.onSurface} />}
              onPress={() => router.push('/music' as any)}
            />
            <IconCircleButton
              accessibilityLabel="Mulai rekam lari"
              icon={<Play size={18} strokeWidth={2} color={PALETTE.onSurface} />}
              onPress={() => router.push('/record' as any)}
            />
          </>
        }
      />

      <View style={styles.bodyPadding}>
        {/* Hero Data Strip + 7-Day Activity Bar Chart */}
        <View style={styles.dataStripCard}>
          <View style={styles.stripHeaderRow}>
            <KickerText>TOTAL JARAK TERCATAT</KickerText>
            <View style={styles.sessionChip}>
              <Text style={styles.sessionChipText}>{stats.totalWorkouts} SESI</Text>
            </View>
          </View>

          <View style={styles.heroMetricRow}>
            <Text style={styles.heroNumeral} numberOfLines={1} adjustsFontSizeToFit>
              {totalKm}
            </Text>
            <Text style={styles.heroUnit}>KM</Text>
          </View>

          <View style={styles.hairline} />

          <View style={styles.subMetricsRow}>
            <View style={styles.subMetricCell}>
              <KickerText style={styles.microLabel}>DURASI</KickerText>
              <Text style={styles.subNumeral}>
                {formatDuration(stats.totalDurationSeconds)}
              </Text>
            </View>

            <View style={styles.subMetricCell}>
              <KickerText style={styles.microLabel}>KALORI</KickerText>
              <Text style={styles.subNumeral}>{stats.totalCaloriesKcal}</Text>
            </View>

            <View style={styles.subMetricCell}>
              <KickerText style={styles.microLabel}>LANGKAH</KickerText>
              <Text style={styles.subNumeral}>{formatSteps(stats.totalSteps)}</Text>
            </View>

            <View style={styles.subMetricCell}>
              <KickerText style={styles.microLabel}>7 HARI</KickerText>
              <Text style={styles.subNumeral}>{weeklyKm} km</Text>
            </View>
          </View>

          <View style={styles.hairline} />

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
                            backgroundColor: PALETTE.surfaceInverse,
                          }
                        : {
                            height: 4,
                            backgroundColor: PALETTE.neutralSoft,
                          },
                    ]}
                  />
                </View>
                <Text
                  style={[
                    styles.barLabel,
                    bar.isToday && { color: PALETTE.onSurface },
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
            accessibilityLabel="Mulai sesi lari baru"
            onPress={() => router.push('/record' as any)}
            style={({ pressed }) => [
              styles.limeTile,
              pressed && { backgroundColor: PALETTE.primaryDeep },
            ]}
          >
            <View style={styles.tileTopRow}>
              <Footprints size={18} strokeWidth={2} color={PALETTE.onPrimary} />
              <KickerText style={{ color: 'rgba(14, 15, 12, 0.6)' }}>SESI BARU</KickerText>
            </View>
            <View>
              <Text style={styles.limeTileTitle}>Mulai Lari</Text>
              <View style={styles.tileBottomRow}>
                <Text style={styles.limeTileSub}>GPS · Pace · Splits</Text>
                <ArrowUpRight size={14} strokeWidth={2} color={PALETTE.onPrimary} />
              </View>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Lihat ringkasan mingguan"
            onPress={() => router.push('/history' as any)}
            style={({ pressed }) => [
              styles.paperTile,
              pressed && { opacity: 0.8 },
            ]}
          >
            <View style={styles.tileTopRow}>
              <BarChart2 size={18} strokeWidth={2} color={PALETTE.onSurface} />
              <KickerText>MINGGU INI</KickerText>
            </View>
            <View>
              <View style={styles.tileStatRow}>
                <Text style={styles.tileStatNumeral}>{weeklySessions}</Text>
                <Text style={styles.tileStatUnit}>sesi</Text>
              </View>
              <View style={styles.tileBottomRow}>
                <Text style={styles.tileSubMuted}>{weeklyKm} km tercatat</Text>
                <ArrowUpRight size={14} strokeWidth={2} color={PALETTE.onSurface} />
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
            <KickerText>LOG TERBARU</KickerText>
            <Text style={styles.sectionTitle}>Aktivitas Terbaru</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/history' as any)}
            style={({ pressed }) => [styles.seeAllPill, pressed && { opacity: 0.72 }]}
          >
            <Text style={styles.seeAllText}>Semua</Text>
          </Pressable>
        </View>

        {recentWorkouts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Activity size={28} strokeWidth={2} color={PALETTE.onSurfaceVariant} />
            <Text style={styles.emptyTitle}>Belum ada aktivitas tercatat</Text>
            <Text style={styles.emptyDesc}>
              Tekan kartu Mulai Lari atau tombol + di bar bawah untuk memulai sesi pertamamu.
            </Text>
          </View>
        ) : (
          recentWorkouts.map((workout) => (
            <ActivityRowCard
              key={workout.id}
              workout={workout}
              dateFormat="short"
              onPress={() => router.push(`/workout/${workout.id}` as any)}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.surface,
  },
  content: {
    paddingBottom: 112,
  },
  bodyPadding: {
    paddingHorizontal: SPACING.gutter,
  },
  dataStripCard: {
    backgroundColor: PALETTE.surfaceAlt,
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
    backgroundColor: PALETTE.surfaceInverse,
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sessionChipText: {
    ...TYPOGRAPHY.caption,
    color: PALETTE.onInverse,
  },
  heroMetricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.sm,
  },
  heroNumeral: {
    ...TYPOGRAPHY.displayHero,
    color: PALETTE.accent,
  },
  heroUnit: {
    ...TYPOGRAPHY.headlineMd,
    color: PALETTE.onSurfaceVariant,
  },
  hairline: {
    height: 1,
    backgroundColor: PALETTE.border,
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
    color: PALETTE.onSurface,
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
    color: PALETTE.onSurfaceVariant,
  },
  bentoGrid: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  limeTile: {
    flex: 1,
    backgroundColor: PALETTE.primary,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.tilePadding,
    minHeight: 132,
    justifyContent: 'space-between',
  },
  paperTile: {
    flex: 1,
    backgroundColor: PALETTE.surfaceAlt,
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
    color: PALETTE.onPrimary,
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
    color: PALETTE.onSurface,
  },
  tileStatUnit: {
    ...TYPOGRAPHY.bodySm,
    color: PALETTE.onSurfaceVariant,
  },
  tileSubMuted: {
    ...TYPOGRAPHY.labelSm,
    color: PALETTE.onSurfaceVariant,
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
    color: PALETTE.onSurface,
    marginTop: 2,
  },
  seeAllPill: {
    backgroundColor: PALETTE.surfaceAlt,
    borderRadius: RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  seeAllText: {
    ...TYPOGRAPHY.labelSm,
    color: PALETTE.onSurface,
  },
  emptyCard: {
    backgroundColor: PALETTE.surfaceAlt,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.xxl,
    alignItems: 'center',
  },
  emptyTitle: {
    ...TYPOGRAPHY.headlineSm,
    color: PALETTE.onSurface,
    marginTop: SPACING.md,
  },
  emptyDesc: {
    ...TYPOGRAPHY.bodySm,
    color: PALETTE.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 6,
  },
});
