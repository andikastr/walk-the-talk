export type SharePreset = 'paper' | 'dark' | 'sticker';
export type ShareAspectRatio = 'portrait' | 'story';

export interface ShareCardLayout {
  ratio: ShareAspectRatio;
  width: number;
  height: number | undefined;
  padding: number;
  hasMap: boolean;
  mapWidth: number;
  mapHeight: number;
  metricColumns: 2;
  trackColumns: 1 | 2;
}

interface RatioSpec {
  unitW: number;
  unitH: number;
  baseMultiplier: number;
  padding: number;
  minMapHeight: number;
  maxBaseMapHeight: number;
  /** Header + hero distance + metric strip vertical footprint + safety buffer */
  baseChromeHeight: number;
}

const RATIO_SPECS: Record<ShareAspectRatio, RatioSpec> = {
  portrait: {
    unitW: 3,
    unitH: 4,
    baseMultiplier: 104,
    padding: 16,
    minMapHeight: 120,
    maxBaseMapHeight: 176,
    baseChromeHeight: 236,
  },
  story: {
    unitW: 9,
    unitH: 16,
    baseMultiplier: 33,
    padding: 16,
    minMapHeight: 148,
    maxBaseMapHeight: 268,
    baseChromeHeight: 248,
  },
};

/**
 * Computes card dimensions preserving 3:4 (Post) or 9:16 (Story) ratio when a map canvas is shown,
 * or an auto-height compact layout when omitting the map for indoor workouts.
 */
export function computeShareCardLayout(
  ratio: ShareAspectRatio,
  trackCount: number,
  hasMap: boolean = true
): ShareCardLayout {
  const spec = RATIO_SPECS[ratio];
  const safeTracks = Math.max(0, Math.floor(trackCount));
  const trackColumns: 1 | 2 =
    safeTracks >= 2 && (ratio !== 'story' || safeTracks >= 5) ? 2 : 1;

  if (!hasMap) {
    const width = spec.baseMultiplier * spec.unitW;
    return {
      ratio,
      width,
      height: undefined,
      padding: spec.padding,
      hasMap: false,
      mapWidth: 0,
      mapHeight: 0,
      metricColumns: 2,
      trackColumns,
    };
  }

  const trackRows = safeTracks === 0 ? 0 : Math.ceil(safeTracks / trackColumns);
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
    padding: spec.padding,
    hasMap: true,
    mapWidth: width - spec.padding * 2,
    mapHeight,
    metricColumns: 2,
    trackColumns,
  };
}

