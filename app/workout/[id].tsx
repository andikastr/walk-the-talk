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
import { WorkoutRecord } from '@/types/workout';
import { WorkoutMap } from '@/components/map/WorkoutMap';
import { SplitsTable } from '@/components/workout/SplitsTable';
import { ShareWorkoutModal } from '@/components/workout/ShareWorkoutModal';
import { formatDuration, formatPace, formatSteps } from '@/services/location/metrics';
import { FONT_FAMILY, PALETTE, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';
import { SpotifyAttribution } from '@/components/spotify/SpotifyAttribution';
import { KickerText } from '@/components/ui/EditorialPrimitives';

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={PALETTE.accent} />
      </View>
    );
  }

  if (!workout) {
    return (
      <View style={styles.notFoundContainer}>
        <AlertCircle size={40} strokeWidth={2} color={PALETTE.onSurfaceVariant} />
        <Text style={styles.notFoundText}>Aktivitas tidak ditemukan.</Text>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.85 }]}
          onPress={() => router.back()}
        >
          <Text style={styles.backBtnText}>Kembali</Text>
        </Pressable>
      </View>
    );
  }

  const dateStr = new Date(workout.startTime).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = new Date(workout.startTime).toLocaleTimeString('id-ID', {
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

  const typeLabel =
    workout.type === 'walk' ? 'JALAN' : workout.type === 'jog' ? 'JOGGING' : 'LARI';

  const renderBadgeIcon = () => {
    if (workout.type === 'walk') {
      return <Footprints size={14} strokeWidth={2} color={PALETTE.onInverse} />;
    }
    if (workout.type === 'jog') {
      return <Activity size={14} strokeWidth={2} color={PALETTE.onInverse} />;
    }
    return <Flame size={14} strokeWidth={2} color={PALETTE.onInverse} />;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Rounded Map Route Card */}
      <View style={styles.mapWrapper}>
        <View style={styles.mapCard}>
          <WorkoutMap
            currentLocation={centerCoord}
            routeCoordinates={workout.routePoints}
            isTracking={false}
          />
        </View>
      </View>

      {/* Editorial Title & Type Chip */}
      <View style={styles.headerBox}>
        <View style={styles.typeChip}>
          {renderBadgeIcon()}
          <Text style={styles.typeChipText}>{typeLabel}</Text>
        </View>

        <Text style={styles.title}>{workout.title}</Text>
        <KickerText style={styles.dateKicker}>
          {dateStr} · {timeStr}
        </KickerText>
      </View>

      {/* Data Strip Metrics Card */}
      <View style={styles.statsCard}>
        <KickerText style={{ marginBottom: 4 }}>JARAK TEMPUH</KickerText>
        <View style={styles.heroRow}>
          <Text style={styles.mainStatVal}>{distKm}</Text>
          <Text style={styles.mainStatUnit}>KM</Text>
        </View>

        <View style={styles.hairline} />

        <View style={styles.subStatsRow}>
          <View style={styles.subStat}>
            <KickerText style={{ marginBottom: 4 }}>AVG PACE</KickerText>
            <Text style={styles.subStatVal}>{formatPace(workout.avgPaceSecondsPerKm)}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.subStat}>
            <KickerText style={{ marginBottom: 4 }}>WAKTU</KickerText>
            <Text style={styles.subStatVal}>{formatDuration(workout.durationSeconds)}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.subStat}>
            <KickerText style={{ marginBottom: 4 }}>KALORI</KickerText>
            <Text style={styles.subStatVal}>{workout.caloriesKcal} kcal</Text>
          </View>
        </View>

        <View style={styles.hairline} />

        <View style={styles.subStatsRow}>
          <View style={styles.subStat}>
            <KickerText style={{ marginBottom: 4 }}>TOTAL LANGKAH</KickerText>
            <Text style={styles.subStatVal}>{formatSteps(workout.steps ?? 0)}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.subStat}>
            <KickerText style={{ marginBottom: 4 }}>AVG KADENS</KickerText>
            <Text style={styles.subStatVal}>{workout.avgCadenceSpm ?? 0} spm</Text>
          </View>
        </View>
      </View>

      {/* Single Primary Lime CTA untuk Share Sosial */}
      <Pressable
        accessibilityRole="button"
        onPress={() => setShowShareModal(true)}
        style={({ pressed }) => [styles.shareCtaBtn, pressed && { opacity: 0.88 }]}
      >
        <Share2 size={18} strokeWidth={2.2} color={PALETTE.onPrimary} />
        <Text style={styles.shareCtaText}>Bagikan Aktivitas</Text>
      </Pressable>

      {/* Soundtrack Dark Ink Card */}
      {workout.soundtrackTrackName && (
        <View style={styles.soundtrackCard}>
          <View style={styles.soundtrackHeader}>
            <KickerText inverse style={{ color: PALETTE.primary }}>
              SOUNDTRACK LARI
            </KickerText>
            <SpotifyAttribution size="small" variant="dark" />
          </View>
          <View style={styles.soundtrackContent}>
            <View style={styles.soundtrackThumb}>
              <Music size={20} strokeWidth={2} color={PALETTE.spotifyGreen} />
            </View>
            <View style={{ marginLeft: SPACING.md, flex: 1, minWidth: 0 }}>
              <Text style={styles.soundtrackTitle} numberOfLines={1}>
                {workout.soundtrackTrackName}
              </Text>
              <Text style={styles.soundtrackArtist} numberOfLines={1}>
                {workout.soundtrackArtist}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Splits Table */}
      <View style={styles.splitsSection}>
        <KickerText style={{ marginBottom: 4 }}>RINGKASAN PACE</KickerText>
        <Text style={styles.sectionHeading}>Splits Per Kilometer</Text>
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
    backgroundColor: PALETTE.surface,
  },
  content: {
    paddingTop: SPACING.sm,
    paddingBottom: 48,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: PALETTE.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundContainer: {
    flex: 1,
    backgroundColor: PALETTE.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.gutter,
  },
  notFoundText: {
    ...TYPOGRAPHY.headlineSm,
    color: PALETTE.onSurfaceVariant,
    marginTop: SPACING.md,
    marginBottom: SPACING.xl,
  },
  backBtn: {
    backgroundColor: PALETTE.surfaceInverse,
    height: 44,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    ...TYPOGRAPHY.labelMd,
    fontFamily: FONT_FAMILY.bodySemiBold,
    color: PALETTE.onInverse,
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
    backgroundColor: PALETTE.surfaceAlt,
  },
  headerBox: {
    paddingHorizontal: SPACING.gutter,
    marginBottom: SPACING.xl,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.surfaceInverse,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
    gap: 5,
    marginBottom: SPACING.md,
  },
  typeChipText: {
    ...TYPOGRAPHY.caption,
    color: PALETTE.onInverse,
  },
  title: {
    ...TYPOGRAPHY.displayMd,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.84,
    color: PALETTE.onSurface,
  },
  dateKicker: {
    marginTop: 6,
  },
  statsCard: {
    backgroundColor: PALETTE.surfaceAlt,
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
    color: PALETTE.accent,
  },
  mainStatUnit: {
    ...TYPOGRAPHY.headlineSm,
    color: PALETTE.onSurfaceVariant,
  },
  hairline: {
    height: 1,
    backgroundColor: PALETTE.border,
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
    backgroundColor: PALETTE.border,
    marginHorizontal: SPACING.sm,
  },
  subStatVal: {
    ...TYPOGRAPHY.numeralIdle,
    fontSize: 18,
    color: PALETTE.onSurface,
  },
  shareCtaBtn: {
    marginHorizontal: SPACING.gutter,
    marginBottom: SPACING.xl,
    height: 50,
    borderRadius: RADIUS.full,
    backgroundColor: PALETTE.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  shareCtaText: {
    ...TYPOGRAPHY.labelMd,
    fontFamily: FONT_FAMILY.displaySemiBold,
    color: PALETTE.onPrimary,
  },
  soundtrackCard: {
    backgroundColor: PALETTE.surfaceInverse,
    marginHorizontal: SPACING.gutter,
    marginBottom: SPACING.xl,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.cardPadding,
  },
  soundtrackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  soundtrackContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  soundtrackThumb: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(244, 242, 236, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soundtrackTitle: {
    ...TYPOGRAPHY.cardTitle,
    color: PALETTE.onInverse,
  },
  soundtrackArtist: {
    ...TYPOGRAPHY.bodySm,
    color: PALETTE.onInverseMuted,
    marginTop: 2,
  },
  splitsSection: {
    paddingHorizontal: SPACING.gutter,
  },
  sectionHeading: {
    ...TYPOGRAPHY.headlineSm,
    color: PALETTE.onSurface,
    marginBottom: SPACING.md,
  },
});
