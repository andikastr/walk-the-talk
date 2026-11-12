import type {
  PedometerPermissionResponse,
  PedometerSessionSnapshot,
  ResumePedometerSessionOptions,
  StartPedometerSessionOptions,
  StepEventSubscription,
  StepUpdateEvent,
} from './WorkoutPedometer.types';

const DENIED_RESPONSE: PedometerPermissionResponse = {
  status: 'denied',
  granted: false,
  canAskAgain: false,
  expires: 'never',
};

const EMPTY_SNAPSHOT: PedometerSessionSnapshot = {
  sessionId: null,
  totalSteps: 0,
  lastStepTimestampMs: 0,
  isRecording: false,
  isForegroundServiceRunning: false,
};

export function isUsingNativeBackgroundModule(): boolean {
  return false;
}

export async function isAvailableAsync(): Promise<boolean> {
  return false;
}

export async function getPermissionsAsync(): Promise<PedometerPermissionResponse> {
  return DENIED_RESPONSE;
}

export async function requestPermissionsAsync(): Promise<PedometerPermissionResponse> {
  return DENIED_RESPONSE;
}

export async function requestNotificationPermissionAsync(): Promise<PedometerPermissionResponse> {
  return DENIED_RESPONSE;
}

export async function startSessionAsync(
  _options: StartPedometerSessionOptions
): Promise<PedometerSessionSnapshot> {
  return EMPTY_SNAPSHOT;
}

export async function pauseSessionAsync(): Promise<PedometerSessionSnapshot> {
  return EMPTY_SNAPSHOT;
}

export async function resumeSessionAsync(
  _options?: ResumePedometerSessionOptions
): Promise<PedometerSessionSnapshot> {
  return EMPTY_SNAPSHOT;
}

export async function stopSessionAsync(): Promise<PedometerSessionSnapshot> {
  return EMPTY_SNAPSHOT;
}

export async function getSessionSnapshotAsync(): Promise<PedometerSessionSnapshot> {
  return EMPTY_SNAPSHOT;
}

export function addStepListener(
  _listener: (event: StepUpdateEvent) => void
): StepEventSubscription {
  return { remove: () => {} };
}

