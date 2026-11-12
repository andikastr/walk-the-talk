export type PedometerTrackingMode = 'indoor' | 'outdoor';

export type PedometerPermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface PedometerPermissionResponse {
  status: PedometerPermissionStatus;
  granted: boolean;
  canAskAgain: boolean;
  expires: 'never' | number;
}

export interface StartPedometerSessionOptions {
  sessionId: string;
  trackingMode: PedometerTrackingMode;
  useForegroundService: boolean;
  notificationTitle: string;
  notificationBody: string;
  notificationColor?: string;
  strideMeters?: number;
  initialSyncedSteps?: number;
  stepsLabel?: string;
}

export interface ResumePedometerSessionOptions {
  trackingMode?: PedometerTrackingMode;
  useForegroundService?: boolean;
  notificationTitle?: string;
  notificationBody?: string;
  notificationColor?: string;
  strideMeters?: number;
}

export interface PedometerSessionSnapshot {
  sessionId: string | null;
  totalSteps: number;
  lastStepTimestampMs: number;
  isRecording: boolean;
  isForegroundServiceRunning: boolean;
}

export interface StepUpdateEvent {
  sessionId: string;
  totalSteps: number;
  timestampMs: number;
  isForegroundServiceRunning: boolean;
}

export interface StepEventSubscription {
  remove: () => void;
}

