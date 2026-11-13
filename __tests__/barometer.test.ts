import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Barometer } from 'expo-sensors';
import {
  calculateFloorsClimbed,
  isBarometerAvailableAsync,
  pressureToRelativeAltitudeMeters,
  startBarometerWatcher,
} from '@/services/sensors/barometer';

jest.mock('expo-sensors', () => ({
  Barometer: {
    isAvailableAsync: jest.fn(),
    setUpdateInterval: jest.fn(),
    addListener: jest.fn(),
  },
}));

describe('services/sensors/barometer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isBarometerAvailableAsync', () => {
    it('returns true when hardware supports barometer', async () => {
      (Barometer.isAvailableAsync as jest.Mock).mockResolvedValue(true as never);
      await expect(isBarometerAvailableAsync()).resolves.toBe(true);
    });

    it('returns false when barometer is unsupported or throws', async () => {
      (Barometer.isAvailableAsync as jest.Mock).mockResolvedValue(false as never);
      await expect(isBarometerAvailableAsync()).resolves.toBe(false);

      (Barometer.isAvailableAsync as jest.Mock).mockRejectedValue(
        new Error('Hardware missing') as never
      );
      await expect(isBarometerAvailableAsync()).resolves.toBe(false);
    });
  });

  describe('pressureToRelativeAltitudeMeters', () => {
    it('returns 0 when pressure is identical to baseline', () => {
      expect(pressureToRelativeAltitudeMeters(1013.25, 1013.25)).toBe(0);
    });

    it('calculates positive altitude when air pressure decreases (climbing up)', () => {
      // Sea level 1013.25 hPa climbing up to ~1001.25 hPa (~100m rise)
      const altitude = pressureToRelativeAltitudeMeters(1001.25, 1013.25);
      expect(altitude).toBeGreaterThan(90);
      expect(altitude).toBeLessThan(110);
    });

    it('calculates negative altitude when air pressure increases (moving down)', () => {
      const altitude = pressureToRelativeAltitudeMeters(1020, 1013.25);
      expect(altitude).toBeLessThan(0);
    });

    it('safely handles non-finite or non-positive pressure', () => {
      expect(pressureToRelativeAltitudeMeters(0, 1013.25)).toBe(0);
      expect(pressureToRelativeAltitudeMeters(-100, 1013.25)).toBe(0);
      expect(pressureToRelativeAltitudeMeters(NaN, 1013.25)).toBe(0);
    });
  });

  describe('calculateFloorsClimbed', () => {
    it('returns 0 for elevation gain under 3 meters', () => {
      expect(calculateFloorsClimbed(0)).toBe(0);
      expect(calculateFloorsClimbed(2.9)).toBe(0);
    });

    it('returns exact floors for multiples of 3 meters', () => {
      expect(calculateFloorsClimbed(3.0)).toBe(1);
      expect(calculateFloorsClimbed(6.1)).toBe(2);
      expect(calculateFloorsClimbed(15.5)).toBe(5);
    });
  });

  describe('startBarometerWatcher', () => {
    it('gracefully exits with no-op unsubscribe if barometer is unavailable', async () => {
      (Barometer.isAvailableAsync as jest.Mock).mockResolvedValue(false as never);

      const listener = jest.fn();
      const unsub = await startBarometerWatcher(listener as any);

      expect(typeof unsub).toBe('function');
      expect(Barometer.addListener).not.toHaveBeenCalled();
      unsub();
    });

    it('subscribes and processes measurements with relative altitude and floor counts', async () => {
      (Barometer.isAvailableAsync as jest.Mock).mockResolvedValue(true as never);
      let registeredListener: ((data: any) => void) | null = null;
      const removeMock = jest.fn();

      (Barometer.addListener as jest.Mock).mockImplementation((cb: any) => {
        registeredListener = cb;
        return { remove: removeMock };
      });

      const samples: any[] = [];
      const unsub = await startBarometerWatcher((s) => samples.push(s));

      expect(Barometer.addListener).toHaveBeenCalledTimes(1);
      expect(registeredListener).toBeDefined();

      // First sample (baseline pressure)
      registeredListener!({ pressure: 1010, timestamp: 1000 });
      expect(samples).toHaveLength(1);
      expect(samples[0].relativeAltitudeMeters).toBe(0);
      expect(samples[0].floorsClimbed).toBe(0);

      // Second sample: climbed 6.5 meters (iOS relativeAltitude provided)
      registeredListener!({ pressure: 1009.2, relativeAltitude: 6.5, timestamp: 2000 });
      expect(samples).toHaveLength(2);
      expect(samples[1].relativeAltitudeMeters).toBe(6.5);
      expect(samples[1].addedGainMeters).toBe(6.5);
      expect(samples[1].floorsClimbed).toBe(2); // 6.5 / 3 = 2 floors

      unsub();
      expect(removeMock).toHaveBeenCalledTimes(1);
    });
  });
});

