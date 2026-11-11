import * as SQLite from 'expo-sqlite';
import {
  ActiveWorkoutCheckpoint,
  GPSCoordinate,
  WorkoutRecord,
  WorkoutStats,
  WorkoutType,
} from '@/types/workout';
import { WORKOUT_CONFIG } from '@/constants/Config';

const ACTIVE_CHECKPOINT_SETTING_KEY = 'active_workout_checkpoint_v1';
const CALIBRATED_STRIDES_SETTING_KEY = 'calibrated_strides_v1';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('walkthetalk.db');
      await initDatabase(db);
      dbInstance = db;
      return db;
    })().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

async function initDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      duration_seconds INTEGER NOT NULL,
      distance_meters REAL NOT NULL,
      avg_pace_seconds REAL NOT NULL,
      calories_kcal INTEGER NOT NULL,
      soundtrack_track_name TEXT,
      soundtrack_artist TEXT,
      steps INTEGER DEFAULT 0,
      avg_cadence_spm INTEGER DEFAULT 0,
      elevation_gain_meters REAL DEFAULT 0,
      is_indoor INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS workout_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_id TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      altitude REAL,
      accuracy REAL,
      speed REAL,
      timestamp INTEGER NOT NULL,
      segment_index INTEGER DEFAULT 0,
      FOREIGN KEY (workout_id) REFERENCES workouts (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workout_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_id TEXT NOT NULL,
      km_number INTEGER NOT NULL,
      duration_seconds INTEGER NOT NULL,
      pace_seconds REAL NOT NULL,
      elevation_gain_meters REAL DEFAULT 0,
      FOREIGN KEY (workout_id) REFERENCES workouts (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_points_workout ON workout_points (workout_id);
    CREATE INDEX IF NOT EXISTS idx_splits_workout ON workout_splits (workout_id);
  `);

  // Migrasi aman untuk database lama agar kolom baru selalu tersedia
  const ensureColumn = async (table: string, column: string, sqlType: string) => {
    const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table});`);
    const existing = new Set(columns.map((col) => col.name));
    if (!existing.has(column)) {
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqlType};`);
    }
  };

  await ensureColumn('workouts', 'steps', 'INTEGER DEFAULT 0');
  await ensureColumn('workouts', 'avg_cadence_spm', 'INTEGER DEFAULT 0');
  await ensureColumn('workouts', 'elevation_gain_meters', 'REAL DEFAULT 0');
  await ensureColumn('workouts', 'is_indoor', 'INTEGER DEFAULT 0');
  await ensureColumn('workout_points', 'segment_index', 'INTEGER DEFAULT 0');
  await ensureColumn('workout_splits', 'elevation_gain_meters', 'REAL DEFAULT 0');
}

/**
 * Menyimpan data sesi lari yang telah selesai
 */
export async function saveWorkout(workout: WorkoutRecord): Promise<void> {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO workouts (id, type, title, start_time, end_time, duration_seconds, distance_meters, avg_pace_seconds, calories_kcal, soundtrack_track_name, soundtrack_artist, steps, avg_cadence_spm, elevation_gain_meters, is_indoor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        workout.id,
        workout.type,
        workout.title,
        workout.startTime,
        workout.endTime,
        workout.durationSeconds,
        workout.distanceMeters,
        workout.avgPaceSecondsPerKm,
        workout.caloriesKcal,
        workout.soundtrackTrackName || null,
        workout.soundtrackArtist || null,
        workout.steps ?? 0,
        workout.avgCadenceSpm ?? 0,
        Math.round(workout.elevationGainMeters ?? 0),
        workout.isIndoor ? 1 : 0,
      ]
    );

    // Simpan koordinat rute GPS
    for (const pt of workout.routePoints) {
      await db.runAsync(
        `INSERT INTO workout_points (workout_id, latitude, longitude, altitude, accuracy, speed, timestamp, segment_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          workout.id,
          pt.latitude,
          pt.longitude,
          pt.altitude ?? null,
          pt.accuracy ?? null,
          pt.speed ?? null,
          pt.timestamp,
          pt.segmentIndex ?? 0,
        ]
      );
    }

    // Simpan splits km
    for (const split of workout.splits) {
      await db.runAsync(
        `INSERT INTO workout_splits (workout_id, km_number, duration_seconds, pace_seconds, elevation_gain_meters)
         VALUES (?, ?, ?, ?, ?);`,
        [
          workout.id,
          split.kmNumber,
          split.durationSeconds,
          split.paceSecondsPerKm,
          Math.round(split.elevationGainMeters ?? 0),
        ]
      );
    }
  });
}

/**
 * Mengambil daftar seluruh riwayat lari (tanpa titik detail GPS untuk efisiensi memori)
 */
