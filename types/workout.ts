export type WorkoutType = 'walk' | 'jog' | 'run';

export type MotionActivityType =
  | 'still'
  | 'walking'
  | 'running'
  | 'on_bicycle'
  | 'in_vehicle'
  | 'unknown';

export type StrideCadenceBand = 'walk' | 'jog' | 'runModerate' | 'runFast';

export type CalibratedStrideProfile = Partial<Record<WorkoutType, number>> & {
  bands?: Partial<Record<StrideCadenceBand, number>>;
};

export type WorkoutStatus = 'idle' | 'recording' | 'paused' | 'completed';

export type TrackingMode = 'outdoor' | 'indoor';

export type StepTrackingMode = 'sensor' | 'fallback';

export type GpsSignalQuality = 'acquiring' | 'weak' | 'good';

export interface GPSCoordinate {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  accuracy?: number | null;
  speed?: number | null; // meters per second
  timestamp: number;
  segmentIndex?: number;
}

export interface WorkoutSplit {
  kmNumber: number;
  durationSeconds: number;
  paceSecondsPerKm: number;
  elevationGainMeters?: number;
}

export interface WorkoutSoundtrackItem {
  trackId?: string;
  trackName: string;
  artist: string;
  playedAt?: number;
}

export interface WorkoutRecord {
  id: string;
  type: WorkoutType;
  title: string;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  distanceMeters: number;
  avgPaceSecondsPerKm: number;
  caloriesKcal: number;
  routePoints: GPSCoordinate[];
  splits: WorkoutSplit[];
  soundtrackTrackName?: string;
  soundtrackArtist?: string;
  soundtracks?: WorkoutSoundtrackItem[];
  steps?: number;
  avgCadenceSpm?: number;
  elevationGainMeters?: number;
  floorsClimbed?: number;
  motionActivity?: MotionActivityType;
  isIndoor?: boolean;
}

export interface WorkoutStats {
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  totalWorkouts: number;
  totalCaloriesKcal: number;
  totalSteps: number;
  totalFloorsClimbed?: number;
}

export interface ActiveWorkoutCheckpoint {
  version: number;
  type: WorkoutType;
  trackingMode: TrackingMode;
  autoPauseEnabled: boolean;
  status: 'recording' | 'paused';
  isAutoPaused: boolean;
  isVehicleDetected?: boolean;
  motionActivity?: MotionActivityType;
  floorsClimbed?: number;
  barometricGainMeters?: number;
  startTime: number;
  accumulatedActiveMs: number;
  activeSegmentStartMs: number | null;
  distanceMeters: number;
  steps: number;
  elevationGainMeters: number;
  smoothedAltitudeMeters: number | null;
  elevationAnchorMeters: number | null;
  smoothedCurrentPaceSeconds: number;
  currentSegmentIndex: number;
  routePoints: GPSCoordinate[];
  splits: WorkoutSplit[];
  splitProgressMeters: number;
  splitProgressSeconds: number;
  splitElevationGainMeters: number;
  lastAnchoredPoint: GPSCoordinate | null;
  recentPoints: GPSCoordinate[];
  lastMovementOrStepAt: number;
  lastStepSyncTimestamp: number;
  distanceAtLastStepEvent: number;
  fallbackBgStepsAdded: number;
  lastSyncedNativeSteps?: number;
  lastHardwareStepAt?: number;
  lastAcceptedGpsAt?: number;
  stepsAtLastAcceptedGps?: number;
  bridgedMetersSinceLastGps?: number;
  bridgedSplitSecondsSinceLastGps?: number;
  recentStepEvents?: { timestamp: number; deltaSteps: number }[];
  calibGpsMeters: number;
  calibHwSteps: number;
  weightKg: number;
  soundtracks?: WorkoutSoundtrackItem[];
  lastSavedAt: number;
}

