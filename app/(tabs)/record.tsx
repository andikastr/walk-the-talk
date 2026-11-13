import React, { useEffect, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  Footprints,
  List,
  Map,
  Navigation,
  PauseCircle,
  Radio,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useWorkoutSession } from '@/hooks/useWorkoutSession';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';
import { useSpotifyPlayer, useSpotifyPlayerFocus } from '@/hooks/useSpotifyPlayer';
import { getPlaybackState, getRecentlyPlayedTracks } from '@/services/spotify/player';
import { toWorkoutSoundtrackItem } from '@/services/spotify/workout-soundtrack';
import { LiveStatsHUD } from '@/components/workout/LiveStatsHUD';
import { WorkoutControls } from '@/components/workout/WorkoutControls';
import { WorkoutMap } from '@/components/map/WorkoutMap';
import { SplitsTable } from '@/components/workout/SplitsTable';
import { RunnerMiniPlayer } from '@/components/spotify/RunnerMiniPlayer';
import { SaveWorkoutModal } from '@/components/workout/SaveWorkoutModal';
import { WorkoutSoundtrackItem, WorkoutType } from '@/types/workout';
import { FONT_FAMILY, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';
import { getActivityLabel } from '@/constants/i18n';
import { usePreferences } from '@/context/AppPreferencesContext';
import { useAppDialog } from '@/context/AppDialogContext';
import { formatDuration } from '@/services/location/metrics';
import { getElapsedActiveSeconds } from '@/services/location/tracking-engine';
import { getAppSetting, setAppSetting } from '@/services/database/workout-repo';

const BG_LOCATION_PROMPTED_KEY = 'bg_location_prompted_v1';

export default function RecordScreen() {
  const router = useRouter();
  const { palette, isDark, t, autoPauseEnabled, setAutoPauseEnabled } = usePreferences();
  const { confirm } = useAppDialog();
  const {
    status,
    isAutoPaused,
    trackingMode,
    workoutType,
    durationSeconds,
    distanceMeters,
    currentPaceSeconds,
    avgPaceSeconds,
    caloriesKcal,
    steps,
    avgCadenceSpm,
    elevationGainMeters,
    floorsClimbed,
    isVehicleDetected,
    stepTrackingMode,
    routeCoordinates,
    splits,
    sessionSoundtracks,
    workoutStartTime,
    currentLocation,
    currentHeading,
    gpsSignal,
    gpsAccuracyMeters,
    hasLocationPermission,
    hasBackgroundPermission,
    pedometerAvailable,
    hasPedometerPermission,
    getStrideForType,
    pendingRecovery,
    setTrackingMode,
    refreshLocationPermission,
    requestBackgroundLocationPermission,
    recordPlayedTrack,
    mergeSessionSoundtracks,
    startWorkout,
    pauseWorkout,
    resumeWorkout,
    stopWorkout,
    resetWorkout,
    saveCurrentWorkout,
    restorePendingWorkout,
    dismissPendingWorkout,
  } = useWorkoutSession();

  const { isAuthenticated: isSpotifyAuthenticated } = useSpotifyAuth();
  const { currentTrack, isPlaying } = useSpotifyPlayer();
  useSpotifyPlayerFocus();

  const [selectedType, setSelectedType] = useState<WorkoutType>('run');
  const [viewMode, setViewMode] = useState<'map' | 'splits'>('map');
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [workoutTitle, setWorkoutTitle] = useState('');
  const [isSyncingSoundtracks, setIsSyncingSoundtracks] = useState(false);
  const recoveryPromptHandledRef = useRef(false);
  const soundtrackSyncPromiseRef = useRef<Promise<WorkoutSoundtrackItem[] | null> | null>(null);
  const soundtrackSyncRunIdRef = useRef(0);

  // Rekam lagu yang sedang diputar ke daftar soundtrack sesi selama sesi aktif merekam
  useEffect(() => {
    if (status !== 'recording' || !isPlaying || !currentTrack) return;
    const item = toWorkoutSoundtrackItem(currentTrack, Date.now());
    if (item) {
      recordPlayedTrack(item);
    }
  }, [status, isPlaying, currentTrack, recordPlayedTrack]);

  // Tampilkan prompt pemulihan sesi bila aplikasi sempat tertutup saat sesi aktif
  useEffect(() => {
    if (!pendingRecovery || recoveryPromptHandledRef.current) return;
    recoveryPromptHandledRef.current = true;

    let cancelled = false;
    (async () => {
      const activityName = getActivityLabel(pendingRecovery.type, t);
      const distKm = (pendingRecovery.distanceMeters / 1000).toFixed(2);
      const durStr = formatDuration(
        getElapsedActiveSeconds(pendingRecovery, pendingRecovery.lastSavedAt || Date.now())
      );

      const shouldResume = await confirm({
        kicker: t.record.recoveryKicker,
        title: t.record.recoveryTitle,
        message: t.record.recoveryMessage(activityName, distKm, durStr),
        cancelText: t.record.recoveryDiscard,
        confirmText: t.record.recoveryResume,
      });

      if (cancelled) return;
      if (shouldResume) {
        await restorePendingWorkout();
      } else {
        await dismissPendingWorkout();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [confirm, dismissPendingWorkout, pendingRecovery, restorePendingWorkout, t]);

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
    if (trackingMode === 'outdoor') {
      if (hasLocationPermission !== true) {
        const granted = await refreshLocationPermission(true);
        if (!granted) {
          await showPermissionGuidance();
          return;
        }
      }

      if (hasBackgroundPermission === false) {
        const alreadyPrompted = await getAppSetting(BG_LOCATION_PROMPTED_KEY).catch(
          () => null
        );
        if (alreadyPrompted !== 'true') {
          await setAppSetting(BG_LOCATION_PROMPTED_KEY, 'true').catch(() => {});
          const wantsBg = await confirm({
            kicker: t.record.bgLocationKicker,
            title: t.record.bgLocationTitle,
            message: t.record.bgLocationMessage,
            cancelText: t.record.bgLocationSkip,
            confirmText: t.record.bgLocationConfirm,
          });
          if (wantsBg) {
            await requestBackgroundLocationPermission();
          }
        }
      }
    }

    await startWorkout(selectedType);
    if (isPlaying && currentTrack) {
      const initialTrack = toWorkoutSoundtrackItem(currentTrack, Date.now());
      if (initialTrack) {
        recordPlayedTrack(initialTrack);
      }
    }
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

    if (isPlaying && currentTrack) {
      const stopTrack = toWorkoutSoundtrackItem(currentTrack, Date.now());
      if (stopTrack) {
        recordPlayedTrack(stopTrack);
      }
    }

    const sessionStartMs = workoutStartTime ?? Date.now() - durationSeconds * 1000;
    await stopWorkout();

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

    if (isSpotifyAuthenticated) {
      const runId = ++soundtrackSyncRunIdRef.current;
      setIsSyncingSoundtracks(true);
      const syncPromise = (async (): Promise<WorkoutSoundtrackItem[] | null> => {
        try {
          const [playbackState, recentlyPlayed] = await Promise.all([
            getPlaybackState().catch(() => null),
            getRecentlyPlayedTracks({ afterMs: sessionStartMs }),
          ]);

          const fetchedItems: WorkoutSoundtrackItem[] = [];
          if (playbackState?.is_playing && playbackState.item) {
            const currentItem = toWorkoutSoundtrackItem(playbackState.item, Date.now());
            if (currentItem) fetchedItems.push(currentItem);
          }
          fetchedItems.push(...recentlyPlayed.items);

          if (soundtrackSyncRunIdRef.current !== runId) {
            return null;
          }
          return mergeSessionSoundtracks(fetchedItems, Date.now());
        } catch {
          return null;
        } finally {
          if (soundtrackSyncRunIdRef.current === runId) {
            setIsSyncingSoundtracks(false);
          }
        }
      })();
      soundtrackSyncPromiseRef.current = syncPromise;
    } else {
      soundtrackSyncPromiseRef.current = null;
      setIsSyncingSoundtracks(false);
    }
  };

  const handleConfirmSave = async () => {
    let syncedSoundtracks: WorkoutSoundtrackItem[] | undefined;
    if (soundtrackSyncPromiseRef.current) {
      try {
        const result = await soundtrackSyncPromiseRef.current;
        if (result) {
          syncedSoundtracks = result;
        }
      } catch {
        // Ignore sync errors cleanly so saving never blocks
      }
    }

    const saved = await saveCurrentWorkout(workoutTitle, syncedSoundtracks);
    soundtrackSyncPromiseRef.current = null;
    setIsSyncingSoundtracks(false);
    setSaveModalVisible(false);
    router.push(`/workout/${saved.id}` as any);
  };

  const handleDiscard = () => {
    soundtrackSyncRunIdRef.current += 1;
    soundtrackSyncPromiseRef.current = null;
    setIsSyncingSoundtracks(false);
    setSaveModalVisible(false);
    void resetWorkout();
  };

  const isRecordingOrPaused = status === 'recording' || status === 'paused';
  const displayedType = isRecordingOrPaused ? workoutType : selectedType;
  const activeTypeLabel =
    displayedType === 'walk'
      ? t.activityTypes.walkFull
      : getActivityLabel(displayedType, t);
  const darkSurfaceBorder = isDark ? { borderWidth: 1, borderColor: palette.border } : undefined;
  const strideCm = Math.round(getStrideForType(displayedType) * 100);

  const gpsDotColor =
    gpsSignal === 'good'
      ? palette.primaryDeep
      : gpsSignal === 'weak'
      ? palette.accent
      : palette.onSurfaceVariant;
  const gpsLabel =
    gpsSignal === 'good' && gpsAccuracyMeters != null
      ? t.record.gpsGood(gpsAccuracyMeters)
      : gpsSignal === 'weak' && gpsAccuracyMeters != null
      ? t.record.gpsWeak(gpsAccuracyMeters)
      : t.record.gpsAcquiring;

  const statusKickerText =
    status === 'recording' && isAutoPaused
      ? t.record.autoPausedKicker
      : status === 'recording' && trackingMode === 'indoor'
      ? t.record.recordingIndoorKicker
      : status === 'recording'
      ? t.record.recordingKicker
      : status === 'paused'
      ? t.record.pausedKicker
      : t.record.idleKicker;

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
              <View
                style={[
                  styles.recordingDot,
                  { backgroundColor: isAutoPaused ? palette.onSurfaceVariant : palette.accent },
                ]}
              />
            )}
            <Text style={[styles.topBarKicker, { color: palette.onSurfaceVariant }]}>
              {statusKickerText}
            </Text>
          </View>
          <Text style={[styles.topBarTitle, { color: palette.onSurface }]}>
            {activeTypeLabel}
          </Text>
        </View>

        {!isRecordingOrPaused && trackingMode === 'outdoor' && hasLocationPermission && (
          <View
            style={[
              styles.signalBadge,
              { backgroundColor: palette.surfaceAlt },
              darkSurfaceBorder,
            ]}
          >
            <Radio size={13} strokeWidth={2} color={gpsDotColor} />
            <Text style={[styles.signalBadgeText, { color: palette.onSurface }]}>
              {gpsLabel}
            </Text>
          </View>
        )}

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
              {trackingMode === 'indoor' ? (
                <Footprints
                  size={15}
                  strokeWidth={2}
                  color={
                    viewMode === 'map' ? palette.onActionPrimary : palette.onSurfaceVariant
                  }
                />
              ) : (
                <Map
                  size={15}
                  strokeWidth={2}
                  color={
                    viewMode === 'map' ? palette.onActionPrimary : palette.onSurfaceVariant
                  }
                />
              )}
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
                {trackingMode === 'indoor' ? t.record.indoorModeChip : t.record.mapChip}
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

      {/* Pre-Run Options Strip: Outdoor GPS / Indoor Toggle + Auto-Pause */}
      {!isRecordingOrPaused && (
        <View style={styles.optionsStrip}>
          <View style={styles.optionsLeft}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setTrackingMode('outdoor')}
              style={({ pressed }) => [
                styles.optionChip,
                {
                  backgroundColor:
                    trackingMode === 'outdoor' ? palette.actionPrimary : palette.surfaceAlt,
                },
                trackingMode !== 'outdoor' && darkSurfaceBorder,
                pressed && { opacity: 0.78 },
              ]}
            >
              <Navigation
                size={13}
                strokeWidth={2}
                color={
                  trackingMode === 'outdoor'
                    ? palette.onActionPrimary
                    : palette.onSurfaceVariant
                }
              />
              <Text
                style={[
                  styles.optionChipText,
                  {
                    color:
                      trackingMode === 'outdoor'
                        ? palette.onActionPrimary
                        : palette.onSurfaceVariant,
                  },
                ]}
              >
                {t.record.outdoorModeChip}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => setTrackingMode('indoor')}
              style={({ pressed }) => [
                styles.optionChip,
                {
                  backgroundColor:
                    trackingMode === 'indoor' ? palette.actionPrimary : palette.surfaceAlt,
                },
                trackingMode !== 'indoor' && darkSurfaceBorder,
                pressed && { opacity: 0.78 },
              ]}
            >
              <Footprints
                size={13}
                strokeWidth={2}
                color={
                  trackingMode === 'indoor'
                    ? palette.onActionPrimary
                    : palette.onSurfaceVariant
                }
              />
              <Text
                style={[
                  styles.optionChipText,
                  {
                    color:
                      trackingMode === 'indoor'
                        ? palette.onActionPrimary
                        : palette.onSurfaceVariant,
                  },
                ]}
              >
                {t.record.indoorModeChip}
              </Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => void setAutoPauseEnabled(!autoPauseEnabled)}
            style={({ pressed }) => [
              styles.optionChip,
              {
                backgroundColor: autoPauseEnabled ? palette.primary : palette.surfaceAlt,
              },
              !autoPauseEnabled && darkSurfaceBorder,
              pressed && { opacity: 0.78 },
            ]}
          >
            <PauseCircle
              size={13}
              strokeWidth={2}
              color={autoPauseEnabled ? palette.onPrimary : palette.onSurfaceVariant}
            />
            <Text
              style={[
                styles.optionChipText,
                {
                  color: autoPauseEnabled ? palette.onPrimary : palette.onSurfaceVariant,
                },
              ]}
            >
              {t.record.autoPauseLabel}
            </Text>
          </Pressable>
        </View>
      )}

      {trackingMode === 'outdoor' && hasLocationPermission === false && (
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

      {hasPedometerPermission === false && (
        <Pressable
          accessibilityRole="button"
          onPress={() => void Linking.openSettings()}
          style={({ pressed }) => [
            styles.permissionBanner,
            { backgroundColor: palette.surfaceAlt },
            darkSurfaceBorder,
            pressed && { opacity: 0.8 },
          ]}
        >
          <AlertTriangle size={15} strokeWidth={2} color={palette.onSurfaceVariant} />
          <Text
            style={[styles.permissionBannerText, { color: palette.onSurfaceVariant }]}
            numberOfLines={1}
          >
            {t.record.pedometerDeniedBanner}
          </Text>
        </Pressable>
      )}

      {isVehicleDetected && (
        <View
          style={[
            styles.vehicleAlertBanner,
            {
              backgroundColor: isDark
                ? 'rgba(235, 87, 87, 0.16)'
                : 'rgba(235, 87, 87, 0.12)',
              borderColor: palette.accent,
            },
          ]}
        >
          <AlertTriangle size={15} strokeWidth={2} color={palette.accent} />
          <Text
            style={[styles.vehicleAlertText, { color: palette.accent }]}
            numberOfLines={2}
          >
            {t.hud.vehicleWarning}
          </Text>
        </View>
      )}

      {/* Center Map / Indoor Panel / Splits Frame */}
      <View style={styles.centerArea}>
        {viewMode === 'splits' ? (
          <ScrollView style={styles.splitsScroll} showsVerticalScrollIndicator={false}>
            <Text style={[styles.splitsKicker, { color: palette.onSurfaceVariant }]}>
              {t.record.splitsKicker}
            </Text>
            <Text style={[styles.splitsHeading, { color: palette.onSurface }]}>
              {t.record.splitsHeading}
            </Text>
            <SplitsTable splits={splits} />
          </ScrollView>
        ) : trackingMode === 'indoor' ? (
          <View
            style={[
              styles.indoorCard,
              { backgroundColor: palette.surfaceAlt },
              darkSurfaceBorder,
            ]}
          >
            <View
              style={[
                styles.indoorIconCircle,
                { backgroundColor: palette.surfaceRaised },
                darkSurfaceBorder,
              ]}
            >
              <Footprints size={28} strokeWidth={2} color={palette.accent} />
            </View>
            <Text style={[styles.indoorKicker, { color: palette.onSurfaceVariant }]}>
              {t.record.indoorCardKicker}
            </Text>
            <Text style={[styles.indoorHeading, { color: palette.onSurface }]}>
              {t.record.indoorCardHeading}
            </Text>
            <Text style={[styles.indoorHint, { color: palette.onSurfaceVariant }]}>
              {pedometerAvailable === false
                ? t.record.indoorUnavailableHint
                : t.record.indoorCardSensorHint}
            </Text>
            <View
              style={[
                styles.strideBadge,
                { backgroundColor: palette.surfaceRaised },
                darkSurfaceBorder,
              ]}
            >
              <Text style={[styles.strideBadgeText, { color: palette.onSurface }]}>
                {t.record.indoorCardStride(strideCm)}
              </Text>
            </View>
          </View>
        ) : (
          <View
            style={[
              styles.mapFrame,
              { backgroundColor: palette.surfaceAlt },
              darkSurfaceBorder,
            ]}
          >
            <WorkoutMap
              currentLocation={currentLocation}
              headingDegrees={currentHeading}
              routeCoordinates={routeCoordinates}
              isTracking={status === 'recording' && !isAutoPaused}
            />
          </View>
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
          elevationGainMeters={elevationGainMeters}
          floorsClimbed={floorsClimbed}
          trackingMode={trackingMode}
          stepTrackingMode={stepTrackingMode}
        />

        <RunnerMiniPlayer />

        <WorkoutControls
          status={status}
          selectedType={selectedType}
          onSelectType={setSelectedType}
          onStart={() => void handleStart()}
          onPause={() => void pauseWorkout()}
          onResume={() => void resumeWorkout()}
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
        soundtracks={sessionSoundtracks}
        isSyncingSoundtracks={isSyncingSoundtracks}
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
  signalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: RADIUS.full,
  },
  signalBadgeText: {
    ...TYPOGRAPHY.labelSm,
    fontSize: 11,
  },
  optionsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.gutter,
    marginBottom: SPACING.sm,
    gap: 8,
  },
  optionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  optionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: RADIUS.full,
  },
  optionChipText: {
    ...TYPOGRAPHY.labelSm,
    fontSize: 11,
  },
  indoorCard: {
    flex: 1,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    gap: 8,
  },
  indoorIconCircle: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  indoorKicker: {
    ...TYPOGRAPHY.labelUppercase,
  },
  indoorHeading: {
    ...TYPOGRAPHY.headlineSm,
    textAlign: 'center',
  },
  indoorHint: {
    ...TYPOGRAPHY.bodySm,
    textAlign: 'center',
    maxWidth: 260,
  },
  strideBadge: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
  },
  strideBadgeText: {
    ...TYPOGRAPHY.labelSm,
    fontFamily: FONT_FAMILY.displaySemiBold,
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
  vehicleAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: SPACING.gutter,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  vehicleAlertText: {
    ...TYPOGRAPHY.labelSm,
    flex: 1,
    fontFamily: FONT_FAMILY.displayMedium,
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
