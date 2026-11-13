import * as Location from 'expo-location';
import {
  ActiveWorkoutCheckpoint,
  CalibratedStrideProfile,
  GPSCoordinate,
  MotionActivityType,
  StrideCadenceBand,
  WorkoutSplit,
  WorkoutType,
} from '@/types/workout';
import { WORKOUT_CONFIG } from '@/constants/Config';
import { calculateHaversineDistance } from '@/services/location/metrics';

export interface CreateCheckpointOptions {
  type: WorkoutType;
  trackingMode: 'outdoor' | 'indoor';
  autoPauseEnabled: boolean;
  weightKg: number;
  now?: number;
}

export interface ProcessGpsSampleOptions {
  allowFallbackSteps: boolean;
  pedometerActive?: boolean;
  calibratedStrides?: CalibratedStrideProfile;
}

export interface ProcessGpsResult {
  checkpoint: ActiveWorkoutCheckpoint;
  acceptedPoint: boolean;
  didAutoPause: boolean;
  didAutoResume: boolean;
  latestCoords: Location.LocationObjectCoords;
}

const MIN_PLAUSIBLE_PACE_SEC_PER_KM = 90; // 1:30 / km
const MAX_PLAUSIBLE_PACE_SEC_PER_KM = 1800; // 30:00 / km

function isValidStride(val: unknown): val is number {
  return (
    typeof val === 'number' &&
    Number.isFinite(val) &&
    val >= WORKOUT_CONFIG.minCalibratedStrideMeters &&
    val <= WORKOUT_CONFIG.maxCalibratedStrideMeters
  );
}

export function classifyCadenceBand(cadenceSpm: number): StrideCadenceBand {
  if (cadenceSpm < 125) return 'walk';
  if (cadenceSpm < 155) return 'jog';
  if (cadenceSpm < 175) return 'runModerate';
  return 'runFast';
}

export function resolveStrideMeters(
  type: WorkoutType,
  calibratedStrides?: CalibratedStrideProfile,
  currentCadenceSpm?: number
): number {
  if (
    typeof currentCadenceSpm === 'number' &&
    Number.isFinite(currentCadenceSpm) &&
    currentCadenceSpm > 0
  ) {
    const band = classifyCadenceBand(currentCadenceSpm);
    const bandStride = calibratedStrides?.bands?.[band];
    if (isValidStride(bandStride)) {
      return bandStride;
    }
  }

  const calibrated = calibratedStrides?.[type];
  if (isValidStride(calibrated)) {
    return calibrated;
  }
  return WORKOUT_CONFIG.strideMetersByType[type] || WORKOUT_CONFIG.strideMetersByType.walk;
}

export interface MotionClassificationResult {
  activity: MotionActivityType;
  isVehicle: boolean;
}

/**
 * Mengklasifikasikan aktivitas gerak pengguna dan mendeteksi laju kendaraan bermotor
 * berbasis fusi kecepatan GPS, frekuensi langkah (cadence), dan perpindahan segmen.
 */
export function classifyMotionActivity(params: {
  speedMps: number | null | undefined;
  stepRateSpm: number;
  pedometerActive?: boolean;
  msSinceStep: number | null;
  dtSec: number;
  displacementMeters: number;
}): MotionClassificationResult {
  const { speedMps, stepRateSpm, pedometerActive, msSinceStep, dtSec, displacementMeters } =
    params;
  const impliedSpeedMps = dtSec > 0 ? displacementMeters / dtSec : 0;
  const resolvedSpeedMps =
    typeof speedMps === 'number' && Number.isFinite(speedMps) && speedMps >= 0
      ? speedMps
      : impliedSpeedMps;

  // 1. Deteksi kendaraan mutlak: Kecepatan melampaui batas wajar pelari manusia (> 10.5 m/s ~ 37.8 km/jam)
  if (resolvedSpeedMps > 10.5 || impliedSpeedMps > 10.5) {
    return { activity: 'in_vehicle', isVehicle: true };
  }

  // 2. Deteksi kendaraan berbasis sensor pedometer aktif:
  // Sensor langkah aktif dan diam tanpa langkah (>= 4 detik), namun GPS melaju pada kecepatan kendaraan (>= 6.5 m/s ~ 23.4 km/jam)
  const isVehicleBySilentPedometer =
    Boolean(pedometerActive) &&
    msSinceStep !== null &&
    msSinceStep >= 4000 &&
    resolvedSpeedMps >= 6.5;

  if (isVehicleBySilentPedometer) {
    return { activity: 'in_vehicle', isVehicle: true };
  }

  // 3. Lari (Running): Cadence tinggi atau perpaduan kecepatan lari + cadence
  if (
    stepRateSpm >= 155 ||
    (resolvedSpeedMps >= 2.6 && (stepRateSpm >= 125 || !pedometerActive))
  ) {
    return { activity: 'running', isVehicle: false };
  }

  // 4. Jalan (Walking): Ada langkah kaki atau kecepatan berjalan normal
  if (stepRateSpm > 0 || (resolvedSpeedMps >= 0.5 && resolvedSpeedMps < 2.6)) {
    return { activity: 'walking', isVehicle: false };
  }

  // 5. Diam (Still)
  if (resolvedSpeedMps < 0.4 && stepRateSpm === 0) {
    return { activity: 'still', isVehicle: false };
  }

  return { activity: 'unknown', isVehicle: false };
}

/**
 * Menerapkan data elevasi presisi tinggi dan hitungan lantai dari sensor Barometer ke checkpoint
 */
export function applyBarometricMeasurementToCheckpoint(
  checkpoint: ActiveWorkoutCheckpoint,
  addedGainMeters: number,
  floorsClimbed: number
): ActiveWorkoutCheckpoint {
  if (checkpoint.status !== 'recording' || checkpoint.isAutoPaused) {
    return checkpoint;
  }

  const safeGain = Math.max(0, addedGainMeters);
  const nextBaroGain = (checkpoint.barometricGainMeters ?? 0) + safeGain;
  const nextFloors = Math.max(checkpoint.floorsClimbed ?? 0, floorsClimbed);

  const nextElevGain =
    safeGain > 0
      ? checkpoint.elevationGainMeters + safeGain
      : checkpoint.elevationGainMeters;

  return {
    ...checkpoint,
    elevationGainMeters: nextElevGain,
    barometricGainMeters: nextBaroGain,
    floorsClimbed: nextFloors,
  };
}

