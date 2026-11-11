import React, { useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle, List, Map } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useWorkoutSession } from '@/hooks/useWorkoutSession';
import { useSpotifyPlayer } from '@/hooks/useSpotifyPlayer';
import { LiveStatsHUD } from '@/components/workout/LiveStatsHUD';
import { WorkoutControls } from '@/components/workout/WorkoutControls';
import { WorkoutMap } from '@/components/map/WorkoutMap';
import { SplitsTable } from '@/components/workout/SplitsTable';
import { RunnerMiniPlayer } from '@/components/spotify/RunnerMiniPlayer';
import { SaveWorkoutModal } from '@/components/workout/SaveWorkoutModal';
import { WorkoutType } from '@/types/workout';
import { RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';
import { getActivityLabel } from '@/constants/i18n';
import { usePreferences } from '@/context/AppPreferencesContext';
import { useAppDialog } from '@/context/AppDialogContext';

export default function RecordScreen() {
  const router = useRouter();
  const { palette, isDark, t } = usePreferences();
  const { confirm } = useAppDialog();
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
    hasLocationPermission,
    refreshLocationPermission,
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

  const showPermissionGuidance = async () => {
    const shouldOpenSettings = await confirm({
      kicker: t.record.permissionKicker,
      title: t.record.permissionTitle,
      message: t.record.permissionMessage,
      cancelText: t.common.later,
      confirmText: t.common.openSettings,
    });
    if (shouldOpenSettings) {
      await Linking.openSettings();
    }
  };

  const handleStart = async () => {
    if (hasLocationPermission !== true) {
      const granted = await refreshLocationPermission(true);
      if (!granted) {
        await showPermissionGuidance();
        return;
      }
    }
    startWorkout(selectedType);
  };

  const handleStop = async () => {
    const isShortSession = distanceMeters < 10 && durationSeconds < 10;
    const confirmed = await confirm({
      kicker: isShortSession ? t.common.warningKicker : t.common.confirmKicker,
      title: t.record.stopTitle,
      message: isShortSession ? t.record.stopShortMessage : t.record.stopMessage,
      cancelText: t.common.cancel,
      confirmText: t.record.stopAction,
    });

    if (!confirmed) return;

    stopWorkout();
    const now = new Date();
    const hour = now.getHours();
    const timeGreeting =
      hour < 11
        ? t.timeOfDay.morning
        : hour < 15
        ? t.timeOfDay.afternoon
        : hour < 18
        ? t.timeOfDay.evening
        : t.timeOfDay.night;
    const typeLabel = getActivityLabel(workoutType || selectedType, t);
    setWorkoutTitle(`${typeLabel} ${timeGreeting}`);
    setSaveModalVisible(true);
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
    setSaveModalVisible(false);
    resetWorkout();
  };

  const isRecordingOrPaused = status === 'recording' || status === 'paused';
  const displayedType = isRecordingOrPaused ? workoutType : selectedType;
  const activeTypeLabel =
    displayedType === 'walk'
      ? t.activityTypes.walkFull
      : getActivityLabel(displayedType, t);
  const darkSurfaceBorder = isDark ? { borderWidth: 1, borderColor: palette.border } : undefined;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: palette.surface }]}
      edges={['top']}
    >
      {/* Editorial Top Header */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <View style={styles.statusKickerRow}>
            {status === 'recording' && (
              <View style={[styles.recordingDot, { backgroundColor: palette.accent }]} />
            )}
            <Text style={[styles.topBarKicker, { color: palette.onSurfaceVariant }]}>
              {status === 'recording'
                ? t.record.recordingKicker
                : status === 'paused'
                ? t.record.pausedKicker
                : t.record.idleKicker}
            </Text>
          </View>
          <Text style={[styles.topBarTitle, { color: palette.onSurface }]}>
            {activeTypeLabel}
          </Text>
        </View>

        {isRecordingOrPaused && (
          <View style={styles.modeToggleRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.record.mapChipA11y}
              style={({ pressed }) => [
                styles.modeChip,
                {
                  backgroundColor:
                    viewMode === 'map' ? palette.actionPrimary : palette.surfaceAlt,
                },
                viewMode !== 'map' && darkSurfaceBorder,
                pressed && { opacity: 0.78 },
              ]}
              onPress={() => setViewMode('map')}
            >
              <Map
                size={15}
                strokeWidth={2}
                color={
                  viewMode === 'map' ? palette.onActionPrimary : palette.onSurfaceVariant
                }
              />
              <Text
                style={[
                  styles.modeChipText,
                  {
                    color:
                      viewMode === 'map'
                        ? palette.onActionPrimary
                        : palette.onSurfaceVariant,
                  },
                ]}
              >
                {t.record.mapChip}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.record.splitsChipA11y}
              style={({ pressed }) => [
                styles.modeChip,
                {
                  backgroundColor:
                    viewMode === 'splits' ? palette.actionPrimary : palette.surfaceAlt,
                },
                viewMode !== 'splits' && darkSurfaceBorder,
                pressed && { opacity: 0.78 },
              ]}
              onPress={() => setViewMode('splits')}
            >
              <List
                size={15}
                strokeWidth={2}
                color={
                  viewMode === 'splits' ? palette.onActionPrimary : palette.onSurfaceVariant
                }
              />
              <Text
                style={[
                  styles.modeChipText,
                  {
                    color:
                      viewMode === 'splits'
                        ? palette.onActionPrimary
                        : palette.onSurfaceVariant,
                  },
                ]}
              >
                {t.record.splitsChip}
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {hasLocationPermission === false && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.record.permissionTitle}
          onPress={() => void showPermissionGuidance()}
          style={({ pressed }) => [
            styles.permissionBanner,
            { backgroundColor: palette.emberTint },
            pressed && { opacity: 0.8 },
          ]}
        >
          <AlertTriangle size={15} strokeWidth={2} color={palette.accent} />
          <Text style={[styles.permissionBannerText, { color: palette.accent }]} numberOfLines={1}>
            {t.record.permissionBannerText}
          </Text>
        </Pressable>
      )}

      {/* Center Map / Splits Frame */}
      <View style={styles.centerArea}>
        {viewMode === 'map' ? (
          <View
            style={[
              styles.mapFrame,
              { backgroundColor: palette.surfaceAlt },
              darkSurfaceBorder,
            ]}
          >
            <WorkoutMap
              currentLocation={currentLocation}
              routeCoordinates={routeCoordinates}
              isTracking={status === 'recording'}
            />
          </View>
        ) : (
          <ScrollView style={styles.splitsScroll} showsVerticalScrollIndicator={false}>
            <Text style={[styles.splitsKicker, { color: palette.onSurfaceVariant }]}>
              {t.record.splitsKicker}
            </Text>
            <Text style={[styles.splitsHeading, { color: palette.onSurface }]}>
              {t.record.splitsHeading}
            </Text>
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
          onStart={() => void handleStart()}
          onPause={pauseWorkout}
          onResume={resumeWorkout}
          onStop={() => void handleStop()}
        />
      </View>

      <SaveWorkoutModal
        visible={saveModalVisible}
        workoutTitle={workoutTitle}
        onChangeTitle={setWorkoutTitle}
        distanceMeters={distanceMeters}
        durationSeconds={durationSeconds}
        avgPaceSeconds={avgPaceSeconds}
        steps={steps}
        soundtrackTrackName={currentTrack?.name}
        soundtrackArtistName={currentTrack?.artists?.[0]?.name}
        onSave={handleConfirmSave}
        onDiscard={handleDiscard}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  },
  topBarKicker: {
    ...TYPOGRAPHY.labelUppercase,
  },
  topBarTitle: {
    ...TYPOGRAPHY.headlineMd,
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
  },
  modeChipText: {
    ...TYPOGRAPHY.labelSm,
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: SPACING.gutter,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  permissionBannerText: {
    ...TYPOGRAPHY.labelSm,
    flex: 1,
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
  },
  splitsScroll: {
    flex: 1,
  },
  splitsKicker: {
    ...TYPOGRAPHY.labelUppercase,
    marginBottom: 4,
  },
  splitsHeading: {
    ...TYPOGRAPHY.headlineSm,
    marginBottom: SPACING.md,
  },
  bottomStack: {
    paddingHorizontal: SPACING.gutter,
    paddingTop: SPACING.md,
    paddingBottom: 94,
    gap: 10,
  },
});
