import * as Location from 'expo-location';
import {
  ActiveWorkoutCheckpoint,
  GPSCoordinate,
  WorkoutSplit,
  WorkoutType,
} from '@/types/workout';
import { WORKOUT_CONFIG } from '@/constants/Config';
import { calculateHaversineDistance, calculatePaceSeconds } from '@/services/location/metrics';

export interface CreateCheckpointOptions {
  type: WorkoutType;
  trackingMode: 'outdoor' | 'indoor';
  autoPauseEnabled: boolean;
  weightKg: number;
  now?: number;
}

export interface ProcessGpsSampleOptions {
  allowFallbackSteps: boolean;
  calibratedStrides?: Partial<Record<WorkoutType, number>>;
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

export function resolveStrideMeters(
  type: WorkoutType,
  calibratedStrides?: Partial<Record<WorkoutType, number>>
): number {
  const calibrated = calibratedStrides?.[type];
  if (
    typeof calibrated === 'number' &&
    Number.isFinite(calibrated) &&
    calibrated >= WORKOUT_CONFIG.minCalibratedStrideMeters &&
    calibrated <= WORKOUT_CONFIG.maxCalibratedStrideMeters
  ) {
    return calibrated;
  }
  return WORKOUT_CONFIG.strideMetersByType[type] || WORKOUT_CONFIG.strideMetersByType.walk;
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
    calibGpsMeters: 0,
    calibHwSteps: 0,
    weightKg,
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
    accumulatedActiveMs: totalMs,
    activeSegmentStartMs: null,
    smoothedCurrentPaceSeconds: 0,
    lastAnchoredPoint: null,
    recentPoints: [],
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
    activeSegmentStartMs: now,
    lastMovementOrStepAt: now,
    lastStepSyncTimestamp: now,
    distanceAtLastStepEvent: checkpoint.distanceMeters,
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
    activeSegmentStartMs: resumeAtMs,
    lastMovementOrStepAt: resumeAtMs,
    lastStepSyncTimestamp: resumeAtMs,
    distanceAtLastStepEvent: checkpoint.distanceMeters,
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

function updateSmoothedPace(
  prevSmoothedPace: number,
  speedMps: number | null | undefined,
  recentPoints: GPSCoordinate[]
): number {
  let rawPace = 0;

  if (typeof speedMps === 'number' && Number.isFinite(speedMps)) {
    if (speedMps < WORKOUT_CONFIG.autoPauseSpeedMps) {
      return 0;
    }
    rawPace = 1000 / speedMps;
  } else if (recentPoints.length >= 2) {
    const first = recentPoints[0];
    const last = recentPoints[recentPoints.length - 1];
    const segDist = calculateHaversineDistance(first, last);
    const segTimeSec = Math.max(1, (last.timestamp - first.timestamp) / 1000);
    if (segDist >= 5) {
      rawPace = calculatePaceSeconds(segDist, segTimeSec);
    }
  }

  if (
    !rawPace ||
    !Number.isFinite(rawPace) ||
    rawPace < MIN_PLAUSIBLE_PACE_SEC_PER_KM ||
    rawPace > MAX_PLAUSIBLE_PACE_SEC_PER_KM
  ) {
    return prevSmoothedPace;
  }

  return prevSmoothedPace > 0
    ? Math.round(prevSmoothedPace * 0.65 + rawPace * 0.35)
    : Math.round(rawPace);
}

export function applyFallbackStepsToCheckpoint(
  checkpoint: ActiveWorkoutCheckpoint,
  distanceMeters: number,
  now: number,
  calibratedStrides?: Partial<Record<WorkoutType, number>>,
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
  let didAutoPause = false;
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
      recentPoints: [newPoint],
      routePoints: nextRoute,
      smoothedAltitudeMeters: nextElev.smoothedAltitudeMeters,
      elevationAnchorMeters: nextElev.elevationAnchorMeters,
      lastMovementOrStepAt: Math.max(checkpoint.lastMovementOrStepAt, timestamp),
    };
    return {
      checkpoint,
      acceptedPoint: true,
      didAutoPause,
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
      didAutoPause,
      didAutoResume,
      latestCoords: coords,
    };
  }

  const dtSec = Math.max(0.5, (timestamp - prev.timestamp) / 1000);
  const stepDist = calculateHaversineDistance(prev, newPoint);
  const impliedSpeedMps = stepDist / dtSec;

  // Anti-spike filter: tolak lompatan GPS yang kecepatannya tidak mungkin saat berjalan/berlari
  if (impliedSpeedMps > WORKOUT_CONFIG.maxPlausibleSpeedMps) {
    return {
      checkpoint,
      acceptedPoint: false,
      didAutoPause,
      didAutoResume,
      latestCoords: coords,
    };
  }

