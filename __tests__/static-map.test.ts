import { describe, expect, it } from '@jest/globals';
import {
  buildOsmTileUrl,
  computeStaticMapPlan,
  latLngToWorldNorm,
  STATIC_MAP_SINGLE_POINT_ZOOM,
  STATIC_MAP_TILE_SIZE,
} from '@/services/location/static-map';
import { computeShareCardLayout } from '@/components/workout/share-card-layout';
import { GPSCoordinate } from '@/types/workout';

function makePoint(lat: number, lng: number, ts: number): GPSCoordinate {
  return {
    latitude: lat,
    longitude: lng,
    altitude: 10,
    accuracy: 6,
    speed: 3,
    timestamp: ts,
    segmentIndex: 0,
  };
}

describe('services/location/static-map & share-card-layout', () => {
  const sampleRoute: GPSCoordinate[] = [
    makePoint(-6.2185, 106.8018, 1_000),
    makePoint(-6.2168, 106.8042, 20_000),
    makePoint(-6.2149, 106.8065, 40_000),
    makePoint(-6.2162, 106.8081, 60_000),
  ];

  it('builds Slippy map tiles and projects all route points within viewport bounds', () => {
    const plan = computeStaticMapPlan({
      routePoints: sampleRoute,
      width: 280,
      height: 180,
      padding: 18,
      theme: 'light',
      cartoApiKey: '',
    });

    expect(plan).not.toBeNull();
    expect(plan!.zoom).toBeGreaterThanOrEqual(12);
    expect(plan!.zoom).toBeLessThanOrEqual(17);
    expect(plan!.tiles.length).toBeGreaterThanOrEqual(2);
    expect(plan!.usesCarto).toBe(false);
    expect(plan!.attribution).toBe('© OpenStreetMap');
    expect(plan!.tiles[0].url).toContain('https://tile.openstreetmap.org/');

    // Tiles cover the viewport [0, width] x [0, height]
    const minLeft = Math.min(...plan!.tiles.map((t) => t.left));
    const maxRight = Math.max(...plan!.tiles.map((t) => t.left + STATIC_MAP_TILE_SIZE));
    const minTop = Math.min(...plan!.tiles.map((t) => t.top));
    const maxBottom = Math.max(...plan!.tiles.map((t) => t.top + STATIC_MAP_TILE_SIZE));
    expect(minLeft).toBeLessThanOrEqual(0);
    expect(maxRight).toBeGreaterThanOrEqual(280);
    expect(minTop).toBeLessThanOrEqual(0);
    expect(maxBottom).toBeGreaterThanOrEqual(180);

    // Every projected GPS point remains comfortably inside the viewport
    for (const pt of plan!.segments.flat()) {
      expect(pt.x).toBeGreaterThan(0);
      expect(pt.x).toBeLessThan(280);
      expect(pt.y).toBeGreaterThan(0);
      expect(pt.y).toBeLessThan(180);
    }

    // Center world projection invariants at (0, 0)
    expect(latLngToWorldNorm(0, 0)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('switches cleanly to Carto dark tiles when Carto API key is provided', () => {
    const plan = computeStaticMapPlan({
      routePoints: sampleRoute,
      width: 265,
      height: 220,
      theme: 'dark',
      cartoApiKey: 'test_carto_key',
    });

    expect(plan).not.toBeNull();
    expect(plan!.usesCarto).toBe(true);
    expect(plan!.attribution).toBe('© OpenStreetMap · © CARTO');
    expect(plan!.tiles[0].url).toContain('/dark_all/');
    expect(plan!.tiles[0].url).toContain('key=test_carto_key');
  });

  it('returns null when no points exist, and renders a centered zoom-16 basemap for a single GPS point', () => {
    expect(
      computeStaticMapPlan({
        routePoints: [],
        width: 280,
        height: 160,
      })
    ).toBeNull();

    const singlePlan = computeStaticMapPlan({
      routePoints: [sampleRoute[0]],
      width: 280,
      height: 160,
      cartoApiKey: 'test_carto_key',
    });

    expect(singlePlan).not.toBeNull();
    expect(singlePlan!.isSinglePoint).toBe(true);
    expect(singlePlan!.zoom).toBe(STATIC_MAP_SINGLE_POINT_ZOOM);
    expect(singlePlan!.segments).toEqual([]);
    expect(singlePlan!.startPoint).toEqual({ x: 140, y: 80 });
    expect(singlePlan!.endPoint).toBeNull();
    expect(singlePlan!.tiles.length).toBeGreaterThanOrEqual(2);
    expect(buildOsmTileUrl(16, 123, 456)).toBe(
      'https://tile.openstreetmap.org/16/123/456.png'
    );
  });

  it('locks strictly to 4:5 (Post) and 9:16 (Story) across Outdoor, Indoor, and 0..40 soundtracks', () => {
    for (const hasMap of [true, false]) {
      for (const trackCount of [0, 1, 3, 4, 8, 9, 15, 16, 24, 32, 40]) {
        const po = computeShareCardLayout('portrait', trackCount, hasMap);
        const st = computeShareCardLayout('story', trackCount, hasMap);

        expect(po.width / po.height).toBeCloseTo(4 / 5, 5);
        expect(st.width / st.height).toBeCloseTo(9 / 16, 5);
        expect(po.width).toBe(384);
        expect(po.height).toBe(480);
        expect(st.width).toBe(324);
        expect(st.height).toBe(576);
        expect(po.stageWidth).toBeGreaterThan(0);
        expect(po.stageHeight).toBeGreaterThan(0);
        expect(st.stageHeight).toBeGreaterThan(0);

        if (hasMap) {
          expect(po.mapWidth).toBe(po.stageWidth);
          expect(po.mapHeight).toBe(po.stageHeight);
        } else {
          expect(po.mapWidth).toBe(0);
          expect(po.mapHeight).toBe(0);
        }
      }
    }
  });

  it('uses adaptive 1->2->3->4 soundtrack columns with overflow capping', () => {
    expect(computeShareCardLayout('portrait', 0)).toMatchObject({
      trackColumns: 1,
      maxVisibleTracks: 0,
      overflowTracks: 0,
    });
    expect(computeShareCardLayout('portrait', 3)).toMatchObject({
      trackColumns: 1,
      maxVisibleTracks: 3,
      overflowTracks: 0,
      showTrackArtist: true,
    });
    expect(computeShareCardLayout('portrait', 8)).toMatchObject({
      trackColumns: 2,
      maxVisibleTracks: 8,
      overflowTracks: 0,
      showTrackArtist: true,
    });
    expect(computeShareCardLayout('portrait', 15)).toMatchObject({
      trackColumns: 3,
      maxVisibleTracks: 15,
      overflowTracks: 0,
      showTrackArtist: false,
    });
    expect(computeShareCardLayout('portrait', 40)).toMatchObject({
      trackColumns: 4,
      maxVisibleTracks: 24,
      overflowTracks: 16,
      showTrackArtist: false,
    });
    expect(computeShareCardLayout('story', 40)).toMatchObject({
      trackColumns: 4,
      maxVisibleTracks: 32,
      overflowTracks: 8,
      showTrackArtist: false,
    });
  });
});

