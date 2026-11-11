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
const BATCH_CHUNK_SIZE = 100;

const WORKOUT_POINT_INSERT_PREFIX =
  'INSERT INTO workout_points (workout_id, latitude, longitude, altitude, accuracy, speed, timestamp, segment_index) VALUES ';
const WORKOUT_POINT_PLACEHOLDER = '(?, ?, ?, ?, ?, ?, ?, ?)';

const WORKOUT_SPLIT_INSERT_PREFIX =
  'INSERT INTO workout_splits (workout_id, km_number, duration_seconds, pace_seconds, elevation_gain_meters) VALUES ';
const WORKOUT_SPLIT_PLACEHOLDER = '(?, ?, ?, ?, ?)';

const ACTIVE_CP_POINT_INSERT_PREFIX =
  'INSERT INTO active_checkpoint_points (session_start_time, latitude, longitude, altitude, accuracy, speed, timestamp, segment_index) VALUES ';
const ACTIVE_CP_POINT_PLACEHOLDER = '(?, ?, ?, ?, ?, ?, ?, ?)';

const WORKOUT_SUMMARY_SELECT_COLUMNS = `id, type, title, start_time as startTime, end_time as endTime,
            duration_seconds as durationSeconds, distance_meters as distanceMeters,
            avg_pace_seconds as avgPaceSecondsPerKm, calories_kcal as caloriesKcal,
            soundtrack_track_name as soundtrackTrackName, soundtrack_artist as soundtrackArtist,
            COALESCE(steps, 0) as steps, COALESCE(avg_cadence_spm, 0) as avgCadenceSpm,
            COALESCE(elevation_gain_meters, 0) as elevationGainMeters,
            COALESCE(is_indoor, 0) as isIndoorRaw`;

export type WorkoutSummary = Omit<WorkoutRecord, 'routePoints' | 'splits'>;

export interface WorkoutPageCursor {
  startTime: number;
  id: string;
}

export interface WorkoutPageResult {
  items: WorkoutSummary[];
  hasMore: boolean;
  nextCursor: WorkoutPageCursor | null;
}

export interface WeeklyDayBucketInput {
  key: string;
  startMs: number;
  endMs: number;
}

export interface WeeklyDailySummaryResult {
  byKey: Record<string, { totalMeters: number; sessions: number }>;
  totalMeters: number;
  totalSessions: number;
}

let dbInstance: SQLite.SQLiteDatabase | null = null;
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let dbWriteQueue: Promise<void> = Promise.resolve();
let syncedSessionStartTime: number | null = null;
let syncedPointCount = 0;

function enqueueDbWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = dbWriteQueue.then(task);
  dbWriteQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function mapWorkoutSummaryRow(row: any): WorkoutSummary {
  const { isIndoorRaw, ...rest } = row;
  return {
    ...rest,
    isIndoor: Boolean(isIndoorRaw),
  };
}

function bindGpsPointRow(
  ownerKey: string | number,
  pt: GPSCoordinate
): SQLite.SQLiteBindValue[] {
  return [
    ownerKey,
    pt.latitude,
    pt.longitude,
    pt.altitude ?? null,
    pt.accuracy ?? null,
    pt.speed ?? null,
    pt.timestamp,
    pt.segmentIndex ?? 0,
  ];
}

async function insertRowsInChunks<T>(
  db: SQLite.SQLiteDatabase,
  insertPrefixSql: string,
  rowPlaceholder: string,
  chunkSize: number,
  items: T[],
  bindRow: (item: T) => SQLite.SQLiteBindValue[]
): Promise<void> {
  if (items.length === 0) return;

  for (let offset = 0; offset < items.length; offset += chunkSize) {
    const chunk = items.slice(offset, offset + chunkSize);
    const placeholders = new Array(chunk.length).fill(rowPlaceholder).join(', ');
    const params: SQLite.SQLiteBindValue[] = [];
    for (const item of chunk) {
      params.push(...bindRow(item));
    }
    await db.runAsync(`${insertPrefixSql}${placeholders};`, params);
  }
}

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
    PRAGMA foreign_keys = ON;
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

    CREATE TABLE IF NOT EXISTS active_checkpoint_points (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      session_start_time INTEGER NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      altitude REAL,
      accuracy REAL,
      speed REAL,
      timestamp INTEGER NOT NULL,
      segment_index INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_points_workout ON workout_points (workout_id);
    CREATE INDEX IF NOT EXISTS idx_splits_workout ON workout_splits (workout_id);
    CREATE INDEX IF NOT EXISTS idx_active_cp_session ON active_checkpoint_points (session_start_time, seq);
    CREATE INDEX IF NOT EXISTS idx_workouts_start_time ON workouts (start_time DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_workouts_type_start ON workouts (type, start_time DESC, id DESC);
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
 * Menyimpan data sesi lari yang telah selesai secara batch ter-chunk dalam satu transaksi
 */
export async function saveWorkout(workout: WorkoutRecord): Promise<void> {
  return enqueueDbWrite(async () => {
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

      await insertRowsInChunks(
        db,
        WORKOUT_POINT_INSERT_PREFIX,
        WORKOUT_POINT_PLACEHOLDER,
        BATCH_CHUNK_SIZE,
        workout.routePoints,
        (pt) => bindGpsPointRow(workout.id, pt)
      );

      await insertRowsInChunks(
        db,
        WORKOUT_SPLIT_INSERT_PREFIX,
        WORKOUT_SPLIT_PLACEHOLDER,
        BATCH_CHUNK_SIZE,
        workout.splits,
        (split) => [
          workout.id,
          split.kmNumber,
          split.durationSeconds,
          split.paceSecondsPerKm,
          Math.round(split.elevationGainMeters ?? 0),
        ]
      );
    });
  });
}

