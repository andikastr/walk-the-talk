import {
  GPSCoordinate,
  GpsSignalQuality,
  WorkoutSplit,
  WorkoutType,
} from '@/types/workout';
import { WORKOUT_CONFIG } from '@/constants/Config';

// Radius bumi dalam meter
const EARTH_RADIUS_METERS = 6371000;

/**
 * Menghitung jarak antara dua koordinat GPS menggunakan rumus Haversine
 */
export function calculateHaversineDistance(
  coord1: { latitude: number; longitude: number },
  coord2: { latitude: number; longitude: number }
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;

  const dLat = toRad(coord2.latitude - coord1.latitude);
  const dLon = toRad(coord2.longitude - coord1.longitude);

  const lat1 = toRad(coord1.latitude);
  const lat2 = toRad(coord2.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Menghitung total jarak dari deretan koordinat GPS
 */
export function calculateTotalDistance(coordinates: GPSCoordinate[]): number {
  if (coordinates.length < 2) return 0;
  let totalDistance = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const prev = coordinates[i - 1];
    const curr = coordinates[i];
    if ((curr.segmentIndex ?? 0) !== (prev.segmentIndex ?? 0)) continue;
    totalDistance += calculateHaversineDistance(prev, curr);
  }
  return totalDistance;
}

/**
 * Format detik ke string waktu HH:MM:SS atau MM:SS
 */
export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

/**
 * Menghitung pace rata-rata (detik per km)
 */
export function calculatePaceSeconds(distanceMeters: number, durationSeconds: number): number {
  if (distanceMeters < 10 || durationSeconds <= 0) return 0;
  const distanceKm = distanceMeters / 1000;
  return durationSeconds / distanceKm;
}

/**
 * Format pace (detik per km) menjadi string "M'SS\" /km"
 */
export function formatPace(paceSeconds: number): string {
  if (!paceSeconds || paceSeconds <= 0 || !isFinite(paceSeconds) || paceSeconds > 3600) {
    return `--'--"`;
  }
  const mins = Math.floor(paceSeconds / 60);
  const secs = Math.floor(paceSeconds % 60);
  return `${mins}'${secs.toString().padStart(2, '0')}"`;
}

export interface EstimateCaloriesOptions {
  elevationGainMeters?: number;
  isIndoor?: boolean;
  splits?: WorkoutSplit[];
}

function interpolateMet(
  speedKmH: number,
  anchors: readonly [number, number][]
): number {
  if (!Number.isFinite(speedKmH) || speedKmH <= anchors[0][0]) {
    return anchors[0][1];
  }
  const lastIdx = anchors.length - 1;
  if (speedKmH >= anchors[lastIdx][0]) {
    return anchors[lastIdx][1];
  }
  for (let i = 1; i <= lastIdx; i++) {
    const [x0, y0] = anchors[i - 1];
    const [x1, y1] = anchors[i];
    if (speedKmH <= x1) {
      const ratio = (speedKmH - x0) / Math.max(1e-6, x1 - x0);
      return y0 + (y1 - y0) * ratio;
    }
  }
  return anchors[lastIdx][1];
}

export function resolveMetForSpeed(type: WorkoutType, speedKmH: number): number {
  if (type === 'walk') {
    return interpolateMet(speedKmH, [
      [4.0, 3.5],
      [5.5, 4.3],
      [6.5, 4.8],
    ]);
  }
  if (type === 'jog') {
    return interpolateMet(speedKmH, [
      [2.0, 2.3],
      [4.0, 3.5],
      [5.5, 4.3],
      [6.5, 4.8],
      [7.0, 7.0],
      [8.5, 8.0],
      [9.5, 8.5],
    ]);
  }
  return interpolateMet(speedKmH, [
    [2.0, 2.3],
    [4.0, 3.5],
    [5.5, 4.3],
    [6.5, 4.8],
    [7.5, 7.3],
    [8.5, 8.0],
    [9.5, 9.0],
    [10.5, 10.0],
    [12.0, 11.5],
    [14.0, 12.5],
  ]);
}

/**
 * Estimasi pembakaran kalori berdasarkan MET (Metabolic Equivalent of Task),
 * mendukung agregasi per kilometer split + penyesuaian kerja vertikal tanjakan.
 * Formula dasar: Calories (kcal) = MET * beratBadan (kg) * durasi (jam) + climbBonus
 */
export function estimateCalories(
  type: WorkoutType,
  durationSeconds: number,
  distanceMeters: number,
  weightKg: number = 65,
  options?: EstimateCaloriesOptions
): number {
  if (durationSeconds <= 0 || weightKg <= 0) return 0;

  let baseKcal = 0;
  const splits = options?.splits;
  const sumSplitSeconds =
    splits && splits.length > 0
      ? splits.reduce((sum, s) => sum + Math.max(0, s.durationSeconds), 0)
      : 0;

  if (
    splits &&
    splits.length > 0 &&
    sumSplitSeconds > 0 &&
    sumSplitSeconds <= durationSeconds + 5
  ) {
    for (const split of splits) {
      const splitSec = Math.max(1, split.durationSeconds);
      const splitHours = splitSec / 3600;
      const splitSpeedKmH = 1 / splitHours;
      baseKcal += resolveMetForSpeed(type, splitSpeedKmH) * weightKg * splitHours;
    }

    const remSec = Math.max(0, durationSeconds - sumSplitSeconds);
    const remMeters = Math.max(0, distanceMeters - splits.length * 1000);
    if (remSec > 0) {
      const remHours = remSec / 3600;
      const remSpeedKmH = remMeters > 0 ? (remMeters / 1000) / remHours : 0;
      baseKcal += resolveMetForSpeed(type, remSpeedKmH) * weightKg * remHours;
    }
  } else {
    const durationHours = durationSeconds / 3600;
    const speedKmH = distanceMeters > 0 ? (distanceMeters / 1000) / durationHours : 0;
    baseKcal = resolveMetForSpeed(type, speedKmH) * weightKg * durationHours;
  }

  // Tambahan kerja vertikal gravitasi saat menanjak (~0.01 kcal / kg / meter naik untuk efisiensi ~23%)
  const elevGain =
    !options?.isIndoor &&
    typeof options?.elevationGainMeters === 'number' &&
    Number.isFinite(options.elevationGainMeters) &&
    options.elevationGainMeters > 0
      ? options.elevationGainMeters
      : 0;
  const climbKcal = weightKg * elevGain * 0.01;

  return Math.round(baseKcal + climbKcal);
}

/**
 * Menghitung splits per kilometer dari riwayat koordinat
 */
export function calculateSplits(coordinates: GPSCoordinate[]): WorkoutSplit[] {
  if (coordinates.length < 2) return [];

  const splits: WorkoutSplit[] = [];
  let accumulatedDistance = 0;
  let lastKmIndex = 0;
  let splitActiveSeconds = 0;

  for (let i = 1; i < coordinates.length; i++) {
    const prev = coordinates[i - 1];
    const curr = coordinates[i];
    if ((curr.segmentIndex ?? 0) !== (prev.segmentIndex ?? 0)) continue;

    const d = calculateHaversineDistance(prev, curr);
    const dtSec = Math.max(0, (curr.timestamp - prev.timestamp) / 1000);
    accumulatedDistance += d;
    splitActiveSeconds += dtSec;

    const currentKm = Math.floor(accumulatedDistance / 1000);
    if (currentKm > lastKmIndex) {
      const dur = Math.max(1, Math.round(splitActiveSeconds));
      splits.push({
        kmNumber: currentKm,
        durationSeconds: dur,
        paceSecondsPerKm: dur,
      });
      lastKmIndex = currentKm;
      splitActiveSeconds = 0;
    }
  }

  return splits;
}

/**
 * Mengestimasi jumlah langkah dari jarak tempuh (meter) saat sensor pedometer tidak aktif
 */
export function estimateStepsFromDistance(
  distanceMeters: number,
  type: WorkoutType = 'walk',
  customStrideMeters?: number
): number {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return 0;
  const strideMeters =
    customStrideMeters && customStrideMeters > 0
      ? customStrideMeters
      : WORKOUT_CONFIG.strideMetersByType[type] || WORKOUT_CONFIG.strideMetersByType.walk;
  return Math.max(0, Math.round(distanceMeters / strideMeters));
}

/**
 * Klasifikasi kualitas sinyal akurasi GPS (meter)
 */
export function classifyGpsAccuracy(accuracy?: number | null): GpsSignalQuality {
  if (accuracy == null || !Number.isFinite(accuracy) || accuracy <= 0) {
    return 'acquiring';
  }
  if (accuracy <= WORKOUT_CONFIG.gpsGoodAccuracyMeters) {
    return 'good';
  }
  if (accuracy <= WORKOUT_CONFIG.gpsMaxAccuracyMeters) {
    return 'weak';
  }
  return 'acquiring';
}

/**
 * Format elevasi menanjak dalam meter (contoh: "42 m")
 */
export function formatElevationMeters(elevationMeters: number): string {
  if (!Number.isFinite(elevationMeters) || elevationMeters <= 0) return '0 m';
  return `${Math.round(elevationMeters)} m`;
}

/**
 * Menghitung rata-rata cadence (langkah per menit / SPM)
 */
export function calculateCadenceSpm(steps: number, durationSeconds: number): number {
  if (!Number.isFinite(steps) || steps <= 0 || durationSeconds <= 0) return 0;
  return Math.round(steps / (durationSeconds / 60));
}

/**
 * Memformat jumlah langkah dengan pemisah ribuan (contoh: 4.520)
 */
export function formatSteps(steps: number): string {
  if (!Number.isFinite(steps) || steps <= 0) return '0';
  return Math.round(steps)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