export function createInitialCheckpoint({
  type,
  trackingMode,
  autoPauseEnabled,
  weightKg,
  now = Date.now(),
}: CreateCheckpointOptions): ActiveWorkoutCheckpoint {
  return {
    version: 1,
    type,
    trackingMode,
    autoPauseEnabled,
    status: 'recording',
    isAutoPaused: false,
    isVehicleDetected: false,
    motionActivity: 'still',
    floorsClimbed: 0,
    barometricGainMeters: 0,
    startTime: now,
    accumulatedActiveMs: 0,
    activeSegmentStartMs: now,
    distanceMeters: 0,
    steps: 0,
    elevationGainMeters: 0,
    smoothedAltitudeMeters: null,
    elevationAnchorMeters: null,
    smoothedCurrentPaceSeconds: 0,
    currentSegmentIndex: 0,
    routePoints: [],
    splits: [],
    splitProgressMeters: 0,
    splitProgressSeconds: 0,
    splitElevationGainMeters: 0,
    lastAnchoredPoint: null,
    recentPoints: [],
    lastMovementOrStepAt: now,
    lastStepSyncTimestamp: now,
    distanceAtLastStepEvent: 0,
    fallbackBgStepsAdded: 0,
    lastSyncedNativeSteps: 0,
    calibGpsMeters: 0,
    calibHwSteps: 0,
    weightKg,
    soundtracks: [],
    lastSavedAt: now,
  };
}

export function getElapsedActiveMs(
  checkpoint: ActiveWorkoutCheckpoint,
  now: number = Date.now()
): number {
  const activeDelta =
    checkpoint.status === 'recording' &&
    !checkpoint.isAutoPaused &&
    checkpoint.activeSegmentStartMs !== null
      ? Math.max(0, now - checkpoint.activeSegmentStartMs)
      : 0;
  return checkpoint.accumulatedActiveMs + activeDelta;
}

export function getElapsedActiveSeconds(
  checkpoint: ActiveWorkoutCheckpoint,
  now: number = Date.now()
): number {
  return Math.floor(getElapsedActiveMs(checkpoint, now) / 1000);
}

export function applyManualPause(
  checkpoint: ActiveWorkoutCheckpoint,
  now: number = Date.now()
): ActiveWorkoutCheckpoint {
  const totalMs = getElapsedActiveMs(checkpoint, now);
  return {
    ...checkpoint,
    status: 'paused',
    isAutoPaused: false,
    isVehicleDetected: false,
    accumulatedActiveMs: totalMs,
    activeSegmentStartMs: null,
    smoothedCurrentPaceSeconds: 0,
    lastAnchoredPoint: null,
    recentPoints: [],
    lastAcceptedGpsAt: undefined,
    stepsAtLastAcceptedGps: checkpoint.steps,
    bridgedMetersSinceLastGps: 0,
    bridgedSplitSecondsSinceLastGps: 0,
    recentStepEvents: [],
    currentSegmentIndex: checkpoint.currentSegmentIndex + 1,
  };
}

export function applyManualResume(
  checkpoint: ActiveWorkoutCheckpoint,
  now: number = Date.now()
): ActiveWorkoutCheckpoint {
  return {
    ...checkpoint,
    status: 'recording',
    isAutoPaused: false,
    isVehicleDetected: false,
    motionActivity: checkpoint.steps > 0 ? 'walking' : 'still',
    activeSegmentStartMs: now,
    lastMovementOrStepAt: now,
    lastStepSyncTimestamp: now,
    distanceAtLastStepEvent: checkpoint.distanceMeters,
    lastAcceptedGpsAt: undefined,
    stepsAtLastAcceptedGps: checkpoint.steps,
    bridgedMetersSinceLastGps: 0,
    bridgedSplitSecondsSinceLastGps: 0,
    recentStepEvents: [],
  };
}

export function applyAutoPauseState(
  checkpoint: ActiveWorkoutCheckpoint,
  pauseAtMs: number
): ActiveWorkoutCheckpoint {
  if (checkpoint.status !== 'recording' || checkpoint.isAutoPaused) {
    return checkpoint;
  }
  const totalMs = getElapsedActiveMs(checkpoint, pauseAtMs);
  return {
    ...checkpoint,
    isAutoPaused: true,
    accumulatedActiveMs: totalMs,
    activeSegmentStartMs: null,
    smoothedCurrentPaceSeconds: 0,
    lastAnchoredPoint: null,
    recentPoints: [],
    lastAcceptedGpsAt: undefined,
    stepsAtLastAcceptedGps: checkpoint.steps,
    bridgedMetersSinceLastGps: 0,
    bridgedSplitSecondsSinceLastGps: 0,
    recentStepEvents: [],
    currentSegmentIndex: checkpoint.currentSegmentIndex + 1,
  };
}

export function evaluateIdleAutoPause(
  checkpoint: ActiveWorkoutCheckpoint,
  now: number = Date.now()
): ActiveWorkoutCheckpoint | null {
  const hasStartedMoving =
    checkpoint.trackingMode === 'indoor'
      ? checkpoint.steps > 0
      : checkpoint.routePoints.length > 0;

  if (
    !checkpoint.autoPauseEnabled ||
    checkpoint.status !== 'recording' ||
    checkpoint.isAutoPaused ||
    !hasStartedMoving
  ) {
    return null;
  }
  if (now - checkpoint.lastMovementOrStepAt >= WORKOUT_CONFIG.autoPauseIdleMs) {
    return applyAutoPauseState(checkpoint, now);
  }
  return null;
}