  const isSpeedStationary =
    typeof speed === 'number' &&
    Number.isFinite(speed) &&
    speed < WORKOUT_CONFIG.autoPauseSpeedMps;

  // Cek perpindahan minimum untuk mencegah GPS drift saat diam
  if (stepDist < WORKOUT_CONFIG.minMovementDistanceMeters) {
    if (
      checkpoint.autoPauseEnabled &&
      (isSpeedStationary || speed == null) &&
      timestamp - checkpoint.lastMovementOrStepAt >= WORKOUT_CONFIG.autoPauseIdleMs
    ) {
      checkpoint = applyAutoPauseState(checkpoint, timestamp);
      didAutoPause = true;
    }
    return {
      checkpoint,
      acceptedPoint: false,
      didAutoPause,
      didAutoResume,
      latestCoords: coords,
    };
  }

  // Titik valid dan menunjukkan pergerakan nyata
  const elevStep = computeElevationStep(
    checkpoint.smoothedAltitudeMeters,
    checkpoint.elevationAnchorMeters,
    altitude,
    dtSec
  );

  const nextDist = checkpoint.distanceMeters + stepDist;
  const nextRecent = [...checkpoint.recentPoints, newPoint].slice(-6);
  const nextPace = updateSmoothedPace(
    checkpoint.smoothedCurrentPaceSeconds,
    speed,
    nextRecent
  );

  const splitUpdate = advanceSplitsIncremental(
    checkpoint.splits,
    checkpoint.splitProgressMeters,
    checkpoint.splitProgressSeconds,
    checkpoint.splitElevationGainMeters,
    stepDist,
    dtSec,
    elevStep.addedGainMeters
  );

  const highQualityFix =
    accuracy == null || accuracy <= WORKOUT_CONFIG.gpsGoodAccuracyMeters;

  let updatedCheckpoint: ActiveWorkoutCheckpoint = {
    ...checkpoint,
    distanceMeters: nextDist,
    elevationGainMeters: checkpoint.elevationGainMeters + elevStep.addedGainMeters,
    smoothedAltitudeMeters: elevStep.smoothedAltitudeMeters,
    elevationAnchorMeters: elevStep.elevationAnchorMeters,
    smoothedCurrentPaceSeconds: nextPace,
    lastAnchoredPoint: newPoint,
    recentPoints: nextRecent,
    routePoints: [...checkpoint.routePoints, newPoint],
    splits: splitUpdate.splits,
    splitProgressMeters: splitUpdate.splitProgressMeters,
    splitProgressSeconds: splitUpdate.splitProgressSeconds,
    splitElevationGainMeters: splitUpdate.splitElevationGainMeters,
    lastMovementOrStepAt: timestamp,
    calibGpsMeters: highQualityFix
      ? checkpoint.calibGpsMeters + stepDist
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
    didAutoPause,
    didAutoResume,
    latestCoords: coords,
  };
}

export function applyHardwareStepsToCheckpoint(
  inputCheckpoint: ActiveWorkoutCheckpoint,
  rawStepDelta: number,
  now: number,
  calibratedStrides?: Partial<Record<WorkoutType, number>>,
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

  const stride = resolveStrideMeters(checkpoint.type, calibratedStrides);
  const dtSec = Math.max(0.5, (now - checkpoint.lastStepSyncTimestamp) / 1000);

  if (checkpoint.trackingMode === 'indoor') {
    const addedDist = effectiveAddedSteps * stride;
    const nextDist = checkpoint.distanceMeters + addedDist;
    const instantSpeedMps = addedDist / dtSec;
    const rawPace =
      instantSpeedMps >= WORKOUT_CONFIG.autoPauseSpeedMps ? 1000 / instantSpeedMps : 0;
    const nextPace =
      rawPace >= MIN_PLAUSIBLE_PACE_SEC_PER_KM && rawPace <= MAX_PLAUSIBLE_PACE_SEC_PER_KM
        ? checkpoint.smoothedCurrentPaceSeconds > 0
          ? Math.round(checkpoint.smoothedCurrentPaceSeconds * 0.65 + rawPace * 0.35)
          : Math.round(rawPace)
        : checkpoint.smoothedCurrentPaceSeconds;

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
    };

    return { checkpoint, didAutoResume };
  }

  // Outdoor mode: kalibrasi panjang langkah nyata bila akurasi GPS bagus
  checkpoint = {
    ...checkpoint,
    steps: checkpoint.steps + effectiveAddedSteps,
    distanceAtLastStepEvent: checkpoint.distanceMeters,
    fallbackBgStepsAdded: nextFallbackBg,
    lastMovementOrStepAt: now,
    lastStepSyncTimestamp: now,
    calibHwSteps:
      !options?.isBackgroundReconcile
        ? checkpoint.calibHwSteps + effectiveAddedSteps
        : checkpoint.calibHwSteps,
  };

  return { checkpoint, didAutoResume };
}
