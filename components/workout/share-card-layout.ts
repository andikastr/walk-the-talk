export type SharePreset = 'paper' | 'dark' | 'sticker';
export type ShareAspectRatio = 'portrait' | 'story';

export interface ShareCardLayout {
  ratio: ShareAspectRatio;
  width: number;
  height: number;
  padding: number;
  hasMap: boolean;
  stageWidth: number;
  stageHeight: number;
  mapWidth: number;
  mapHeight: number;
  metricColumns: 2;
  trackColumns: 1 | 2 | 3 | 4;
  maxVisibleTracks: number;
  overflowTracks: number;
  showTrackArtist: boolean;
}

interface RatioSpec {
  unitW: number;
  unitH: number;
  baseMultiplier: number;
  padding: number;
  minStageHeight: number;
  maxTracksFourCol: number;
  /** Outer padding + header + hero distance + metric strip vertical footprint + safety buffer */
  baseChromeHeight: number;
}

const RATIO_SPECS: Record<ShareAspectRatio, RatioSpec> = {
  portrait: {
    unitW: 4,
    unitH: 5,
    baseMultiplier: 96, // 384 x 480 (exact 4:5)
    padding: 14,
    minStageHeight: 116,
    maxTracksFourCol: 24, // 4 cols x 6 rows
    baseChromeHeight: 228,
  },
  story: {
    unitW: 9,
    unitH: 16,
    baseMultiplier: 36, // 324 x 576 (exact 9:16)
    padding: 14,
    minStageHeight: 156,
    maxTracksFourCol: 32, // 4 cols x 8 rows
    baseChromeHeight: 234,
  },
};

interface SoundtrackGridPlan {
  trackColumns: 1 | 2 | 3 | 4;
  maxVisibleTracks: number;
  overflowTracks: number;
  showTrackArtist: boolean;
  trackSectionHeight: number;
}

function computeSoundtrackGridPlan(
  safeTracks: number,
  spec: RatioSpec
): SoundtrackGridPlan {
  if (safeTracks <= 0) {
    return {
      trackColumns: 1,
      maxVisibleTracks: 0,
      overflowTracks: 0,
      showTrackArtist: true,
      trackSectionHeight: 0,
    };
  }

  let trackColumns: 1 | 2 | 3 | 4;
  let maxVisibleTracks: number;
  let showTrackArtist: boolean;

  if (safeTracks <= 3) {
    trackColumns = 1;
    maxVisibleTracks = 3;
    showTrackArtist = true;
  } else if (safeTracks <= 8) {
    trackColumns = 2;
    maxVisibleTracks = 8;
    showTrackArtist = true;
  } else if (safeTracks <= 15) {
    trackColumns = 3;
    maxVisibleTracks = 15;
    showTrackArtist = false;
  } else {
    trackColumns = 4;
    maxVisibleTracks = spec.maxTracksFourCol;
    showTrackArtist = false;
  }

  const displayedCount = Math.min(safeTracks, maxVisibleTracks);
  const overflowTracks = Math.max(0, safeTracks - displayedCount);
  const trackRows = Math.ceil(displayedCount / trackColumns);

  // marginTop(6) + paddingTop(6) + header(13) + gridGap(3) + rows*(13) + rowGaps*(2) + optional overflow chip(15)
  const overflowHeight = overflowTracks > 0 ? 15 : 0;
  const trackSectionHeight =
    28 + trackRows * 13 + Math.max(0, trackRows - 1) * 2 + overflowHeight;

  return {
    trackColumns,
    maxVisibleTracks,
    overflowTracks,
    showTrackArtist,
    trackSectionHeight,
  };
}

/**
 * Computes strictly fixed 4:5 (Post) or 9:16 (Story) card dimensions across both
 * Outdoor (map) and Indoor (focus telemetry panel) sessions and 0..N soundtracks.
 */
export function computeShareCardLayout(
  ratio: ShareAspectRatio,
  trackCount: number,
  hasMap: boolean = true
): ShareCardLayout {
  const spec = RATIO_SPECS[ratio];
  const width = spec.baseMultiplier * spec.unitW;
  const height = spec.baseMultiplier * spec.unitH;
  const safeTracks = Math.max(0, Math.floor(trackCount));
  const soundtrackPlan = computeSoundtrackGridPlan(safeTracks, spec);

  const stageWidth = width - spec.padding * 2;
  const availableStageHeight =
    height - spec.baseChromeHeight - soundtrackPlan.trackSectionHeight;
  const stageHeight = Math.max(spec.minStageHeight, availableStageHeight);

  return {
    ratio,
    width,
    height,
    padding: spec.padding,
    hasMap,
    stageWidth,
    stageHeight,
    mapWidth: hasMap ? stageWidth : 0,
    mapHeight: hasMap ? stageHeight : 0,
    metricColumns: 2,
    trackColumns: soundtrackPlan.trackColumns,
    maxVisibleTracks: soundtrackPlan.maxVisibleTracks,
    overflowTracks: soundtrackPlan.overflowTracks,
    showTrackArtist: soundtrackPlan.showTrackArtist,
  };
}

