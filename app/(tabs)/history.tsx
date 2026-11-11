import React, { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Calendar, Play } from 'lucide-react-native';
import { getAllWorkouts, deleteWorkout, getWorkoutStats } from '@/services/database/workout-repo';
import { WorkoutRecord, WorkoutStats, WorkoutType } from '@/types/workout';
import { PALETTE, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';
import { formatSteps } from '@/services/location/metrics';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';
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

  const handleDelete = (id: string, title: string) => {
    Alert.alert('Hapus Aktivitas', `Apakah Anda yakin ingin menghapus "${title}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          await deleteWorkout(id);
          await loadWorkouts();
        },
      },
    ]);
  };

  const filteredWorkouts = useMemo(() => {
    if (filter === 'all') return workouts;
    return workouts.filter((w) => w.type === filter);
  }, [workouts, filter]);

  const filterChips: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'Semua' },
    { key: 'run', label: 'Lari' },
    { key: 'jog', label: 'Jogging' },
    { key: 'walk', label: 'Jalan' },
  ];

  const renderHeader = () => (
    <View style={styles.listHeader}>
      {/* Overview 2x2 Data Strip */}
      {stats && (
        <View style={styles.statsBanner}>
          <View style={styles.statsCol}>
            <KickerText style={styles.statsLbl}>KM TOTAL</KickerText>
            <Text style={styles.statsNumEmber}>
              {(stats.totalDistanceMeters / 1000).toFixed(1)}
            </Text>
          </View>

          <View style={styles.statsCol}>
            <KickerText style={styles.statsLbl}>AKTIVITAS</KickerText>
            <Text style={styles.statsNum}>{stats.totalWorkouts}</Text>
          </View>

          <View style={styles.statsCol}>
            <KickerText style={styles.statsLbl}>TOTAL LANGKAH</KickerText>
            <Text style={styles.statsNum}>{formatSteps(stats.totalSteps)}</Text>
          </View>

          <View style={styles.statsCol}>
            <KickerText style={styles.statsLbl}>KCAL</KickerText>
            <Text style={styles.statsNum}>{stats.totalCaloriesKcal}</Text>
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
                isActive && styles.chipActive,
                pressed && { opacity: 0.78 },
              ]}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <TopAppBar
        kicker="LOG LATIHAN"
        title="Riwayat Aktivitas"
        avatarUrl={user?.images?.[0]?.url}
        rightActions={
          <IconCircleButton
            accessibilityLabel="Mulai aktivitas baru"
            icon={<Play size={18} strokeWidth={2} color={PALETTE.onSurface} />}
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
            tintColor={PALETTE.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Calendar size={36} strokeWidth={2} color={PALETTE.onSurfaceVariant} />
            <Text style={styles.emptyTitle}>
              {filter === 'all' ? 'Belum ada riwayat aktivitas' : 'Belum ada sesi untuk filter ini'}
            </Text>
            <Text style={styles.emptySubtitle}>
              Selesaikan sesi jalan, jogging, atau lari untuk melihat catatan latihan di sini.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <ActivityRowCard
            workout={item}
            dateFormat="full"
            onPress={() => router.push(`/workout/${item.id}` as any)}
            onDelete={() => handleDelete(item.id, item.title)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.surface,
  },
  listHeader: {
    marginBottom: SPACING.md,
  },
  statsBanner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: SPACING.md,
    backgroundColor: PALETTE.surfaceAlt,
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
    color: PALETTE.onSurface,
  },
  statsNumEmber: {
    ...TYPOGRAPHY.numeralMd,
    color: PALETTE.accent,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.sm,
  },
  chip: {
    backgroundColor: PALETTE.surfaceAlt,
    borderRadius: RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: PALETTE.surfaceInverse,
  },
  chipText: {
    ...TYPOGRAPHY.labelSm,
    color: PALETTE.onSurfaceVariant,
  },
  chipTextActive: {
    color: PALETTE.onInverse,
  },
  listContent: {
    paddingHorizontal: SPACING.gutter,
    paddingBottom: 112,
  },
  emptyContainer: {
    backgroundColor: PALETTE.surfaceAlt,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    alignItems: 'center',
    padding: SPACING.xxl,
    marginTop: SPACING.sm,
  },
  emptyTitle: {
    ...TYPOGRAPHY.headlineSm,
    color: PALETTE.onSurface,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...TYPOGRAPHY.bodySm,
    color: PALETTE.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 6,
  },
});
