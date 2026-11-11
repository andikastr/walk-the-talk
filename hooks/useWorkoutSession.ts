import { useState, useRef, useEffect, useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import {
  ActiveWorkoutCheckpoint,
  GpsSignalQuality,
  GPSCoordinate,
  StepTrackingMode,
  TrackingMode,
  WorkoutRecord,
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
  applyHardwareStepsToCheckpoint,
  applyManualPause,
  applyManualResume,
  createInitialCheckpoint,
  evaluateIdleAutoPause,
  getElapsedActiveSeconds,
  processGpsLocationSample,
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

export type { StepTrackingMode };

const IDLE_PREVIEW_MIN_MS = 3000;
const IDLE_PREVIEW_MIN_METERS = 3;

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
  const [calibratedStrides, setCalibratedStrides] = useState<
    Partial<Record<WorkoutType, number>>
  >({});
  const [pendingRecovery, setPendingRecovery] =
    useState<ActiveWorkoutCheckpoint | null>(null);

  // Refs untuk status sinkron tanpa stale closure pada listener background/hardware
  const checkpointRef = useRef<ActiveWorkoutCheckpoint | null>(null);
  const statusRef = useRef<WorkoutStatus>('idle');
  const trackingModeRef = useRef<TrackingMode>('outdoor');
  const weightKgRef = useRef<number>(weightKg);
  const autoPauseEnabledRef = useRef<boolean>(autoPauseEnabled);
  const calibratedStridesRef = useRef<Partial<Record<WorkoutType, number>>>({});
  const appStateRef = useRef<string>(AppState.currentState ?? 'active');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleLocationSubRef = useRef<Location.LocationSubscription | null>(null);
  const activeLocationSubRef = useRef<Location.LocationSubscription | null>(null);
  const pedometerSubRef = useRef<ReturnType<typeof Pedometer.watchStepCount> | null>(null);

  const pedometerActiveRef = useRef<boolean>(false);
  const lastSensorStepsRef = useRef<number>(0);
  const sensorReceivedEventRef = useRef<boolean>(false);
  const lastCheckpointSavedAtRef = useRef<number>(0);
  const lastBgEnteredAtRef = useRef<number | null>(null);

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

    const elapsedSec = getElapsedActiveSeconds(cp, now);
    setDurationSeconds(elapsedSec);
    setAvgPaceSeconds(calculatePaceSeconds(cp.distanceMeters, elapsedSec));
    setCaloriesKcal(
      estimateCalories(cp.type, elapsedSec, cp.distanceMeters, cp.weightKg || weightKgRef.current, {
        elevationGainMeters: cp.elevationGainMeters,
        isIndoor: cp.trackingMode === 'indoor',
        splits: cp.splits,
      })
    );
    setAvgCadenceSpm(calculateCadenceSpm(cp.steps, elapsedSec));

    if (now - lastCheckpointSavedAtRef.current >= WORKOUT_CONFIG.checkpointIntervalMs) {
      void persistCheckpointIfDue(cp, false);
    }
  }, [applyCheckpointToUi, persistCheckpointIfDue]);

  // Cek status sensor & panjang langkah terkalibrasi + cek checkpoint pemulihan saat mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [strides, available, pedoPerm, savedCheckpoint] = await Promise.all([
          getCalibratedStrides(),
          Pedometer.isAvailableAsync().catch(() => false),
          Pedometer.getPermissionsAsync().catch(() => null),
          loadActiveCheckpoint().catch(() => null),
        ]);

        if (!active) return;

        setCalibratedStrides(strides);
        calibratedStridesRef.current = strides;
        setPedometerAvailable(available);
        setHasPedometerPermission(pedoPerm ? pedoPerm.status === 'granted' : null);

        if (
          savedCheckpoint &&
          (savedCheckpoint.distanceMeters >= 5 ||
            getElapsedActiveSeconds(savedCheckpoint) >= 5 ||
            savedCheckpoint.routePoints.length > 1)
        ) {
          setPendingRecovery(savedCheckpoint);
        } else if (savedCheckpoint) {
          await clearActiveCheckpoint().catch(() => {});
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

      const allowFallback =
        !pedometerActiveRef.current || appStateRef.current !== 'active';

      let nextCp = currentCp;
      let changed = false;

      for (const loc of sorted) {
        const res = processGpsLocationSample(nextCp, loc, {
          allowFallbackSteps: allowFallback,
          calibratedStrides: calibratedStridesRef.current,
        });
        if (res.acceptedPoint || res.didAutoPause || res.didAutoResume) {
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

  // Rekonsiliasi langkah iOS saat kembali dari background (`getStepCountAsync`)
  const reconcileIosBackgroundSteps = useCallback(async () => {
    if (Platform.OS !== 'ios') return;
    const cp = checkpointRef.current;
    const bgSince = lastBgEnteredAtRef.current;
    lastBgEnteredAtRef.current = null;

    if (
      !cp ||
      statusRef.current !== 'recording' ||
      cp.isAutoPaused ||
      !pedometerActiveRef.current ||
      !bgSince
    ) {
      return;
    }

    const now = Date.now();
    if (now - bgSince < 2000) return;

    try {
      const res = await Pedometer.getStepCountAsync(new Date(bgSince), new Date(now));
      const bgSteps = Math.max(0, res?.steps ?? 0);
      if (bgSteps > 0 && checkpointRef.current && statusRef.current === 'recording') {
        const updated = applyHardwareStepsToCheckpoint(
          checkpointRef.current,
          bgSteps,
          now,
          calibratedStridesRef.current,
          { isBackgroundReconcile: true }
        );
        checkpointRef.current = updated.checkpoint;
        sensorReceivedEventRef.current = true;
        setStepTrackingMode('sensor');
        applyCheckpointToUi(updated.checkpoint, now);
      }
    } catch {
      // Abaikan jika getStepCountAsync tidak tersedia atau izin pedometer ditolak
    }
  }, [applyCheckpointToUi]);

  // Pantau status foreground/background untuk sinkronisasi timer, pedometer & recovery DB
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState !== 'active' && prevState === 'active') {
        lastBgEnteredAtRef.current = Date.now();
        if (checkpointRef.current && (statusRef.current === 'recording' || statusRef.current === 'paused')) {
          void persistCheckpointIfDue(checkpointRef.current, true);
        }
      }

      if (nextState === 'active') {
        void refreshLocationPermission(false);
        void Pedometer.getPermissionsAsync()
          .then((perm) => setHasPedometerPermission(perm.status === 'granted'))
          .catch(() => {});
        syncWallClockMetrics();
        void reconcileIosBackgroundSteps();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [
    persistCheckpointIfDue,
    reconcileIosBackgroundSteps,
    refreshLocationPermission,
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
    async (activityType: WorkoutType) => {
      await stopOutdoorGpsTracking();

      const fgPerm = await Location.getForegroundPermissionsAsync();
      if (fgPerm.status !== 'granted') {
        setHasLocationPermission(false);
        return;
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
        return;
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
    },
    [handleLocationBatch, palette.accent, stopOutdoorGpsTracking, t]
  );

  // Hentikan / mulai pedometer hardware
  const stopPedometerTracking = useCallback(() => {
    if (pedometerSubRef.current) {
      pedometerSubRef.current.remove();
      pedometerSubRef.current = null;
    }
    pedometerActiveRef.current = false;
  }, []);

  const startPedometerTracking = useCallback(async () => {
    stopPedometerTracking();
    lastSensorStepsRef.current = 0;
    sensorReceivedEventRef.current = false;

    try {
      const available = await Pedometer.isAvailableAsync();
      setPedometerAvailable(available);
      if (!available) {
        pedometerActiveRef.current = false;
        setStepTrackingMode('fallback');
        return;
      }

      const perm = await Pedometer.requestPermissionsAsync();
      const granted = perm.status === 'granted';
      setHasPedometerPermission(granted);

      if (!granted) {
        pedometerActiveRef.current = false;
        setStepTrackingMode('fallback');
        return;
      }

      if (statusRef.current !== 'recording' && statusRef.current !== 'paused') {
        return;
      }

      pedometerActiveRef.current = true;
      setStepTrackingMode('sensor');

      pedometerSubRef.current = Pedometer.watchStepCount((result) => {
        const currentRaw = Math.max(0, result.steps ?? 0);

        if (statusRef.current !== 'recording') {
          lastSensorStepsRef.current = currentRaw;
          return;
        }

        const delta = Math.max(0, currentRaw - lastSensorStepsRef.current);
        lastSensorStepsRef.current = currentRaw;

        if (delta > 0 && checkpointRef.current) {
          sensorReceivedEventRef.current = true;
          const now = Date.now();
          const res = applyHardwareStepsToCheckpoint(
            checkpointRef.current,
            delta,
            now,
            calibratedStridesRef.current
          );
          checkpointRef.current = res.checkpoint;
          setStepTrackingMode('sensor');
          applyCheckpointToUi(res.checkpoint, now);
        }
      });
    } catch {
      pedometerActiveRef.current = false;
      setHasPedometerPermission(false);
      setStepTrackingMode('fallback');
    }
  }, [applyCheckpointToUi, stopPedometerTracking]);

  // Bersihkan seluruh listener saat unmount jika tidak sedang background tracking?
  // Catatan: saat sesi aktif dibiarkan hidup di Root Tab, stopForeground listeners tapi
  // background task headless di TaskManager tetap hidup jika foreground service masih aktif!
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
      const updatedStrides = await saveCalibratedStride(cp.type, measuredStride);
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
      lastBgEnteredAtRef.current = null;

      setPendingRecovery(null);
      setStatus('recording');
      setStepTrackingMode(activeMode === 'indoor' ? 'sensor' : 'fallback');
      applyCheckpointToUi(initialCheckpoint, now);

      void persistCheckpointIfDue(initialCheckpoint, true);

      const tasks: Promise<unknown>[] = [startPedometerTracking()];
      if (activeMode === 'outdoor') {
        tasks.push(startOutdoorGpsTracking(type));
      }
      await Promise.all(tasks);
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

    await Promise.all([
      stopOutdoorGpsTracking(),
      Promise.resolve(stopPedometerTracking()),
      persistCheckpointIfDue(pausedCp, true),
    ]);
  }, [
    applyCheckpointToUi,
    persistCheckpointIfDue,
    stopOutdoorGpsTracking,
    stopPedometerTracking,
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

    const tasks: Promise<unknown>[] = [startPedometerTracking()];
    if (resumedCp.trackingMode === 'outdoor') {
      tasks.push(startOutdoorGpsTracking(resumedCp.type));
    }
    await Promise.all(tasks);
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
    if (cp) {
      const frozenCp = applyManualPause(cp, now);
      checkpointRef.current = frozenCp;
      applyCheckpointToUi(frozenCp, now);
      void persistCalibratedStrideIfReady(frozenCp);
    }

    statusRef.current = 'completed';
    setStatus('completed');
    setIsAutoPaused(false);

    await Promise.all([
      stopOutdoorGpsTracking(),
      Promise.resolve(stopPedometerTracking()),
      clearActiveCheckpoint().catch(() => {}),
    ]);
  }, [
    applyCheckpointToUi,
    persistCalibratedStrideIfReady,
    stopOutdoorGpsTracking,
    stopPedometerTracking,
  ]);

  // RESET WORKOUT
  const resetWorkout = useCallback(async () => {
    statusRef.current = 'idle';
    checkpointRef.current = null;
    lastSensorStepsRef.current = 0;
    sensorReceivedEventRef.current = false;
    lastBgEnteredAtRef.current = null;

    await Promise.all([
      stopOutdoorGpsTracking(),
      Promise.resolve(stopPedometerTracking()),
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
  }, [stopOutdoorGpsTracking, stopPedometerTracking]);

  // RESTORE CRASH RECOVERY CHECKPOINT
  const restorePendingWorkout = useCallback(async () => {
    const saved = pendingRecovery;
    if (!saved) return;

    const now = Date.now();
    // Jika sebelumnya status recording saat crash, potong ke lastSavedAt atau resume bersih sebagai paused
    // agar durasi offline selama app mati tidak membengkak palsu!
    const recoveredPaused: ActiveWorkoutCheckpoint = {
      ...saved,
      status: 'paused',
      isAutoPaused: false,
      accumulatedActiveMs: getElapsedActiveSeconds(saved, saved.lastSavedAt || now) * 1000,
      activeSegmentStartMs: null,
      smoothedCurrentPaceSeconds: 0,
      lastAnchoredPoint: null,
      recentPoints: [],
      currentSegmentIndex: saved.currentSegmentIndex + 1,
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
    await clearActiveCheckpoint().catch(() => {});
  }, []);

  // SAVE TO DATABASE
  const saveCurrentWorkout = useCallback(
    async (
      title: string,
      soundtrack?: { trackName: string; artist: string }
    ): Promise<WorkoutRecord> => {
      const cp = checkpointRef.current;
      const now = Date.now();
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
        soundtrackTrackName: soundtrack?.trackName,
        soundtrackArtist: soundtrack?.artist,
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
