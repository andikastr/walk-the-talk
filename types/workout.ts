export type WorkoutType = 'walk' | 'jog' | 'run';

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
  steps?: number;
  avgCadenceSpm?: number;
  elevationGainMeters?: number;
  isIndoor?: boolean;
}

export interface WorkoutStats {
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  totalWorkouts: number;
  totalCaloriesKcal: number;
  totalSteps: number;
}

export interface ActiveWorkoutCheckpoint {
  version: number;
  type: WorkoutType;
  trackingMode: TrackingMode;
  autoPauseEnabled: boolean;
  status: 'recording' | 'paused';
  isAutoPaused: boolean;
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
  calibGpsMeters: number;
  calibHwSteps: number;
  weightKg: number;
  lastSavedAt: number;
}

