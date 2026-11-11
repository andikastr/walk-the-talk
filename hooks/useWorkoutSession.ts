import { useState, useRef, useEffect, useCallback } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import {
  WorkoutType,
  WorkoutStatus,
  GPSCoordinate,
  WorkoutSplit,
  WorkoutRecord,
} from '@/types/workout';
import {
  calculateHaversineDistance,
  calculatePaceSeconds,
  estimateCalories,
  calculateSplits,
  calculateCadenceSpm,
} from '@/services/location/metrics';
import { WORKOUT_CONFIG } from '@/constants/Config';
import { saveWorkout as saveWorkoutToDb } from '@/services/database/workout-repo';

export type StepTrackingMode = 'sensor' | 'fallback';

const SILENT_SENSOR_FALLBACK_METERS = 30;

export function useWorkoutSession() {
  const [status, setStatus] = useState<WorkoutStatus>('idle');
  const [workoutType, setWorkoutType] = useState<WorkoutType>('run');
  const [durationSeconds, setDurationSeconds] = useState<number>(0);
  const [distanceMeters, setDistanceMeters] = useState<number>(0);
  const [currentPaceSeconds, setCurrentPaceSeconds] = useState<number>(0);
  const [avgPaceSeconds, setAvgPaceSeconds] = useState<number>(0);
  const [caloriesKcal, setCaloriesKcal] = useState<number>(0);
  const [steps, setSteps] = useState<number>(0);
  const [avgCadenceSpm, setAvgCadenceSpm] = useState<number>(0);
  const [stepTrackingMode, setStepTrackingMode] = useState<StepTrackingMode>('fallback');
  const [routeCoordinates, setRouteCoordinates] = useState<GPSCoordinate[]>([]);
  const [splits, setSplits] = useState<WorkoutSplit[]>([]);
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);

  // Refs untuk tracking interval, subscription & live state tanpa stale closure
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const pedometerSubRef = useRef<ReturnType<typeof Pedometer.watchStepCount> | null>(null);
  const startTimeRef = useRef<number>(0);
  const lastLocationRef = useRef<GPSCoordinate | null>(null);
  const recentPointsRef = useRef<GPSCoordinate[]>([]);
  const routeCoordinatesRef = useRef<GPSCoordinate[]>([]);

  const statusRef = useRef<WorkoutStatus>('idle');
  const workoutTypeRef = useRef<WorkoutType>('run');
  const durationSecondsRef = useRef<number>(0);
  const distanceMetersRef = useRef<number>(0);
  const stepsRef = useRef<number>(0);
  const appStateRef = useRef<string>(AppState.currentState ?? 'active');

  const pedometerActiveRef = useRef<boolean>(false);
  const lastSensorStepsRef = useRef<number>(0);
  const distanceAtLastStepEventRef = useRef<number>(0);
  const sensorReceivedEventRef = useRef<boolean>(false);

  // Pantau status foreground/background untuk mode hybrid pedometer
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
    });
    return () => {
      subscription.remove();
    };
  }, []);

  // Pastikan listener dibersihkan jika hook unmount
  useEffect(() => {
    return () => {
      locationSubRef.current?.remove();
      pedometerSubRef.current?.remove();
    };
  }, []);

  // Minta izin lokasi saat mount
  useEffect(() => {
    (async () => {
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      setHasLocationPermission(fgStatus === 'granted');

      if (fgStatus === 'granted') {
        const initialLoc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setCurrentLocation(initialLoc.coords);
      }
    })();
  }, []);

  // Timer interval saat recording
  useEffect(() => {
    if (status === 'recording') {
      timerRef.current = setInterval(() => {
        setDurationSeconds((prev) => {
          const next = prev + 1;
          durationSecondsRef.current = next;
          setCaloriesKcal(
            estimateCalories(workoutTypeRef.current, next, distanceMetersRef.current)
          );
          setAvgCadenceSpm(calculateCadenceSpm(stepsRef.current, next));
          return next;
        });
      }, 1000);
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
  }, [status]);

  // Fallback estimasi langkah dari jarak GPS saat sensor nonaktif atau app di background
  const applyFallbackStepsIfNeeded = useCallback((updatedDistanceMeters: number) => {
    const distDelta = updatedDistanceMeters - distanceAtLastStepEventRef.current;
    if (distDelta <= 0) return;

    const stride =
      WORKOUT_CONFIG.strideMetersByType[workoutTypeRef.current] ||
      WORKOUT_CONFIG.strideMetersByType.walk;

    const sensorUnavailable =
      !pedometerActiveRef.current || appStateRef.current !== 'active';
    const sensorSilentTooLong = distDelta >= SILENT_SENSOR_FALLBACK_METERS;

    if (!sensorUnavailable && !sensorSilentTooLong) return;

    const estimatedDelta = Math.floor(distDelta / stride);
    if (estimatedDelta <= 0) return;

    distanceAtLastStepEventRef.current += estimatedDelta * stride;
    stepsRef.current += estimatedDelta;
    setSteps(stepsRef.current);
    setAvgCadenceSpm(calculateCadenceSpm(stepsRef.current, durationSecondsRef.current));
    if (sensorUnavailable || !sensorReceivedEventRef.current) {
      setStepTrackingMode('fallback');
    }
  }, []);

  // Handler update lokasi GPS
  const handleLocationUpdate = useCallback(
    (loc: Location.LocationObject) => {
      const { latitude, longitude, altitude, accuracy, speed } = loc.coords;
      const timestamp = loc.timestamp;

      setCurrentLocation(loc.coords);

      // Hanya proses pergerakan jika sesi sedang berjalan (recording)
      if (statusRef.current !== 'recording') return;

      // Filter noise GPS: Abaikan titik yang akurasinya buruk (> 25 meter)
      if (accuracy && accuracy > WORKOUT_CONFIG.gpsMaxAccuracyMeters) {
        return;
      }

      const newPoint: GPSCoordinate = {
        latitude,
        longitude,
        altitude,
        accuracy,
        speed,
        timestamp,
      };

      if (!lastLocationRef.current) {
        lastLocationRef.current = newPoint;
        routeCoordinatesRef.current = [newPoint];
        setRouteCoordinates([newPoint]);
        return;
      }

      const stepDist = calculateHaversineDistance(lastLocationRef.current, newPoint);

      // Abaikan jika pergerakan terlalu kecil (mencegah drift GPS saat berhenti)
      if (stepDist < WORKOUT_CONFIG.minMovementDistanceMeters) {
        return;
      }

      lastLocationRef.current = newPoint;

      // Update akumulasi jarak & fallback langkah
      const updatedDist = distanceMetersRef.current + stepDist;
      distanceMetersRef.current = updatedDist;
      setDistanceMeters(updatedDist);
      setAvgPaceSeconds(calculatePaceSeconds(updatedDist, durationSecondsRef.current));
      applyFallbackStepsIfNeeded(updatedDist);

      // Hitung pace terkini (berdasarkan pergerakan ~15 detik terakhir)
      recentPointsRef.current = [...recentPointsRef.current, newPoint].slice(-6);
      if (recentPointsRef.current.length >= 2) {
        const first = recentPointsRef.current[0];
        const last = recentPointsRef.current[recentPointsRef.current.length - 1];
        const segDist = calculateHaversineDistance(first, last);
        const segTimeSec = Math.max(1, (last.timestamp - first.timestamp) / 1000);
        setCurrentPaceSeconds(calculatePaceSeconds(segDist, segTimeSec));
      }

      const nextRoute = [...routeCoordinatesRef.current, newPoint];
      routeCoordinatesRef.current = nextRoute;
      setRouteCoordinates(nextRoute);
      setSplits(calculateSplits(nextRoute));
    },
    [applyFallbackStepsIfNeeded]
  );

  // Mulai pelacakan GPS
  const startLocationWatching = useCallback(async () => {
    if (locationSubRef.current) {
      locationSubRef.current.remove();
    }

    locationSubRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: WORKOUT_CONFIG.locationTimeIntervalMs,
        distanceInterval: WORKOUT_CONFIG.locationDistanceIntervalMeters,
      },
      handleLocationUpdate
    );
  }, [handleLocationUpdate]);

  // Hentikan pelacakan GPS
  const stopLocationWatching = useCallback(() => {
    if (locationSubRef.current) {
      locationSubRef.current.remove();
      locationSubRef.current = null;
    }
  }, []);

  // Hentikan pedometer
  const stopPedometerWatching = useCallback(() => {
    if (pedometerSubRef.current) {
      pedometerSubRef.current.remove();
      pedometerSubRef.current = null;
    }
    pedometerActiveRef.current = false;
  }, []);

  // Mulai pedometer hardware (dengan fallback otomatis ke GPS jika tidak didukung/izin ditolak)
  const startPedometerWatching = useCallback(async () => {
    stopPedometerWatching();
    lastSensorStepsRef.current = 0;
    sensorReceivedEventRef.current = false;

    try {
      const available = await Pedometer.isAvailableAsync();
      if (!available) {
        pedometerActiveRef.current = false;
        setStepTrackingMode('fallback');
        return;
      }

      const perm = await Pedometer.requestPermissionsAsync();
      if (perm.status !== 'granted') {
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

        // Saat jeda/selesai, perbarui baseline sensor tanpa menambahkan langkah
        if (statusRef.current !== 'recording') {
          lastSensorStepsRef.current = currentRaw;
          distanceAtLastStepEventRef.current = distanceMetersRef.current;
          return;
        }

        const delta = Math.max(0, currentRaw - lastSensorStepsRef.current);
        lastSensorStepsRef.current = currentRaw;

        if (delta > 0) {
          sensorReceivedEventRef.current = true;
          distanceAtLastStepEventRef.current = distanceMetersRef.current;
          stepsRef.current += delta;
          setSteps(stepsRef.current);
          setAvgCadenceSpm(calculateCadenceSpm(stepsRef.current, durationSecondsRef.current));
          setStepTrackingMode('sensor');
        }
      });
    } catch {
      pedometerActiveRef.current = false;
      setStepTrackingMode('fallback');
    }
  }, [stopPedometerWatching]);

  // START WORKOUT
  const startWorkout = async (type: WorkoutType = 'run') => {
    statusRef.current = 'recording';
    workoutTypeRef.current = type;
    durationSecondsRef.current = 0;
    distanceMetersRef.current = 0;
    stepsRef.current = 0;
    lastSensorStepsRef.current = 0;
    distanceAtLastStepEventRef.current = 0;
    sensorReceivedEventRef.current = false;
    routeCoordinatesRef.current = [];

    setWorkoutType(type);
    setStatus('recording');
    setDurationSeconds(0);
    setDistanceMeters(0);
    setCurrentPaceSeconds(0);
    setAvgPaceSeconds(0);
    setCaloriesKcal(0);
    setSteps(0);
    setAvgCadenceSpm(0);
    setStepTrackingMode('fallback');
    setRouteCoordinates([]);
    setSplits([]);
    startTimeRef.current = Date.now();
    lastLocationRef.current = null;
    recentPointsRef.current = [];

    await Promise.all([startLocationWatching(), startPedometerWatching()]);
  };

  // PAUSE WORKOUT
  const pauseWorkout = () => {
    statusRef.current = 'paused';
    setStatus('paused');
  };

  // RESUME WORKOUT
  const resumeWorkout = () => {
    statusRef.current = 'recording';
    distanceAtLastStepEventRef.current = distanceMetersRef.current;
    setStatus('recording');
  };

  // STOP WORKOUT (Selesai dan siapkan summary)
  const stopWorkout = () => {
    statusRef.current = 'completed';
    setStatus('completed');
    stopLocationWatching();
    stopPedometerWatching();
  };

  // RESET (Batal atau mulai baru)
  const resetWorkout = () => {
    statusRef.current = 'idle';
    stopLocationWatching();
    stopPedometerWatching();
    durationSecondsRef.current = 0;
    distanceMetersRef.current = 0;
    stepsRef.current = 0;
    lastSensorStepsRef.current = 0;
    distanceAtLastStepEventRef.current = 0;
    sensorReceivedEventRef.current = false;
    routeCoordinatesRef.current = [];

    setStatus('idle');
    setDurationSeconds(0);
    setDistanceMeters(0);
    setCurrentPaceSeconds(0);
    setAvgPaceSeconds(0);
    setCaloriesKcal(0);
    setSteps(0);
    setAvgCadenceSpm(0);
    setStepTrackingMode('fallback');
    setRouteCoordinates([]);
    setSplits([]);
    lastLocationRef.current = null;
    recentPointsRef.current = [];
  };

  // SAVE TO DATABASE
  const saveCurrentWorkout = async (
    title: string,
    soundtrack?: { trackName: string; artist: string }
  ): Promise<WorkoutRecord> => {
    const finalDuration = durationSecondsRef.current;
    const finalSteps = stepsRef.current;
    const record: WorkoutRecord = {
      id: `workout_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: workoutTypeRef.current,
      title: title || `${workoutTypeRef.current.toUpperCase()} Activity`,
      startTime: startTimeRef.current || Date.now() - finalDuration * 1000,
      endTime: Date.now(),
      durationSeconds: finalDuration,
      distanceMeters: distanceMetersRef.current,
      avgPaceSecondsPerKm: avgPaceSeconds,
      caloriesKcal,
      routePoints: routeCoordinatesRef.current,
      splits,
      soundtrackTrackName: soundtrack?.trackName,
      soundtrackArtist: soundtrack?.artist,
      steps: finalSteps,
      avgCadenceSpm: calculateCadenceSpm(finalSteps, finalDuration),
    };

    await saveWorkoutToDb(record);
    resetWorkout();
    return record;
  };

  return {
    status,
    workoutType,
    durationSeconds,
    distanceMeters,
    currentPaceSeconds,
    avgPaceSeconds,
    caloriesKcal,
    steps,
    avgCadenceSpm,
    stepTrackingMode,
    routeCoordinates,
    splits,
    currentLocation,
    hasLocationPermission,
    startWorkout,
    pauseWorkout,
    resumeWorkout,
    stopWorkout,
    resetWorkout,
    saveCurrentWorkout,
  };
}

