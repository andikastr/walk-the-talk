import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Pedometer as ExpoSensorsPedometer } from 'expo-sensors';
import type {
  PedometerPermissionResponse,
  PedometerSessionSnapshot,
  ResumePedometerSessionOptions,
  StartPedometerSessionOptions,
  StepEventSubscription,
  StepUpdateEvent,
} from './WorkoutPedometer.types';

type WorkoutPedometerEvents = {
  onStepUpdate: (event: StepUpdateEvent) => void;
};

declare class NativeWorkoutPedometerModule extends NativeModule<WorkoutPedometerEvents> {
  isAvailableAsync(): Promise<boolean>;
  getPermissionsAsync(): Promise<PedometerPermissionResponse>;
  requestPermissionsAsync(): Promise<PedometerPermissionResponse>;
  requestNotificationPermissionAsync(): Promise<PedometerPermissionResponse>;
  startSessionAsync(options: StartPedometerSessionOptions): Promise<PedometerSessionSnapshot>;
  pauseSessionAsync(): Promise<PedometerSessionSnapshot>;
  resumeSessionAsync(options?: ResumePedometerSessionOptions): Promise<PedometerSessionSnapshot>;
  stopSessionAsync(): Promise<PedometerSessionSnapshot>;
  getSessionSnapshotAsync(): Promise<PedometerSessionSnapshot>;
}

const nativeModule =
  requireOptionalNativeModule<NativeWorkoutPedometerModule>('WorkoutPedometer');

// Foreground-only fallback state when the binary lacks the custom native module (e.g., Expo Go).
const fallbackState = {
  sessionId: null as string | null,
  isRecording: false,
  accumulatedSteps: 0,
  liveSteps: 0,
  lastStepTimestampMs: 0,
  subscription: null as { remove: () => void } | null,
  listeners: new Set<(event: StepUpdateEvent) => void>(),
};

function buildFallbackSnapshot(): PedometerSessionSnapshot {
  return {
    sessionId: fallbackState.sessionId,
    totalSteps: Math.max(0, fallbackState.accumulatedSteps + fallbackState.liveSteps),
    lastStepTimestampMs: fallbackState.lastStepTimestampMs,
    isRecording: fallbackState.isRecording,
    isForegroundServiceRunning: false,
  };
}

function stopFallbackWatcher(): void {
  if (fallbackState.subscription) {
    try {
      fallbackState.subscription.remove();
    } catch {
      // Ignore cleanup errors
    }
    fallbackState.subscription = null;
  }
}

function startFallbackWatcher(): void {
  stopFallbackWatcher();
  if (!fallbackState.isRecording) return;

  try {
    fallbackState.subscription = ExpoSensorsPedometer.watchStepCount(({ steps }) => {
      if (!fallbackState.isRecording) return;
      const reported = Math.max(0, Math.round(steps));
      if (reported > fallbackState.liveSteps) {
        fallbackState.liveSteps = reported;
        fallbackState.lastStepTimestampMs = Date.now();
        const event: StepUpdateEvent = {
          sessionId: fallbackState.sessionId ?? '',
          totalSteps: fallbackState.accumulatedSteps + fallbackState.liveSteps,
          timestampMs: fallbackState.lastStepTimestampMs,
          isForegroundServiceRunning: false,
        };
        fallbackState.listeners.forEach((listener) => {
          try {
            listener(event);
          } catch {
            // Isolate listener errors
          }
        });
      }
    });
  } catch {
    fallbackState.subscription = null;
  }
}

export function isUsingNativeBackgroundModule(): boolean {
  return nativeModule !== null;
}

