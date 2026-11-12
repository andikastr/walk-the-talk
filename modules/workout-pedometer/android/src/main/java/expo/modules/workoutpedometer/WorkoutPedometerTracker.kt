package expo.modules.workoutpedometer

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener2
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.math.max
import kotlin.math.roundToLong

data class StepSnapshot(
  val sessionId: String?,
  val totalSteps: Long,
  val lastStepTimestampMs: Long,
  val isRecording: Boolean,
  val isForegroundServiceRunning: Boolean
)

data class PersistedPedometerConfig(
  val sessionId: String?,
  val trackingMode: String,
  val isRecording: Boolean,
  val baselineRawSteps: Double,
  val accumulatedBeforePause: Long,
  val lastRawSteps: Double,
  val lastStepTimestampMs: Long,
  val strideMeters: Double,
  val useForegroundService: Boolean,
  val notificationTitle: String,
  val notificationBody: String,
  val notificationColor: String?,
  val stepsLabel: String
) {
  fun currentTotalSteps(): Long {
    if (baselineRawSteps < 0.0 || lastRawSteps < baselineRawSteps) {
      return accumulatedBeforePause
    }
    val delta = max(0L, (lastRawSteps - baselineRawSteps).roundToLong())
    return accumulatedBeforePause + delta
  }
}

class WorkoutPedometerTracker private constructor(context: Context) : SensorEventListener2 {
  private val appContext = context.applicationContext
  private val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  private val sensorManager =
    appContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
  private val stepSensor: Sensor? = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
  private val mainHandler = Handler(Looper.getMainLooper())

  private val stateLock = Any()
  private var config = loadPersistedConfig()
  private var isSensorRegistered = false
  private var pendingFlush: CompletableDeferred<Unit>? = null
  private var lastNotifSteps: Long = -1L
  private var lastNotifUpdatedAtMs: Long = 0L

  @Volatile
  var onStepListener: ((StepSnapshot) -> Unit)? = null

  fun isHardwareAvailable(): Boolean = stepSensor != null

  fun readConfig(): PersistedPedometerConfig = synchronized(stateLock) { config }

  fun startSession(
    sessionId: String,
    trackingMode: String,
    useForegroundService: Boolean,
    notificationTitle: String,
    notificationBody: String,
    notificationColor: String?,
    strideMeters: Double,
    initialSyncedSteps: Long,
    stepsLabel: String
  ): StepSnapshot {
    val safeStride = if (strideMeters.isFinite() && strideMeters in 0.3..2.5) strideMeters else 0.9
    val snapshot: StepSnapshot
    val cfgCopy: PersistedPedometerConfig

    synchronized(stateLock) {
      val sameActiveSession = config.sessionId == sessionId && config.isRecording
      config = if (sameActiveSession) {
        config.copy(
          trackingMode = trackingMode,
          useForegroundService = useForegroundService,
          notificationTitle = notificationTitle,
          notificationBody = notificationBody,
          notificationColor = notificationColor,
          strideMeters = safeStride,
          stepsLabel = stepsLabel,
          accumulatedBeforePause = max(config.accumulatedBeforePause, max(0L, initialSyncedSteps))
        )
      } else {
        PersistedPedometerConfig(
          sessionId = sessionId,
          trackingMode = trackingMode,
          isRecording = true,
          baselineRawSteps = -1.0,
          accumulatedBeforePause = max(0L, initialSyncedSteps),
          lastRawSteps = -1.0,
          lastStepTimestampMs = System.currentTimeMillis(),
          strideMeters = safeStride,
          useForegroundService = useForegroundService,
          notificationTitle = notificationTitle,
          notificationBody = notificationBody,
          notificationColor = notificationColor,
          stepsLabel = stepsLabel
        )
      }
      saveConfigLocked(config)
      registerSensorLocked()
      lastNotifSteps = -1L
      lastNotifUpdatedAtMs = 0L
      cfgCopy = config
      snapshot = buildSnapshotLocked()
    }

    syncForegroundService(cfgCopy, snapshot)
    return snapshot
  }