/**
 * Mengambil daftar seluruh riwayat lari (tanpa titik detail GPS untuk efisiensi memori)
 */
export async function getAllWorkouts(): Promise<WorkoutSummary[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT ${WORKOUT_SUMMARY_SELECT_COLUMNS}
     FROM workouts ORDER BY start_time DESC, id DESC;`
  );
  return rows.map(mapWorkoutSummaryRow);
}

/**
 * Mengambil N riwayat sesi terbaru untuk beranda tanpa memuat seluruh tabel
 */
export async function getRecentWorkouts(limit: number = 5): Promise<WorkoutSummary[]> {
  const db = await getDatabase();
  const safeLimit = Math.max(1, Math.floor(limit));
  const rows = await db.getAllAsync<any>(
    `SELECT ${WORKOUT_SUMMARY_SELECT_COLUMNS}
     FROM workouts ORDER BY start_time DESC, id DESC LIMIT ?;`,
    [safeLimit]
  );
  return rows.map(mapWorkoutSummaryRow);
}

/**
 * Mengambil halaman riwayat sesi berbasis keyset cursor & filter tipe SQLite
 */
export async function getWorkoutsPage(options?: {
  limit?: number;
  type?: WorkoutType | 'all';
  cursor?: WorkoutPageCursor | null;
}): Promise<WorkoutPageResult> {
  const db = await getDatabase();
  const safeLimit = Math.max(1, Math.min(100, Math.floor(options?.limit ?? 25)));
  const conditions: string[] = [];
  const params: SQLite.SQLiteBindValue[] = [];

  if (options?.type && options.type !== 'all') {
    conditions.push('type = ?');
    params.push(options.type);
  }

  if (options?.cursor) {
    conditions.push('(start_time < ? OR (start_time = ? AND id < ?))');
    params.push(options.cursor.startTime, options.cursor.startTime, options.cursor.id);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await db.getAllAsync<any>(
    `SELECT ${WORKOUT_SUMMARY_SELECT_COLUMNS}
     FROM workouts ${whereClause} ORDER BY start_time DESC, id DESC LIMIT ?;`,
    [...params, safeLimit + 1]
  );

  const hasMore = rows.length > safeLimit;
  const pageRows = hasMore ? rows.slice(0, safeLimit) : rows;
  const items = pageRows.map(mapWorkoutSummaryRow);
  const lastItem = items[items.length - 1];

  return {
    items,
    hasMore,
    nextCursor: hasMore && lastItem ? { startTime: lastItem.startTime, id: lastItem.id } : null,
  };
}

/**
 * Agregasi jarak & jumlah sesi per ember tanggal lokal langsung di SQLite
 */
export async function getWeeklyDailySummary(
  dayBuckets: WeeklyDayBucketInput[]
): Promise<WeeklyDailySummaryResult> {
  if (dayBuckets.length === 0) {
    return { byKey: {}, totalMeters: 0, totalSessions: 0 };
  }

  const db = await getDatabase();
  const byKey: Record<string, { totalMeters: number; sessions: number }> = {};
  for (const bucket of dayBuckets) {
    byKey[bucket.key] = { totalMeters: 0, sessions: 0 };
  }

  const minStart = Math.min(...dayBuckets.map((b) => b.startMs));
  const maxEnd = Math.max(...dayBuckets.map((b) => b.endMs));

  const caseWhenClauses: string[] = [];
  const params: SQLite.SQLiteBindValue[] = [];

  for (let i = 0; i < dayBuckets.length; i++) {
    caseWhenClauses.push(`WHEN start_time >= ? AND start_time < ? THEN ${i}`);
    params.push(dayBuckets[i].startMs, dayBuckets[i].endMs);
  }

  params.push(minStart, maxEnd);

  const rows = await db.getAllAsync<{
    bucketIndex: number;
    totalMeters: number;
    sessions: number;
  }>(
    `SELECT
       CASE ${caseWhenClauses.join(' ')} ELSE -1 END AS bucketIndex,
       COALESCE(SUM(distance_meters), 0) AS totalMeters,
       COUNT(id) AS sessions
     FROM workouts
     WHERE start_time >= ? AND start_time < ?
     GROUP BY bucketIndex;`,
    params
  );

  let totalMeters = 0;
  let totalSessions = 0;

  for (const row of rows) {
    if (row.bucketIndex >= 0 && row.bucketIndex < dayBuckets.length) {
      const key = dayBuckets[row.bucketIndex].key;
      const meters = Number(row.totalMeters) || 0;
      const sessions = Number(row.sessions) || 0;
      byKey[key] = { totalMeters: meters, sessions };
      totalMeters += meters;
      totalSessions += sessions;
    }
  }

  return { byKey, totalMeters, totalSessions };
}

/**
 * Mengambil satu workout lengkap dengan koordinat rute GPS & splits
 */
export async function getWorkoutById(id: string): Promise<WorkoutRecord | null> {
  const db = await getDatabase();

  const workoutRow = await db.getFirstAsync<any>(
    `SELECT ${WORKOUT_SUMMARY_SELECT_COLUMNS}
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

  return {
    ...mapWorkoutSummaryRow(workoutRow),
    routePoints: points,
    splits: splits,
  };
}

