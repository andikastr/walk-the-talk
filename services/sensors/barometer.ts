import { Barometer, type BarometerMeasurement } from 'expo-sensors';

export const SEA_LEVEL_PRESSURE_HPA = 1013.25;
export const METERS_PER_FLOOR = 3.0;
export const BAROMETRIC_NOISE_DEADBAND_METERS = 2.5;
export const BAROMETER_EMA_ALPHA = 0.25;

/**
 * Menghitung estimasi perbedaan ketinggian (meter) dari tekanan udara (hPa)
 * menggunakan formula hipsometrik atmosfer standar ICAO.
 *
 * @param currentPressureHpa Tekanan udara saat ini dalam hPa
 * @param baselinePressureHpa Tekanan udara referensi awal sesi
 */
export function pressureToRelativeAltitudeMeters(
  currentPressureHpa: number,
  baselinePressureHpa: number
): number {
  if (
    !Number.isFinite(currentPressureHpa) ||
    !Number.isFinite(baselinePressureHpa) ||
    currentPressureHpa <= 0 ||
    baselinePressureHpa <= 0
  ) {
    return 0;
  }

  const pCurr = currentPressureHpa / SEA_LEVEL_PRESSURE_HPA;
  const pBase = baselinePressureHpa / SEA_LEVEL_PRESSURE_HPA;

  // Formula barometrik atmosfer ICAO: h = 44330 * (pBase^(1/5.255) - pCurr^(1/5.255))
  const exponent = 1 / 5.255;
  const deltaMeters = 44330 * (Math.pow(pBase, exponent) - Math.pow(pCurr, exponent));

  return Math.round(deltaMeters * 10) / 10;
}

/**
 * Menghitung jumlah lantai tangga yang dinaiki (1 lantai ~ 3.0 meter kenaikan vertikal)
 */
export function calculateFloorsClimbed(elevationGainMeters: number): number {
  if (!Number.isFinite(elevationGainMeters) || elevationGainMeters <= 0) {
    return 0;
  }
  return Math.floor(elevationGainMeters / METERS_PER_FLOOR);
}

export interface BarometerSample {
  pressureHpa: number;
  relativeAltitudeMeters: number;
  addedGainMeters: number;
  floorsClimbed: number;
  timestamp: number;
}

export type BarometerListener = (sample: BarometerSample) => void;

/**
 * Memeriksa apakah sensor Barometer / Altimeter didukung oleh perangkat
 */
export async function isBarometerAvailableAsync(): Promise<boolean> {
  try {
    return await Barometer.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Memulai pemantauan sensor barometer untuk menghitung perubahan elevasi vertikal
 * dan anak tangga yang dinaiki tanpa noise GPS.
 */
export async function startBarometerWatcher(
  onSample: BarometerListener,
  options?: { updateIntervalMs?: number }
): Promise<() => void> {
  const isAvailable = await isBarometerAvailableAsync();
  if (!isAvailable) {
    return () => {};
  }

  const interval = options?.updateIntervalMs ?? 1500;
  try {
    Barometer.setUpdateInterval(interval);
  } catch {
    // Abaikan jika setUpdateInterval tidak didukung di platform tertentu
  }

  let baselinePressure: number | null = null;
  let smoothedPressure: number | null = null;
  let smoothedAltitude: number | null = null;
  let prevAltitudeAnchor: number | null = null;
  let accumulatedGainMeters = 0;
  let isCancelled = false;

  const subscription = Barometer.addListener((measurement: BarometerMeasurement) => {
    if (isCancelled) return;
    const { pressure, relativeAltitude } = measurement;
    if (!Number.isFinite(pressure) || pressure <= 0) return;

    if (baselinePressure === null) {
      baselinePressure = pressure;
    }

    smoothedPressure =
      smoothedPressure === null
        ? pressure
        : smoothedPressure * (1 - BAROMETER_EMA_ALPHA) + pressure * BAROMETER_EMA_ALPHA;

    // iOS CMAltimeter langsung menyediakan relativeAltitude dalam meter;
    // Android Sensor.TYPE_PRESSURE dikonversi melalui formula hipsometrik atmosfer berbasis smoothedPressure
    const rawAlt =
      typeof relativeAltitude === 'number' && Number.isFinite(relativeAltitude)
        ? relativeAltitude
        : pressureToRelativeAltitudeMeters(smoothedPressure, baselinePressure);

    smoothedAltitude =
      smoothedAltitude === null
        ? rawAlt
        : smoothedAltitude * (1 - BAROMETER_EMA_ALPHA) + rawAlt * BAROMETER_EMA_ALPHA;

    if (prevAltitudeAnchor === null) {
      prevAltitudeAnchor = smoothedAltitude;
    }

    const verticalDelta = smoothedAltitude - prevAltitudeAnchor;
    let addedGain = 0;

    // Hysteresis deadband untuk meredam noise mikro ayunan saku celana (< 2.5m)
    if (verticalDelta >= BAROMETRIC_NOISE_DEADBAND_METERS) {
      addedGain = verticalDelta;
      accumulatedGainMeters += addedGain;
      prevAltitudeAnchor = smoothedAltitude;
    } else if (verticalDelta <= -BAROMETRIC_NOISE_DEADBAND_METERS) {
      // Menurun tidak menambah gain, tapi memperbarui titik jangkar
      prevAltitudeAnchor = smoothedAltitude;
    }

    const floors = calculateFloorsClimbed(accumulatedGainMeters);

    onSample({
      pressureHpa: Math.round(smoothedPressure * 100) / 100,
      relativeAltitudeMeters: Math.round(smoothedAltitude * 10) / 10,
      addedGainMeters: Math.round(addedGain * 10) / 10,
      floorsClimbed: floors,
      timestamp: Date.now(),
    });
  });

  return () => {
    isCancelled = true;
    try {
      subscription.remove();
    } catch {
      // Ignore cleanup errors
    }
  };
}