function applyAutoResumeState(
  checkpoint: ActiveWorkoutCheckpoint,
  resumeAtMs: number
): ActiveWorkoutCheckpoint {
  if (checkpoint.status !== 'recording' || !checkpoint.isAutoPaused) {
    return checkpoint;
  }
  return {
    ...checkpoint,
    isAutoPaused: false,
    isVehicleDetected: false,
    motionActivity: checkpoint.steps > 0 ? 'walking' : 'still',
    activeSegmentStartMs: resumeAtMs,
    lastMovementOrStepAt: resumeAtMs,
    lastStepSyncTimestamp: resumeAtMs,
    distanceAtLastStepEvent: checkpoint.distanceMeters,
    lastAcceptedGpsAt: undefined,
    stepsAtLastAcceptedGps: checkpoint.steps,
    bridgedMetersSinceLastGps: 0,
    bridgedSplitSecondsSinceLastGps: 0,
    recentStepEvents: [],
  };
}

export function advanceSplitsIncremental(
  currentSplits: WorkoutSplit[],
  prevProgressMeters: number,
  prevProgressSeconds: number,
  prevElevationGain: number,
  addedDistMeters: number,
  activeDtSeconds: number,
  addedElevGainMeters: number
): {
  splits: WorkoutSplit[];
  splitProgressMeters: number;
  splitProgressSeconds: number;
  splitElevationGainMeters: number;
} {
  let progressDist = prevProgressMeters;
  let progressTime = prevProgressSeconds;
  let progressElev = prevElevationGain;
  let remainingDist = Math.max(0, addedDistMeters);
  let remainingTime = Math.max(0, activeDtSeconds);
  let remainingElev = Math.max(0, addedElevGainMeters);

  if (remainingDist <= 0) {
    return {
      splits: currentSplits,
      splitProgressMeters: progressDist,
      splitProgressSeconds: progressTime + remainingTime,
      splitElevationGainMeters: progressElev + remainingElev,
    };
  }

  let nextSplits = currentSplits;

  while (progressDist + remainingDist >= 1000) {
    const neededToReachKm = Math.max(0, 1000 - progressDist);
    const ratio = remainingDist > 0 ? Math.min(1, neededToReachKm / remainingDist) : 1;

    const timeForThisKm = remainingTime * ratio;
    const elevForThisKm = remainingElev * ratio;

    const totalKmSeconds = Math.max(1, Math.round(progressTime + timeForThisKm));
    const totalKmElev = Math.round(progressElev + elevForThisKm);

    if (nextSplits === currentSplits) {
      nextSplits = [...currentSplits];
    }
    nextSplits.push({
      kmNumber: nextSplits.length + 1,
      durationSeconds: totalKmSeconds,
      paceSecondsPerKm: totalKmSeconds,
      elevationGainMeters: totalKmElev,
    });

    remainingDist = Math.max(0, remainingDist - neededToReachKm);
    remainingTime = Math.max(0, remainingTime - timeForThisKm);
    remainingElev = Math.max(0, remainingElev - elevForThisKm);
    progressDist = 0;
    progressTime = 0;
    progressElev = 0;
  }

  return {
    splits: nextSplits,
    splitProgressMeters: progressDist + remainingDist,
    splitProgressSeconds: progressTime + remainingTime,
    splitElevationGainMeters: progressElev + remainingElev,
  };
}

function computeElevationStep(
  prevSmoothedAlt: number | null,
  prevAnchorAlt: number | null,
  rawAltitude: number | null | undefined,
  dtSec: number
): {
  smoothedAltitudeMeters: number | null;
  elevationAnchorMeters: number | null;
  addedGainMeters: number;
} {
  if (rawAltitude == null || !Number.isFinite(rawAltitude)) {
    return {
      smoothedAltitudeMeters: prevSmoothedAlt,
      elevationAnchorMeters: prevAnchorAlt,
      addedGainMeters: 0,
    };
  }

  const smoothed =
    prevSmoothedAlt == null
      ? rawAltitude
      : prevSmoothedAlt * 0.7 + rawAltitude * 0.3;

  if (prevAnchorAlt == null) {
    return {
      smoothedAltitudeMeters: smoothed,
      elevationAnchorMeters: smoothed,
      addedGainMeters: 0,
    };
  }

  const verticalDelta = smoothed - prevAnchorAlt;
  const maxStepAllowance =
    WORKOUT_CONFIG.maxSingleElevationStepMeters * Math.max(1, dtSec / 3);

  // Filter lonjakan ketinggian GPS yang tidak realistis
  if (Math.abs(verticalDelta) > maxStepAllowance) {
    return {
      smoothedAltitudeMeters: smoothed,
      elevationAnchorMeters: smoothed,
      addedGainMeters: 0,
    };
  }

  if (verticalDelta >= WORKOUT_CONFIG.elevationNoiseThresholdMeters) {
    return {
      smoothedAltitudeMeters: smoothed,
      elevationAnchorMeters: smoothed,
      addedGainMeters: verticalDelta,
    };
  }

  if (verticalDelta <= -WORKOUT_CONFIG.elevationNoiseThresholdMeters) {
    return {
      smoothedAltitudeMeters: smoothed,
      elevationAnchorMeters: smoothed,
      addedGainMeters: 0,
    };
  }

  return {
    smoothedAltitudeMeters: smoothed,
    elevationAnchorMeters: prevAnchorAlt,
    addedGainMeters: 0,
  };
}

interface StepEventSample {
  timestamp: number;
  deltaSteps: number;
}

function pruneStepEvents(events: StepEventSample[] | undefined, now: number): StepEventSample[] {
  if (!events || events.length === 0) return [];
  const minTs = now - WORKOUT_CONFIG.stepRateWindowMs;
  return events.filter((e) => e.timestamp >= minTs && e.timestamp <= now + 2000 && e.deltaSteps > 0);
}

function appendStepEvent(
  events: StepEventSample[] | undefined,
  now: number,
  deltaSteps: number
): StepEventSample[] {
  const valid = pruneStepEvents(events, now);
  if (deltaSteps <= 0) return valid;
  return [...valid, { timestamp: now, deltaSteps }].slice(-32);
}