/**
 * Menghapus workout beserta relasi titik GPS & split via ON DELETE CASCADE
 */
export async function deleteWorkout(id: string): Promise<void> {
  return enqueueDbWrite(async () => {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM workouts WHERE id = ?;`, [id]);
  });
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
  return enqueueDbWrite(async () => {
    const db = await getDatabase();
    let alreadyPersisted =
      syncedSessionStartTime === checkpoint.startTime ? syncedPointCount : -1;
    let shouldResetTable = false;

    if (alreadyPersisted < 0) {
      const countRow = await db.getFirstAsync<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM active_checkpoint_points WHERE session_start_time = ?;`,
        [checkpoint.startTime]
      );
      alreadyPersisted = Number(countRow?.cnt) || 0;
      const totalRow = await db.getFirstAsync<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM active_checkpoint_points;`
      );
      if ((Number(totalRow?.cnt) || 0) > alreadyPersisted) {
        shouldResetTable = true;
      }
    }

    if (checkpoint.routePoints.length < alreadyPersisted) {
      shouldResetTable = true;
      alreadyPersisted = 0;
    }

    const deltaPoints = checkpoint.routePoints.slice(alreadyPersisted);
    const lightweightMetadata: ActiveWorkoutCheckpoint = {
      ...checkpoint,
      routePoints: [],
      lastSavedAt: Date.now(),
    };

    await db.withTransactionAsync(async () => {
      if (shouldResetTable) {
        await db.runAsync(`DELETE FROM active_checkpoint_points WHERE session_start_time != ?;`, [
          checkpoint.startTime,
        ]);
        if (alreadyPersisted === 0) {
          await db.runAsync(`DELETE FROM active_checkpoint_points;`);
        }
      }

      if (deltaPoints.length > 0) {
        await insertRowsInChunks(
          db,
          ACTIVE_CP_POINT_INSERT_PREFIX,
          ACTIVE_CP_POINT_PLACEHOLDER,
          BATCH_CHUNK_SIZE,
          deltaPoints,
          (pt) => bindGpsPointRow(checkpoint.startTime, pt)
        );
      }

      await db.runAsync(
        `INSERT INTO app_settings (key, value)
         VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
        [ACTIVE_CHECKPOINT_SETTING_KEY, JSON.stringify(lightweightMetadata)]
      );
    });

    syncedSessionStartTime = checkpoint.startTime;
    syncedPointCount = checkpoint.routePoints.length;
  });
}

export async function loadActiveCheckpoint(): Promise<ActiveWorkoutCheckpoint | null> {
  return enqueueDbWrite(async () => {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM app_settings WHERE key = ?;`,
      [ACTIVE_CHECKPOINT_SETTING_KEY]
    );
    const raw = row?.value ?? null;
    if (!raw) return null;

    let parsed: ActiveWorkoutCheckpoint | null = null;
    try {
      parsed = JSON.parse(raw) as ActiveWorkoutCheckpoint;
    } catch {
      return null;
    }

    if (
      !parsed ||
      typeof parsed.startTime !== 'number' ||
      typeof parsed.distanceMeters !== 'number'
    ) {
      return null;
    }

    const externalPoints = await db.getAllAsync<GPSCoordinate>(
      `SELECT latitude, longitude, altitude, accuracy, speed, timestamp, COALESCE(segment_index, 0) as segmentIndex
       FROM active_checkpoint_points
       WHERE session_start_time = ?
       ORDER BY seq ASC;`,
      [parsed.startTime]
    );

    const legacyPoints = Array.isArray(parsed.routePoints) ? parsed.routePoints : [];
    const routePoints = externalPoints.length > 0 ? externalPoints : legacyPoints;

    // Simpan jumlah baris yang sudah berada di tabel eksternal (0 bila berasal dari payload JSON legacy)
    syncedSessionStartTime = parsed.startTime;
    syncedPointCount = externalPoints.length;

    return {
      ...parsed,
      routePoints,
    };
  });
}

export async function clearActiveCheckpoint(): Promise<void> {
  return enqueueDbWrite(async () => {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      await db.runAsync(`DELETE FROM active_checkpoint_points;`);
      await db.runAsync(`DELETE FROM app_settings WHERE key = ?;`, [
        ACTIVE_CHECKPOINT_SETTING_KEY,
      ]);
    });
    syncedSessionStartTime = null;
    syncedPointCount = 0;
  });
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