  fun pauseSession(): StepSnapshot {
    val snapshot: StepSnapshot
    synchronized(stateLock) {
      val frozenTotal = config.currentTotalSteps()
      config = config.copy(
        isRecording = false,
        baselineRawSteps = -1.0,
        accumulatedBeforePause = frozenTotal,
        lastRawSteps = -1.0
      )
      saveConfigLocked(config)
      unregisterSensorLocked()
      snapshot = buildSnapshotLocked()
    }
    WorkoutPedometerService.stop(appContext)
    return snapshot
  }

  fun resumeSession(
    trackingMode: String? = null,
    useForegroundService: Boolean? = null,
    notificationTitle: String? = null,
    notificationBody: String? = null,
    notificationColor: String? = null,
    strideMeters: Double? = null
  ): StepSnapshot {
    val snapshot: StepSnapshot
    val cfgCopy: PersistedPedometerConfig

    synchronized(stateLock) {
      val updatedStride =
        if (strideMeters != null && strideMeters.isFinite() && strideMeters in 0.3..2.5) {
          strideMeters
        } else {
          config.strideMeters
        }
      config = config.copy(
        trackingMode = trackingMode ?: config.trackingMode,
        isRecording = true,
        baselineRawSteps = -1.0,
        lastRawSteps = -1.0,
        lastStepTimestampMs = System.currentTimeMillis(),
        strideMeters = updatedStride,
        useForegroundService = useForegroundService ?: config.useForegroundService,
        notificationTitle = notificationTitle ?: config.notificationTitle,
        notificationBody = notificationBody ?: config.notificationBody,
        notificationColor = notificationColor ?: config.notificationColor
      )
      saveConfigLocked(config)
      registerSensorLocked()
      lastNotifSteps = -1L
      lastNotifUpdatedAtMs = 0L
      cfgCopy = config
      snapshot = buildSnapshotLocked()
    }

    syncForegroundService(cfgCopy, snapshot)
    return snapshot
  }

  fun stopSession(): StepSnapshot {
    val snapshot: StepSnapshot
    synchronized(stateLock) {
      config = defaultConfig()
      prefs.edit().clear().apply()
      unregisterSensorLocked()
      lastNotifSteps = -1L
      lastNotifUpdatedAtMs = 0L
      snapshot = buildSnapshotLocked()
    }
    WorkoutPedometerService.stop(appContext)
    return snapshot
  }

  fun ensureStartedFromService() {
    synchronized(stateLock) {
      if (config.isRecording) {
        registerSensorLocked()
      }
    }
  }

  fun currentSnapshot(): StepSnapshot = synchronized(stateLock) {
    buildSnapshotLocked()
  }

  suspend fun flushAndReadSnapshot(timeoutMs: Long = 180L): StepSnapshot {
    val manager = sensorManager
    val deferredToAwait: CompletableDeferred<Unit>? = synchronized(stateLock) {
      if (!config.isRecording || !isSensorRegistered || manager == null) {
        null
      } else {
        val current = pendingFlush
        if (current != null && !current.isCompleted) {
          current
        } else {
          val created = CompletableDeferred<Unit>()
          pendingFlush = created
          val triggered = runCatching { manager.flush(this) }.getOrDefault(false)
          if (!triggered) {
            created.complete(Unit)
            pendingFlush = null
            null
          } else {
            created
          }
        }
      }
    }

    if (deferredToAwait != null) {
      withTimeoutOrNull(timeoutMs) {
        deferredToAwait.await()
      }
    }

    return currentSnapshot()
  }