export async function isAvailableAsync(): Promise<boolean> {
  if (nativeModule) {
    return nativeModule.isAvailableAsync();
  }
  try {
    return await ExpoSensorsPedometer.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function getPermissionsAsync(): Promise<PedometerPermissionResponse> {
  if (nativeModule) {
    return nativeModule.getPermissionsAsync();
  }
  try {
    const res = await ExpoSensorsPedometer.getPermissionsAsync();
    return {
      status: res.status as PedometerPermissionResponse['status'],
      granted: res.granted,
      canAskAgain: res.canAskAgain,
      expires: res.expires,
    };
  } catch {
    return { status: 'denied', granted: false, canAskAgain: false, expires: 'never' };
  }
}

export async function requestPermissionsAsync(): Promise<PedometerPermissionResponse> {
  if (nativeModule) {
    return nativeModule.requestPermissionsAsync();
  }
  try {
    const res = await ExpoSensorsPedometer.requestPermissionsAsync();
    return {
      status: res.status as PedometerPermissionResponse['status'],
      granted: res.granted,
      canAskAgain: res.canAskAgain,
      expires: res.expires,
    };
  } catch {
    return { status: 'denied', granted: false, canAskAgain: false, expires: 'never' };
  }
}

export async function requestNotificationPermissionAsync(): Promise<PedometerPermissionResponse> {
  if (nativeModule) {
    return nativeModule.requestNotificationPermissionAsync();
  }
  return { status: 'granted', granted: true, canAskAgain: true, expires: 'never' };
}

export async function startSessionAsync(
  options: StartPedometerSessionOptions
): Promise<PedometerSessionSnapshot> {
  if (nativeModule) {
    return nativeModule.startSessionAsync({
      sessionId: options.sessionId,
      trackingMode: options.trackingMode,
      useForegroundService: options.useForegroundService,
      notificationTitle: options.notificationTitle,
      notificationBody: options.notificationBody,
      ...(options.notificationColor ? { notificationColor: options.notificationColor } : {}),
      strideMeters: options.strideMeters ?? 0.9,
      initialSyncedSteps: Math.max(0, Math.round(options.initialSyncedSteps ?? 0)),
      stepsLabel: options.stepsLabel ?? 'langkah',
    });
  }

  const sameActive =
    fallbackState.sessionId === options.sessionId && fallbackState.isRecording;
  if (sameActive) {
    fallbackState.accumulatedSteps = Math.max(
      fallbackState.accumulatedSteps,
      Math.max(0, Math.round(options.initialSyncedSteps ?? 0))
    );
  } else {
    fallbackState.sessionId = options.sessionId;
    fallbackState.isRecording = true;
    fallbackState.accumulatedSteps = Math.max(
      0,
      Math.round(options.initialSyncedSteps ?? 0)
    );
    fallbackState.liveSteps = 0;
    fallbackState.lastStepTimestampMs = Date.now();
  }
  startFallbackWatcher();
  return buildFallbackSnapshot();
}

export async function pauseSessionAsync(): Promise<PedometerSessionSnapshot> {
  if (nativeModule) {
    return nativeModule.pauseSessionAsync();
  }

  fallbackState.accumulatedSteps += fallbackState.liveSteps;
  fallbackState.liveSteps = 0;
  fallbackState.isRecording = false;
  stopFallbackWatcher();
  return buildFallbackSnapshot();
}

export async function resumeSessionAsync(
  options?: ResumePedometerSessionOptions
): Promise<PedometerSessionSnapshot> {
  if (nativeModule) {
    return nativeModule.resumeSessionAsync(options);
  }

  fallbackState.isRecording = true;
  fallbackState.liveSteps = 0;
  fallbackState.lastStepTimestampMs = Date.now();
  startFallbackWatcher();
  return buildFallbackSnapshot();
}

export async function stopSessionAsync(): Promise<PedometerSessionSnapshot> {
  if (nativeModule) {
    return nativeModule.stopSessionAsync();
  }

  stopFallbackWatcher();
  fallbackState.sessionId = null;
  fallbackState.isRecording = false;
  fallbackState.accumulatedSteps = 0;
  fallbackState.liveSteps = 0;
  fallbackState.lastStepTimestampMs = 0;
  return buildFallbackSnapshot();
}

export async function getSessionSnapshotAsync(): Promise<PedometerSessionSnapshot> {
  if (nativeModule) {
    return nativeModule.getSessionSnapshotAsync();
  }
  return buildFallbackSnapshot();
}

export function addStepListener(
  listener: (event: StepUpdateEvent) => void
): StepEventSubscription {
  if (nativeModule) {
    return nativeModule.addListener('onStepUpdate', listener);
  }
  fallbackState.listeners.add(listener);
  return {
    remove: () => {
      fallbackState.listeners.delete(listener);
    },
  };
}