export function computeLiveCadenceSpm(
  events: StepEventSample[] | undefined,
  now: number
): number {
  const valid = pruneStepEvents(events, now);
  if (valid.length === 0) return 0;

  const lastEvent = valid[valid.length - 1];
  if (now - lastEvent.timestamp >= 3000) return 0;

  const firstEvent = valid[0];
  const spanMs = lastEvent.timestamp - firstEvent.timestamp;
  if (valid.length < 2 || spanMs < 1200) {
    return 0;
  }

  let stepsInSpan = 0;
  for (let i = 1; i < valid.length; i++) {
    stepsInSpan += valid[i].deltaSteps;
  }
  if (stepsInSpan < 2) return 0;

  return Math.round((stepsInSpan / (spanMs / 1000)) * 60);
}

function computePedometerSpeedMps(
  events: StepEventSample[] | undefined,
  now: number,
  type: WorkoutType,
  calibratedStrides?: CalibratedStrideProfile
): number {
  const cadenceSpm = computeLiveCadenceSpm(events, now);
  if (cadenceSpm <= 0) return 0;
  const stride = resolveStrideMeters(type, calibratedStrides, cadenceSpm);
  return (cadenceSpm / 60) * stride;
}

function resolveGpsSpeedMps(
  speedMps: number | null | undefined,
  recentPoints: GPSCoordinate[]
): number | null {
  if (typeof speedMps === 'number' && Number.isFinite(speedMps) && speedMps >= 0) {
    return speedMps;
  }
  if (recentPoints.length >= 2) {
    const first = recentPoints[0];
    const last = recentPoints[recentPoints.length - 1];
    const segDist = calculateHaversineDistance(first, last);
    const segTimeSec = Math.max(1, (last.timestamp - first.timestamp) / 1000);
    if (segDist >= 5) {
      return segDist / segTimeSec;
    }
  }
  return null;
}

export function computeFusedPaceSeconds(params: {
  prevSmoothedPace: number;
  gpsSpeedMps: number | null | undefined;
  gpsAccuracyMeters: number | null | undefined;
  gpsAgeMs: number;
  recentPoints: GPSCoordinate[];
  pedometerActive: boolean;
  lastHardwareStepAt: number | undefined;
  pedometerSpeedMps: number;
  now: number;
}): number {
  const {
    prevSmoothedPace,
    gpsSpeedMps,
    gpsAccuracyMeters,
    gpsAgeMs,
    recentPoints,
    pedometerActive,
    lastHardwareStepAt,
    pedometerSpeedMps,
    now,
  } = params;

  if (pedometerActive && lastHardwareStepAt != null && now - lastHardwareStepAt >= 3000) {
    return 0;
  }

  const resolvedGpsSpeed = resolveGpsSpeedMps(gpsSpeedMps, recentPoints);
  let blendedSpeedMps: number | null = null;

  if (pedometerActive && pedometerSpeedMps >= WORKOUT_CONFIG.autoPauseSpeedMps) {
    if (resolvedGpsSpeed != null && resolvedGpsSpeed >= WORKOUT_CONFIG.autoPauseSpeedMps) {
      const strongFreshGps =
        gpsAccuracyMeters != null && gpsAccuracyMeters <= 10 && gpsAgeMs <= 4000;
      const gpsWeight = strongFreshGps ? 0.7 : 0.35;
      blendedSpeedMps =
        gpsWeight * resolvedGpsSpeed + (1 - gpsWeight) * pedometerSpeedMps;
    } else {
      blendedSpeedMps = pedometerSpeedMps;
    }
  } else if (resolvedGpsSpeed != null) {
    if (resolvedGpsSpeed < WORKOUT_CONFIG.autoPauseSpeedMps) {
      return 0;
    }
    blendedSpeedMps = resolvedGpsSpeed;
  }

  if (blendedSpeedMps == null || !Number.isFinite(blendedSpeedMps) || blendedSpeedMps <= 0) {
    return prevSmoothedPace;
  }

  const rawPace = 1000 / blendedSpeedMps;
  if (
    !Number.isFinite(rawPace) ||
    rawPace < MIN_PLAUSIBLE_PACE_SEC_PER_KM ||
    rawPace > MAX_PLAUSIBLE_PACE_SEC_PER_KM
  ) {
    return prevSmoothedPace;
  }

  return prevSmoothedPace > 0
    ? Math.round(prevSmoothedPace * 0.55 + rawPace * 0.45)
    : Math.round(rawPace);
}

export function applyStationaryPaceDecay(
  checkpoint: ActiveWorkoutCheckpoint,
  now: number,
  pedometerActive: boolean
): ActiveWorkoutCheckpoint {
  if (checkpoint.status !== 'recording' || checkpoint.smoothedCurrentPaceSeconds <= 0) {
    return checkpoint;
  }
  const idleBySteps =
    pedometerActive &&
    checkpoint.lastHardwareStepAt != null &&
    now - checkpoint.lastHardwareStepAt >= 3500;
  const idleByMovement =
    !pedometerActive && now - checkpoint.lastMovementOrStepAt >= 5000;
  if (!idleBySteps && !idleByMovement) {
    return checkpoint;
  }
  return {
    ...checkpoint,
    smoothedCurrentPaceSeconds: 0,
  };
}

export function applyFallbackStepsToCheckpoint(
  checkpoint: ActiveWorkoutCheckpoint,
  distanceMeters: number,
  now: number,
  calibratedStrides?: CalibratedStrideProfile,
  forceFallback: boolean = false
): ActiveWorkoutCheckpoint {
  if (checkpoint.trackingMode === 'indoor') return checkpoint;

  const distDelta = distanceMeters - checkpoint.distanceAtLastStepEvent;
  if (distDelta <= 0) return checkpoint;

  const sensorSilentTooLong = distDelta >= WORKOUT_CONFIG.silentSensorFallbackMeters;
  if (!forceFallback && !sensorSilentTooLong) {
    return checkpoint;
  }

  const stride = resolveStrideMeters(checkpoint.type, calibratedStrides);
  const estimatedDelta = Math.floor(distDelta / stride);
  if (estimatedDelta <= 0) return checkpoint;

  return {
    ...checkpoint,
    distanceAtLastStepEvent: checkpoint.distanceAtLastStepEvent + estimatedDelta * stride,
    steps: checkpoint.steps + estimatedDelta,
    fallbackBgStepsAdded: forceFallback
      ? checkpoint.fallbackBgStepsAdded + estimatedDelta
      : checkpoint.fallbackBgStepsAdded,
    lastStepSyncTimestamp: now,
  };
}

