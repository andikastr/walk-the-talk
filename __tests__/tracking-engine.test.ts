import { describe, expect, it } from '@jest/globals';
import type * as Location from 'expo-location';
import {
  advanceSplitsIncremental,
  applyFallbackStepsToCheckpoint,
  applyHardwareStepsToCheckpoint,
  applyManualPause,
  applyManualResume,
  createInitialCheckpoint,
  evaluateIdleAutoPause,
  getElapsedActiveSeconds,
  processGpsLocationSample,
  reconcileTotalHardwareStepsToCheckpoint,
  resolveStrideMeters,
} from '@/services/location/tracking-engine';
import { WORKOUT_CONFIG } from '@/constants/Config';

function makeLoc(
  latitude: number,
  longitude: number,
  timestamp: number,
  overrides: Partial<Location.LocationObjectCoords> = {}
): Location.LocationObject {
  return {
    timestamp,
    coords: {
      latitude,
      longitude,
      altitude: 10,
      accuracy: 8,
      altitudeAccuracy: 5,
      heading: 0,
      speed: 2.5,
      ...overrides,
    },
  };
}

describe('services/location/tracking-engine', () => {
  it('validates stride calibration bounds with fallback defaults', () => {
    expect(resolveStrideMeters('walk')).toBe(WORKOUT_CONFIG.strideMetersByType.walk);
    expect(resolveStrideMeters('run', { run: 1.25 })).toBe(1.25);
    // Out-of-bounds calibrations are rejected
    expect(resolveStrideMeters('jog', { jog: 0.1 })).toBe(
      WORKOUT_CONFIG.strideMetersByType.jog
    );
    expect(resolveStrideMeters('run', { run: 2.5 })).toBe(
      WORKOUT_CONFIG.strideMetersByType.run
    );
  });

  it('tracks active time across manual pause and resume while incrementing segmentIndex', () => {
    const start = 100_000;
    let cp = createInitialCheckpoint({
      type: 'run',
      trackingMode: 'outdoor',
      autoPauseEnabled: true,
      weightKg: 70,
      now: start,
    });

    expect(getElapsedActiveSeconds(cp, start + 15_000)).toBe(15);

    cp = applyManualPause(cp, start + 15_000);
    expect(cp.status).toBe('paused');
    expect(cp.currentSegmentIndex).toBe(1);
    expect(getElapsedActiveSeconds(cp, start + 45_000)).toBe(15);

    cp = applyManualResume(cp, start + 45_000);
    expect(cp.status).toBe('recording');
    expect(getElapsedActiveSeconds(cp, start + 55_000)).toBe(25);
  });

  it('advances multi-kilometer splits proportionally and records elevation gain', () => {
    const update = advanceSplitsIncremental(
      [],
      500,
      150,
      4,
      1700,
      510,
      17
    );

    expect(update.splits).toHaveLength(2);
    expect(update.splits[0].kmNumber).toBe(1);
    expect(update.splits[1].kmNumber).toBe(2);
    expect(update.splits[0].durationSeconds).toBe(300);
    expect(update.splits[1].durationSeconds).toBe(300);
    expect(update.splitProgressMeters).toBeCloseTo(200, 4);
  });

  it('filters cold-start inaccuracy, null island, spikes, and micro-drift', () => {
    const start = 1_000_000;
    let cp = createInitialCheckpoint({
      type: 'run',
      trackingMode: 'outdoor',
      autoPauseEnabled: true,
      weightKg: 70,
      now: start,
    });

    // Null island rejected
    expect(
      processGpsLocationSample(cp, makeLoc(0, 0, start + 1000), {
        allowFallbackSteps: true,
      }).acceptedPoint
    ).toBe(false);

    // Cold start (< 10s) rejects accuracy > 20m
    expect(
      processGpsLocationSample(
        cp,
        makeLoc(-6.2, 106.8, start + 2000, { accuracy: 22 }),
        { allowFallbackSteps: true }
      ).acceptedPoint
    ).toBe(false);

    // After 10s, accuracy 22m <= gpsMaxAccuracyMeters (25m) is accepted
    const anchorRes = processGpsLocationSample(
      cp,
      makeLoc(-6.2, 106.8, start + 12_000, { accuracy: 22, altitude: 10 }),
      { allowFallbackSteps: true }
    );
    expect(anchorRes.acceptedPoint).toBe(true);
    cp = anchorRes.checkpoint;

    // Micro-drift (< 3m) rejected
    const driftRes = processGpsLocationSample(
      cp,
      makeLoc(-6.200005, 106.8, start + 15_000, { accuracy: 8 }),
      { allowFallbackSteps: true }
    );
    expect(driftRes.acceptedPoint).toBe(false);

    // Implausible spike (> 12 m/s over 2s) rejected
    const spikeRes = processGpsLocationSample(
      cp,
      makeLoc(-6.205, 106.8, start + 14_000, { accuracy: 8 }),
      { allowFallbackSteps: true }
    );
    expect(spikeRes.acceptedPoint).toBe(false);

    // Valid ~55.6m move over 10s with altitude rise accepted
    const validRes = processGpsLocationSample(
      cp,
      makeLoc(-6.2005, 106.8, start + 22_000, {
        accuracy: 8,
        altitude: 30,
        speed: 5.5,
      }),
      { allowFallbackSteps: true }
    );
    expect(validRes.acceptedPoint).toBe(true);
    expect(validRes.checkpoint.distanceMeters).toBeGreaterThan(50);
    expect(validRes.checkpoint.elevationGainMeters).toBeGreaterThan(0);
    expect(validRes.checkpoint.routePoints).toHaveLength(2);
  });

  it('auto-pauses on idle threshold and auto-resumes on movement or hardware steps', () => {
    const start = 2_000_000;
    let cp = createInitialCheckpoint({
      type: 'walk',
      trackingMode: 'outdoor',
      autoPauseEnabled: true,
      weightKg: 65,
      now: start,
    });

    // Anchor point
    cp = processGpsLocationSample(
      cp,
      makeLoc(-6.2, 106.8, start + 1000, { accuracy: 8 }),
      { allowFallbackSteps: true }
    ).checkpoint;

    // Idle too short -> no auto-pause
    expect(evaluateIdleAutoPause(cp, start + 5000)).toBeNull();

    // Idle >= autoPauseIdleMs -> auto-pause triggered
    const pausedCp = evaluateIdleAutoPause(
      cp,
      start + 1000 + WORKOUT_CONFIG.autoPauseIdleMs
    );
    expect(pausedCp).not.toBeNull();
    expect(pausedCp!.isAutoPaused).toBe(true);
    expect(pausedCp!.currentSegmentIndex).toBe(1);

    // Sub-threshold step delta does not auto-resume
    const subStepRes = applyHardwareStepsToCheckpoint(
      pausedCp!,
      WORKOUT_CONFIG.autoResumeMinSteps - 1,
      start + 12_000
    );
    expect(subStepRes.didAutoResume).toBe(false);
    expect(subStepRes.checkpoint.isAutoPaused).toBe(true);

    // Hardware steps >= autoResumeMinSteps auto-resumes
    const stepResumeRes = applyHardwareStepsToCheckpoint(
      pausedCp!,
      WORKOUT_CONFIG.autoResumeMinSteps,
      start + 13_000
    );
    expect(stepResumeRes.didAutoResume).toBe(true);
    expect(stepResumeRes.checkpoint.isAutoPaused).toBe(false);
    expect(stepResumeRes.checkpoint.steps).toBe(WORKOUT_CONFIG.autoResumeMinSteps);
  });

  it('reconciles background fallback steps without double counting and updates indoor distance', () => {
    const start = 3_000_000;
    let outdoorCp = createInitialCheckpoint({
      type: 'walk',
      trackingMode: 'outdoor',
      autoPauseEnabled: false,
      weightKg: 65,
      now: start,
    });

    // Force 72m fallback (~100 steps at 0.72m stride)
    outdoorCp = applyFallbackStepsToCheckpoint(
      outdoorCp,
      72,
      start + 20_000,
      undefined,
      true
    );
    expect(outdoorCp.steps).toBe(100);
    expect(outdoorCp.fallbackBgStepsAdded).toBe(100);

    // Reconcile 120 hardware steps reported for the same background span -> only +20 net steps
    const reconciled = applyHardwareStepsToCheckpoint(
      outdoorCp,
      120,
      start + 21_000,
      undefined,
      { isBackgroundReconcile: true }
    );
    expect(reconciled.checkpoint.steps).toBe(120);
    expect(reconciled.checkpoint.fallbackBgStepsAdded).toBe(0);
    expect(reconciled.checkpoint.calibHwSteps).toBe(0);

    // Indoor mode uses calibrated stride for distance and ignores fallback
    let indoorCp = createInitialCheckpoint({
      type: 'run',
      trackingMode: 'indoor',
      autoPauseEnabled: true,
      weightKg: 70,
      now: start,
    });
    const indoorAfter = applyHardwareStepsToCheckpoint(
      indoorCp,
      100,
      start + 30_000,
      { run: 1.2 }
    );
    expect(indoorAfter.checkpoint.steps).toBe(100);
    expect(indoorAfter.checkpoint.distanceMeters).toBeCloseTo(120, 4);
    expect(
      applyFallbackStepsToCheckpoint(indoorAfter.checkpoint, 500, start + 40_000, undefined, true)
    ).toBe(indoorAfter.checkpoint);
  });

  it('reconciles cumulative native total steps idempotently, advances indoor splits, and prevents false auto-pause on resume', () => {
    const start = 4_000_000;
    let indoorCp = createInitialCheckpoint({
      type: 'run',
      trackingMode: 'indoor',
      autoPauseEnabled: true,
      weightKg: 70,
      now: start,
    });

    // User walked 1,000 steps in background up until 2s before unlocking screen at t = +300s
    const resumeNow = start + 300_000;
    const lastStepAt = resumeNow - 2_000;
    const rec1 = reconcileTotalHardwareStepsToCheckpoint(
      indoorCp,
      1000,
      resumeNow,
      { run: 1.1 },
      { isBackgroundReconcile: true, stepTimestampMs: lastStepAt }
    );
    expect(rec1.appliedStepDelta).toBe(1000);
    expect(rec1.checkpoint.steps).toBe(1000);
    expect(rec1.checkpoint.lastSyncedNativeSteps).toBe(1000);
    expect(rec1.checkpoint.distanceMeters).toBeCloseTo(1100, 4);
    expect(rec1.checkpoint.splits).toHaveLength(1);
    expect(rec1.checkpoint.splits[0].kmNumber).toBe(1);

    // Since native stepTimestampMs was 2s ago (< autoPauseIdleMs), immediate idle check must NOT auto-pause
    expect(evaluateIdleAutoPause(rec1.checkpoint, resumeNow)).toBeNull();

    // Duplicate delivery of same cumulative totalSteps=1000 must be a no-op
    const recDup = reconcileTotalHardwareStepsToCheckpoint(
      rec1.checkpoint,
      1000,
      resumeNow + 500,
      { run: 1.1 }
    );
    expect(recDup.appliedStepDelta).toBe(0);
    expect(recDup.checkpoint).toBe(rec1.checkpoint);

    // Auto-pause, then accumulate native steps one-by-one until autoResumeMinSteps
    const autoPaused = evaluateIdleAutoPause(
      rec1.checkpoint,
      lastStepAt + WORKOUT_CONFIG.autoPauseIdleMs
    );
    expect(autoPaused).not.toBeNull();
    expect(autoPaused!.isAutoPaused).toBe(true);

    // Sub-threshold total (1000 -> 1002) leaves lastSyncedNativeSteps at 1000 so steps buffer
    const subTotal = reconcileTotalHardwareStepsToCheckpoint(
      autoPaused!,
      1002,
      lastStepAt + WORKOUT_CONFIG.autoPauseIdleMs + 2000,
      { run: 1.1 }
    );
    expect(subTotal.appliedStepDelta).toBe(0);
    expect(subTotal.didAutoResume).toBe(false);
    expect(subTotal.checkpoint.lastSyncedNativeSteps).toBe(1000);

    // Crossing threshold (1000 -> 1000 + autoResumeMinSteps) auto-resumes and applies all steps
    const resumeTotal = 1000 + WORKOUT_CONFIG.autoResumeMinSteps;
    const resumed = reconcileTotalHardwareStepsToCheckpoint(
      subTotal.checkpoint,
      resumeTotal,
      lastStepAt + WORKOUT_CONFIG.autoPauseIdleMs + 4000,
      { run: 1.1 }
    );
    expect(resumed.didAutoResume).toBe(true);
    expect(resumed.checkpoint.isAutoPaused).toBe(false);
    expect(resumed.checkpoint.steps).toBe(resumeTotal);
    expect(resumed.checkpoint.lastSyncedNativeSteps).toBe(resumeTotal);
  });

  it('replaces outdoor background fallback steps cleanly via cumulative native snapshot reconciliation', () => {
    const start = 5_000_000;
    let outdoorCp = createInitialCheckpoint({
      type: 'walk',
      trackingMode: 'outdoor',
      autoPauseEnabled: false,
      weightKg: 65,
      now: start,
    });

    // GPS background task added 100 fallback steps for 72m while screen was off
    outdoorCp = applyFallbackStepsToCheckpoint(
      outdoorCp,
      72,
      start + 40_000,
      undefined,
      true
    );
    expect(outdoorCp.steps).toBe(100);
    expect(outdoorCp.fallbackBgStepsAdded).toBe(100);

    // Native background pedometer counted 130 cumulative session steps -> swap 100 fallback, add +30 net
    const rec = reconcileTotalHardwareStepsToCheckpoint(
      outdoorCp,
      130,
      start + 45_000,
      undefined,
      { isBackgroundReconcile: true, stepTimestampMs: start + 44_000 }
    );
    expect(rec.appliedStepDelta).toBe(130);
    expect(rec.checkpoint.steps).toBe(130);
    expect(rec.checkpoint.fallbackBgStepsAdded).toBe(0);
    expect(rec.checkpoint.lastSyncedNativeSteps).toBe(130);
  });
});

