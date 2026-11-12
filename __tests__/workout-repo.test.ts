import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  clearActiveCheckpoint,
  deleteWorkout,
  getCalibratedStrides,
  getRecentWorkouts,
  getWeeklyDailySummary,
  getWorkoutById,
  getWorkoutsPage,
  getWorkoutStats,
  loadActiveCheckpoint,
  saveActiveCheckpoint,
  saveCalibratedStride,
  saveWorkout,
} from '@/services/database/workout-repo';
import { createInitialCheckpoint } from '@/services/location/tracking-engine';
import { GPSCoordinate, WorkoutRecord } from '@/types/workout';

interface StoredCheckpointPointRow extends GPSCoordinate {
  seq: number;
  session_start_time: number;
}

const mockDbState = {
  workouts: new Map<string, Record<string, any>>(),
  workoutPoints: [] as Record<string, any>[],
  workoutSplits: [] as Record<string, any>[],
  workoutSoundtracks: [] as Record<string, any>[],
  activeCheckpointPoints: [] as StoredCheckpointPointRow[],
  appSettings: new Map<string, string>(),
  execCalls: [] as string[],
  runCalls: [] as { sql: string; params: any[] }[],
  nextSeq: 1,
  activeTransactions: 0,
  maxConcurrentTransactions: 0,
};

function makePoint(idx: number, baseTs: number = 1_000_000): GPSCoordinate {
  return {
    latitude: -6.2 + idx * 0.0001,
    longitude: 106.8 + idx * 0.0001,
    altitude: 15,
    accuracy: 8,
    speed: 3.1,
    timestamp: baseTs + idx * 2000,
    segmentIndex: 0,
  };
}

