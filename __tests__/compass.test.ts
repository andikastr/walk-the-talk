import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Location from 'expo-location';
import {
  resolveBestHeadingDegrees,
  smoothCircularDegrees,
  startCompassHeadingWatcher,
} from '@/services/sensors/compass';

jest.mock('expo-location', () => ({
  watchHeadingAsync: jest.fn(),
}));

describe('services/sensors/compass', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('smoothCircularDegrees', () => {
    it('returns initial heading when prevDegrees is null or undefined', () => {
      expect(smoothCircularDegrees(null, 45)).toBe(45);
      expect(smoothCircularDegrees(undefined, 180)).toBe(180);
    });

    it('smooths normal angles progressively toward the new angle', () => {
      const smoothed = smoothCircularDegrees(100, 110, 0.5);
      // Halfway between 100 and 110 is 105
      expect(smoothed).toBeCloseTo(105, 0);
    });

    it('handles wrapping across 359° <-> 0° boundary correctly without wrapping through 180°', () => {
      // Transition from 350° to 10°: shortest path is across 0° (+20° delta)
      const smoothed = smoothCircularDegrees(350, 10, 0.5);
      // Halfway between 350° and 10° across 0° is 0° (or 360°)
      expect(smoothed === 0 || smoothed === 360).toBe(true);

      // Transition from 5° to 355°: shortest path is across 0° (-10° delta)
      const smoothedBack = smoothCircularDegrees(5, 355, 0.5);
      expect(smoothedBack === 0 || smoothedBack === 360).toBe(true);
    });

    it('normalizes out-of-bounds angles (< 0 or >= 360)', () => {
      expect(smoothCircularDegrees(null, -90)).toBe(270);
      expect(smoothCircularDegrees(null, 450)).toBe(90);
    });
  });

  describe('resolveBestHeadingDegrees', () => {
    it('prefers valid trueHeading over magHeading', () => {
      expect(
        resolveBestHeadingDegrees({ trueHeading: 124.5, magHeading: 120.2 })
      ).toBe(124.5);
    });

    it('falls back to magHeading if trueHeading is -1 or negative', () => {
      expect(
        resolveBestHeadingDegrees({ trueHeading: -1, magHeading: 88.4 })
      ).toBe(88.4);
    });

    it('returns null if neither is valid', () => {
      expect(
        resolveBestHeadingDegrees({ trueHeading: -1, magHeading: -1 })
      ).toBeNull();
    });
  });

  describe('startCompassHeadingWatcher', () => {
    it('subscribes to Location.watchHeadingAsync and invokes callback with smoothed values', async () => {
      let registeredCallback: ((heading: any) => void) | null = null;
      const removeMock = jest.fn();

      (Location.watchHeadingAsync as jest.Mock).mockImplementation(
        async (cb: any) => {
          registeredCallback = cb;
          return { remove: removeMock };
        }
      );

      const headingsReceived: number[] = [];
      const unsubscribe = await startCompassHeadingWatcher(
        (h) => headingsReceived.push(h),
        { alpha: 0.5 }
      );

      expect(Location.watchHeadingAsync).toHaveBeenCalledTimes(1);
      expect(registeredCallback).toBeDefined();

      // First sample (initial)
      registeredCallback!({ trueHeading: 90, magHeading: 88, accuracy: 3 });
      expect(headingsReceived).toHaveLength(1);
      expect(headingsReceived[0]).toBe(90);

      // Second sample (smoothed 90 -> 100 with alpha 0.5)
      registeredCallback!({ trueHeading: 100, magHeading: 98, accuracy: 3 });
      expect(headingsReceived).toHaveLength(2);
      expect(headingsReceived[1]).toBe(95);

      // Unsubscribe cleanup
      unsubscribe();
      expect(removeMock).toHaveBeenCalledTimes(1);
    });
  });
});
