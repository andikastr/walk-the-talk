import { describe, expect, it } from '@jest/globals';
import {
  computeStaticMapPlan,
  latLngToWorldNorm,
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

  it('returns null for indoor or single-point sessions without breaking', () => {
    expect(
      computeStaticMapPlan({
        routePoints: [],
        width: 280,
        height: 160,
      })
    ).toBeNull();
    expect(
      computeStaticMapPlan({
        routePoints: [sampleRoute[0]],
        width: 280,
        height: 160,
      })
    ).toBeNull();
  });

  it('keeps exact 1:1, 3:4, and 9:16 ratios even when scaling for large playlists', () => {
    for (const trackCount of [0, 1, 4, 12, 18]) {
      const sq = computeShareCardLayout('square', trackCount);
      const po = computeShareCardLayout('portrait', trackCount);
      const st = computeShareCardLayout('story', trackCount);

      expect(sq.width / sq.height).toBeCloseTo(1, 5);
      expect(po.width / po.height).toBeCloseTo(3 / 4, 5);
      expect(st.width / st.height).toBeCloseTo(9 / 16, 5);
      expect(sq.mapWidth).toBeGreaterThan(0);
      expect(sq.mapHeight).toBeGreaterThan(0);
      expect(po.mapHeight).toBeGreaterThan(0);
      expect(st.mapHeight).toBeGreaterThan(0);
    }
  });
});

