export type WorkoutType = 'walk' | 'jog' | 'run';

export type WorkoutStatus = 'idle' | 'recording' | 'paused' | 'completed';

export interface GPSCoordinate {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  accuracy?: number | null;
  speed?: number | null; // meters per second
  timestamp: number;
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
}

export interface WorkoutStats {
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  totalWorkouts: number;
  totalCaloriesKcal: number;
  totalSteps: number;
}