export async function getAllWorkouts(): Promise<Omit<WorkoutRecord, 'routePoints' | 'splits'>[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT id, type, title, start_time as startTime, end_time as endTime, 
            duration_seconds as durationSeconds, distance_meters as distanceMeters, 
            avg_pace_seconds as avgPaceSecondsPerKm, calories_kcal as caloriesKcal,
            soundtrack_track_name as soundtrackTrackName, soundtrack_artist as soundtrackArtist,
            COALESCE(steps, 0) as steps, COALESCE(avg_cadence_spm, 0) as avgCadenceSpm,
            COALESCE(elevation_gain_meters, 0) as elevationGainMeters,
            COALESCE(is_indoor, 0) as isIndoorRaw
     FROM workouts ORDER BY start_time DESC;`
  );
  return rows.map((row) => ({
    ...row,
    isIndoor: Boolean(row.isIndoorRaw),
  }));
}

/**
 * Mengambil satu workout lengkap dengan koordinat rute GPS & splits
 */
export async function getWorkoutById(id: string): Promise<WorkoutRecord | null> {
  const db = await getDatabase();

  const workoutRow = await db.getFirstAsync<any>(
    `SELECT id, type, title, start_time as startTime, end_time as endTime, 
            duration_seconds as durationSeconds, distance_meters as distanceMeters, 
            avg_pace_seconds as avgPaceSecondsPerKm, calories_kcal as caloriesKcal,
            soundtrack_track_name as soundtrackTrackName, soundtrack_artist as soundtrackArtist,
            COALESCE(steps, 0) as steps, COALESCE(avg_cadence_spm, 0) as avgCadenceSpm,
            COALESCE(elevation_gain_meters, 0) as elevationGainMeters,
            COALESCE(is_indoor, 0) as isIndoorRaw
     FROM workouts WHERE id = ?;`,
    [id]
  );

  if (!workoutRow) return null;

  const points = await db.getAllAsync<GPSCoordinate>(
    `SELECT latitude, longitude, altitude, accuracy, speed, timestamp, COALESCE(segment_index, 0) as segmentIndex
     FROM workout_points WHERE workout_id = ? ORDER BY timestamp ASC;`,
    [id]
  );

  const splits = await db.getAllAsync<any>(
    `SELECT km_number as kmNumber, duration_seconds as durationSeconds, pace_seconds as paceSecondsPerKm,
            COALESCE(elevation_gain_meters, 0) as elevationGainMeters
     FROM workout_splits WHERE workout_id = ? ORDER BY km_number ASC;`,
    [id]
  );

  const { isIndoorRaw, ...rest } = workoutRow;
  return {
    ...rest,
    isIndoor: Boolean(isIndoorRaw),
    routePoints: points,
    splits: splits,
  };
}

/**
 * Menghapus workout
 */
export async function deleteWorkout(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM workouts WHERE id = ?;`, [id]);
}

/**
 * Mengambil statistik akumulatif (total jarak, durasi, sesi, kalori, langkah)
 */
export async function getWorkoutStats(): Promise<WorkoutStats> {
  const db = await getDatabase();
  const res = await db.getFirstAsync<any>(
    `SELECT 
       COALESCE(SUM(distance_meters), 0) as totalDistanceMeters,
       COALESCE(SUM(duration_seconds), 0) as totalDurationSeconds,
       COUNT(id) as totalWorkouts,
       COALESCE(SUM(calories_kcal), 0) as totalCaloriesKcal,
       COALESCE(SUM(steps), 0) as totalSteps
     FROM workouts;`
  );

  return {
    totalDistanceMeters: res?.totalDistanceMeters || 0,
    totalDurationSeconds: res?.totalDurationSeconds || 0,
    totalWorkouts: res?.totalWorkouts || 0,
    totalCaloriesKcal: res?.totalCaloriesKcal || 0,
    totalSteps: res?.totalSteps || 0,
  };
}

/**
 * Mengambil nilai preferensi aplikasi dari SQLite
 */
export async function getAppSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = ?;`,
    [key]
  );
  return row?.value ?? null;
}

/**
 * Menyimpan atau memperbarui preferensi aplikasi ke SQLite
 */
export async function setAppSetting(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO app_settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [key, value]
  );
}

/**
 * Menghapus kunci pengaturan tertentu dari SQLite
 */
export async function deleteAppSetting(key: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM app_settings WHERE key = ?;`, [key]);
}

export async function saveActiveCheckpoint(
  checkpoint: ActiveWorkoutCheckpoint
): Promise<void> {
  await setAppSetting(
    ACTIVE_CHECKPOINT_SETTING_KEY,
    JSON.stringify({ ...checkpoint, lastSavedAt: Date.now() })
  );
}

export async function loadActiveCheckpoint(): Promise<ActiveWorkoutCheckpoint | null> {
  const raw = await getAppSetting(ACTIVE_CHECKPOINT_SETTING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ActiveWorkoutCheckpoint;
    if (
      !parsed ||
      typeof parsed.startTime !== 'number' ||
      typeof parsed.distanceMeters !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function clearActiveCheckpoint(): Promise<void> {
  await deleteAppSetting(ACTIVE_CHECKPOINT_SETTING_KEY);
}

export async function getCalibratedStrides(): Promise<Partial<Record<WorkoutType, number>>> {
  const raw = await getAppSetting(CALIBRATED_STRIDES_SETTING_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Partial<Record<WorkoutType, number>>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveCalibratedStride(
  type: WorkoutType,
  strideMeters: number
): Promise<Partial<Record<WorkoutType, number>>> {
  const clamped = Math.min(
    WORKOUT_CONFIG.maxCalibratedStrideMeters,
    Math.max(WORKOUT_CONFIG.minCalibratedStrideMeters, strideMeters)
  );
  const current = await getCalibratedStrides();
  const prev = current[type];
  const blended =
    typeof prev === 'number' && Number.isFinite(prev)
      ? Number((prev * 0.6 + clamped * 0.4).toFixed(3))
      : Number(clamped.toFixed(3));
  const next: Partial<Record<WorkoutType, number>> = {
    ...current,
    [type]: blended,
  };
  await setAppSetting(CALIBRATED_STRIDES_SETTING_KEY, JSON.stringify(next));
  return next;
}