function rejectStationaryGpsFix(
  checkpoint: ActiveWorkoutCheckpoint,
  timestamp: number,
  speed: number | null | undefined,
  pedometerActive: boolean,
  coords: Location.LocationObjectCoords,
  didAutoResume: boolean
): ProcessGpsResult {
  const isSpeedStationary =
    typeof speed === 'number' &&
    Number.isFinite(speed) &&
    speed < WORKOUT_CONFIG.autoPauseSpeedMps;
  const msSinceStep =
    checkpoint.lastHardwareStepAt != null
      ? Math.max(0, timestamp - checkpoint.lastHardwareStepAt)
      : null;
  const stepsIdleLong =
    pedometerActive &&
    msSinceStep != null &&
    msSinceStep >= WORKOUT_CONFIG.stationaryStepGraceMs;

  let nextCp = checkpoint;
  let didAutoPause = false;

  if (
    nextCp.autoPauseEnabled &&
    (isSpeedStationary || speed == null || stepsIdleLong) &&
    timestamp - nextCp.lastMovementOrStepAt >= WORKOUT_CONFIG.autoPauseIdleMs
  ) {
    nextCp = applyAutoPauseState(nextCp, timestamp);
    didAutoPause = true;
  } else if (
    pedometerActive &&
    msSinceStep != null &&
    msSinceStep >= 3000 &&
    nextCp.smoothedCurrentPaceSeconds > 0
  ) {
    nextCp = { ...nextCp, smoothedCurrentPaceSeconds: 0 };
  }

  return {
    checkpoint: nextCp,
    acceptedPoint: false,
    didAutoPause,
    didAutoResume,
    latestCoords: coords,
  };
}

