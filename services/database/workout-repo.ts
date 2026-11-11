import * as SQLite from 'expo-sqlite';
import { WorkoutRecord, WorkoutStats, GPSCoordinate } from '@/types/workout';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  dbInstance = await SQLite.openDatabaseAsync('walkthetalk.db');
  await initDatabase(dbInstance);
  return dbInstance;
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
      avg_cadence_spm INTEGER DEFAULT 0
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
      FOREIGN KEY (workout_id) REFERENCES workouts (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workout_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_id TEXT NOT NULL,
      km_number INTEGER NOT NULL,
      duration_seconds INTEGER NOT NULL,
      pace_seconds REAL NOT NULL,
      FOREIGN KEY (workout_id) REFERENCES workouts (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_points_workout ON workout_points (workout_id);
    CREATE INDEX IF NOT EXISTS idx_splits_workout ON workout_splits (workout_id);
  `);

  // Migrasi aman untuk database lama yang belum memiliki kolom steps / avg_cadence_spm
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(workouts);`);
  const existingColumnNames = new Set(columns.map((col) => col.name));

  if (!existingColumnNames.has('steps')) {
    await db.execAsync(`ALTER TABLE workouts ADD COLUMN steps INTEGER DEFAULT 0;`);
  }
  if (!existingColumnNames.has('avg_cadence_spm')) {
    await db.execAsync(`ALTER TABLE workouts ADD COLUMN avg_cadence_spm INTEGER DEFAULT 0;`);
  }
}

/**
 * Menyimpan data sesi lari yang telah selesai
 */
export async function saveWorkout(workout: WorkoutRecord): Promise<void> {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO workouts (id, type, title, start_time, end_time, duration_seconds, distance_meters, avg_pace_seconds, calories_kcal, soundtrack_track_name, soundtrack_artist, steps, avg_cadence_spm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
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
      ]
    );

    // Simpan koordinat rute GPS
    for (const pt of workout.routePoints) {
      await db.runAsync(
        `INSERT INTO workout_points (workout_id, latitude, longitude, altitude, accuracy, speed, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [workout.id, pt.latitude, pt.longitude, pt.altitude ?? null, pt.accuracy ?? null, pt.speed ?? null, pt.timestamp]
      );
    }

    // Simpan splits km
    for (const split of workout.splits) {
      await db.runAsync(
        `INSERT INTO workout_splits (workout_id, km_number, duration_seconds, pace_seconds)
         VALUES (?, ?, ?, ?);`,
        [workout.id, split.kmNumber, split.durationSeconds, split.paceSecondsPerKm]
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
            COALESCE(steps, 0) as steps, COALESCE(avg_cadence_spm, 0) as avgCadenceSpm
     FROM workouts ORDER BY start_time DESC;`
  );
  return rows;
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
            COALESCE(steps, 0) as steps, COALESCE(avg_cadence_spm, 0) as avgCadenceSpm
     FROM workouts WHERE id = ?;`,
    [id]
  );

  if (!workoutRow) return null;

  const points = await db.getAllAsync<GPSCoordinate>(
    `SELECT latitude, longitude, altitude, accuracy, speed, timestamp 
     FROM workout_points WHERE workout_id = ? ORDER BY timestamp ASC;`,
    [id]
  );

  const splits = await db.getAllAsync<any>(
    `SELECT km_number as kmNumber, duration_seconds as durationSeconds, pace_seconds as paceSecondsPerKm 
     FROM workout_splits WHERE workout_id = ? ORDER BY km_number ASC;`,
    [id]
  );

  return {
    ...workoutRow,
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

