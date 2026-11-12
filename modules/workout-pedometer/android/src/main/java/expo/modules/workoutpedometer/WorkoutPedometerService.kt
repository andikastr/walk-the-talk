package expo.modules.workoutpedometer

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import java.util.Locale

class WorkoutPedometerService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val tracker = WorkoutPedometerTracker.getInstance(applicationContext)
    val config = tracker.readConfig()

    if (!config.isRecording || !config.useForegroundService) {
      stopForegroundSafely()
      stopSelf()
      return START_NOT_STICKY
    }

    if (!hasActivityRecognitionPermission(this)) {
      Log.w(TAG, "Cannot promote health foreground service without ACTIVITY_RECOGNITION permission.")
      stopForegroundSafely()
      stopSelf()
      return START_NOT_STICKY
    }

    try {
      val notification = buildNotification(this, config, tracker.currentSnapshot())
      val fgsType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
      } else {
        0
      }
      ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, fgsType)
      isServiceRunning = true
      tracker.ensureStartedFromService()
    } catch (e: RuntimeException) {
      Log.w(TAG, "WorkoutPedometerService could not enter foreground: ${e.message}", e)
      isServiceRunning = false
      stopSelf()
      return START_NOT_STICKY
    }

    return START_STICKY
  }

  override fun onDestroy() {
    isServiceRunning = false
    super.onDestroy()
  }

  private fun stopForegroundSafely() {
    isServiceRunning = false
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
  }

  companion object {
    private const val TAG = "WorkoutPedometerSvc"
    private const val CHANNEL_ID = "walk_the_talk_workout_pedometer"
    private const val NOTIFICATION_ID = 481759

    @Volatile
    var isServiceRunning: Boolean = false
      private set

    fun hasActivityRecognitionPermission(context: Context): Boolean {
      return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        ContextCompat.checkSelfPermission(
          context,
          Manifest.permission.ACTIVITY_RECOGNITION
        ) == PackageManager.PERMISSION_GRANTED
      } else {
        true
      }
    }

    fun startOrUpdate(
      context: Context,
      config: PersistedPedometerConfig,
      snapshot: StepSnapshot
    ) {
      if (!hasActivityRecognitionPermission(context)) return

      if (isServiceRunning) {
        updateNotificationIfRunning(context, config, snapshot)
        return
      }

      val intent = Intent(context, WorkoutPedometerService::class.java)
      runCatching {
        ContextCompat.startForegroundService(context, intent)
      }.onFailure { err ->
        Log.w(TAG, "Unable to start WorkoutPedometerService: ${err.message}", err)
      }
    }

    @SuppressLint("MissingPermission")
    fun updateNotificationIfRunning(
      context: Context,
      config: PersistedPedometerConfig,
      snapshot: StepSnapshot
    ) {
      if (!isServiceRunning) return
      runCatching {
        val notification = buildNotification(context, config, snapshot)
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
      }.onFailure { err ->
        Log.w(TAG, "Unable to update pedometer notification: ${err.message}")
      }
    }

    fun stop(context: Context) {
      isServiceRunning = false
      runCatching {
        context.stopService(Intent(context, WorkoutPedometerService::class.java))
      }
    }

    private fun buildNotification(
      context: Context,
      config: PersistedPedometerConfig,
      snapshot: StepSnapshot
    ): Notification {
      ensureChannel(context)

      val bodyText = if (snapshot.totalSteps > 0L) {
        val km = (snapshot.totalSteps * config.strideMeters) / 1000.0
        String.format(
          Locale.US,
          "%d %s · %.2f km",
          snapshot.totalSteps,
          config.stepsLabel,
          km
        )
      } else {
        config.notificationBody
      }

      val builder = NotificationCompat.Builder(context, CHANNEL_ID)
        .setContentTitle(config.notificationTitle)
        .setContentText(bodyText)
        .setSmallIcon(resolveNotificationIcon(context))
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setPriority(NotificationCompat.PRIORITY_LOW)

      parseColor(config.notificationColor)?.let { accent ->
        builder.setColor(accent)
      }

      context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launchIntent ->
        launchIntent.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        val piFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val contentIntent = PendingIntent.getActivity(context, 0, launchIntent, piFlags)
        builder.setContentIntent(contentIntent)
      }

      return builder.build()
    }

    private fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
      if (manager.getNotificationChannel(CHANNEL_ID) != null) return

      val appName = context.applicationInfo.loadLabel(context.packageManager).toString()
      val channel = NotificationChannel(
        CHANNEL_ID,
        appName,
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Active indoor workout step tracking"
        setShowBadge(false)
      }
      manager.createNotificationChannel(channel)
    }

    private fun resolveNotificationIcon(context: Context): Int {
      val customIcon = context.resources.getIdentifier(
        "notification_icon",
        "drawable",
        context.packageName
      )
      if (customIcon != 0) return customIcon

      val locIcon = context.resources.getIdentifier(
        "location_foreground_service_icon",
        "drawable",
        context.packageName
      )
      if (locIcon != 0) return locIcon

      return context.applicationInfo.icon
    }

    private fun parseColor(raw: String?): Int? {
      if (raw.isNullOrBlank()) return null
      return runCatching { Color.parseColor(raw) }.getOrNull()
    }
  }
}