export function processGpsLocationSample(
  inputCheckpoint: ActiveWorkoutCheckpoint,
  loc: Location.LocationObject,
  options: ProcessGpsSampleOptions
): ProcessGpsResult {
  const { coords } = loc;
  const { latitude, longitude, altitude, accuracy, speed } = coords;
  const timestamp =
    typeof loc.timestamp === 'number' && Number.isFinite(loc.timestamp) && loc.timestamp > 0
      ? loc.timestamp
      : Date.now();
  const pedometerActive = Boolean(options.pedometerActive);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    (Math.abs(latitude) < 1e-6 && Math.abs(longitude) < 1e-6)
  ) {
    return {
      checkpoint: inputCheckpoint,
      acceptedPoint: false,
      didAutoPause: false,
      didAutoResume: false,
      latestCoords: coords,
    };
  }

  if (inputCheckpoint.status !== 'recording' || inputCheckpoint.trackingMode === 'indoor') {
    return {
      checkpoint: inputCheckpoint,
      acceptedPoint: false,
      didAutoPause: false,
      didAutoResume: false,
      latestCoords: coords,
    };
  }

  // Filter cold start & GPS noise accuracy
  const isColdStart = !inputCheckpoint.lastAnchoredPoint;
  const waitedSec = Math.max(0, (timestamp - inputCheckpoint.startTime) / 1000);
  const maxAllowedAccuracy =
    isColdStart && waitedSec < 10
      ? WORKOUT_CONFIG.gpsColdStartAccuracyMeters
      : WORKOUT_CONFIG.gpsMaxAccuracyMeters;

  if (accuracy != null && accuracy > maxAllowedAccuracy) {
    return {
      checkpoint: inputCheckpoint,
      acceptedPoint: false,
      didAutoPause: false,
      didAutoResume: false,
      latestCoords: coords,
    };
  }

  let checkpoint = inputCheckpoint;
  let didAutoResume = false;

  const newPoint: GPSCoordinate = {
    latitude,
    longitude,
    altitude,
    accuracy,
    speed,
    timestamp,
    segmentIndex: checkpoint.currentSegmentIndex,
  };

  // Saat sesi sedang auto-paused, periksa apakah pengguna sudah mulai bergerak kembali
  if (checkpoint.isAutoPaused) {
    const speedMoving =
      typeof speed === 'number' &&
      Number.isFinite(speed) &&
      speed >= WORKOUT_CONFIG.autoResumeSpeedMps;
    const prevKnown = checkpoint.routePoints[checkpoint.routePoints.length - 1];
    const displacement = prevKnown ? calculateHaversineDistance(prevKnown, newPoint) : 0;
    const movedEnough =
      displacement >= WORKOUT_CONFIG.autoResumeMinMovementMeters &&
      accuracy != null &&
      accuracy <= WORKOUT_CONFIG.gpsMaxAccuracyMeters;

    if (!speedMoving && !movedEnough) {
      return {
        checkpoint,
        acceptedPoint: false,
        didAutoPause: false,
        didAutoResume: false,
        latestCoords: coords,
      };
    }

    checkpoint = applyAutoResumeState(checkpoint, timestamp);
    didAutoResume = true;
    newPoint.segmentIndex = checkpoint.currentSegmentIndex;
  }

  // Titik awal segmen (setelah start atau setelah jeda / auto-pause)
  if (!checkpoint.lastAnchoredPoint) {
    const nextRoute = [...checkpoint.routePoints, newPoint];
    const nextElev = computeElevationStep(
      checkpoint.smoothedAltitudeMeters,
      checkpoint.elevationAnchorMeters,
      altitude,
      0
    );
    checkpoint = {
      ...checkpoint,
      lastAnchoredPoint: newPoint,
      lastAcceptedGpsAt: timestamp,
      stepsAtLastAcceptedGps: checkpoint.steps,
      bridgedMetersSinceLastGps: 0,
      bridgedSplitSecondsSinceLastGps: 0,
      recentPoints: [newPoint],
      routePoints: nextRoute,
      smoothedAltitudeMeters: nextElev.smoothedAltitudeMeters,
      elevationAnchorMeters: nextElev.elevationAnchorMeters,
      lastMovementOrStepAt: Math.max(checkpoint.lastMovementOrStepAt, timestamp),
    };
    return {
      checkpoint,
      acceptedPoint: true,
      didAutoPause: false,
      didAutoResume,
      latestCoords: coords,
    };
  }

  const prev = checkpoint.lastAnchoredPoint;

  // Abaikan timestamp mundur / duplikat
  if (timestamp <= prev.timestamp) {
    return {
      checkpoint,
      acceptedPoint: false,
      didAutoPause: false,
      didAutoResume,
      latestCoords: coords,
    };
  }

  const dtSec = Math.max(0.5, (timestamp - prev.timestamp) / 1000);
  const stepDist = calculateHaversineDistance(prev, newPoint);
  const impliedSpeedMps = stepDist / dtSec;

  const msSinceStep =
    checkpoint.lastHardwareStepAt != null
      ? Math.max(0, timestamp - checkpoint.lastHardwareStepAt)
      : null;
  const liveCadence = computeLiveCadenceSpm(checkpoint.recentStepEvents, timestamp);
  const motion = classifyMotionActivity({
    speedMps: speed,
    stepRateSpm: liveCadence,
    pedometerActive,
    msSinceStep,
    dtSec,
    displacementMeters: stepDist,
  });

  // Anti-spike filter & Deteksi Laju Kendaraan Bermotor (motor/mobil):
  // Menolak lonjakan teleport atau laju kendaraan bermotor dan menjeda sesi otomatis
  if (impliedSpeedMps > WORKOUT_CONFIG.maxPlausibleSpeedMps || motion.isVehicle) {
    const vehicleCp: ActiveWorkoutCheckpoint = {
      ...checkpoint,
      isVehicleDetected: true,
      isAutoPaused: true,
      motionActivity: 'in_vehicle',
      smoothedCurrentPaceSeconds: 0,
    };
    return {
      checkpoint: vehicleCp,
      acceptedPoint: false,
      didAutoPause: true,
      didAutoResume: false,
      latestCoords: coords,
    };
  }

  // Filter perpindahan minimum diskalakan terhadap akurasi GPS untuk meredam zig-zag
  const effectiveAccuracy =
    accuracy != null && Number.isFinite(accuracy)
      ? accuracy
      : WORKOUT_CONFIG.gpsGoodAccuracyMeters;
  const effectiveMinMove = Math.max(
    WORKOUT_CONFIG.minMovementDistanceMeters,
    effectiveAccuracy * WORKOUT_CONFIG.accuracyScaledMinMoveFactor
  );

  if (stepDist < effectiveMinMove) {
    return rejectStationaryGpsFix(
      checkpoint,
      timestamp,
      speed,
      pedometerActive,
      coords,
      didAutoResume
    );
  }

  // Stationary Drift Gate: saat pedometer aktif namun tidak ada langkah dalam >= 5 detik, tolak drift kecil
  const isBypassDisplacement =
    stepDist >= WORKOUT_CONFIG.stationaryBypassDisplacementMeters &&
    accuracy != null &&
    accuracy <= 10;
  const allowNonSteppingBypass =
    msSinceStep != null &&
    msSinceStep >= WORKOUT_CONFIG.stationaryStepGraceMs &&
    isBypassDisplacement;

  if (
    pedometerActive &&
    msSinceStep != null &&
    msSinceStep >= WORKOUT_CONFIG.stationaryStepGraceMs &&
    !allowNonSteppingBypass
  ) {
    return rejectStationaryGpsFix(
      checkpoint,
      timestamp,
      speed,
      pedometerActive,
      coords,
      didAutoResume
    );
  }

  // Step-Bounded Plausibility Guard: deteksi lonjakan teleport GPS dibanding jumlah langkah nyata
  const baseSteps = checkpoint.stepsAtLastAcceptedGps ?? checkpoint.steps;
  const stepsDelta = Math.max(0, checkpoint.steps - baseSteps);
  if (
    !allowNonSteppingBypass &&
    pedometerActive &&
    checkpoint.lastHardwareStepAt != null &&
    stepsDelta >= 2 &&
    stepDist > Math.max(15, stepsDelta * WORKOUT_CONFIG.maxMetersPerHardwareStep)
  ) {
    return {
      checkpoint,
      acceptedPoint: false,
      didAutoPause: false,
      didAutoResume,
      latestCoords: coords,
    };
  }

  // Titik valid dan menunjukkan pergerakan nyata; rekonsiliasi jarak blackout tanpa double-count
  const bridgedMeters = checkpoint.bridgedMetersSinceLastGps ?? 0;
  const bridgedSplitSec = checkpoint.bridgedSplitSecondsSinceLastGps ?? 0;
  const netAddedDist = bridgedMeters > 0 ? Math.max(0, stepDist - bridgedMeters) : stepDist;
  const netSplitDtSec = bridgedSplitSec > 0 ? Math.max(0, dtSec - bridgedSplitSec) : dtSec;

  const elevStep = computeElevationStep(
    checkpoint.smoothedAltitudeMeters,
    checkpoint.elevationAnchorMeters,
    altitude,
    dtSec
  );

  const nextDist = checkpoint.distanceMeters + netAddedDist;
  const nextRecent = [...checkpoint.recentPoints, newPoint].slice(-6);
  const evalNow = Math.max(timestamp, checkpoint.lastHardwareStepAt ?? 0);
  const pedometerSpeedMps = pedometerActive
    ? computePedometerSpeedMps(
        checkpoint.recentStepEvents,
        evalNow,
        checkpoint.type,
        options.calibratedStrides
      )
    : 0;
  const nextPace = computeFusedPaceSeconds({
    prevSmoothedPace: checkpoint.smoothedCurrentPaceSeconds,
    gpsSpeedMps: speed,
    gpsAccuracyMeters: accuracy,
    gpsAgeMs: 0,
    recentPoints: nextRecent,
    pedometerActive,
    lastHardwareStepAt: checkpoint.lastHardwareStepAt,
    pedometerSpeedMps,
    now: evalNow,
  });

  const splitUpdate = advanceSplitsIncremental(
    checkpoint.splits,
    checkpoint.splitProgressMeters,
    checkpoint.splitProgressSeconds,
    checkpoint.splitElevationGainMeters,
    netAddedDist,
    netSplitDtSec,
    elevStep.addedGainMeters
  );

  const highQualityFix =
    (accuracy == null || accuracy <= WORKOUT_CONFIG.gpsGoodAccuracyMeters) &&
    bridgedMeters === 0 &&
    !isBypassDisplacement;

  let updatedCheckpoint: ActiveWorkoutCheckpoint = {
    ...checkpoint,
    isVehicleDetected: false,
    motionActivity: motion.activity,
    distanceMeters: nextDist,
    elevationGainMeters: checkpoint.elevationGainMeters + elevStep.addedGainMeters,
    smoothedAltitudeMeters: elevStep.smoothedAltitudeMeters,
    elevationAnchorMeters: elevStep.elevationAnchorMeters,
    smoothedCurrentPaceSeconds: nextPace,
    lastAnchoredPoint: newPoint,
    lastAcceptedGpsAt: timestamp,
    stepsAtLastAcceptedGps: checkpoint.steps,
    bridgedMetersSinceLastGps: 0,
    bridgedSplitSecondsSinceLastGps: 0,
    recentPoints: nextRecent,
    routePoints: [...checkpoint.routePoints, newPoint],
    splits: splitUpdate.splits,
    splitProgressMeters: splitUpdate.splitProgressMeters,
    splitProgressSeconds: splitUpdate.splitProgressSeconds,
    splitElevationGainMeters: splitUpdate.splitElevationGainMeters,
    lastMovementOrStepAt: timestamp,
    calibGpsMeters: highQualityFix
      ? checkpoint.calibGpsMeters + netAddedDist
      : checkpoint.calibGpsMeters,
  };

  updatedCheckpoint = applyFallbackStepsToCheckpoint(
    updatedCheckpoint,
    nextDist,
    timestamp,
    options.calibratedStrides,
    options.allowFallbackSteps
  );

  return {
    checkpoint: updatedCheckpoint,
    acceptedPoint: true,
    didAutoPause: false,
    didAutoResume,
    latestCoords: coords,
  };
}

