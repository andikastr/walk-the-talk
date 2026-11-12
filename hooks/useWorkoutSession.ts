import { useState, useRef, useEffect, useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as WorkoutPedometer from '@/modules/workout-pedometer';
import type { StepEventSubscription } from '@/modules/workout-pedometer';
import {
  ActiveWorkoutCheckpoint,
  CalibratedStrideProfile,
  GpsSignalQuality,
  GPSCoordinate,
  StepTrackingMode,
  TrackingMode,
  WorkoutRecord,
  WorkoutSoundtrackItem,
  WorkoutSplit,
  WorkoutStatus,
  WorkoutType,
} from '@/types/workout';
import {
  calculateCadenceSpm,
  calculatePaceSeconds,
  classifyGpsAccuracy,
  estimateCalories,
} from '@/services/location/metrics';
import { WORKOUT_CONFIG } from '@/constants/Config';
import {
  clearActiveCheckpoint,
  getCalibratedStrides,
  loadActiveCheckpoint,
  saveActiveCheckpoint,
  saveCalibratedStride,
  saveWorkout as saveWorkoutToDb,
} from '@/services/database/workout-repo';
import {
  applyFallbackStepsToCheckpoint,
  applyManualPause,
  applyManualResume,
  applyStationaryPaceDecay,
  classifyCadenceBand,
  createInitialCheckpoint,
  evaluateIdleAutoPause,
  getElapsedActiveSeconds,
  processGpsLocationSample,
  reconcileTotalHardwareStepsToCheckpoint,
  resolveStrideMeters,
} from '@/services/location/tracking-engine';
import {
  isBackgroundLocationGranted,
  registerForegroundLocationTaskListener,
  startBackgroundLocationUpdates,
  stopBackgroundLocationUpdates,
} from '@/services/location/background-task';
import { getActivityLabel } from '@/constants/i18n';
import { usePreferences } from '@/context/AppPreferencesContext';
import {
  appendUniqueSoundtrack,
  getPrimarySoundtrack,
  mergeWorkoutSoundtracks,
  normalizeWorkoutSoundtracks,
} from '@/services/spotify/workout-soundtrack';

export type { StepTrackingMode };

const IDLE_PREVIEW_MIN_MS = 3000;
const IDLE_PREVIEW_MIN_METERS = 3;

function getCheckpointSessionId(
  checkpoint: Pick<ActiveWorkoutCheckpoint, 'startTime'>
): string {
  return `wtt-${checkpoint.startTime}`;
}

function reconcileSnapshotOntoRecordingCheckpoint(
  checkpoint: ActiveWorkoutCheckpoint,
  snapshot: WorkoutPedometer.PedometerSessionSnapshot | null,
  strides: CalibratedStrideProfile,
  now: number
): ActiveWorkoutCheckpoint {
  if (
    checkpoint.status !== 'recording' ||
    !snapshot ||
    snapshot.sessionId !== getCheckpointSessionId(checkpoint) ||
    snapshot.totalSteps <= (checkpoint.lastSyncedNativeSteps ?? 0)
  ) {
    return checkpoint;
  }

  const res = reconcileTotalHardwareStepsToCheckpoint(
    checkpoint,
    snapshot.totalSteps,
    now,
    strides,
    {
      isBackgroundReconcile: true,
      stepTimestampMs: snapshot.lastStepTimestampMs,
    }
  );

  if (res.appliedStepDelta <= 0) {
    return checkpoint;
  }

  return {
    ...res.checkpoint,
    lastSavedAt: Math.max(
      checkpoint.lastSavedAt,
      Math.min(now, snapshot.lastStepTimestampMs || now)
    ),
  };
}

export function useWorkoutSession() {
  const { weightKg, autoPauseEnabled, palette, t } = usePreferences();

  const [status, setStatus] = useState<WorkoutStatus>('idle');
  const [isAutoPaused, setIsAutoPaused] = useState<boolean>(false);
  const [trackingMode, setTrackingModeState] = useState<TrackingMode>('outdoor');
  const [workoutType, setWorkoutType] = useState<WorkoutType>('run');
  const [durationSeconds, setDurationSeconds] = useState<number>(0);
  const [distanceMeters, setDistanceMeters] = useState<number>(0);
  const [currentPaceSeconds, setCurrentPaceSeconds] = useState<number>(0);
  const [avgPaceSeconds, setAvgPaceSeconds] = useState<number>(0);
  const [caloriesKcal, setCaloriesKcal] = useState<number>(0);
  const [steps, setSteps] = useState<number>(0);
  const [avgCadenceSpm, setAvgCadenceSpm] = useState<number>(0);
  const [elevationGainMeters, setElevationGainMeters] = useState<number>(0);
  const [stepTrackingMode, setStepTrackingMode] = useState<StepTrackingMode>('fallback');
  const [routeCoordinates, setRouteCoordinates] = useState<GPSCoordinate[]>([]);
  const [splits, setSplits] = useState<WorkoutSplit[]>([]);
  const [sessionSoundtracks, setSessionSoundtracks] = useState<WorkoutSoundtrackItem[]>([]);
  const [workoutStartTime, setWorkoutStartTime] = useState<number | null>(null);
  const [currentLocation, setCurrentLocation] =
    useState<Location.LocationObjectCoords | null>(null);
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);
  const [hasBackgroundPermission, setHasBackgroundPermission] = useState<boolean | null>(
    null
  );
  const [pedometerAvailable, setPedometerAvailable] = useState<boolean | null>(null);
  const [hasPedometerPermission, setHasPedometerPermission] = useState<boolean | null>(
    null
  );
  const [calibratedStrides, setCalibratedStrides] = useState<CalibratedStrideProfile>({});
  const [pendingRecovery, setPendingRecovery] =
    useState<ActiveWorkoutCheckpoint | null>(null);

  // Refs untuk status sinkron tanpa stale closure pada listener background/hardware
  const checkpointRef = useRef<ActiveWorkoutCheckpoint | null>(null);
  const statusRef = useRef<WorkoutStatus>('idle');
  const trackingModeRef = useRef<TrackingMode>('outdoor');
  const weightKgRef = useRef<number>(weightKg);
  const autoPauseEnabledRef = useRef<boolean>(autoPauseEnabled);
  const calibratedStridesRef = useRef<CalibratedStrideProfile>({});
  const appStateRef = useRef<string>(AppState.currentState ?? 'active');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleLocationSubRef = useRef<Location.LocationSubscription | null>(null);
  const activeLocationSubRef = useRef<Location.LocationSubscription | null>(null);
  const pedometerSubRef = useRef<StepEventSubscription | null>(null);

  const pedometerActiveRef = useRef<boolean>(false);
  const sensorReceivedEventRef = useRef<boolean>(false);
  const lastCheckpointSavedAtRef = useRef<number>(0);
  const isReconcilingResumeRef = useRef<boolean>(false);

  // Sinkronkan preferensi terbaru ke refs dan ke checkpoint aktif bila ada
  useEffect(() => {
    weightKgRef.current = weightKg;
    if (checkpointRef.current) {
      checkpointRef.current = { ...checkpointRef.current, weightKg };
    }
  }, [weightKg]);

  useEffect(() => {
    autoPauseEnabledRef.current = autoPauseEnabled;
    if (checkpointRef.current) {
      checkpointRef.current = { ...checkpointRef.current, autoPauseEnabled };
    }
  }, [autoPauseEnabled]);

  useEffect(() => {
    calibratedStridesRef.current = calibratedStrides;
  }, [calibratedStrides]);

  const applyCheckpointToUi = useCallback(
    (cp: ActiveWorkoutCheckpoint, now: number = Date.now()) => {
      const elapsedSec = getElapsedActiveSeconds(cp, now);
      const calories = estimateCalories(
        cp.type,
        elapsedSec,
        cp.distanceMeters,
        cp.weightKg || weightKgRef.current,
        {
          elevationGainMeters: cp.elevationGainMeters,
          isIndoor: cp.trackingMode === 'indoor',
          splits: cp.splits,
        }
      );
      const avgPace = calculatePaceSeconds(cp.distanceMeters, elapsedSec);
      const cadence = calculateCadenceSpm(cp.steps, elapsedSec);

      setWorkoutType(cp.type);
      setTrackingModeState(cp.trackingMode);
      trackingModeRef.current = cp.trackingMode;
      setIsAutoPaused(cp.isAutoPaused);
      setDurationSeconds(elapsedSec);
      setDistanceMeters(cp.distanceMeters);
      setCurrentPaceSeconds(cp.smoothedCurrentPaceSeconds);
      setAvgPaceSeconds(avgPace);
      setCaloriesKcal(calories);
      setSteps(cp.steps);
      setAvgCadenceSpm(cadence);
      setElevationGainMeters(Math.round(cp.elevationGainMeters));
      setRouteCoordinates(cp.routePoints);
      setSplits(cp.splits);
      setSessionSoundtracks(cp.soundtracks ?? []);
      setWorkoutStartTime(cp.startTime);
    },
    []
  );

  const persistCheckpointIfDue = useCallback(
    async (cp: ActiveWorkoutCheckpoint, force: boolean = false) => {
      const now = Date.now();
      if (
        !force &&
        now - lastCheckpointSavedAtRef.current < WORKOUT_CONFIG.checkpointIntervalMs
      ) {
        return;
      }
      lastCheckpointSavedAtRef.current = now;
      try {
        await saveActiveCheckpoint({ ...cp, lastSavedAt: now });
      } catch (err) {
        console.warn('[WorkoutSession] Failed to save checkpoint:', err);
      }
    },
    []
  );

  // Sinkronisasi durasi berbasis timestamp & evaluasi auto-pause tiap detik
  const syncWallClockMetrics = useCallback(() => {
    if (isReconcilingResumeRef.current) return;
    const cp = checkpointRef.current;
    if (!cp || statusRef.current !== 'recording') return;

    const now = Date.now();
    const autoPausedCp = evaluateIdleAutoPause(cp, now);
    if (autoPausedCp) {
      checkpointRef.current = autoPausedCp;
      applyCheckpointToUi(autoPausedCp, now);
      void persistCheckpointIfDue(autoPausedCp, true);
      return;
    }

    const decayedCp = applyStationaryPaceDecay(
      cp,
      now,
      pedometerActiveRef.current && appStateRef.current === 'active'
    );
    const activeCp = decayedCp;
    if (decayedCp !== cp) {
      checkpointRef.current = decayedCp;
      setCurrentPaceSeconds(0);
    }

    const elapsedSec = getElapsedActiveSeconds(activeCp, now);
    setDurationSeconds(elapsedSec);
    setAvgPaceSeconds(calculatePaceSeconds(activeCp.distanceMeters, elapsedSec));
    setCaloriesKcal(
      estimateCalories(
        activeCp.type,
        elapsedSec,
        activeCp.distanceMeters,
        activeCp.weightKg || weightKgRef.current,
        {
          elevationGainMeters: activeCp.elevationGainMeters,
          isIndoor: activeCp.trackingMode === 'indoor',
          splits: activeCp.splits,
        }
      )
    );
    setAvgCadenceSpm(calculateCadenceSpm(activeCp.steps, elapsedSec));

    if (now - lastCheckpointSavedAtRef.current >= WORKOUT_CONFIG.checkpointIntervalMs) {
      void persistCheckpointIfDue(activeCp, false);
    }
  }, [applyCheckpointToUi, persistCheckpointIfDue]);

  // Cek status sensor & panjang langkah terkalibrasi + cek checkpoint pemulihan saat mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [strides, available, pedoPerm, savedCheckpoint, nativeSnap] = await Promise.all([
          getCalibratedStrides(),
          WorkoutPedometer.isAvailableAsync().catch(() => false),
          WorkoutPedometer.getPermissionsAsync().catch(() => null),
          loadActiveCheckpoint().catch(() => null),
          WorkoutPedometer.getSessionSnapshotAsync().catch(() => null),
        ]);

        if (!active) return;

        setCalibratedStrides(strides);
        calibratedStridesRef.current = strides;
        setPedometerAvailable(available);
        setHasPedometerPermission(pedoPerm ? pedoPerm.granted : null);

        const now = Date.now();
        const hydratedCheckpoint = savedCheckpoint
          ? reconcileSnapshotOntoRecordingCheckpoint(
              savedCheckpoint,
              nativeSnap,
              strides,
              now
            )
          : null;

        if (
          hydratedCheckpoint &&
          (hydratedCheckpoint.distanceMeters >= 5 ||
            getElapsedActiveSeconds(hydratedCheckpoint) >= 5 ||
            hydratedCheckpoint.steps >= 10 ||
            hydratedCheckpoint.routePoints.length > 1)
        ) {
          setPendingRecovery(hydratedCheckpoint);
        } else if (hydratedCheckpoint) {
          await clearActiveCheckpoint().catch(() => {});
          await WorkoutPedometer.stopSessionAsync().catch(() => {});
        }
      } catch {
        // Ignore initialization errors cleanly
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const refreshLocationPermission = useCallback(
    async (requestIfUndetermined: boolean = false): Promise<boolean> => {
      try {
        let perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted' && requestIfUndetermined) {
          perm = await Location.requestForegroundPermissionsAsync();
        }
        const granted = perm.status === 'granted';
        setHasLocationPermission(granted);

        const bgGranted = granted ? await isBackgroundLocationGranted() : false;
        setHasBackgroundPermission(bgGranted);

        if (granted) {
          try {
            const initialLoc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
            });
            setCurrentLocation(initialLoc.coords);
          } catch {
            // Lokasi GPS mungkin belum tersedia saat pertama kali aktif
          }
        }
        return granted;
      } catch {
        setHasLocationPermission(false);
        setHasBackgroundPermission(false);
        return false;
      }
    },
    []
  );

  const requestBackgroundLocationPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') return false;
    try {
      const fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== 'granted') return false;
      const currentBg = await Location.getBackgroundPermissionsAsync();
      if (currentBg.status === 'granted') {
        setHasBackgroundPermission(true);
        return true;
      }
      const res = await Location.requestBackgroundPermissionsAsync();
      const granted = res.status === 'granted';
      setHasBackgroundPermission(granted);
      return granted;
    } catch {
      setHasBackgroundPermission(false);
      return false;
    }
  }, []);

  // Pre-run idle GPS preview watcher: perbarui badge sinyal & pusatkan peta sebelum start
  useEffect(() => {
    let cancelled = false;

    const stopIdlePreview = () => {
      if (idleLocationSubRef.current) {
        idleLocationSubRef.current.remove();
        idleLocationSubRef.current = null;
      }
    };

    if (
      status !== 'idle' ||
      trackingMode !== 'outdoor' ||
      hasLocationPermission !== true ||
      Platform.OS === 'web'
    ) {
      stopIdlePreview();
      return stopIdlePreview;
    }

    (async () => {
      try {
        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: IDLE_PREVIEW_MIN_MS,
            distanceInterval: IDLE_PREVIEW_MIN_METERS,
          },
          (loc) => {
            if (!cancelled) {
              setCurrentLocation(loc.coords);
            }
          }
        );
        if (cancelled) {
          sub.remove();
        } else {
          idleLocationSubRef.current = sub;
        }
      } catch {
        // Ignore preview failures cleanly
      }
    })();

    return () => {
      cancelled = true;
      stopIdlePreview();
    };
  }, [status, trackingMode, hasLocationPermission]);

  // Proses batch GPS dari foreground watcher atau background task
  const handleLocationBatch = useCallback(
    (locations: Location.LocationObject[]) => {
      if (locations.length === 0) return;

      const sorted =
        locations.length > 1
          ? [...locations].sort((a, b) => a.timestamp - b.timestamp)
          : locations;
      const newest = sorted[sorted.length - 1];
      setCurrentLocation(newest.coords);

      const currentCp = checkpointRef.current;
      if (
        !currentCp ||
        statusRef.current !== 'recording' ||
        currentCp.trackingMode === 'indoor'
      ) {
        return;
      }

      const liveForegroundPedometer =
        pedometerActiveRef.current && appStateRef.current === 'active';
      const allowFallback = !liveForegroundPedometer;

      let nextCp = currentCp;
      let changed = false;

      for (const loc of sorted) {
        const res = processGpsLocationSample(nextCp, loc, {
          allowFallbackSteps: allowFallback,
          pedometerActive: liveForegroundPedometer,
          calibratedStrides: calibratedStridesRef.current,
        });
        if (
          res.acceptedPoint ||
          res.didAutoPause ||
          res.didAutoResume ||
          res.checkpoint.smoothedCurrentPaceSeconds !== nextCp.smoothedCurrentPaceSeconds
        ) {
          changed = true;
        }
        nextCp = res.checkpoint;
      }

      if (changed) {
        // Jika pedometer tidak aktif atau di background, catat mode estimasi langkah
        if (allowFallback && nextCp.steps > currentCp.steps) {
          setStepTrackingMode('fallback');
        }
        checkpointRef.current = nextCp;
        applyCheckpointToUi(nextCp);
        if (appStateRef.current !== 'active') {
          void persistCheckpointIfDue(nextCp, false);
        }
      } else {
        // Simpan kembali jika fallback jarak memicu estimasi langkah tambahan saat senyap
        const updatedFallbackCp = applyFallbackStepsToCheckpoint(
          nextCp,
          nextCp.distanceMeters,
          Date.now(),
          calibratedStridesRef.current,
          allowFallback
        );
        if (updatedFallbackCp !== nextCp) {
          checkpointRef.current = updatedFallbackCp;
          setSteps(updatedFallbackCp.steps);
          setStepTrackingMode('fallback');
        }
      }
    },
    [applyCheckpointToUi, persistCheckpointIfDue]
  );

  const applyNativeStepTotal = useCallback(
    (
      sessionId: string | null,
      totalSteps: number,
      timestampMs: number,
      isBackgroundReconcile: boolean
    ) => {
      const cp = checkpointRef.current;
      if (!cp || statusRef.current !== 'recording') return;
      if (sessionId && sessionId !== getCheckpointSessionId(cp)) return;

      const now = Date.now();
      const res = reconcileTotalHardwareStepsToCheckpoint(
        cp,
        totalSteps,
        now,
        calibratedStridesRef.current,
        {
          isBackgroundReconcile,
          stepTimestampMs: timestampMs,
        }
      );

      if (res.appliedStepDelta > 0) {
        checkpointRef.current = res.checkpoint;
        sensorReceivedEventRef.current = true;
        setStepTrackingMode('sensor');
        applyCheckpointToUi(res.checkpoint, now);
        void persistCheckpointIfDue(res.checkpoint, res.didAutoResume);
      }
    },
    [applyCheckpointToUi, persistCheckpointIfDue]
  );

  // Rekonsiliasi total langkah native setelah app kembali dari background / layar mati
  const syncNativePedometerSnapshot = useCallback(async () => {
    if (!pedometerActiveRef.current || statusRef.current !== 'recording') {
      syncWallClockMetrics();
      return;
    }

    isReconcilingResumeRef.current = true;
    try {
      const snapshot = await WorkoutPedometer.getSessionSnapshotAsync();
      applyNativeStepTotal(
        snapshot.sessionId,
        snapshot.totalSteps,
        snapshot.lastStepTimestampMs,
        true
      );
    } catch {
      // Abaikan jika modul native atau izin sensor tidak tersedia
    } finally {
      isReconcilingResumeRef.current = false;
      syncWallClockMetrics();
    }
  }, [applyNativeStepTotal, syncWallClockMetrics]);

  // Pantau status foreground/background untuk sinkronisasi timer, pedometer & recovery DB
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState !== 'active' && prevState === 'active') {
        if (
          checkpointRef.current &&
          (statusRef.current === 'recording' || statusRef.current === 'paused')
        ) {
          void persistCheckpointIfDue(checkpointRef.current, true);
        }
      }

      if (nextState === 'active') {
        void refreshLocationPermission(false);
        void WorkoutPedometer.getPermissionsAsync()
          .then((perm) => setHasPedometerPermission(perm.granted))
          .catch(() => {});

        if (statusRef.current === 'recording') {
          void syncNativePedometerSnapshot();
        } else {
          syncWallClockMetrics();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [
    persistCheckpointIfDue,
    refreshLocationPermission,
    syncNativePedometerSnapshot,
    syncWallClockMetrics,
  ]);

  // Minta izin lokasi dasar saat mount
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) {
        return refreshLocationPermission(true);
      }
      return false;
    });
    return () => {
      active = false;
    };
  }, [refreshLocationPermission]);

  // Timer interval tiap 1 detik: hanya menyinkronkan wall-clock timestamp & auto-pause
  useEffect(() => {
    if (status === 'recording') {
      timerRef.current = setInterval(syncWallClockMetrics, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [status, syncWallClockMetrics]);

  // Mulai / hentikan GPS tracking (Background Service jika diizinkan, fallback Foreground Watch)
  const stopOutdoorGpsTracking = useCallback(async () => {
    registerForegroundLocationTaskListener(null);
    if (activeLocationSubRef.current) {
      activeLocationSubRef.current.remove();
      activeLocationSubRef.current = null;
    }
    await stopBackgroundLocationUpdates();
  }, []);

  const startOutdoorGpsTracking = useCallback(
    async (activityType: WorkoutType): Promise<boolean> => {
      await stopOutdoorGpsTracking();

      const fgPerm = await Location.getForegroundPermissionsAsync();
      if (fgPerm.status !== 'granted') {
        setHasLocationPermission(false);
        return false;
      }

      const activityName = getActivityLabel(activityType, t);
      registerForegroundLocationTaskListener(handleLocationBatch);

      const startedBackground = await startBackgroundLocationUpdates({
        notificationTitle: t.record.fgServiceTitle(activityName),
        notificationBody: t.record.fgServiceBody,
        notificationColor: palette.accent,
      });

      if (startedBackground) {
        // Ambil posisi cepat awal sambil menunggu batch background task pertama masuk
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation })
          .then((loc) => handleLocationBatch([loc]))
          .catch(() => {});
        return true;
      }

      // Fallback mulus ke foreground watchPositionAsync jika izin background belum diberikan
      registerForegroundLocationTaskListener(null);
      activeLocationSubRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: WORKOUT_CONFIG.locationTimeIntervalMs,
          distanceInterval: WORKOUT_CONFIG.locationDistanceIntervalMeters,
        },
        (loc) => handleLocationBatch([loc])
      );
      return false;
    },
    [handleLocationBatch, palette.accent, stopOutdoorGpsTracking, t]
  );

  // Lepaskan listener JS pedometer tanpa menghentikan foreground service native yang sedang aktif
  const detachPedometerListener = useCallback(() => {
    if (pedometerSubRef.current) {
      pedometerSubRef.current.remove();
      pedometerSubRef.current = null;
    }
    pedometerActiveRef.current = false;
  }, []);

  const startPedometerTracking = useCallback(
    async (options: {
      sessionId: string;
      trackingMode: TrackingMode;
      activityType: WorkoutType;
      useForegroundService: boolean;
      initialSyncedSteps: number;
      isResume: boolean;
    }) => {
      detachPedometerListener();
      sensorReceivedEventRef.current = false;

      try {
        const available = await WorkoutPedometer.isAvailableAsync();
        setPedometerAvailable(available);
        if (!available) {
          pedometerActiveRef.current = false;
          setStepTrackingMode('fallback');
          return;
        }

        const perm = await WorkoutPedometer.requestPermissionsAsync();
        const granted = perm.granted;
        setHasPedometerPermission(granted);

        if (!granted) {
          pedometerActiveRef.current = false;
          setStepTrackingMode('fallback');
          return;
        }

        if (options.useForegroundService) {
          await WorkoutPedometer.requestNotificationPermissionAsync().catch(() => null);
        }

        if (statusRef.current !== 'recording') {
          return;
        }

        pedometerActiveRef.current = true;
        setStepTrackingMode('sensor');

        pedometerSubRef.current = WorkoutPedometer.addStepListener((event) => {
          applyNativeStepTotal(
            event.sessionId,
            event.totalSteps,
            event.timestampMs,
            false
          );
        });

        const activityName = getActivityLabel(options.activityType, t);
        const notificationTitle =
          options.trackingMode === 'indoor'
            ? t.record.indoorFgServiceTitle(activityName)
            : t.record.fgServiceTitle(activityName);
        const notificationBody =
          options.trackingMode === 'indoor'
            ? t.record.indoorFgServiceBody
            : t.record.fgServiceBody;
        const strideMeters = resolveStrideMeters(
          options.activityType,
          calibratedStridesRef.current
        );

        let snapshot: WorkoutPedometer.PedometerSessionSnapshot | null = null;
        if (options.isResume) {
          const existingSnap = await WorkoutPedometer.getSessionSnapshotAsync().catch(() => null);
          if (existingSnap && existingSnap.sessionId === options.sessionId) {
            snapshot = await WorkoutPedometer.resumeSessionAsync({
              trackingMode: options.trackingMode,
              useForegroundService: options.useForegroundService,
              notificationTitle,
              notificationBody,
              notificationColor: palette.accent,
              strideMeters,
            });
          }
        }

        if (!snapshot) {
          snapshot = await WorkoutPedometer.startSessionAsync({
            sessionId: options.sessionId,
            trackingMode: options.trackingMode,
            useForegroundService: options.useForegroundService,
            notificationTitle,
            notificationBody,
            notificationColor: palette.accent,
            strideMeters,
            initialSyncedSteps: options.initialSyncedSteps,
            stepsLabel: t.hud.steps.toLowerCase(),
          });
        }

        applyNativeStepTotal(
          snapshot.sessionId,
          snapshot.totalSteps,
          snapshot.lastStepTimestampMs,
          true
        );
      } catch {
        pedometerActiveRef.current = false;
        setHasPedometerPermission(false);
        setStepTrackingMode('fallback');
      }
    },
    [applyNativeStepTotal, detachPedometerListener, palette.accent, t]
  );

  // Bersihkan seluruh listener saat unmount jika tidak sedang background tracking?
  // Catatan: saat sesi aktif dibiarkan hidup di Root Tab, stopForeground listeners tapi
  // background task headless & native pedometer service tetap hidup jika foreground service aktif!
  useEffect(() => {
    return () => {
      registerForegroundLocationTaskListener(null);
      if (activeLocationSubRef.current) {
        activeLocationSubRef.current.remove();
        activeLocationSubRef.current = null;
      }
      if (idleLocationSubRef.current) {
        idleLocationSubRef.current.remove();
        idleLocationSubRef.current = null;
      }
      if (pedometerSubRef.current) {
        pedometerSubRef.current.remove();
        pedometerSubRef.current = null;
      }
    };
  }, []);

  const persistCalibratedStrideIfReady = useCallback(async (cp: ActiveWorkoutCheckpoint | null) => {
    if (
      !cp ||
      cp.trackingMode !== 'outdoor' ||
      cp.calibHwSteps < WORKOUT_CONFIG.minCalibrationSteps ||
      cp.calibGpsMeters < WORKOUT_CONFIG.minCalibrationDistanceMeters
    ) {
      return;
    }

    try {
      const measuredStride = cp.calibGpsMeters / cp.calibHwSteps;
      const elapsedSec = getElapsedActiveSeconds(cp, Date.now());
      const avgCadence = calculateCadenceSpm(cp.steps, elapsedSec);
      const cadenceBand = avgCadence > 0 ? classifyCadenceBand(avgCadence) : undefined;
      const updatedStrides = await saveCalibratedStride(
        cp.type,
        measuredStride,
        cadenceBand
      );
      setCalibratedStrides(updatedStrides);
      calibratedStridesRef.current = updatedStrides;
    } catch {
      // Ignore calibration write failures cleanly
    }
  }, []);

  const setTrackingMode = useCallback((mode: TrackingMode) => {
    if (statusRef.current !== 'idle') return;
    trackingModeRef.current = mode;
    setTrackingModeState(mode);
  }, []);

  // START WORKOUT
  const startWorkout = useCallback(
    async (type: WorkoutType = 'run', overrideMode?: TrackingMode) => {
      const activeMode = overrideMode ?? trackingModeRef.current;
      const now = Date.now();
      const initialCheckpoint = createInitialCheckpoint({
        type,
        trackingMode: activeMode,
        autoPauseEnabled: autoPauseEnabledRef.current,
        weightKg: weightKgRef.current,
        now,
      });

      checkpointRef.current = initialCheckpoint;
      statusRef.current = 'recording';
      trackingModeRef.current = activeMode;
      lastCheckpointSavedAtRef.current = now;

      setPendingRecovery(null);
      setStatus('recording');
      setStepTrackingMode(activeMode === 'indoor' ? 'sensor' : 'fallback');
      applyCheckpointToUi(initialCheckpoint, now);

      void persistCheckpointIfDue(initialCheckpoint, true);

      let startedBgGps = false;
      if (activeMode === 'outdoor') {
        startedBgGps = await startOutdoorGpsTracking(type);
      }

      await startPedometerTracking({
        sessionId: getCheckpointSessionId(initialCheckpoint),
        trackingMode: activeMode,
        activityType: type,
        // Aturan 1 notifikasi: outdoor dg GPS background memakai notifikasi GPS saja; indoor/tanpa-GPS memakai notifikasi health service
        useForegroundService: activeMode === 'indoor' || !startedBgGps,
        initialSyncedSteps: 0,
        isResume: false,
      });
    },
    [
      applyCheckpointToUi,
      persistCheckpointIfDue,
      startOutdoorGpsTracking,
      startPedometerTracking,
    ]
  );

  // PAUSE WORKOUT
  const pauseWorkout = useCallback(async () => {
    const cp = checkpointRef.current;
    if (!cp || statusRef.current !== 'recording') return;

    const now = Date.now();
    const pausedCp = applyManualPause(cp, now);
    checkpointRef.current = pausedCp;
    statusRef.current = 'paused';
    setStatus('paused');
    applyCheckpointToUi(pausedCp, now);

    detachPedometerListener();

    const [, pausedNative] = await Promise.all([
      stopOutdoorGpsTracking(),
      WorkoutPedometer.pauseSessionAsync().catch(() => null),
    ]);

    const reconciledBeforePause = reconcileSnapshotOntoRecordingCheckpoint(
      cp,
      pausedNative,
      calibratedStridesRef.current,
      now
    );

    let finalPausedCp = pausedCp;
    if (reconciledBeforePause !== cp) {
      finalPausedCp = applyManualPause(reconciledBeforePause, now);
      checkpointRef.current = finalPausedCp;
      applyCheckpointToUi(finalPausedCp, now);
    }

    await persistCheckpointIfDue(finalPausedCp, true);
  }, [
    applyCheckpointToUi,
    detachPedometerListener,
    persistCheckpointIfDue,
    stopOutdoorGpsTracking,
  ]);

  // RESUME WORKOUT
  const resumeWorkout = useCallback(async () => {
    const cp = checkpointRef.current;
    if (!cp || statusRef.current !== 'paused') return;

    const now = Date.now();
    const resumedCp = applyManualResume(cp, now);
    checkpointRef.current = resumedCp;
    statusRef.current = 'recording';
    setStatus('recording');
    applyCheckpointToUi(resumedCp, now);

    void persistCheckpointIfDue(resumedCp, true);

    let startedBgGps = false;
    if (resumedCp.trackingMode === 'outdoor') {
      startedBgGps = await startOutdoorGpsTracking(resumedCp.type);
    }

    await startPedometerTracking({
      sessionId: getCheckpointSessionId(resumedCp),
      trackingMode: resumedCp.trackingMode,
      activityType: resumedCp.type,
      useForegroundService: resumedCp.trackingMode === 'indoor' || !startedBgGps,
      initialSyncedSteps: resumedCp.lastSyncedNativeSteps ?? resumedCp.steps,
      isResume: true,
    });
  }, [
    applyCheckpointToUi,
    persistCheckpointIfDue,
    startOutdoorGpsTracking,
    startPedometerTracking,
  ]);

  // STOP WORKOUT (Selesai dan siapkan summary)
  const stopWorkout = useCallback(async () => {
    const cp = checkpointRef.current;
    const now = Date.now();
    let baseCp = cp;
    if (cp) {
      const frozenCp = applyManualPause(cp, now);
      checkpointRef.current = frozenCp;
      applyCheckpointToUi(frozenCp, now);
    }

    statusRef.current = 'completed';
    setStatus('completed');
    setIsAutoPaused(false);
    detachPedometerListener();

    const [, pausedNative] = await Promise.all([
      stopOutdoorGpsTracking(),
      WorkoutPedometer.pauseSessionAsync().catch(() => null),
    ]);

    if (baseCp) {
      baseCp = reconcileSnapshotOntoRecordingCheckpoint(
        baseCp,
        pausedNative,
        calibratedStridesRef.current,
        now
      );
      const finalFrozenCp = applyManualPause(baseCp, now);
      checkpointRef.current = finalFrozenCp;
      applyCheckpointToUi(finalFrozenCp, now);
      void persistCalibratedStrideIfReady(finalFrozenCp);
    }

    await Promise.all([
      WorkoutPedometer.stopSessionAsync().catch(() => null),
      clearActiveCheckpoint().catch(() => {}),
    ]);
  }, [
    applyCheckpointToUi,
    detachPedometerListener,
    persistCalibratedStrideIfReady,
    stopOutdoorGpsTracking,
  ]);

  // RESET WORKOUT
  const resetWorkout = useCallback(async () => {
    statusRef.current = 'idle';
    checkpointRef.current = null;
    sensorReceivedEventRef.current = false;
    isReconcilingResumeRef.current = false;
    detachPedometerListener();

    await Promise.all([
      stopOutdoorGpsTracking(),
      WorkoutPedometer.stopSessionAsync().catch(() => null),
      clearActiveCheckpoint().catch(() => {}),
    ]);

    setStatus('idle');
    setIsAutoPaused(false);
    setDurationSeconds(0);
    setDistanceMeters(0);
    setCurrentPaceSeconds(0);
    setAvgPaceSeconds(0);
    setCaloriesKcal(0);
    setSteps(0);
    setAvgCadenceSpm(0);
    setElevationGainMeters(0);
    setStepTrackingMode('fallback');
    setRouteCoordinates([]);
    setSplits([]);
    setSessionSoundtracks([]);
    setWorkoutStartTime(null);
  }, [detachPedometerListener, stopOutdoorGpsTracking]);

  // RESTORE CRASH RECOVERY CHECKPOINT
  const restorePendingWorkout = useCallback(async () => {
    const saved = pendingRecovery;
    if (!saved) return;

    const now = Date.now();
    let baseSaved = saved;

    try {
      const nativeSnap = await WorkoutPedometer.getSessionSnapshotAsync();
      baseSaved = reconcileSnapshotOntoRecordingCheckpoint(
        saved,
        nativeSnap,
        calibratedStridesRef.current,
        now
      );
      await WorkoutPedometer.pauseSessionAsync().catch(() => null);
    } catch {
      // Ignore native recovery sync errors cleanly
    }

    // Jika sebelumnya status recording saat crash, potong ke lastSavedAt atau resume bersih sebagai paused
    // agar durasi offline selama app mati tidak membengkak palsu!
    const recoveredPaused: ActiveWorkoutCheckpoint = {
      ...baseSaved,
      status: 'paused',
      isAutoPaused: false,
      accumulatedActiveMs:
        getElapsedActiveSeconds(baseSaved, baseSaved.lastSavedAt || now) * 1000,
      activeSegmentStartMs: null,
      smoothedCurrentPaceSeconds: 0,
      lastAnchoredPoint: null,
      recentPoints: [],
      currentSegmentIndex: baseSaved.currentSegmentIndex + 1,
    };

    checkpointRef.current = recoveredPaused;
    statusRef.current = 'paused';
    setPendingRecovery(null);
    setStatus('paused');
    applyCheckpointToUi(recoveredPaused, now);
    await persistCheckpointIfDue(recoveredPaused, true);
  }, [applyCheckpointToUi, pendingRecovery, persistCheckpointIfDue]);

  const dismissPendingWorkout = useCallback(async () => {
    setPendingRecovery(null);
    await Promise.all([
      WorkoutPedometer.stopSessionAsync().catch(() => null),
      clearActiveCheckpoint().catch(() => {}),
    ]);
  }, []);

  const recordPlayedTrack = useCallback(
    (item: WorkoutSoundtrackItem | null | undefined) => {
      const cp = checkpointRef.current;
      if (!cp || statusRef.current !== 'recording') return;

      const existing = cp.soundtracks ?? [];
      const next = appendUniqueSoundtrack(existing, item);
      if (next === existing) return;

      const updatedCp: ActiveWorkoutCheckpoint = {
        ...cp,
        soundtracks: next,
      };
      checkpointRef.current = updatedCp;
      setSessionSoundtracks(next);
      void persistCheckpointIfDue(updatedCp, true);
    },
    [persistCheckpointIfDue]
  );

  const mergeSessionSoundtracks = useCallback(
    (recentlyPlayed: WorkoutSoundtrackItem[], endMs?: number): WorkoutSoundtrackItem[] => {
      const cp = checkpointRef.current;
      if (!cp) return sessionSoundtracks;

      const merged = mergeWorkoutSoundtracks(cp.soundtracks ?? [], recentlyPlayed, {
        startMs: cp.startTime,
        endMs: endMs ?? Date.now(),
      });
      checkpointRef.current = {
        ...cp,
        soundtracks: merged,
      };
      setSessionSoundtracks(merged);
      return merged;
    },
    [sessionSoundtracks]
  );

  // SAVE TO DATABASE
  const saveCurrentWorkout = useCallback(
    async (
      title: string,
      soundtrack?:
        | { trackName: string; artist: string }
        | WorkoutSoundtrackItem[]
    ): Promise<WorkoutRecord> => {
      const cp = checkpointRef.current;
      const now = Date.now();
      const baseSoundtracks = cp?.soundtracks ?? sessionSoundtracks;
      const resolvedSoundtracks = Array.isArray(soundtrack)
        ? mergeWorkoutSoundtracks(baseSoundtracks, soundtrack, {
            startMs: cp?.startTime,
            endMs: now,
          })
        : soundtrack
        ? appendUniqueSoundtrack(baseSoundtracks, soundtrack)
        : normalizeWorkoutSoundtracks({ soundtracks: baseSoundtracks });
      const primarySoundtrack = getPrimarySoundtrack(resolvedSoundtracks);
      const finalDuration = cp ? getElapsedActiveSeconds(cp, now) : durationSeconds;
      const finalDistance = cp ? cp.distanceMeters : distanceMeters;
      const finalSteps = cp ? cp.steps : steps;
      const finalType = cp ? cp.type : workoutType;
      const finalWeight = cp ? cp.weightKg : weightKgRef.current;
      const finalElev = cp?.elevationGainMeters ?? elevationGainMeters;
      const finalIsIndoor = (cp?.trackingMode ?? trackingModeRef.current) === 'indoor';
      const finalSplits = cp?.splits ?? splits;
      const finalCalories = estimateCalories(
        finalType,
        finalDuration,
        finalDistance,
        finalWeight,
        {
          elevationGainMeters: finalElev,
          isIndoor: finalIsIndoor,
          splits: finalSplits,
        }
      );
      const finalAvgPace = calculatePaceSeconds(finalDistance, finalDuration);

      const record: WorkoutRecord = {
        id: `workout_${now}_${Math.random().toString(36).substring(2, 7)}`,
        type: finalType,
        title: title || `${finalType.toUpperCase()} Activity`,
        startTime: cp?.startTime || now - finalDuration * 1000,
        endTime: now,
        durationSeconds: finalDuration,
        distanceMeters: finalDistance,
        avgPaceSecondsPerKm: finalAvgPace,
        caloriesKcal: finalCalories,
        routePoints: cp?.routePoints ?? routeCoordinates,
        splits: cp?.splits ?? splits,
        soundtrackTrackName: primarySoundtrack?.trackName,
        soundtrackArtist: primarySoundtrack?.artist,
        ...(resolvedSoundtracks.length > 0
          ? { soundtracks: resolvedSoundtracks }
          : {}),
        steps: finalSteps,
        avgCadenceSpm: calculateCadenceSpm(finalSteps, finalDuration),
        elevationGainMeters: Math.round(cp?.elevationGainMeters ?? elevationGainMeters),
        isIndoor: (cp?.trackingMode ?? trackingModeRef.current) === 'indoor',
      };

      await saveWorkoutToDb(record);
      await resetWorkout();
      return record;
    },
    [
      distanceMeters,
      durationSeconds,
      elevationGainMeters,
      resetWorkout,
      routeCoordinates,
      sessionSoundtracks,
      splits,
      steps,
      workoutType,
    ]
  );

  const gpsAccuracyMeters =
    currentLocation?.accuracy != null && Number.isFinite(currentLocation.accuracy)
      ? Math.round(currentLocation.accuracy)
      : null;
  const gpsSignal: GpsSignalQuality = classifyGpsAccuracy(currentLocation?.accuracy);
  const getStrideForType = useCallback(
    (type: WorkoutType) => resolveStrideMeters(type, calibratedStrides),
    [calibratedStrides]
  );

  return {
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
    stepTrackingMode,
    routeCoordinates,
    splits,
    sessionSoundtracks,
    workoutStartTime,
    currentLocation,
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
  };
}
