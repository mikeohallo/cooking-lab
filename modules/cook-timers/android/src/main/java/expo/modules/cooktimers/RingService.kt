package expo.modules.cooktimers

import android.annotation.SuppressLint
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.content.ContextCompat

/**
 * The ring (0.5.0). Started by a timer's exact alarm, as a foreground service
 * of type systemExempted — allowed for an app holding SCHEDULE_EXACT_ALARM
 * that uses it to keep an alarm sounding. Without that permission it is
 * never started: `ring` falls back to TimerNotifications.ringBackup. It plays the phone's own alarm
 * sound, looping, through the alarm stream (so the alarm volume decides, and
 * Do Not Disturb treats it as an alarm), vibrates, and shows which timers
 * are done with Stop. It stops on Stop, or after five minutes, and leaves a
 * quiet "Rest finished at 7:42 pm" for each.
 */
class RingService : Service() {
  companion object {
    const val ACTION_RING = "expo.modules.cooktimers.RING_START"
    const val ACTION_STOP = "expo.modules.cooktimers.RING_STOP"
    const val ACTION_SILENCE = "expo.modules.cooktimers.RING_SILENCE"
    private const val EXTRA_NAME = "name"
    private const val EXTRA_ENDS = "endsAt"
    private const val RING_FOR_MS = 5 * 60_000L

    fun ring(context: Context, timer: RunningTimer) {
      // Without Alarms & reminders, Android refuses this service's type
      // (systemExempted needs SCHEDULE_EXACT_ALARM), and an inexact alarm
      // gives no right to start any foreground service from the background.
      // So the ring is a notification instead: the backup channel's alarm
      // sound, repeating until Stop, never a crash (0.5.0 fix).
      if (!TimerAlarms.canScheduleExact(context)) {
        ringByNotification(context, timer)
        return
      }
      val intent = Intent(context, RingService::class.java)
        .setAction(ACTION_RING)
        .putExtra(TimerAlarms.EXTRA_ID, timer.id)
        .putExtra(EXTRA_NAME, timer.name)
        .putExtra(EXTRA_ENDS, timer.endsAt)
      try {
        ContextCompat.startForegroundService(context, intent)
      } catch (_: IllegalStateException) {
        // ForegroundServiceStartNotAllowedException: not allowed to start now.
        ringByNotification(context, timer)
      } catch (_: SecurityException) {
        ringByNotification(context, timer)
      }
    }

    /** It ran out: the module keeps it no longer, and the app hears so. */
    private fun ranOut(context: Context, timer: RunningTimer) {
      TimerStore.remove(context, timer.id)
      TimerStore.enqueue(context, "ranOut", timer.id, timer.endsAt)
      TimerNotifications.cancel(context, timer.id)
      CookTimersModule.tellQueued()
    }

    private fun ringByNotification(context: Context, timer: RunningTimer) {
      ranOut(context, timer)
      TimerNotifications.ringBackup(context, timer)
    }

    /** The app stopped a timer that may be ringing: quiet for that one, nothing queued. */
    fun silence(context: Context, timerId: String) {
      if (!ringing.containsKey(timerId)) return
      context.startService(
        Intent(context, RingService::class.java).setAction(ACTION_SILENCE).putExtra(TimerAlarms.EXTRA_ID, timerId),
      )
    }

    /** What is ringing now, by timer id. */
    private val ringing = LinkedHashMap<String, RunningTimer>()
  }

  private var player: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private val handler = Handler(Looper.getMainLooper())
  private val timeUp = Runnable { finishAll(stoppedBy = null) }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_RING -> {
        val id = intent.getStringExtra(TimerAlarms.EXTRA_ID)
        if (id == null) {
          stopIfQuiet()
          return START_NOT_STICKY
        }
        val timer = RunningTimer(id, intent.getStringExtra(EXTRA_NAME) ?: "", intent.getLongExtra(EXTRA_ENDS, System.currentTimeMillis()))
        start(timer)
      }
      ACTION_STOP -> finishAll(stoppedBy = System.currentTimeMillis())
      ACTION_SILENCE -> {
        intent.getStringExtra(TimerAlarms.EXTRA_ID)?.let { synchronized(ringing) { ringing.remove(it) } }
        stopIfQuiet()
      }
      else -> stopIfQuiet()
    }
    return START_NOT_STICKY
  }

  private fun start(timer: RunningTimer) {
    synchronized(ringing) { ringing[timer.id] = timer }
    ranOut(this, timer)

    val notification = TimerNotifications.ringing(this, synchronized(ringing) { ringing.values.toList() })
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(TimerNotifications.RING_NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED)
    } else {
      startForeground(TimerNotifications.RING_NOTIFICATION, notification)
    }
    playSound()
    vibrate()
    handler.removeCallbacks(timeUp)
    handler.postDelayed(timeUp, RING_FOR_MS)
  }

  /** Stop pressed (`stoppedBy` is when), or five minutes passed (null): quiet, and a line for each. */
  private fun finishAll(stoppedBy: Long?) {
    val done = synchronized(ringing) { ringing.values.toList().also { ringing.clear() } }
    for (timer in done) {
      if (stoppedBy != null) TimerStore.enqueue(this, "stopped", timer.id, stoppedBy)
      TimerNotifications.showFinished(this, timer)
    }
    if (stoppedBy != null && done.isNotEmpty()) CookTimersModule.tellQueued()
    stopIfQuiet()
  }

  @SuppressLint("MissingPermission")
  private fun stopIfQuiet() {
    val left = synchronized(ringing) { ringing.values.toList() }
    if (left.isNotEmpty()) {
      TimerNotifications.ringing(this, left).let { notification ->
        getSystemService(android.app.NotificationManager::class.java)?.notify(TimerNotifications.RING_NOTIFICATION, notification)
      }
      return
    }
    handler.removeCallbacks(timeUp)
    player?.run {
      try {
        stop()
      } catch (_: IllegalStateException) {
      }
      release()
    }
    player = null
    vibrator?.cancel()
    vibrator = null
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }

  private fun playSound() {
    if (player != null) return
    val uri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
      ?: return
    player = try {
      MediaPlayer().apply {
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        setDataSource(this@RingService, uri)
        isLooping = true
        prepare()
        start()
      }
    } catch (_: Exception) {
      // No sound to play; the vibration and the notification still say it.
      null
    }
  }

  private fun vibrate() {
    if (vibrator != null) return
    val found: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
    if (found == null || !found.hasVibrator()) return
    val pattern = longArrayOf(0, 700, 500)
    val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      @Suppress("DEPRECATION")
      found.vibrate(VibrationEffect.createWaveform(pattern, 0), attributes)
    } else {
      @Suppress("DEPRECATION")
      found.vibrate(pattern, 0, attributes)
    }
    vibrator = found
  }

  override fun onDestroy() {
    handler.removeCallbacks(timeUp)
    player?.release()
    player = null
    vibrator?.cancel()
    super.onDestroy()
  }
}
