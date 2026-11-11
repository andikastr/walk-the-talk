import { describe, expect, it } from '@jest/globals';
import {
  calculateCadenceSpm,
  calculateHaversineDistance,
  calculatePaceSeconds,
  calculateSplits,
  calculateTotalDistance,
  classifyGpsAccuracy,
  estimateCalories,
  estimateStepsFromDistance,
  formatDuration,
  formatElevationMeters,
  formatPace,
  resolveMetForSpeed,
} from '@/services/location/metrics';
import { GPSCoordinate } from '@/types/workout';

describe('services/location/metrics', () => {
  it('computes Haversine distance accurately for zero and equatorial degree deltas', () => {
    expect(
      calculateHaversineDistance(
        { latitude: -6.2, longitude: 106.8 },
        { latitude: -6.2, longitude: 106.8 }
      )
    ).toBe(0);

    const oneDegLatMeters = calculateHaversineDistance(
      { latitude: 0, longitude: 100 },
      { latitude: 1, longitude: 100 }
    );
    expect(oneDegLatMeters).toBeGreaterThan(110500);
    expect(oneDegLatMeters).toBeLessThan(111800);
  });

  it('ignores segment breaks when computing total distance', () => {
    const coords: GPSCoordinate[] = [
      { latitude: -6.2, longitude: 106.8, timestamp: 1000, segmentIndex: 0 },
      { latitude: -6.201, longitude: 106.8, timestamp: 11000, segmentIndex: 0 },
      // Teleported point after pause in segment 1 must not add distance across the gap
      { latitude: -6.25, longitude: 106.85, timestamp: 60000, segmentIndex: 1 },
      { latitude: -6.251, longitude: 106.85, timestamp: 70000, segmentIndex: 1 },
    ];

    const seg0Dist = calculateHaversineDistance(coords[0], coords[1]);
    const seg1Dist = calculateHaversineDistance(coords[2], coords[3]);
    expect(calculateTotalDistance(coords)).toBeCloseTo(seg0Dist + seg1Dist, 4);
    expect(calculateTotalDistance([coords[0]])).toBe(0);
  });

  it('formats duration and pace edge cases consistently', () => {
    expect(formatDuration(65)).toBe('01:05');
    expect(formatDuration(3661)).toBe('01:01:01');

    expect(calculatePaceSeconds(9, 60)).toBe(0);
    expect(calculatePaceSeconds(1000, 0)).toBe(0);
    expect(calculatePaceSeconds(1000, 300)).toBe(300);

    expect(formatPace(0)).toBe(`--'--"`);
    expect(formatPace(3601)).toBe(`--'--"`);
    expect(formatPace(Number.POSITIVE_INFINITY)).toBe(`--'--"`);
    expect(formatPace(305)).toBe(`5'05"`);
  });

  it('interpolates MET smoothly across speed anchors', () => {
    expect(resolveMetForSpeed('walk', 3.0)).toBe(3.5);
    expect(resolveMetForSpeed('walk', 5.5)).toBe(4.3);
    expect(resolveMetForSpeed('walk', 8.0)).toBe(4.8);
    expect(resolveMetForSpeed('walk', 4.75)).toBeCloseTo(3.9, 4);

    expect(resolveMetForSpeed('jog', 8.5)).toBe(8.0);
    expect(resolveMetForSpeed('run', 12.0)).toBe(11.5);
    expect(resolveMetForSpeed('run', 16.0)).toBe(12.5);
  });

  it('estimates calories with speed sensitivity, per-split weighting, and elevation climb cost', () => {
    expect(estimateCalories('run', 0, 5000, 70)).toBe(0);
    expect(estimateCalories('run', 1800, 5000, 0)).toBe(0);

    const slowRunKcal = estimateCalories('run', 3600, 9500, 70);
    const fastRunKcal = estimateCalories('run', 3600, 13000, 70);
    expect(fastRunKcal).toBeGreaterThan(slowRunKcal);

    const flatRunKcal = estimateCalories('run', 3600, 10000, 70, {
      elevationGainMeters: 0,
    });
    const hillyRunKcal = estimateCalories('run', 3600, 10000, 70, {
      elevationGainMeters: 300,
      isIndoor: false,
    });
    const indoorElevIgnoredKcal = estimateCalories('run', 3600, 10000, 70, {
      elevationGainMeters: 300,
      isIndoor: true,
    });

    // 70 kg * 300 m * 0.01 = 210 kcal climb bonus outdoors; ignored indoors
    expect(hillyRunKcal - flatRunKcal).toBe(210);
    expect(indoorElevIgnoredKcal).toBe(flatRunKcal);

    // Variable interval splits (km 1 slow + km 2 fast + 500m cooldown)
    const splitCalories = estimateCalories('run', 750, 2500, 70, {
      splits: [
        { kmNumber: 1, durationSeconds: 360, paceSecondsPerKm: 360 },
        { kmNumber: 2, durationSeconds: 240, paceSecondsPerKm: 240 },
      ],
    });
    expect(splitCalories).toBeGreaterThan(150);
  });

  it('builds 1km splits cleanly and respects segment gaps', () => {
    const baseLat = -6.2;
    const points: GPSCoordinate[] = [];
    // ~111.2m per 0.001 deg latitude -> 11 steps = ~1.22km
    for (let i = 0; i <= 11; i++) {
      points.push({
        latitude: baseLat + i * 0.001,
        longitude: 106.8,
        timestamp: 1000 + i * 30_000,
        segmentIndex: 0,
      });
    }

    const splits = calculateSplits(points);
    expect(splits).toHaveLength(1);
    expect(splits[0].kmNumber).toBe(1);
    expect(splits[0].durationSeconds).toBe(270);
  });

  it('classifies GPS accuracy and formats step/elevation helpers', () => {
    expect(classifyGpsAccuracy(null)).toBe('acquiring');
    expect(classifyGpsAccuracy(0)).toBe('acquiring');
    expect(classifyGpsAccuracy(12)).toBe('good');
    expect(classifyGpsAccuracy(15)).toBe('good');
    expect(classifyGpsAccuracy(20)).toBe('weak');
    expect(classifyGpsAccuracy(30)).toBe('acquiring');

    expect(estimateStepsFromDistance(1000, 'walk')).toBe(1389);
    expect(estimateStepsFromDistance(1000, 'walk', 0.8)).toBe(1250);
    expect(estimateStepsFromDistance(-10, 'walk')).toBe(0);

    expect(formatElevationMeters(42.4)).toBe('42 m');
    expect(formatElevationMeters(-5)).toBe('0 m');
    expect(calculateCadenceSpm(1800, 600)).toBe(180);
    expect(calculateCadenceSpm(0, 600)).toBe(0);
  });
});