function makeWorkout(
  id: string,
  overrides: Partial<WorkoutRecord> = {}
): WorkoutRecord {
  const startTime = overrides.startTime ?? 1_700_000_000_000;
  return {
    id,
    type: 'run',
    title: `Workout ${id}`,
    startTime,
    endTime: startTime + 1_800_000,
    durationSeconds: 1800,
    distanceMeters: 5000,
    avgPaceSecondsPerKm: 360,
    caloriesKcal: 350,
    routePoints: [],
    splits: [],
    steps: 4500,
    avgCadenceSpm: 150,
    elevationGainMeters: 25,
    isIndoor: false,
    ...overrides,
  };
}

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => ({
    execAsync: async (sql: string) => {
      mockDbState.execCalls.push(sql);
    },
    withTransactionAsync: async (task: () => Promise<void>) => {
      mockDbState.activeTransactions += 1;
      mockDbState.maxConcurrentTransactions = Math.max(
        mockDbState.maxConcurrentTransactions,
        mockDbState.activeTransactions
      );
      try {
        await task();
      } finally {
        mockDbState.activeTransactions -= 1;
      }
    },
    runAsync: async (sql: string, params: any[] = []) => {
      mockDbState.runCalls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').trim();

      if (normalized.startsWith('INSERT INTO workouts ')) {
        mockDbState.workouts.set(params[0], {
          id: params[0],
          type: params[1],
          title: params[2],
          startTime: params[3],
          endTime: params[4],
          durationSeconds: params[5],
          distanceMeters: params[6],
          avgPaceSecondsPerKm: params[7],
          caloriesKcal: params[8],
          soundtrackTrackName: params[9],
          soundtrackArtist: params[10],
          steps: params[11],
          avgCadenceSpm: params[12],
          elevationGainMeters: params[13],
          isIndoorRaw: params[14],
        });
        return { changes: 1, lastInsertRowId: 1 };
      }

      if (normalized.startsWith('INSERT INTO workout_points ')) {
        for (let i = 0; i < params.length; i += 8) {
          mockDbState.workoutPoints.push({
            workout_id: params[i],
            latitude: params[i + 1],
            longitude: params[i + 2],
            altitude: params[i + 3],
            accuracy: params[i + 4],
            speed: params[i + 5],
            timestamp: params[i + 6],
            segmentIndex: params[i + 7],
          });
        }
        return { changes: params.length / 8, lastInsertRowId: 1 };
      }

      if (normalized.startsWith('INSERT INTO workout_splits ')) {
        for (let i = 0; i < params.length; i += 5) {
          mockDbState.workoutSplits.push({
            workout_id: params[i],
            kmNumber: params[i + 1],
            durationSeconds: params[i + 2],
            paceSecondsPerKm: params[i + 3],
            elevationGainMeters: params[i + 4],
          });
        }
        return { changes: params.length / 5, lastInsertRowId: 1 };
      }

      if (normalized.startsWith('INSERT INTO workout_soundtracks ')) {
        for (let i = 0; i < params.length; i += 6) {
          mockDbState.workoutSoundtracks.push({
            workout_id: params[i],
            position: params[i + 1],
            trackId: params[i + 2],
            trackName: params[i + 3],
            artist: params[i + 4],
            playedAt: params[i + 5],
          });
        }
        return { changes: params.length / 6, lastInsertRowId: 1 };
      }

      if (normalized.startsWith('INSERT INTO active_checkpoint_points ')) {
        for (let i = 0; i < params.length; i += 8) {
          mockDbState.activeCheckpointPoints.push({
            seq: mockDbState.nextSeq++,
            session_start_time: params[i],
            latitude: params[i + 1],
            longitude: params[i + 2],
            altitude: params[i + 3],
            accuracy: params[i + 4],
            speed: params[i + 5],
            timestamp: params[i + 6],
            segmentIndex: params[i + 7],
          });
        }
        return { changes: params.length / 8, lastInsertRowId: mockDbState.nextSeq - 1 };
      }

      if (
        normalized.startsWith(
          'DELETE FROM active_checkpoint_points WHERE session_start_time != ?'
        )
      ) {
        mockDbState.activeCheckpointPoints =
          mockDbState.activeCheckpointPoints.filter(
            (r) => r.session_start_time === params[0]
          );
        return { changes: 1, lastInsertRowId: 0 };
      }

      if (normalized.startsWith('DELETE FROM active_checkpoint_points')) {
        mockDbState.activeCheckpointPoints = [];
        return { changes: 1, lastInsertRowId: 0 };
      }

      if (normalized.startsWith('INSERT INTO app_settings ')) {
        mockDbState.appSettings.set(params[0], params[1]);
        return { changes: 1, lastInsertRowId: 1 };
      }

      if (normalized.startsWith('DELETE FROM app_settings WHERE key = ?')) {
        mockDbState.appSettings.delete(params[0]);
        return { changes: 1, lastInsertRowId: 0 };
      }

      if (normalized.startsWith('DELETE FROM workouts WHERE id = ?')) {
        const id = params[0];
        mockDbState.workouts.delete(id);
        mockDbState.workoutPoints = mockDbState.workoutPoints.filter(
          (p) => p.workout_id !== id
        );
        mockDbState.workoutSplits = mockDbState.workoutSplits.filter(
          (s) => s.workout_id !== id
        );
        mockDbState.workoutSoundtracks = mockDbState.workoutSoundtracks.filter(
          (t) => t.workout_id !== id
        );
        return { changes: 1, lastInsertRowId: 0 };
      }

      return { changes: 0, lastInsertRowId: 0 };
    },
    getFirstAsync: async (sql: string, params: any[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();

      if (
        normalized.startsWith(
          'SELECT COUNT(*) as cnt FROM active_checkpoint_points WHERE session_start_time = ?'
        )
      ) {
        const cnt = mockDbState.activeCheckpointPoints.filter(
          (p) => p.session_start_time === params[0]
        ).length;
        return { cnt };
      }

      if (normalized === 'SELECT COUNT(*) as cnt FROM active_checkpoint_points;') {
        return { cnt: mockDbState.activeCheckpointPoints.length };
      }

      if (normalized.startsWith('SELECT value FROM app_settings WHERE key = ?')) {
        const val = mockDbState.appSettings.get(params[0]);
        return val !== undefined ? { value: val } : null;
      }

      if (normalized.includes('FROM workouts WHERE id = ?')) {
        return mockDbState.workouts.get(params[0]) ?? null;
      }

      if (normalized.includes('COUNT(id) as totalWorkouts')) {
        const rows = Array.from(mockDbState.workouts.values());
        return {
          totalDistanceMeters: rows.reduce((s, r) => s + r.distanceMeters, 0),
          totalDurationSeconds: rows.reduce((s, r) => s + r.durationSeconds, 0),
          totalWorkouts: rows.length,
          totalCaloriesKcal: rows.reduce((s, r) => s + r.caloriesKcal, 0),
          totalSteps: rows.reduce((s, r) => s + (r.steps || 0), 0),
        };
      }

      return null;
    },
    getAllAsync: async (sql: string, params: any[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();

      if (normalized.startsWith('PRAGMA table_info(workouts)')) {
        return [
          { name: 'steps' },
          { name: 'avg_cadence_spm' },
          { name: 'elevation_gain_meters' },
          { name: 'is_indoor' },
        ];
      }
      if (normalized.startsWith('PRAGMA table_info(workout_points)')) {
        return [{ name: 'segment_index' }];
      }
      if (normalized.startsWith('PRAGMA table_info(workout_splits)')) {
        return [{ name: 'elevation_gain_meters' }];
      }

      if (normalized.includes('FROM active_checkpoint_points')) {
        return mockDbState.activeCheckpointPoints
          .filter((p) => p.session_start_time === params[0])
          .sort((a, b) => a.seq - b.seq)
          .map(({ seq: _s, session_start_time: _t, ...coord }) => coord);
      }

      if (normalized.includes('FROM workout_points WHERE workout_id = ?')) {
        return mockDbState.workoutPoints
          .filter((p) => p.workout_id === params[0])
          .sort((a, b) => a.timestamp - b.timestamp)
          .map(({ workout_id: _w, ...coord }) => coord);
      }

      if (normalized.includes('FROM workout_splits WHERE workout_id = ?')) {
        return mockDbState.workoutSplits
          .filter((s) => s.workout_id === params[0])
          .sort((a, b) => a.kmNumber - b.kmNumber)
          .map(({ workout_id: _w, ...split }) => split);
      }

      if (normalized.includes('FROM workout_soundtracks WHERE workout_id = ?')) {
        return mockDbState.workoutSoundtracks
          .filter((t) => t.workout_id === params[0])
          .sort((a, b) => a.position - b.position)
          .map(({ workout_id: _w, position: _p, ...track }) => track);
      }

      if (normalized.includes('FROM workout_soundtracks WHERE workout_id IN')) {
        const idSet = new Set(params);
        return mockDbState.workoutSoundtracks
          .filter((t) => idSet.has(t.workout_id))
          .sort((a, b) => {
            const cmp = String(a.workout_id).localeCompare(String(b.workout_id));
            return cmp !== 0 ? cmp : a.position - b.position;
          })
          .map(({ position: _p, workout_id, ...track }) => ({
            workoutId: workout_id,
            ...track,
          }));
      }

      if (normalized.includes('GROUP BY bucketIndex')) {
        const minStart = params[params.length - 2];
        const maxEnd = params[params.length - 1];
        const bucketCount = (params.length - 2) / 2;
        const grouped = new Map<number, { totalMeters: number; sessions: number }>();

        for (const row of mockDbState.workouts.values()) {
          if (row.startTime < minStart || row.startTime >= maxEnd) continue;
          let matched = -1;
          for (let i = 0; i < bucketCount; i++) {
            const bStart = params[i * 2];
            const bEnd = params[i * 2 + 1];
            if (row.startTime >= bStart && row.startTime < bEnd) {
              matched = i;
              break;
            }
          }
          const prev = grouped.get(matched) ?? { totalMeters: 0, sessions: 0 };
          prev.totalMeters += row.distanceMeters;
          prev.sessions += 1;
          grouped.set(matched, prev);
        }

        return Array.from(grouped.entries()).map(([bucketIndex, vals]) => ({
          bucketIndex,
          ...vals,
        }));
      }

      if (normalized.includes('FROM workouts')) {
        let rows = Array.from(mockDbState.workouts.values());
        let pIdx = 0;

        if (normalized.includes('type = ?')) {
          const targetType = params[pIdx++];
          rows = rows.filter((r) => r.type === targetType);
        }
        if (normalized.includes('(start_time < ? OR (start_time = ? AND id < ?))')) {
          const cStart = params[pIdx++];
          pIdx++; // repeated startTime param
          const cId = params[pIdx++];
          rows = rows.filter(
            (r) =>
              r.startTime < cStart ||
              (r.startTime === cStart && String(r.id) < String(cId))
          );
        }

        rows.sort((a, b) => {
          if (b.startTime !== a.startTime) return b.startTime - a.startTime;
          return String(b.id).localeCompare(String(a.id));
        });

        if (normalized.includes('LIMIT ?')) {
          const limit = params[params.length - 1];
          rows = rows.slice(0, limit);
        }
        return rows;
      }

      return [];
    },
  })),
}));