export function applyHardwareStepsToCheckpoint(
  inputCheckpoint: ActiveWorkoutCheckpoint,
  rawStepDelta: number,
  now: number,
  calibratedStrides?: CalibratedStrideProfile,
  options?: { isBackgroundReconcile?: boolean }
): {
  checkpoint: ActiveWorkoutCheckpoint;
  didAutoResume: boolean;
} {
  if (inputCheckpoint.status !== 'recording' || rawStepDelta <= 0) {
    return { checkpoint: inputCheckpoint, didAutoResume: false };
  }

  let checkpoint = inputCheckpoint;
  let didAutoResume = false;

  if (checkpoint.isAutoPaused && rawStepDelta >= WORKOUT_CONFIG.autoResumeMinSteps) {
    checkpoint = applyAutoResumeState(checkpoint, now);
    didAutoResume = true;
  }

  if (checkpoint.isAutoPaused) {
    return { checkpoint, didAutoResume: false };
  }

  // Pada rekonsiliasi iOS Pedometer setelah keluar dari background, hindari double-count dengan langkah fallback sementara
  let effectiveAddedSteps = rawStepDelta;
  let nextFallbackBg = checkpoint.fallbackBgStepsAdded;

  if (options?.isBackgroundReconcile && nextFallbackBg > 0) {
    if (rawStepDelta >= nextFallbackBg) {
      effectiveAddedSteps = rawStepDelta - nextFallbackBg;
      nextFallbackBg = 0;
    } else {
      effectiveAddedSteps = 0;
      nextFallbackBg = nextFallbackBg - rawStepDelta;
    }
  }

  const nextRecentEvents = !options?.isBackgroundReconcile
    ? appendStepEvent(checkpoint.recentStepEvents, now, effectiveAddedSteps)
    : checkpoint.recentStepEvents;
  const dtSec = Math.max(0.5, (now - checkpoint.lastStepSyncTimestamp) / 1000);
  const liveCadence = computeLiveCadenceSpm(nextRecentEvents, now);
  const strideCadence =
    liveCadence > 0
      ? liveCadence
      : dtSec >= 1 && dtSec <= 15 && effectiveAddedSteps >= 2
      ? Math.round((effectiveAddedSteps / dtSec) * 60)
      : 0;
  const stride = resolveStrideMeters(checkpoint.type, calibratedStrides, strideCadence);

  if (checkpoint.trackingMode === 'indoor') {
    const addedDist = effectiveAddedSteps * stride;
    const nextDist = checkpoint.distanceMeters + addedDist;
    const pedometerSpeedMps =
      liveCadence > 0 ? (liveCadence / 60) * stride : addedDist / dtSec;
    const nextPace = computeFusedPaceSeconds({
      prevSmoothedPace: checkpoint.smoothedCurrentPaceSeconds,
      gpsSpeedMps: null,
      gpsAccuracyMeters: null,
      gpsAgeMs: Number.POSITIVE_INFINITY,
      recentPoints: [],
      pedometerActive: true,
      lastHardwareStepAt: now,
      pedometerSpeedMps,
      now,
    });

    const splitUpdate = advanceSplitsIncremental(
      checkpoint.splits,
      checkpoint.splitProgressMeters,
      checkpoint.splitProgressSeconds,
      checkpoint.splitElevationGainMeters,
      addedDist,
      dtSec,
      0
    );

    checkpoint = {
      ...checkpoint,
      steps: checkpoint.steps + effectiveAddedSteps,
      distanceMeters: nextDist,
      smoothedCurrentPaceSeconds: nextPace,
      splits: splitUpdate.splits,
      splitProgressMeters: splitUpdate.splitProgressMeters,
      splitProgressSeconds: splitUpdate.splitProgressSeconds,
      splitElevationGainMeters: splitUpdate.splitElevationGainMeters,
      distanceAtLastStepEvent: nextDist,
      fallbackBgStepsAdded: nextFallbackBg,
      lastMovementOrStepAt: now,
      lastStepSyncTimestamp: now,
      lastHardwareStepAt: now,
      recentStepEvents: nextRecentEvents,
    };

    return { checkpoint, didAutoResume };
  }

  // Outdoor mode: bridge blackout terowongan bila GPS terputus >= gpsDropoutBridgeDelayMs
  const lastGpsAge =
    checkpoint.lastAcceptedGpsAt != null
      ? Math.max(0, now - checkpoint.lastAcceptedGpsAt)
      : 0;
  const shouldBridgeBlackout =
    !options?.isBackgroundReconcile &&
    effectiveAddedSteps > 0 &&
    checkpoint.lastAcceptedGpsAt != null &&
    checkpoint.lastAnchoredPoint != null &&
    lastGpsAge >= WORKOUT_CONFIG.gpsDropoutBridgeDelayMs;

  if (shouldBridgeBlackout) {
    const bridgeDist = effectiveAddedSteps * stride;
    const nextDist = checkpoint.distanceMeters + bridgeDist;
    const prevBridged = checkpoint.bridgedMetersSinceLastGps ?? 0;
    const prevBridgedSec = checkpoint.bridgedSplitSecondsSinceLastGps ?? 0;
    const maxBlackoutSec = Math.max(0, lastGpsAge / 1000);
    const safeSplitDtSec = Math.min(dtSec, Math.max(0, maxBlackoutSec - prevBridgedSec));
    const splitUpdate = advanceSplitsIncremental(
      checkpoint.splits,
      checkpoint.splitProgressMeters,
      checkpoint.splitProgressSeconds,
      checkpoint.splitElevationGainMeters,
      bridgeDist,
      safeSplitDtSec,
      0
    );
    const pedometerSpeedMps =
      liveCadence > 0
        ? (liveCadence / 60) * stride
        : bridgeDist / Math.max(1, dtSec);
    const nextPace = computeFusedPaceSeconds({
      prevSmoothedPace: checkpoint.smoothedCurrentPaceSeconds,
      gpsSpeedMps: null,
      gpsAccuracyMeters: null,
      gpsAgeMs: Number.POSITIVE_INFINITY,
      recentPoints: [],
      pedometerActive: true,
      lastHardwareStepAt: now,
      pedometerSpeedMps,
      now,
    });

    checkpoint = {
      ...checkpoint,
      steps: checkpoint.steps + effectiveAddedSteps,
      distanceMeters: nextDist,
      smoothedCurrentPaceSeconds: nextPace,
      splits: splitUpdate.splits,
      splitProgressMeters: splitUpdate.splitProgressMeters,
      splitProgressSeconds: splitUpdate.splitProgressSeconds,
      splitElevationGainMeters: splitUpdate.splitElevationGainMeters,
      bridgedMetersSinceLastGps: prevBridged + bridgeDist,
      bridgedSplitSecondsSinceLastGps: prevBridgedSec + safeSplitDtSec,
      distanceAtLastStepEvent: nextDist,
      fallbackBgStepsAdded: nextFallbackBg,
      lastMovementOrStepAt: now,
      lastStepSyncTimestamp: now,
      lastHardwareStepAt: now,
      recentStepEvents: nextRecentEvents,
    };

    return { checkpoint, didAutoResume };
  }

  // Outdoor normal: kalibrasi panjang langkah nyata & jaga event cadence tetap segar
  checkpoint = {
    ...checkpoint,
    steps: checkpoint.steps + effectiveAddedSteps,
    distanceAtLastStepEvent: checkpoint.distanceMeters,
    fallbackBgStepsAdded: nextFallbackBg,
    lastMovementOrStepAt: now,
    lastStepSyncTimestamp: now,
    lastHardwareStepAt: now,
    recentStepEvents: nextRecentEvents,
    calibHwSteps:
      !options?.isBackgroundReconcile
        ? checkpoint.calibHwSteps + effectiveAddedSteps
        : checkpoint.calibHwSteps,
  };

  return { checkpoint, didAutoResume };
}

