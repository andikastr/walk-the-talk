import * as Location from 'expo-location';

/**
 * Meratakan sudut melingkar (0 - 360 derajat) menggunakan vektor trigonometrik
 * untuk menghindari efek lompatan jarum saat melintasi batas 359° <-> 0°.
 *
 * @param prevDegrees Sudut derajat sebelumnya (0 - 360)
 * @param newDegrees Sudut derajat baru (0 - 360)
 * @param alpha Bobot ke sudut baru (0.01 - 1.0, default 0.28 untuk pergerakan mulus)
 */
export function smoothCircularDegrees(
  prevDegrees: number | null | undefined,
  newDegrees: number,
  alpha: number = 0.28
): number {
  if (!Number.isFinite(newDegrees)) {
    return prevDegrees && Number.isFinite(prevDegrees) ? prevDegrees : 0;
  }

  const normalizedNew = ((newDegrees % 360) + 360) % 360;
  if (prevDegrees == null || !Number.isFinite(prevDegrees)) {
    return Math.round(normalizedNew * 10) / 10;
  }

  const normalizedPrev = ((prevDegrees % 360) + 360) % 360;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const prevRad = toRad(normalizedPrev);
  const newRad = toRad(normalizedNew);

  const safeAlpha = Math.max(0.01, Math.min(1, alpha));
  const cosCombined = (1 - safeAlpha) * Math.cos(prevRad) + safeAlpha * Math.cos(newRad);
  const sinCombined = (1 - safeAlpha) * Math.sin(prevRad) + safeAlpha * Math.sin(newRad);

  let smoothedDeg = toDeg(Math.atan2(sinCombined, cosCombined));
  smoothedDeg = ((smoothedDeg % 360) + 360) % 360;

  return Math.round(smoothedDeg * 10) / 10;
}

/**
 * Memilih sudut heading terbaik dari data sensor.
 * Mengutamakan `trueHeading` (utara geografis sejati),
 * dan fallback ke `magHeading` jika trueHeading bernilai negatif (-1).
 */
export function resolveBestHeadingDegrees(
  headingObj: Pick<Location.LocationHeadingObject, 'trueHeading' | 'magHeading'>
): number | null {
  if (
    typeof headingObj.trueHeading === 'number' &&
    Number.isFinite(headingObj.trueHeading) &&
    headingObj.trueHeading >= 0
  ) {
    return headingObj.trueHeading;
  }
  if (
    typeof headingObj.magHeading === 'number' &&
    Number.isFinite(headingObj.magHeading) &&
    headingObj.magHeading >= 0
  ) {
    return headingObj.magHeading;
  }
  return null;
}

export type HeadingListener = (headingDegrees: number) => void;

/**
 * Memulai pemantauan sensor kompas (magnetometer / heading) perangkat
 * dengan circular smoothing untuk meredam jitter jarum.
 */
export async function startCompassHeadingWatcher(
  onHeading: HeadingListener,
  options?: { alpha?: number }
): Promise<() => void> {
  const alpha = options?.alpha ?? 0.28;
  let smoothedHeading: number | null = null;
  let isCancelled = false;

  try {
    const sub = await Location.watchHeadingAsync((headingData) => {
      if (isCancelled) return;
      const raw = resolveBestHeadingDegrees(headingData);
      if (raw == null) return;

      smoothedHeading = smoothCircularDegrees(smoothedHeading, raw, alpha);
      onHeading(smoothedHeading);
    });

    return () => {
      isCancelled = true;
      try {
        sub.remove();
      } catch {
        // Abaikan jika listener sudah dihentikan
      }
    };
  } catch (err) {
    console.warn('[Compass] watchHeadingAsync is unavailable on this device:', err);
    return () => {};
  }
}

