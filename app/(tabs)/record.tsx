import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Alert,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { List, Map, Music } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useWorkoutSession } from '@/hooks/useWorkoutSession';
import { useSpotifyPlayer } from '@/hooks/useSpotifyPlayer';
import { LiveStatsHUD } from '@/components/workout/LiveStatsHUD';
import { WorkoutControls } from '@/components/workout/WorkoutControls';
import { WorkoutMap } from '@/components/map/WorkoutMap';
import { SplitsTable } from '@/components/workout/SplitsTable';
import { RunnerMiniPlayer } from '@/components/spotify/RunnerMiniPlayer';
import { WorkoutType } from '@/types/workout';
import { FONT_FAMILY, PALETTE, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';
import { formatDuration, formatPace, formatSteps } from '@/services/location/metrics';

export default function RecordScreen() {
  const router = useRouter();
  const {
    status,
    workoutType,
    durationSeconds,
    distanceMeters,
    currentPaceSeconds,
    avgPaceSeconds,
    caloriesKcal,
    steps,
    avgCadenceSpm,
    routeCoordinates,
    splits,
    currentLocation,
    startWorkout,
    pauseWorkout,
    resumeWorkout,
    stopWorkout,
    resetWorkout,
    saveCurrentWorkout,
  } = useWorkoutSession();

  const { currentTrack } = useSpotifyPlayer();

  const [selectedType, setSelectedType] = useState<WorkoutType>('run');
  const [viewMode, setViewMode] = useState<'map' | 'splits'>('map');
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [workoutTitle, setWorkoutTitle] = useState('');

  const handleStart = () => {
    startWorkout(selectedType);
  };

  const handleStop = () => {
    Alert.alert(
      'Selesaikan Olahraga?',
      'Apakah Anda ingin mengakhiri dan menyimpan sesi lari ini?',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Selesai',
          style: 'default',
          onPress: () => {
            stopWorkout();
            const now = new Date();
            const timeGreeting =
              now.getHours() < 11
                ? 'Pagi'
                : now.getHours() < 15
                ? 'Siang'
                : now.getHours() < 18
                ? 'Sore'
                : 'Malam';
            const typeLabel =
              selectedType === 'walk'
                ? 'Jalan'
                : selectedType === 'jog'
                ? 'Jogging'
                : 'Lari';
            setWorkoutTitle(`${typeLabel} ${timeGreeting}`);
            setSaveModalVisible(true);
          },
        },
      ]
    );
  };

  const handleConfirmSave = async () => {
    const soundtrack = currentTrack
      ? {
          trackName: currentTrack.name,
          artist: currentTrack.artists?.map((a) => a.name).join(', ') || 'Unknown',
        }
      : undefined;

    const saved = await saveCurrentWorkout(workoutTitle, soundtrack);
    setSaveModalVisible(false);
    router.push(`/workout/${saved.id}` as any);
  };

  const handleDiscard = () => {
    Alert.alert('Buang Aktivitas?', 'Data sesi lari ini tidak akan disimpan.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Buang',
        style: 'destructive',
        onPress: () => {
          setSaveModalVisible(false);
          resetWorkout();
        },
      },
    ]);
  };

  const isRecordingOrPaused = status === 'recording' || status === 'paused';
  const activeTypeLabel =
    (isRecordingOrPaused ? workoutType : selectedType) === 'walk'
      ? 'Jalan Kaki'
      : (isRecordingOrPaused ? workoutType : selectedType) === 'jog'
      ? 'Jogging'
      : 'Lari';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Editorial Top Header */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <View style={styles.statusKickerRow}>
            {status === 'recording' && <View style={styles.recordingDot} />}
            <Text style={styles.topBarKicker}>
              {status === 'recording'
                ? 'SEDANG MEREKAM · GPS'
                : status === 'paused'
                ? 'SESI DIJEDA'
                : 'MODE LATIHAN'}
            </Text>
          </View>
          <Text style={styles.topBarTitle}>{activeTypeLabel}</Text>
        </View>

        {isRecordingOrPaused && (
          <View style={styles.modeToggleRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tampilkan peta"
              style={({ pressed }) => [
                styles.modeChip,
                viewMode === 'map' && styles.modeChipActive,
                pressed && { opacity: 0.78 },
              ]}
              onPress={() => setViewMode('map')}
            >
              <Map
                size={15}
                strokeWidth={2}
                color={viewMode === 'map' ? PALETTE.onInverse : PALETTE.onSurfaceVariant}
              />
              <Text
                style={[
                  styles.modeChipText,
                  viewMode === 'map' && styles.modeChipTextActive,
                ]}
              >
                Peta
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tampilkan splits"
              style={({ pressed }) => [
                styles.modeChip,
                viewMode === 'splits' && styles.modeChipActive,
                pressed && { opacity: 0.78 },
              ]}
              onPress={() => setViewMode('splits')}
            >
              <List
                size={15}
                strokeWidth={2}
                color={viewMode === 'splits' ? PALETTE.onInverse : PALETTE.onSurfaceVariant}
              />
              <Text
                style={[
                  styles.modeChipText,
                  viewMode === 'splits' && styles.modeChipTextActive,
                ]}
              >
                Splits
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Center Map / Splits Frame */}
      <View style={styles.centerArea}>
        {viewMode === 'map' ? (
          <View style={styles.mapFrame}>
            <WorkoutMap
              currentLocation={currentLocation}
              routeCoordinates={routeCoordinates}
              isTracking={status === 'recording'}
            />
          </View>
        ) : (
          <ScrollView style={styles.splitsScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.splitsKicker}>SPLITS PER KILOMETER</Text>
            <Text style={styles.splitsHeading}>Catatan Pecahan Waktu</Text>
            <SplitsTable splits={splits} />
          </ScrollView>
        )}
      </View>

      {/* Live Metrics HUD + Spotify Mini Player + Controls */}
      <View style={styles.bottomStack}>
        <LiveStatsHUD
          durationSeconds={durationSeconds}
          distanceMeters={distanceMeters}
          avgPaceSeconds={avgPaceSeconds}
          currentPaceSeconds={currentPaceSeconds}
          caloriesKcal={caloriesKcal}
          steps={steps}
          cadenceSpm={avgCadenceSpm}
        />

        <RunnerMiniPlayer />

        <WorkoutControls
          status={status}
          selectedType={selectedType}
          onSelectType={setSelectedType}
          onStart={handleStart}
          onPause={pauseWorkout}
          onResume={resumeWorkout}
          onStop={handleStop}
        />
      </View>

      {/* Save Workout Bottom Sheet Modal */}
      <Modal visible={saveModalVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.saveModalContent}>
            <Text style={styles.modalKicker}>SESI SELESAI</Text>
            <Text style={styles.saveModalHeading}>Simpan Aktivitas</Text>
            <Text style={styles.saveModalSub}>Beri judul untuk sesi latihan Anda:</Text>

            <TextInput
              style={styles.titleInput}
              value={workoutTitle}
              onChangeText={setWorkoutTitle}
              placeholder="Contoh: Lari Pagi di GBK"
              placeholderTextColor={PALETTE.onSurfaceVariant}
            />

            <View style={styles.summaryStatsBox}>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatLabel}>JARAK</Text>
                <Text style={styles.summaryStatEmber}>
                  {(distanceMeters / 1000).toFixed(2)} km
                </Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatLabel}>DURASI</Text>
                <Text style={styles.summaryStatVal}>{formatDuration(durationSeconds)}</Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatLabel}>AVG PACE</Text>
                <Text style={styles.summaryStatVal}>{formatPace(avgPaceSeconds)}</Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatLabel}>LANGKAH</Text>
                <Text style={styles.summaryStatVal}>{formatSteps(steps)}</Text>
              </View>
            </View>

            {currentTrack && (
              <View style={styles.soundtrackPreview}>
                <Music size={16} strokeWidth={2} color={PALETTE.spotifyGreen} />
                <Text style={styles.soundtrackPreviewText} numberOfLines={1}>
                  Soundtrack: {currentTrack.name} · {currentTrack.artists?.[0]?.name}
                </Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.discardBtn, pressed && { opacity: 0.78 }]}
                onPress={handleDiscard}
              >
                <Text style={styles.discardBtnText}>Buang</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}
                onPress={handleConfirmSave}
              >
                <Text style={styles.saveBtnText}>Simpan Aktivitas</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.surface,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.gutter,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  topBarLeft: {
    flex: 1,
    gap: 2,
  },
  statusKickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recordingDot: {
    width: 6,
    height: 6,
    borderRadius: RADIUS.full,
    backgroundColor: PALETTE.accent,
  },
  topBarKicker: {
    ...TYPOGRAPHY.labelUppercase,
    color: PALETTE.onSurfaceVariant,
  },
  topBarTitle: {
    ...TYPOGRAPHY.headlineMd,
    color: PALETTE.onSurface,
  },
  modeToggleRow: {
    flexDirection: 'row',
    gap: 6,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    backgroundColor: PALETTE.surfaceAlt,
  },
  modeChipActive: {
    backgroundColor: PALETTE.surfaceInverse,
  },
  modeChipText: {
    ...TYPOGRAPHY.labelSm,
    color: PALETTE.onSurfaceVariant,
  },
  modeChipTextActive: {
    color: PALETTE.onInverse,
  },
  centerArea: {
    flex: 1,
    paddingHorizontal: SPACING.gutter,
  },
  mapFrame: {
    flex: 1,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: PALETTE.surfaceAlt,
  },
  splitsScroll: {
    flex: 1,
  },
  splitsKicker: {
    ...TYPOGRAPHY.labelUppercase,
    color: PALETTE.onSurfaceVariant,
    marginBottom: 4,
  },
  splitsHeading: {
    ...TYPOGRAPHY.headlineSm,
    color: PALETTE.onSurface,
    marginBottom: SPACING.md,
  },
  bottomStack: {
    paddingHorizontal: SPACING.gutter,
    paddingTop: SPACING.md,
    paddingBottom: 94,
    gap: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(14, 15, 12, 0.55)',
    justifyContent: 'flex-end',
  },
  saveModalContent: {
    backgroundColor: PALETTE.surface,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    padding: SPACING.gutter,
    paddingBottom: SPACING.xxxl,
  },
  modalKicker: {
    ...TYPOGRAPHY.labelUppercase,
    color: PALETTE.onSurfaceVariant,
    marginBottom: 4,
  },
  saveModalHeading: {
    ...TYPOGRAPHY.displayMd,
    fontSize: 28,
    color: PALETTE.onSurface,
  },
  saveModalSub: {
    ...TYPOGRAPHY.bodyMd,
    color: PALETTE.onSurfaceVariant,
    marginTop: 4,
    marginBottom: SPACING.lg,
  },
  titleInput: {
    backgroundColor: PALETTE.surfaceAlt,
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
    fontFamily: FONT_FAMILY.displaySemiBold,
    color: PALETTE.onSurface,
    fontSize: 16,
    marginBottom: SPACING.lg,
  },
  summaryStatsBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: SPACING.md,
    backgroundColor: PALETTE.surfaceAlt,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.cardPadding,
    marginBottom: SPACING.md,
  },
  summaryStat: {
    alignItems: 'center',
    width: '50%',
  },
  summaryStatLabel: {
    ...TYPOGRAPHY.caption,
    color: PALETTE.onSurfaceVariant,
    marginBottom: 4,
  },
  summaryStatEmber: {
    ...TYPOGRAPHY.numeralSm,
    fontSize: 18,
    color: PALETTE.accent,
  },
  summaryStatVal: {
    ...TYPOGRAPHY.numeralSm,
    fontSize: 18,
    color: PALETTE.onSurface,
  },
  soundtrackPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: PALETTE.surfaceInverse,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
    marginBottom: SPACING.xl,
  },
  soundtrackPreviewText: {
    ...TYPOGRAPHY.bodySm,
    color: PALETTE.onInverse,
    flex: 1,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  discardBtn: {
    flex: 1,
    backgroundColor: PALETTE.surfaceAlt,
    height: 48,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardBtnText: {
    ...TYPOGRAPHY.labelMd,
    fontFamily: FONT_FAMILY.bodySemiBold,
    color: PALETTE.onSurface,
  },
  saveBtn: {
    flex: 2,
    backgroundColor: PALETTE.surfaceInverse,
    height: 48,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    ...TYPOGRAPHY.labelMd,
    fontFamily: FONT_FAMILY.bodySemiBold,
    color: PALETTE.onInverse,
  },
});