export function reconcileTotalHardwareStepsToCheckpoint(
  inputCheckpoint: ActiveWorkoutCheckpoint,
  totalNativeSteps: number,
  now: number,
  calibratedStrides?: CalibratedStrideProfile,
  options?: {
    isBackgroundReconcile?: boolean;
    stepTimestampMs?: number;
  }
): {
  checkpoint: ActiveWorkoutCheckpoint;
  appliedStepDelta: number;
  didAutoResume: boolean;
} {
  if (
    inputCheckpoint.status !== 'recording' ||
    !Number.isFinite(totalNativeSteps)
  ) {
    return {
      checkpoint: inputCheckpoint,
      appliedStepDelta: 0,
      didAutoResume: false,
    };
  }

  const normalizedTotal = Math.max(0, Math.round(totalNativeSteps));
  const prevSynced = Math.max(0, inputCheckpoint.lastSyncedNativeSteps ?? 0);
  const stepDelta = Math.max(0, normalizedTotal - prevSynced);

  if (stepDelta <= 0) {
    return {
      checkpoint: inputCheckpoint,
      appliedStepDelta: 0,
      didAutoResume: false,
    };
  }

  const hasValidNativeTs =
    typeof options?.stepTimestampMs === 'number' &&
    Number.isFinite(options.stepTimestampMs) &&
    options.stepTimestampMs > 0;

  const effectiveTimestamp = hasValidNativeTs
    ? Math.max(
        inputCheckpoint.lastMovementOrStepAt,
        Math.min(now, options!.stepTimestampMs!)
      )
    : now;

  const result = applyHardwareStepsToCheckpoint(
    inputCheckpoint,
    stepDelta,
    effectiveTimestamp,
    calibratedStrides,
    {
      isBackgroundReconcile:
        Boolean(options?.isBackgroundReconcile) ||
        inputCheckpoint.fallbackBgStepsAdded > 0,
    }
  );

  // If auto-paused and stepDelta stayed below autoResumeMinSteps, preserve prevSynced
  // so subsequent steps accumulate until autoResumeMinSteps is reached.
  if (result.checkpoint === inputCheckpoint && !result.didAutoResume) {
    return {
      checkpoint: inputCheckpoint,
      appliedStepDelta: 0,
      didAutoResume: false,
    };
  }

  return {
    checkpoint: {
      ...result.checkpoint,
      lastSyncedNativeSteps: normalizedTotal,
    },
    appliedStepDelta: stepDelta,
    didAutoResume: result.didAutoResume,
  };
}
