export type SharePreset = 'paper' | 'dark' | 'sticker';
export type ShareAspectRatio = 'square' | 'portrait' | 'story';

export interface ShareCardLayout {
  ratio: ShareAspectRatio;
  width: number;
  height: number;
  padding: number;
  mapWidth: number;
  mapHeight: number;
  metricColumns: 2 | 4;
  trackColumns: 1 | 2;
  compactTitle: boolean;
}

interface RatioSpec {
  unitW: number;
  unitH: number;
  baseMultiplier: number;
  padding: number;
  minMapHeight: number;
  maxBaseMapHeight: number;
  metricColumns: 2 | 4;
  compactTitle: boolean;
  /** Header + hero distance + metric strip vertical footprint + safety buffer */
  baseChromeHeight: number;
}

const RATIO_SPECS: Record<ShareAspectRatio, RatioSpec> = {
  square: {
    unitW: 1,
    unitH: 1,
    baseMultiplier: 308,
    padding: 14,
    minMapHeight: 92,
    maxBaseMapHeight: 150,
    metricColumns: 4,
    compactTitle: true,
    baseChromeHeight: 158,
  },
  portrait: {
    unitW: 3,
    unitH: 4,
    baseMultiplier: 104,
    padding: 16,
    minMapHeight: 120,
    maxBaseMapHeight: 176,
    metricColumns: 2,
    compactTitle: false,
    baseChromeHeight: 236,
  },
  story: {
    unitW: 9,
    unitH: 16,
    baseMultiplier: 33,
    padding: 16,
    minMapHeight: 148,
    maxBaseMapHeight: 268,
    metricColumns: 2,
    compactTitle: false,
    baseChromeHeight: 248,
  },
};

/**
 * Computes exact integer canvas dimensions preserving 1:1, 3:4, or 9:16 ratio while
 * ensuring all workout soundtracks fit cleanly without clipping.
 */
export function computeShareCardLayout(
  ratio: ShareAspectRatio,
  trackCount: number
): ShareCardLayout {
  const spec = RATIO_SPECS[ratio];
  const safeTracks = Math.max(0, Math.floor(trackCount));
  const trackColumns: 1 | 2 =
    safeTracks >= 2 && (ratio !== 'story' || safeTracks >= 5) ? 2 : 1;
  const trackRows = safeTracks === 0 ? 0 : Math.ceil(safeTracks / trackColumns);

  const padding = ratio === 'square' && safeTracks >= 5 ? 12 : spec.padding;
  const trackSectionHeight =
    safeTracks === 0
      ? 0
      : 12 + 16 + trackRows * 24 + Math.max(0, trackRows - 1) * 4;

  const requiredMinHeight =
    spec.baseChromeHeight + spec.minMapHeight + trackSectionHeight;

  let multiplier = spec.baseMultiplier;
  while (multiplier * spec.unitH < requiredMinHeight) {
    multiplier += 1;
  }

  const width = multiplier * spec.unitW;
  const height = multiplier * spec.unitH;
  const availableForMap = height - spec.baseChromeHeight - trackSectionHeight;
  const mapHeight = Math.max(
    spec.minMapHeight,
    Math.min(
      Math.max(spec.maxBaseMapHeight, Math.round(height * 0.44)),
      availableForMap
    )
  );

  return {
    ratio,
    width,
    height,
    padding,
    mapWidth: width - padding * 2,
    mapHeight,
    metricColumns: spec.metricColumns,
    trackColumns,
    compactTitle: spec.compactTitle,
  };
}

