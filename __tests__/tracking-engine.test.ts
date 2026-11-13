import { describe, expect, it } from '@jest/globals';
import type * as Location from 'expo-location';
import {
  advanceSplitsIncremental,
  applyBarometricMeasurementToCheckpoint,
  applyFallbackStepsToCheckpoint,
  applyHardwareStepsToCheckpoint,
  applyManualPause,
  applyManualResume,
  applyStationaryPaceDecay,
  classifyCadenceBand,
  classifyMotionActivity,
  computeFusedPaceSeconds,
  createInitialCheckpoint,
  evaluateIdleAutoPause,
  getElapsedActiveSeconds,
  processGpsLocationSample,
  reconcileTotalHardwareStepsToCheckpoint,
  resolveStrideMeters,
} from '@/services/location/tracking-engine';
import { calculateHaversineDistance } from '@/services/location/metrics';
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

  it('rejects red-light stationary GPS drift when pedometer confirms zero steps', () => {
    const start = 6_000_000;
    let cp = createInitialCheckpoint({
      type: 'walk',
      trackingMode: 'outdoor',
      autoPauseEnabled: true,
      weightKg: 65,
      now: start,
    });

    // Anchor GPS + record active steps at t+1s
    cp = processGpsLocationSample(
      cp,
      makeLoc(-6.2, 106.8, start + 1000, { accuracy: 8, speed: 1.4 }),
      { allowFallbackSteps: false, pedometerActive: true }
    ).checkpoint;
    cp = applyHardwareStepsToCheckpoint(cp, 6, start + 1000).checkpoint;
    expect(cp.lastHardwareStepAt).toBe(start + 1000);

    // Stop at red light (0 steps). After 6s (>= 5s grace), noisy GPS drifts ~6.1m
    const driftRes = processGpsLocationSample(
      cp,
      makeLoc(-6.200055, 106.8, start + 7000, { accuracy: 8, speed: 1.4 }),
      { allowFallbackSteps: false, pedometerActive: true }
    );
    expect(driftRes.acceptedPoint).toBe(false);
    expect(driftRes.checkpoint.distanceMeters).toBe(0);
    expect(driftRes.checkpoint.lastMovementOrStepAt).toBe(start + 1000);
    expect(driftRes.checkpoint.smoothedCurrentPaceSeconds).toBe(0);

    // At 8s idle, even noisy GPS jitter triggers Auto-Pause because steps stayed silent
    const pauseRes = processGpsLocationSample(
      driftRes.checkpoint,
      makeLoc(-6.20006, 106.8, start + 9000, { accuracy: 8, speed: 1.5 }),
      { allowFallbackSteps: false, pedometerActive: true }
    );
    expect(pauseRes.acceptedPoint).toBe(false);
    expect(pauseRes.didAutoPause).toBe(true);
    expect(pauseRes.checkpoint.isAutoPaused).toBe(true);

    // Non-stepping bypass: >= 22m high-accuracy move (e.g. push-stroller) still escapes gate
    const bypassRes = processGpsLocationSample(
      driftRes.checkpoint,
      makeLoc(-6.20023, 106.8, start + 7500, { accuracy: 8, speed: 3.2 }),
      { allowFallbackSteps: false, pedometerActive: true }
    );
    expect(bypassRes.acceptedPoint).toBe(true);
    expect(bypassRes.checkpoint.distanceMeters).toBeGreaterThan(22);
  });

  it('scales minimum movement floor by GPS accuracy and guards against step-implausible teleports', () => {
    const start = 7_000_000;
    let cp = createInitialCheckpoint({
      type: 'run',
      trackingMode: 'outdoor',
      autoPauseEnabled: true,
      weightKg: 68,
      now: start,
    });

    // Anchor at start + 1s + 10 steps
    cp = applyHardwareStepsToCheckpoint(cp, 10, start + 1000).checkpoint;
    cp = processGpsLocationSample(
      cp,
      makeLoc(-6.2, 106.8, start + 1000, { accuracy: 8, speed: 3.0 }),
      { allowFallbackSteps: false, pedometerActive: true }
    ).checkpoint;
    expect(cp.stepsAtLastAcceptedGps).toBe(10);

    // Accuracy 20m -> dynamic floor = 20 * 0.45 = 9m -> ~6.5m zig-zag noise rejected
    const weakZigZag = processGpsLocationSample(
      cp,
      makeLoc(-6.200058, 106.8, start + 3000, { accuracy: 20, speed: 2.5 }),
      { allowFallbackSteps: true, pedometerActive: false }
    );
    expect(weakZigZag.acceptedPoint).toBe(false);

    // Only +4 steps occurred (10 -> 14; max step bound = max(15, 4*2.25) = 15m),
    // yet GPS jumps ~50m over 5s (10 m/s passes pure speed cap <12 m/s, fails step guard)
    const cpWith4Steps = applyHardwareStepsToCheckpoint(cp, 4, start + 4500).checkpoint;
    const teleportPoint = makeLoc(-6.20045, 106.8, start + 6000, { accuracy: 8, speed: 9.5 });
    const rejectedTeleport = processGpsLocationSample(cpWith4Steps, teleportPoint, {
      allowFallbackSteps: false,
      pedometerActive: true,
    });
    expect(rejectedTeleport.acceptedPoint).toBe(false);
    expect(rejectedTeleport.checkpoint.distanceMeters).toBe(0);

    // Without pedometer active, speed is plausible and GPS passes baseline
    const fallbackAccepted = processGpsLocationSample(cp, teleportPoint, {
      allowFallbackSteps: true,
      pedometerActive: false,
    });
    expect(fallbackAccepted.acceptedPoint).toBe(true);
  });

  it('bridges tunnel GPS blackouts via pedometer steps and reconciles exit GPS without double counting', () => {
    const start = 8_000_000;
    let cp = createInitialCheckpoint({
      type: 'run',
      trackingMode: 'outdoor',
      autoPauseEnabled: true,
      weightKg: 70,
      now: start,
    });

    const p0 = makeLoc(-6.2, 106.8, start + 1000, { accuracy: 6, speed: 2.6 });
    cp = processGpsLocationSample(cp, p0, {
      allowFallbackSteps: false,
      pedometerActive: true,
      calibratedStrides: { run: 1.05 },
    }).checkpoint;

    // Runner enters tunnel: no GPS fixes for > 6s; hardware pedometer delivers 20 steps (21m)
    cp = applyHardwareStepsToCheckpoint(cp, 10, start + 7500, { run: 1.05 }).checkpoint;
    cp = applyHardwareStepsToCheckpoint(cp, 10, start + 9500, { run: 1.05 }).checkpoint;

    expect(cp.bridgedMetersSinceLastGps).toBeCloseTo(21, 3);
    expect(cp.distanceMeters).toBeCloseTo(21, 3);
    expect(cp.smoothedCurrentPaceSeconds).toBeGreaterThan(0);
    // Calibration step counter must NOT advance while bridging without GPS
    expect(cp.calibHwSteps).toBe(0);

    // Runner exits tunnel at t+11s with a ~25m straight chord from p0
    const pExit = makeLoc(-6.200225, 106.8, start + 11_000, { accuracy: 8, speed: 2.8 });
    const expectedChord = calculateHaversineDistance(p0.coords, pExit.coords);
    const exitRes = processGpsLocationSample(cp, pExit, {
      allowFallbackSteps: false,
      pedometerActive: true,
      calibratedStrides: { run: 1.05 },
    });

    expect(exitRes.acceptedPoint).toBe(true);
    // Total distance equals true GPS chord (~25m), NOT bridged(21) + chord(25) = 46m
    expect(exitRes.checkpoint.distanceMeters).toBeCloseTo(expectedChord, 2);
    expect(exitRes.checkpoint.bridgedMetersSinceLastGps).toBe(0);
    expect(exitRes.checkpoint.bridgedSplitSecondsSinceLastGps).toBe(0);
    // Recovering from bridge must not pollute calibration distance
    expect(exitRes.checkpoint.calibGpsMeters).toBe(0);
  });

  it('fuses GPS and cadence pace by accuracy, resolves cadence-band strides, and decays pace on idle', () => {
    const profile = {
      run: 1.0,
      bands: {
        walk: 0.7,
        jog: 0.9,
        runModerate: 1.08,
        runFast: 1.25,
      },
    };
    expect(classifyCadenceBand(115)).toBe('walk');
    expect(classifyCadenceBand(145)).toBe('jog');
    expect(classifyCadenceBand(165)).toBe('runModerate');
    expect(classifyCadenceBand(182)).toBe('runFast');

    expect(resolveStrideMeters('run', profile, 182)).toBe(1.25);
    expect(resolveStrideMeters('run', profile, 165)).toBe(1.08);
    expect(resolveStrideMeters('run', profile)).toBe(1.0);

    const now = 9_000_000;
    // Strong fresh GPS weights 70% GPS (4.0 m/s) + 30% Pedometer (2.0 m/s) -> 3.4 m/s -> ~294 s/km
    const strongPace = computeFusedPaceSeconds({
      prevSmoothedPace: 0,
      gpsSpeedMps: 4.0,
      gpsAccuracyMeters: 6,
      gpsAgeMs: 0,
      recentPoints: [],
      pedometerActive: true,
      lastHardwareStepAt: now - 500,
      pedometerSpeedMps: 2.0,
      now,
    });
    expect(strongPace).toBe(294);

    // Degraded GPS (18m accuracy) shifts weight to 35% GPS (4.0) + 65% Pedometer (2.0) -> 2.7 m/s -> ~370 s/km
    const weakGpsPace = computeFusedPaceSeconds({
      prevSmoothedPace: 0,
      gpsSpeedMps: 4.0,
      gpsAccuracyMeters: 18,
      gpsAgeMs: 0,
      recentPoints: [],
      pedometerActive: true,
      lastHardwareStepAt: now - 500,
      pedometerSpeedMps: 2.0,
      now,
    });
    expect(weakGpsPace).toBe(370);

    // Idle pace decay clears pace cleanly after 3.5s without steps
    const activeCp = {
      ...createInitialCheckpoint({
        type: 'run',
        trackingMode: 'outdoor',
        autoPauseEnabled: true,
        weightKg: 70,
        now: now - 10_000,
      }),
      smoothedCurrentPaceSeconds: 320,
      lastHardwareStepAt: now - 3600,
    };
    expect(applyStationaryPaceDecay(activeCp, now - 1000, true)).toBe(activeCp);
    const decayed = applyStationaryPaceDecay(activeCp, now, true);
    expect(decayed.smoothedCurrentPaceSeconds).toBe(0);
  });

  describe('classifyMotionActivity & Vehicle Detection', () => {
    it('classifies vehicle when speed exceeds human running record (> 10.5 m/s)', () => {
      const res = classifyMotionActivity({
        speedMps: 11.2,
        stepRateSpm: 160,
        msSinceStep: 500,
        dtSec: 2,
        displacementMeters: 22.4,
      });
      expect(res.isVehicle).toBe(true);
      expect(res.activity).toBe('in_vehicle');
    });

    it('classifies vehicle when moving at motorcycle speed with no foot steps', () => {
      const res = classifyMotionActivity({
        speedMps: 7.0, // ~25 km/h
        pedometerActive: true,
        stepRateSpm: 0,
        msSinceStep: 5000,
        dtSec: 2,
        displacementMeters: 14,
      });
      expect(res.isVehicle).toBe(true);
      expect(res.activity).toBe('in_vehicle');
    });

    it('classifies running when cadence is high or pace is fast running', () => {
      const res = classifyMotionActivity({
        speedMps: 3.2,
        stepRateSpm: 165,
        msSinceStep: 300,
        dtSec: 2,
        displacementMeters: 6.4,
      });
      expect(res.isVehicle).toBe(false);
      expect(res.activity).toBe('running');
    });

    it('classifies walking for moderate cadence and human walking speed', () => {
      const res = classifyMotionActivity({
        speedMps: 1.3,
        stepRateSpm: 110,
        msSinceStep: 500,
        dtSec: 2,
        displacementMeters: 2.6,
      });
      expect(res.isVehicle).toBe(false);
      expect(res.activity).toBe('walking');
    });

    it('auto-pauses and sets isVehicleDetected on vehicle motion in processGpsLocationSample', () => {
      const start = 3_000_000;
      let cp = createInitialCheckpoint({
        type: 'run',
        trackingMode: 'outdoor',
        autoPauseEnabled: true,
        weightKg: 70,
        now: start,
      });

      // Anchor first point
      const anchor = processGpsLocationSample(
        cp,
        makeLoc(-6.2, 106.8, start + 1000, { accuracy: 8 }),
        { allowFallbackSteps: true }
      );
      cp = anchor.checkpoint;

      // Second point: vehicle speed 11 m/s (~40 km/h)
      const vehicleSample = processGpsLocationSample(
        cp,
        makeLoc(-6.2002, 106.8, start + 3000, { speed: 11.5, accuracy: 8 }),
        { allowFallbackSteps: true }
      );

      expect(vehicleSample.acceptedPoint).toBe(false);
      expect(vehicleSample.checkpoint.isVehicleDetected).toBe(true);
      expect(vehicleSample.checkpoint.isAutoPaused).toBe(true);
      expect(vehicleSample.checkpoint.motionActivity).toBe('in_vehicle');

      // When physical steps resume (user got off motorcycle)
      const stepResume = applyHardwareStepsToCheckpoint(
        vehicleSample.checkpoint,
        5,
        start + 8000
      );
      expect(stepResume.checkpoint.isVehicleDetected).toBe(false);
      expect(stepResume.checkpoint.isAutoPaused).toBe(false);
      expect(stepResume.didAutoResume).toBe(true);
    });
  });

  describe('applyBarometricMeasurementToCheckpoint', () => {
    it('applies added gain and floors climbed to checkpoint', () => {
      const cp = createInitialCheckpoint({
        type: 'walk',
        trackingMode: 'outdoor',
        autoPauseEnabled: true,
        weightKg: 65,
        now: 1000,
      });

      const updated = applyBarometricMeasurementToCheckpoint(cp, 6.2, 2);
      expect(updated.barometricGainMeters).toBe(6.2);
      expect(updated.elevationGainMeters).toBe(6.2);
      expect(updated.floorsClimbed).toBe(2);
    });

    it('ignores measurements when workout is paused', () => {
      const cp = {
        ...createInitialCheckpoint({
          type: 'walk',
          trackingMode: 'outdoor',
          autoPauseEnabled: true,
          weightKg: 65,
          now: 1000,
        }),
        isAutoPaused: true,
      };

      const updated = applyBarometricMeasurementToCheckpoint(cp, 5.0, 1);
      expect(updated).toBe(cp);
    });
  });
});

