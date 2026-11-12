package expo.modules.workoutpedometer

import android.Manifest
import android.os.Build
import androidx.core.os.bundleOf
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

private const val STEP_UPDATE_EVENT = "onStepUpdate"

internal class StartPedometerSessionOptions : Record {
  @Field var sessionId: String = ""
  @Field var trackingMode: String = "indoor"
  @Field var useForegroundService: Boolean = false
  @Field var notificationTitle: String = "Walk The Talk"
  @Field var notificationBody: String = ""
  @Field var notificationColor: String? = null
  @Field var strideMeters: Double = 0.9
  @Field var initialSyncedSteps: Long = 0L
  @Field var stepsLabel: String = "langkah"
}

internal class ResumePedometerSessionOptions : Record {
  @Field var trackingMode: String? = null
  @Field var useForegroundService: Boolean? = null
  @Field var notificationTitle: String? = null
  @Field var notificationBody: String? = null
  @Field var notificationColor: String? = null
  @Field var strideMeters: Double? = null
}

class WorkoutPedometerModule : Module() {
  private val tracker: WorkoutPedometerTracker by lazy {
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    WorkoutPedometerTracker.getInstance(context)
  }

  private fun snapshotToMap(snapshot: StepSnapshot): Map<String, Any?> = mapOf(
    "sessionId" to snapshot.sessionId,
    "totalSteps" to snapshot.totalSteps.toDouble(),
    "lastStepTimestampMs" to snapshot.lastStepTimestampMs.toDouble(),
    "isRecording" to snapshot.isRecording,
    "isForegroundServiceRunning" to snapshot.isForegroundServiceRunning
  )

  private fun emitSnapshot(snapshot: StepSnapshot) {
    runCatching {
      sendEvent(
        STEP_UPDATE_EVENT,
        bundleOf(
          "sessionId" to (snapshot.sessionId ?: ""),
          "totalSteps" to snapshot.totalSteps.toDouble(),
          "timestampMs" to snapshot.lastStepTimestampMs.toDouble(),
          "isForegroundServiceRunning" to snapshot.isForegroundServiceRunning
        )
      )
    }
  }

  override fun definition() = ModuleDefinition {
    Name("WorkoutPedometer")

    Events(STEP_UPDATE_EVENT)

    OnCreate {
      runCatching {
        tracker.onStepListener = { snapshot ->
          emitSnapshot(snapshot)
        }
      }
    }

    OnDestroy {
      runCatching {
        tracker.onStepListener = null
      }
    }

    AsyncFunction("isAvailableAsync") {
      tracker.isHardwareAvailable()
    }

    AsyncFunction("getPermissionsAsync") { promise: Promise ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        Permissions.getPermissionsWithPermissionsManager(
          appContext.permissions,
          promise,
          Manifest.permission.ACTIVITY_RECOGNITION
        )
      } else {
        Permissions.getPermissionsWithPermissionsManager(appContext.permissions, promise)
      }
    }

    AsyncFunction("requestPermissionsAsync") { promise: Promise ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        Permissions.askForPermissionsWithPermissionsManager(
          appContext.permissions,
          promise,
          Manifest.permission.ACTIVITY_RECOGNITION
        )
      } else {
        Permissions.askForPermissionsWithPermissionsManager(appContext.permissions, promise)
      }
    }

    AsyncFunction("requestNotificationPermissionAsync") { promise: Promise ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        Permissions.askForPermissionsWithPermissionsManager(
          appContext.permissions,
          promise,
          Manifest.permission.POST_NOTIFICATIONS
        )
      } else {
        Permissions.getPermissionsWithPermissionsManager(appContext.permissions, promise)
      }
    }

    AsyncFunction("startSessionAsync") { options: StartPedometerSessionOptions ->
      val snapshot = tracker.startSession(
        sessionId = options.sessionId,
        trackingMode = options.trackingMode,
        useForegroundService = options.useForegroundService,
        notificationTitle = options.notificationTitle,
        notificationBody = options.notificationBody,
        notificationColor = options.notificationColor,
        strideMeters = options.strideMeters,
        initialSyncedSteps = options.initialSyncedSteps,
        stepsLabel = options.stepsLabel
      )
      snapshotToMap(snapshot)
    }

    AsyncFunction("pauseSessionAsync") {
      snapshotToMap(tracker.pauseSession())
    }

    AsyncFunction("resumeSessionAsync") { options: ResumePedometerSessionOptions? ->
      val snapshot = tracker.resumeSession(
        trackingMode = options?.trackingMode,
        useForegroundService = options?.useForegroundService,
        notificationTitle = options?.notificationTitle,
        notificationBody = options?.notificationBody,
        notificationColor = options?.notificationColor,
        strideMeters = options?.strideMeters
      )
      snapshotToMap(snapshot)
    }

    AsyncFunction("stopSessionAsync") {
      snapshotToMap(tracker.stopSession())
    }

    AsyncFunction("getSessionSnapshotAsync") Coroutine { ->
      val snapshot = tracker.flushAndReadSnapshot()
      snapshotToMap(snapshot)
    }
  }
}