describe('services/database/workout-repo (O1–O3)', () => {
  beforeEach(async () => {
    mockDbState.workouts.clear();
    mockDbState.workoutPoints = [];
    mockDbState.workoutSplits = [];
    mockDbState.workoutSoundtracks = [];
    mockDbState.activeCheckpointPoints = [];
    mockDbState.appSettings.clear();
    mockDbState.runCalls = [];
    mockDbState.nextSeq = 1;
    mockDbState.activeTransactions = 0;
    mockDbState.maxConcurrentTransactions = 0;
    await clearActiveCheckpoint();
    mockDbState.runCalls = [];
  });

  it('enables foreign keys, indexes, and batches workout inserts in safe chunks (O1)', async () => {
    const points = Array.from({ length: 250 }, (_, i) => makePoint(i));
    const splits = [
      { kmNumber: 1, durationSeconds: 300, paceSecondsPerKm: 300, elevationGainMeters: 5 },
      { kmNumber: 2, durationSeconds: 295, paceSecondsPerKm: 295, elevationGainMeters: 8 },
      { kmNumber: 3, durationSeconds: 310, paceSecondsPerKm: 310, elevationGainMeters: 2 },
    ];

    await saveWorkout(
      makeWorkout('w_batch', { routePoints: points, splits })
    );

    const schemaSql = mockDbState.execCalls.join('\n');
    expect(schemaSql).toContain('PRAGMA foreign_keys = ON;');
    expect(schemaSql).toContain('idx_workouts_start_time');
    expect(schemaSql).toContain('idx_workouts_type_start');
    expect(schemaSql).toContain('active_checkpoint_points');

    const pointInserts = mockDbState.runCalls.filter((c) =>
      c.sql.startsWith('INSERT INTO workout_points')
    );
    const splitInserts = mockDbState.runCalls.filter((c) =>
      c.sql.startsWith('INSERT INTO workout_splits')
    );

    // 250 points split across 3 queries (100 + 100 + 50 rows * 8 bind params)
    expect(pointInserts).toHaveLength(3);
    expect(pointInserts[0].params).toHaveLength(100 * 8);
    expect(pointInserts[1].params).toHaveLength(100 * 8);
    expect(pointInserts[2].params).toHaveLength(50 * 8);

    // 3 splits in a single batched query
    expect(splitInserts).toHaveLength(1);
    expect(splitInserts[0].params).toHaveLength(3 * 5);

    const loaded = await getWorkoutById('w_batch');
    expect(loaded).not.toBeNull();
    expect(loaded!.routePoints).toHaveLength(250);
    expect(loaded!.splits).toHaveLength(3);

    // Indoor workout with 0 GPS points triggers 0 point inserts
    mockDbState.runCalls = [];
    await saveWorkout(makeWorkout('w_indoor', { isIndoor: true, routePoints: [] }));
    expect(
      mockDbState.runCalls.filter((c) => c.sql.startsWith('INSERT INTO workout_points'))
    ).toHaveLength(0);

    await deleteWorkout('w_batch');
    expect(mockDbState.workoutPoints.some((p) => p.workout_id === 'w_batch')).toBe(false);
  });

  it('persists only delta points on active checkpoint save and preserves legacy OTA recovery (O2)', async () => {
    const start1 = 2_000_000;
    const cp1 = createInitialCheckpoint({
      type: 'run',
      trackingMode: 'outdoor',
      autoPauseEnabled: true,
      weightKg: 70,
      now: start1,
    });
    cp1.distanceMeters = 450;
    cp1.routePoints = [makePoint(0), makePoint(1), makePoint(2)];

    await saveActiveCheckpoint(cp1);

    const metaRaw1 = mockDbState.appSettings.get('active_workout_checkpoint_v1');
    expect(metaRaw1).toBeDefined();
    expect(JSON.parse(metaRaw1!).routePoints).toEqual([]);
    expect(mockDbState.activeCheckpointPoints).toHaveLength(3);

    // Second flush with 2 additional points should only insert slice(3) = 2 rows
    mockDbState.runCalls = [];
    const cp2 = {
      ...cp1,
      distanceMeters: 780,
      routePoints: [...cp1.routePoints, makePoint(3), makePoint(4)],
    };
    await saveActiveCheckpoint(cp2);

    const deltaInserts = mockDbState.runCalls.filter((c) =>
      c.sql.startsWith('INSERT INTO active_checkpoint_points')
    );
    expect(deltaInserts).toHaveLength(1);
    expect(deltaInserts[0].params).toHaveLength(2 * 8);
    expect(mockDbState.activeCheckpointPoints).toHaveLength(5);

    const loaded = await loadActiveCheckpoint();
    expect(loaded).not.toBeNull();
    expect(loaded!.routePoints).toHaveLength(5);
    expect(loaded!.routePoints[4].latitude).toBeCloseTo(makePoint(4).latitude, 6);

    await clearActiveCheckpoint();
    expect(mockDbState.activeCheckpointPoints).toHaveLength(0);
    expect(mockDbState.appSettings.has('active_workout_checkpoint_v1')).toBe(false);

    // Simulate mid-session OTA upgrade where old app version stored routePoints inside JSON
    const legacyStart = 5_000_000;
    const legacyCp = createInitialCheckpoint({
      type: 'walk',
      trackingMode: 'outdoor',
      autoPauseEnabled: false,
      weightKg: 65,
      now: legacyStart,
    });
    legacyCp.distanceMeters = 120;
    legacyCp.routePoints = [makePoint(0), makePoint(1)];
    mockDbState.appSettings.set(
      'active_workout_checkpoint_v1',
      JSON.stringify(legacyCp)
    );

    const loadedLegacy = await loadActiveCheckpoint();
    expect(loadedLegacy?.routePoints).toHaveLength(2);

    // Resuming after OTA recovery migrates legacy points into external table cleanly without loss
    await saveActiveCheckpoint({
      ...loadedLegacy!,
      routePoints: [...loadedLegacy!.routePoints, makePoint(2)],
    });
    expect(mockDbState.activeCheckpointPoints).toHaveLength(3);
  });

  it('queries recent workouts, SQL 7-day buckets, and keyset cursor pages accurately (O3)', async () => {
    const dayMs = 86_400_000;
    const baseDayStart = 1_700_000_000_000;

    // Older than 7 days (ignored in weekly summary)
    await saveWorkout(
      makeWorkout('w_old', {
        type: 'walk',
        startTime: baseDayStart - 2 * dayMs,
        distanceMeters: 9000,
      })
    );
    // Day 0 (2 sessions)
    await saveWorkout(
      makeWorkout('w_d0_a', {
        type: 'run',
        startTime: baseDayStart + 3600_000,
        distanceMeters: 3200,
      })
    );
    await saveWorkout(
      makeWorkout('w_d0_b', {
        type: 'walk',
        startTime: baseDayStart + 7200_000,
        distanceMeters: 1800,
      })
    );
    // Day 5 (2 workouts with identical startTime to test tie-breaker cursor on id)
    const tieTs = baseDayStart + 5 * dayMs + 5000;
    await saveWorkout(
      makeWorkout('w_tie_1', {
        type: 'run',
        startTime: tieTs,
        distanceMeters: 4000,
      })
    );
    await saveWorkout(
      makeWorkout('w_tie_2', {
        type: 'jog',
        startTime: tieTs,
        distanceMeters: 2500,
      })
    );

    const recent = await getRecentWorkouts(2);
    expect(recent).toHaveLength(2);
    expect(recent.map((w) => w.id)).toEqual(['w_tie_2', 'w_tie_1']);

    const buckets = Array.from({ length: 7 }, (_, i) => ({
      key: `day-${i}`,
      startMs: baseDayStart + i * dayMs,
      endMs: baseDayStart + (i + 1) * dayMs,
    }));
    const weekly = await getWeeklyDailySummary(buckets);
    expect(weekly.byKey['day-0']).toEqual({ totalMeters: 5000, sessions: 2 });
    expect(weekly.byKey['day-5']).toEqual({ totalMeters: 6500, sessions: 2 });
    expect(weekly.totalMeters).toBe(11500);
    expect(weekly.totalSessions).toBe(4);

    // Cursor pagination over all types (limit=2): 5 workouts -> 2 + 2 + 1
    const page1 = await getWorkoutsPage({ limit: 2, type: 'all', cursor: null });
    expect(page1.items.map((w) => w.id)).toEqual(['w_tie_2', 'w_tie_1']);
    expect(page1.hasMore).toBe(true);

    const page2 = await getWorkoutsPage({
      limit: 2,
      type: 'all',
      cursor: page1.nextCursor,
    });
    expect(page2.items.map((w) => w.id)).toEqual(['w_d0_b', 'w_d0_a']);
    expect(page2.hasMore).toBe(true);

    const page3 = await getWorkoutsPage({
      limit: 2,
      type: 'all',
      cursor: page2.nextCursor,
    });
    expect(page3.items.map((w) => w.id)).toEqual(['w_old']);
    expect(page3.hasMore).toBe(false);
    expect(page3.nextCursor).toBeNull();

    // Filtered pagination directly via SQLite WHERE type = ?
    const runPage = await getWorkoutsPage({ limit: 10, type: 'run' });
    expect(runPage.items.map((w) => w.id)).toEqual(['w_tie_1', 'w_d0_a']);

    const stats = await getWorkoutStats();
    expect(stats.totalWorkouts).toBe(5);
  });

  it('persists full unique soundtrack playlists, batches summaries, and falls back to legacy single-track rows', async () => {
    await saveWorkout(
      makeWorkout('w_playlist', {
        startTime: 1_700_100_000_000,
        soundtracks: [
          { trackId: 't1', trackName: 'First Stride', artist: 'Artist A', playedAt: 1_700_100_010_000 },
          { trackId: 't2', trackName: 'Second Wind', artist: 'Artist B', playedAt: 1_700_100_210_000 },
          { trackId: 't1', trackName: 'First Stride', artist: 'Artist A', playedAt: 1_700_100_410_000 },
        ],
      })
    );

    // Simulate legacy DB row without workout_soundtracks rows
    mockDbState.workouts.set('w_legacy', {
      id: 'w_legacy',
      type: 'walk',
      title: 'Legacy Walk',
      startTime: 1_700_050_000_000,
      endTime: 1_700_051_000_000,
      durationSeconds: 1000,
      distanceMeters: 1500,
      avgPaceSecondsPerKm: 666,
      caloriesKcal: 90,
      soundtrackTrackName: 'Old Track',
      soundtrackArtist: 'Legacy Artist',
      steps: 1800,
      avgCadenceSpm: 108,
      elevationGainMeters: 5,
      isIndoorRaw: 0,
    });

    const detail = await getWorkoutById('w_playlist');
    expect(detail?.soundtracks).toHaveLength(2);
    expect(detail?.soundtracks?.map((t) => t.trackName)).toEqual([
      'First Stride',
      'Second Wind',
    ]);
    expect(detail?.soundtrackTrackName).toBe('First Stride');

    const recent = await getRecentWorkouts(5);
    const playlistSummary = recent.find((w) => w.id === 'w_playlist');
    const legacySummary = recent.find((w) => w.id === 'w_legacy');

    expect(playlistSummary?.soundtracks?.map((t) => t.trackName)).toEqual([
      'First Stride',
      'Second Wind',
    ]);
    expect(legacySummary?.soundtracks).toEqual([
      { trackName: 'Old Track', artist: 'Legacy Artist' },
    ]);

    await deleteWorkout('w_playlist');
    expect(
      mockDbState.workoutSoundtracks.some((t) => t.workout_id === 'w_playlist')
    ).toBe(false);
  });

  it('persists cadence-band calibrated strides while preserving legacy scalar JSON compatibility', async () => {
    mockDbState.appSettings.set(
      'calibrated_strides_v1',
      JSON.stringify({ walk: 0.74, run: 1.0 })
    );

    const legacy = await getCalibratedStrides();
    expect(legacy.walk).toBe(0.74);
    expect(legacy.run).toBe(1.0);
    expect(legacy.bands).toBeUndefined();

    const updated = await saveCalibratedStride('run', 1.25, 'runFast');
    // 1.0 * 0.6 + 1.25 * 0.4 = 1.1
    expect(updated.run).toBe(1.1);
    expect(updated.bands?.runFast).toBe(1.25);

    const reloaded = await getCalibratedStrides();
    expect(reloaded.walk).toBe(0.74);
    expect(reloaded.run).toBe(1.1);
    expect(reloaded.bands?.runFast).toBe(1.25);
  });
});
