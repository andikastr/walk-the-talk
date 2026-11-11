import { describe, expect, it } from '@jest/globals';
import {
  simplifyRouteForSilhouette,
  simplifySegmentDouglasPeucker,
  splitCoordinatesBySegment,
} from '@/services/location/route-simplify';
import { GPSCoordinate } from '@/types/workout';

function pt(
  latitude: number,
  longitude: number,
  segmentIndex: number = 0,
  timestamp: number = 1000
): GPSCoordinate {
  return { latitude, longitude, segmentIndex, timestamp };
}

describe('services/location/route-simplify', () => {
  it('splits coordinates strictly along segmentIndex transitions', () => {
    expect(splitCoordinatesBySegment([])).toEqual([]);

    const points = [
      pt(-6.2, 106.8, 0, 1000),
      pt(-6.201, 106.8, 0, 2000),
      pt(-6.205, 106.805, 1, 3000),
      pt(-6.206, 106.805, 1, 4000),
      pt(-6.207, 106.806, 0, 5000),
    ];

    const segments = splitCoordinatesBySegment(points);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toHaveLength(2);
    expect(segments[1]).toHaveLength(2);
    expect(segments[2]).toHaveLength(1);
  });

  it('collapses collinear points while retaining sharp corners in Douglas-Peucker', () => {
    const straightLine = Array.from({ length: 10 }, (_, idx) =>
      pt(-6.2 + idx * 0.001, 106.8)
    );
    const simplifiedLine = simplifySegmentDouglasPeucker(straightLine, 0.0001, 1);
    expect(simplifiedLine).toHaveLength(2);
    expect(simplifiedLine[0]).toBe(straightLine[0]);
    expect(simplifiedLine[1]).toBe(straightLine[9]);

    const sharpCorner = [
      pt(0, 0),
      pt(0, 0.005),
      pt(0, 0.01), // 90-degree corner
      pt(0.005, 0.01),
      pt(0.01, 0.01),
    ];
    const simplifiedCorner = simplifySegmentDouglasPeucker(sharpCorner, 0.001, 1);
    expect(simplifiedCorner).toHaveLength(3);
    expect(simplifiedCorner[1]).toBe(sharpCorner[2]);
  });

  it('budgets large multi-segment routes under maxPoints and handles zero-span coordinates', () => {
    // Pass under budget untouched
    const smallRoute = [pt(-6.2, 106.8, 0), pt(-6.21, 106.81, 0)];
    expect(simplifyRouteForSilhouette(smallRoute, 350)).toEqual([smallRoute]);

    // 900 points across two segments with turns
    const largeRoute: GPSCoordinate[] = [];
    for (let i = 0; i < 450; i++) {
      largeRoute.push(
        pt(-6.2 + i * 0.0001, 106.8 + Math.sin(i / 25) * 0.002, 0, 1000 + i * 1000)
      );
    }
    for (let i = 0; i < 450; i++) {
      largeRoute.push(
        pt(-6.15 + i * 0.0001, 106.82 + Math.cos(i / 20) * 0.002, 1, 500_000 + i * 1000)
      );
    }

    const simplified = simplifyRouteForSilhouette(largeRoute, 120);
    expect(simplified).toHaveLength(2);
    const totalOut = simplified.reduce((acc, seg) => acc + seg.length, 0);
    expect(totalOut).toBeLessThanOrEqual(120);
    expect(totalOut).toBeGreaterThanOrEqual(4);
    expect(simplified[0][0]).toBe(largeRoute[0]);
    expect(simplified[0][simplified[0].length - 1]).toBe(largeRoute[449]);
    expect(simplified[1][0]).toBe(largeRoute[450]);
    expect(simplified[1][simplified[1].length - 1]).toBe(largeRoute[899]);

    // Stationary identical coordinates over budget collapse cleanly without NaN
    const stationary = Array.from({ length: 400 }, (_, i) =>
      pt(-6.2, 106.8, 0, 1000 + i * 1000)
    );
    const collapsed = simplifyRouteForSilhouette(stationary, 50);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]).toHaveLength(2);
  });
});

