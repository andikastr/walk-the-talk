import React, { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Calendar, Play } from 'lucide-react-native';
import { getAllWorkouts, deleteWorkout, getWorkoutStats } from '@/services/database/workout-repo';
import { WorkoutRecord, WorkoutStats, WorkoutType } from '@/types/workout';
import { RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';
import { getActivityLabel } from '@/constants/i18n';
import { formatSteps } from '@/services/location/metrics';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';
import { usePreferences } from '@/context/AppPreferencesContext';
import { useAppDialog } from '@/context/AppDialogContext';
import {
  ActivityRowCard,
  IconCircleButton,
  KickerText,
  TopAppBar,
} from '@/components/ui/EditorialPrimitives';

type FilterType = 'all' | WorkoutType;

export default function HistoryScreen() {
  const router = useRouter();
  const { user } = useSpotifyAuth();
  const { palette, isDark, t } = usePreferences();
  const { confirm } = useAppDialog();
  const [workouts, setWorkouts] = useState<Omit<WorkoutRecord, 'routePoints' | 'splits'>[]>([]);
  const [stats, setStats] = useState<WorkoutStats | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);

  const loadWorkouts = useCallback(async () => {
    try {
      const [data, aggregated] = await Promise.all([getAllWorkouts(), getWorkoutStats()]);
      setWorkouts(data);
      setStats(aggregated);
    } catch (err) {
      console.error('Gagal memuat riwayat latihan:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadWorkouts();
    }, [loadWorkouts])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadWorkouts();
    setRefreshing(false);
  };

  const handleDelete = async (id: string, title: string) => {
    const confirmed = await confirm({
      kicker: t.common.warningKicker,
      title: t.history.deleteTitle,
      message: t.history.deleteMessage(title),
      cancelText: t.common.cancel,
      confirmText: t.history.deleteAction,
      destructive: true,
    });
    if (confirmed) {
      await deleteWorkout(id);
      await loadWorkouts();
    }
  };

  const filteredWorkouts = useMemo(() => {
    if (filter === 'all') return workouts;
    return workouts.filter((w) => w.type === filter);
  }, [workouts, filter]);

  const filterChips: { key: FilterType; label: string }[] = [
    { key: 'all', label: t.common.all },
    { key: 'run', label: getActivityLabel('run', t) },
    { key: 'jog', label: getActivityLabel('jog', t) },
    { key: 'walk', label: getActivityLabel('walk', t) },
  ];

  const darkSurfaceBorder = isDark ? { borderWidth: 1, borderColor: palette.border } : undefined;

  const renderHeader = () => (
    <View style={styles.listHeader}>
      {/* Overview 2x2 Data Strip */}
      {stats && (
        <View
          style={[
            styles.statsBanner,
            { backgroundColor: palette.surfaceAlt },
            darkSurfaceBorder,
          ]}
        >
          <View style={styles.statsCol}>
            <KickerText style={styles.statsLbl}>{t.history.totalKmLabel}</KickerText>
            <Text style={[styles.statsNumEmber, { color: palette.accent }]}>
              {(stats.totalDistanceMeters / 1000).toFixed(1)}
            </Text>
          </View>

          <View style={styles.statsCol}>
            <KickerText style={styles.statsLbl}>{t.history.activitiesLabel}</KickerText>
            <Text style={[styles.statsNum, { color: palette.onSurface }]}>
              {stats.totalWorkouts}
            </Text>
          </View>

          <View style={styles.statsCol}>
            <KickerText style={styles.statsLbl}>{t.history.totalStepsLabel}</KickerText>
            <Text style={[styles.statsNum, { color: palette.onSurface }]}>
              {formatSteps(stats.totalSteps)}
            </Text>
          </View>

          <View style={styles.statsCol}>
            <KickerText style={styles.statsLbl}>{t.history.kcalLabel}</KickerText>
            <Text style={[styles.statsNum, { color: palette.onSurface }]}>
              {stats.totalCaloriesKcal}
            </Text>
          </View>
        </View>
      )}

      {/* Filter Chips per DESIGN.md (chip / chip-active) */}
      <View style={styles.chipRow}>
        {filterChips.map((chip) => {
          const isActive = filter === chip.key;
          return (
            <Pressable
              key={chip.key}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              onPress={() => setFilter(chip.key)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: isActive ? palette.actionPrimary : palette.surfaceAlt,
                },
                !isActive && darkSurfaceBorder,
                pressed && { opacity: 0.78 },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color: isActive ? palette.onActionPrimary : palette.onSurfaceVariant,
                  },
                ]}
              >
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: palette.surface }]}>
      <TopAppBar
        kicker={t.history.kicker}
        title={t.history.title}
        avatarUrl={user?.images?.[0]?.url}
        rightActions={
          <IconCircleButton
            accessibilityLabel={t.history.startNewA11y}
            icon={<Play size={18} strokeWidth={2} color={palette.onSurface} />}
            onPress={() => router.push('/record' as any)}
          />
        }
      />

      <FlatList
        data={filteredWorkouts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.accent}
          />
        }
        ListEmptyComponent={
          <View
            style={[
              styles.emptyContainer,
              { backgroundColor: palette.surfaceAlt },
              darkSurfaceBorder,
            ]}
          >
            <Calendar size={36} strokeWidth={2} color={palette.onSurfaceVariant} />
            <Text style={[styles.emptyTitle, { color: palette.onSurface }]}>
              {filter === 'all' ? t.history.emptyAllTitle : t.history.emptyFilteredTitle}
            </Text>
            <Text style={[styles.emptySubtitle, { color: palette.onSurfaceVariant }]}>
              {t.history.emptySubtitle}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <ActivityRowCard
            workout={item}
            dateFormat="full"
            onPress={() => router.push(`/workout/${item.id}` as any)}
            onDelete={() => void handleDelete(item.id, item.title)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listHeader: {
    marginBottom: SPACING.md,
  },
  statsBanner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: SPACING.md,
    padding: SPACING.cardPadding,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    marginBottom: SPACING.lg,
  },
  statsCol: {
    width: '50%',
    alignItems: 'flex-start',
  },
  statsLbl: {
    marginBottom: 4,
  },
  statsNum: {
    ...TYPOGRAPHY.numeralMd,
  },
  statsNumEmber: {
    ...TYPOGRAPHY.numeralMd,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.sm,
  },
  chip: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    ...TYPOGRAPHY.labelSm,
  },
  listContent: {
    paddingHorizontal: SPACING.gutter,
    paddingBottom: 112,
  },
  emptyContainer: {
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    alignItems: 'center',
    padding: SPACING.xxl,
    marginTop: SPACING.sm,
  },
  emptyTitle: {
    ...TYPOGRAPHY.headlineSm,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...TYPOGRAPHY.bodySm,
    textAlign: 'center',
    marginTop: 6,
  },
});