  override fun onSensorChanged(event: SensorEvent) {
    if (event.sensor.type != Sensor.TYPE_STEP_COUNTER || event.values.isEmpty()) return

    val rawSteps = event.values[0].toDouble()
    if (!rawSteps.isFinite()) return

    val now = System.currentTimeMillis()
    var snapshotToNotify: StepSnapshot? = null
    var notifConfig: PersistedPedometerConfig? = null

    synchronized(stateLock) {
      if (!config.isRecording) return

      val previousTotal = config.currentTotalSteps()
      var updated = config

      if (updated.baselineRawSteps < 0.0) {
        updated = updated.copy(
          baselineRawSteps = rawSteps,
          lastRawSteps = rawSteps
        )
      } else if (rawSteps < updated.lastRawSteps) {
        // Handle sensor reset / reboot while keeping previously recorded session steps intact
        updated = updated.copy(
          accumulatedBeforePause = previousTotal,
          baselineRawSteps = rawSteps,
          lastRawSteps = rawSteps
        )
      } else {
        updated = updated.copy(lastRawSteps = rawSteps)
      }

      val nextTotal = updated.currentTotalSteps()
      val stepsIncreased = nextTotal > previousTotal
      if (stepsIncreased) {
        updated = updated.copy(lastStepTimestampMs = now)
      }

      config = updated
      saveConfigLocked(updated)

      val snap = buildSnapshotLocked()
      if (stepsIncreased) {
        snapshotToNotify = snap
        val enoughStepsDelta =
          lastNotifSteps < 0L || (nextTotal - lastNotifSteps) >= NOTIF_STEP_THROTTLE
        val enoughTimeDelta = (now - lastNotifUpdatedAtMs) >= NOTIF_TIME_THROTTLE_MS
        if (updated.useForegroundService && (enoughStepsDelta || enoughTimeDelta)) {
          lastNotifSteps = nextTotal
          lastNotifUpdatedAtMs = now
          notifConfig = updated
        }
      }
    }

    notifConfig?.let { cfg ->
      snapshotToNotify?.let { snap ->
        WorkoutPedometerService.updateNotificationIfRunning(appContext, cfg, snap)
      }
    }

    snapshotToNotify?.let { snap ->
      onStepListener?.invoke(snap)
    }
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

  override fun onFlushCompleted(sensor: Sensor?) {
    synchronized(stateLock) {
      pendingFlush?.complete(Unit)
      pendingFlush = null
    }
  }

  private fun syncForegroundService(cfg: PersistedPedometerConfig, snapshot: StepSnapshot) {
    if (cfg.useForegroundService && cfg.isRecording) {
      WorkoutPedometerService.startOrUpdate(appContext, cfg, snapshot)
    } else {
      WorkoutPedometerService.stop(appContext)
    }
  }

  private fun registerSensorLocked() {
    val manager = sensorManager
    val sensor = stepSensor
    if (isSensorRegistered || sensor == null || manager == null) return
    val ok = manager.registerListener(
      this,
      sensor,
      SensorManager.SENSOR_DELAY_NORMAL,
      0,
      mainHandler
    )
    isSensorRegistered = ok
  }

  private fun unregisterSensorLocked() {
    val manager = sensorManager
    if (!isSensorRegistered || manager == null) {
      pendingFlush?.complete(Unit)
      pendingFlush = null
      isSensorRegistered = false
      return
    }
    manager.unregisterListener(this)
    isSensorRegistered = false
    pendingFlush?.complete(Unit)
    pendingFlush = null
  }

  private fun buildSnapshotLocked(): StepSnapshot {
    return StepSnapshot(
      sessionId = config.sessionId,
      totalSteps = config.currentTotalSteps(),
      lastStepTimestampMs = config.lastStepTimestampMs,
      isRecording = config.isRecording,
      isForegroundServiceRunning = WorkoutPedometerService.isServiceRunning
    )
  }

  private fun saveConfigLocked(cfg: PersistedPedometerConfig) {
    prefs.edit()
      .putString(KEY_SESSION_ID, cfg.sessionId)
      .putString(KEY_TRACKING_MODE, cfg.trackingMode)
      .putBoolean(KEY_IS_RECORDING, cfg.isRecording)
      .putString(KEY_BASELINE_RAW, cfg.baselineRawSteps.toString())
      .putLong(KEY_ACCUMULATED, cfg.accumulatedBeforePause)
      .putString(KEY_LAST_RAW, cfg.lastRawSteps.toString())
      .putLong(KEY_LAST_STEP_TS, cfg.lastStepTimestampMs)
      .putString(KEY_STRIDE, cfg.strideMeters.toString())
      .putBoolean(KEY_USE_FGS, cfg.useForegroundService)
      .putString(KEY_NOTIF_TITLE, cfg.notificationTitle)
      .putString(KEY_NOTIF_BODY, cfg.notificationBody)
      .putString(KEY_NOTIF_COLOR, cfg.notificationColor)
      .putString(KEY_STEPS_LABEL, cfg.stepsLabel)
      .apply()
  }

  private fun loadPersistedConfig(): PersistedPedometerConfig {
    return PersistedPedometerConfig(
      sessionId = prefs.getString(KEY_SESSION_ID, null),
      trackingMode = prefs.getString(KEY_TRACKING_MODE, "indoor") ?: "indoor",
      isRecording = prefs.getBoolean(KEY_IS_RECORDING, false),
      baselineRawSteps = prefs.getString(KEY_BASELINE_RAW, null)?.toDoubleOrNull() ?: -1.0,
      accumulatedBeforePause = prefs.getLong(KEY_ACCUMULATED, 0L),
      lastRawSteps = prefs.getString(KEY_LAST_RAW, null)?.toDoubleOrNull() ?: -1.0,
      lastStepTimestampMs = prefs.getLong(KEY_LAST_STEP_TS, 0L),
      strideMeters = prefs.getString(KEY_STRIDE, null)?.toDoubleOrNull() ?: 0.9,
      useForegroundService = prefs.getBoolean(KEY_USE_FGS, false),
      notificationTitle = prefs.getString(KEY_NOTIF_TITLE, "Walk The Talk") ?: "Walk The Talk",
      notificationBody = prefs.getString(KEY_NOTIF_BODY, "") ?: "",
      notificationColor = prefs.getString(KEY_NOTIF_COLOR, null),
      stepsLabel = prefs.getString(KEY_STEPS_LABEL, "langkah") ?: "langkah"
    )
  }

  private fun defaultConfig() = PersistedPedometerConfig(
    sessionId = null,
    trackingMode = "indoor",
    isRecording = false,
    baselineRawSteps = -1.0,
    accumulatedBeforePause = 0L,
    lastRawSteps = -1.0,
    lastStepTimestampMs = 0L,
    strideMeters = 0.9,
    useForegroundService = false,
    notificationTitle = "Walk The Talk",
    notificationBody = "",
    notificationColor = null,
    stepsLabel = "langkah"
  )

  companion object {
    private const val PREFS_NAME = "walk_the_talk_workout_pedometer"
    private const val NOTIF_TIME_THROTTLE_MS = 2500L
    private const val NOTIF_STEP_THROTTLE = 10L

    private const val KEY_SESSION_ID = "session_id"
    private const val KEY_TRACKING_MODE = "tracking_mode"
    private const val KEY_IS_RECORDING = "is_recording"
    private const val KEY_BASELINE_RAW = "baseline_raw"
    private const val KEY_ACCUMULATED = "accumulated"
    private const val KEY_LAST_RAW = "last_raw"
    private const val KEY_LAST_STEP_TS = "last_step_ts"
    private const val KEY_STRIDE = "stride_meters"
    private const val KEY_USE_FGS = "use_fgs"
    private const val KEY_NOTIF_TITLE = "notif_title"
    private const val KEY_NOTIF_BODY = "notif_body"
    private const val KEY_NOTIF_COLOR = "notif_color"
    private const val KEY_STEPS_LABEL = "steps_label"

    @Volatile
    private var instance: WorkoutPedometerTracker? = null

    fun getInstance(context: Context): WorkoutPedometerTracker {
      return instance ?: synchronized(this) {
        instance ?: WorkoutPedometerTracker(context).also { instance = it }
      }
    }
  }
}

