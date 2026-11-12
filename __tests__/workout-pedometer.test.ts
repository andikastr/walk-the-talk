import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ExportedConfig } from 'expo/config-plugins';
import { Pedometer as MockedExpoSensorsPedometer } from 'expo-sensors';
import * as WorkoutPedometer from '@/modules/workout-pedometer';
import withWorkoutPedometer from '@/modules/workout-pedometer/plugin/src';

jest.mock('expo', () => ({
  requireOptionalNativeModule: jest.fn(() => null),
}));

jest.mock('expo-sensors', () => ({
  Pedometer: {
    isAvailableAsync: jest.fn(async () => true),
    getPermissionsAsync: jest.fn(async () => ({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    })),
    requestPermissionsAsync: jest.fn(async () => ({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    })),
    watchStepCount: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

describe('modules/workout-pedometer', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await WorkoutPedometer.stopSessionAsync();
  });

  it('tracks session totals across pause and resume even when falling back to expo-sensors', async () => {
    expect(WorkoutPedometer.isUsingNativeBackgroundModule()).toBe(false);
    expect(await WorkoutPedometer.isAvailableAsync()).toBe(true);

    const events: WorkoutPedometer.StepUpdateEvent[] = [];
    const sub = WorkoutPedometer.addStepListener((e) => events.push(e));

    const startSnap = await WorkoutPedometer.startSessionAsync({
      sessionId: 'sess-1',
      trackingMode: 'indoor',
      useForegroundService: true,
      notificationTitle: 'Walk The Talk',
      notificationBody: 'Tracking',
    });
    expect(startSnap.sessionId).toBe('sess-1');
    expect(startSnap.isRecording).toBe(true);
    expect(startSnap.totalSteps).toBe(0);

    const watchMock = MockedExpoSensorsPedometer.watchStepCount as unknown as jest.Mock<
      (cb: (result: { steps: number }) => void) => { remove: jest.Mock }
    >;
    const firstCallback = watchMock.mock.calls[0][0];
    const firstRemove = (watchMock.mock.results[0].value as { remove: jest.Mock }).remove;

    // First active segment receives 25 steps
    firstCallback({ steps: 25 });
    expect(events).toHaveLength(1);
    expect(events[0].totalSteps).toBe(25);

    // Pausing freezes accumulated steps and tears down watcher
    const pausedSnap = await WorkoutPedometer.pauseSessionAsync();
    expect(pausedSnap.isRecording).toBe(false);
    expect(pausedSnap.totalSteps).toBe(25);
    expect(firstRemove).toHaveBeenCalledTimes(1);

    // Resuming starts a fresh watcher segment (steps start from 0 again in expo-sensors)
    const resumedSnap = await WorkoutPedometer.resumeSessionAsync({
      trackingMode: 'indoor',
    });
    expect(resumedSnap.isRecording).toBe(true);
    expect(resumedSnap.totalSteps).toBe(25);

    const secondCallback = watchMock.mock.calls[1][0];
    secondCallback({ steps: 10 });
    const latestSnap = await WorkoutPedometer.getSessionSnapshotAsync();
    expect(latestSnap.totalSteps).toBe(35);
    expect(events).toHaveLength(2);
    expect(events[1].totalSteps).toBe(35);

    sub.remove();
    const stoppedSnap = await WorkoutPedometer.stopSessionAsync();
    expect(stoppedSnap.sessionId).toBeNull();
    expect(stoppedSnap.totalSteps).toBe(0);
    expect(stoppedSnap.isRecording).toBe(false);
  });

  it('configures iOS motion usage and Android health foreground permissions in config plugin', () => {
    const result = withWorkoutPedometer({
      name: 'Walk The Talk',
      slug: 'walk-the-talk',
      android: {},
      ios: {},
    }) as ExportedConfig;

    expect(result.mods?.ios?.infoPlist).toBeDefined();
    expect(result.mods?.android?.manifest).toBeDefined();
  });
});
