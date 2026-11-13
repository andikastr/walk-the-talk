import { Barometer, type BarometerMeasurement } from 'expo-sensors';

const SEA_LEVEL_PRESSURE_HPA = 1013.25;
const METERS_PER_FLOOR = 3.0;
const BAROMETRIC_NOISE_DEADBAND_METERS = 0.35;

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

    // iOS CMAltimeter langsung menyediakan relativeAltitude dalam meter;
    // Android Sensor.TYPE_PRESSURE dikonversi melalui formula hipsometrik atmosfer
    const rawAltitude =
      typeof relativeAltitude === 'number' && Number.isFinite(relativeAltitude)
        ? relativeAltitude
        : pressureToRelativeAltitudeMeters(pressure, baselinePressure);

    if (prevAltitudeAnchor === null) {
      prevAltitudeAnchor = rawAltitude;
    }

    const verticalDelta = rawAltitude - prevAltitudeAnchor;
    let addedGain = 0;

    // Hysteresis deadband untuk meredam noise mikro getaran hembusan angin (< 0.35m)
    if (verticalDelta >= BAROMETRIC_NOISE_DEADBAND_METERS) {
      addedGain = verticalDelta;
      accumulatedGainMeters += addedGain;
      prevAltitudeAnchor = rawAltitude;
    } else if (verticalDelta <= -BAROMETRIC_NOISE_DEADBAND_METERS) {
      // Menurun tidak menambah gain, tapi memperbarui titik jangkar
      prevAltitudeAnchor = rawAltitude;
    }

    const floors = calculateFloorsClimbed(accumulatedGainMeters);

    onSample({
      pressureHpa: pressure,
      relativeAltitudeMeters: Math.round(rawAltitude * 10) / 10,
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

