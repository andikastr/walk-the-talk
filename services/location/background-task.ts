import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { WORKOUT_CONFIG } from '@/constants/Config';
import {
  getCalibratedStrides,
  loadActiveCheckpoint,
  saveActiveCheckpoint,
} from '@/services/database/workout-repo';
import { processGpsLocationSample } from '@/services/location/tracking-engine';

export const WORKOUT_LOCATION_TASK_NAME = 'WALK_THE_TALK_BACKGROUND_LOCATION';

interface LocationTaskPayload {
  locations?: Location.LocationObject[];
}

export type ForegroundLocationTaskListener = (locations: Location.LocationObject[]) => void;

let foregroundListener: ForegroundLocationTaskListener | null = null;

export function registerForegroundLocationTaskListener(
  listener: ForegroundLocationTaskListener | null
): void {
  foregroundListener = listener;
}

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(WORKOUT_LOCATION_TASK_NAME)) {
  TaskManager.defineTask<LocationTaskPayload>(
    WORKOUT_LOCATION_TASK_NAME,
    async ({ data, error }) => {
      if (error) {
        console.warn('[BackgroundLocationTask] Task error:', error.message);
        return;
      }

      const rawLocations = data?.locations;
      if (!rawLocations || rawLocations.length === 0) return;

      const sortedLocations = [...rawLocations].sort((a, b) => a.timestamp - b.timestamp);

      // Jika hook sesi aktif masih terpasang di memori JS, proses langsung lewat listener in-memory
      if (foregroundListener) {
        foregroundListener(sortedLocations);
        return;
      }

      // Headless fallback: UI ter-unmount/terbunuh oleh OS sementara foreground service tetap berjalan
      try {
        const checkpoint = await loadActiveCheckpoint();
        if (
          !checkpoint ||
          checkpoint.status !== 'recording' ||
          checkpoint.trackingMode === 'indoor'
        ) {
          return;
        }

        const calibratedStrides = await getCalibratedStrides();
        let nextCheckpoint = checkpoint;
        let hasChanges = false;

        for (const loc of sortedLocations) {
          const result = processGpsLocationSample(nextCheckpoint, loc, {
            allowFallbackSteps: true,
            calibratedStrides,
          });
          if (result.acceptedPoint || result.didAutoPause || result.didAutoResume) {
            hasChanges = true;
          }
          nextCheckpoint = result.checkpoint;
        }

        if (hasChanges) {
          await saveActiveCheckpoint(nextCheckpoint);
        }
      } catch (err) {
        console.warn('[BackgroundLocationTask] Headless persistence failed:', err);
      }
    }
  );
}

export interface BackgroundTrackingOptions {
  notificationTitle: string;
  notificationBody: string;
  notificationColor: string;
}

export async function isBackgroundLocationGranted(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const bgPerm = await Location.getBackgroundPermissionsAsync();
    return bgPerm.status === 'granted';
  } catch {
    return false;
  }
}

export async function startBackgroundLocationUpdates(
  options: BackgroundTrackingOptions
): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (!TaskManager.isTaskDefined(WORKOUT_LOCATION_TASK_NAME)) return false;

  try {
    const fgPerm = await Location.getForegroundPermissionsAsync();
    const bgPerm = await Location.getBackgroundPermissionsAsync();
    if (fgPerm.status !== 'granted' || bgPerm.status !== 'granted') {
      return false;
    }

    const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(
      WORKOUT_LOCATION_TASK_NAME
    );
    if (alreadyStarted) {
      return true;
    }

    await Location.startLocationUpdatesAsync(WORKOUT_LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: WORKOUT_CONFIG.locationTimeIntervalMs,
      distanceInterval: WORKOUT_CONFIG.locationDistanceIntervalMeters,
      activityType: Location.ActivityType.Fitness,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: options.notificationTitle,
        notificationBody: options.notificationBody,
        notificationColor: options.notificationColor,
        killServiceOnDestroy: false,
      },
    });
    return true;
  } catch (err) {
    console.warn('[BackgroundLocation] Unable to start updates, using foreground watcher:', err);
    return false;
  }
}

export async function stopBackgroundLocationUpdates(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(
      WORKOUT_LOCATION_TASK_NAME
    );
    if (started) {
      await Location.stopLocationUpdatesAsync(WORKOUT_LOCATION_TASK_NAME);
    }
  } catch (err) {
    console.warn('[BackgroundLocation] Error stopping updates:', err);
  }
}

