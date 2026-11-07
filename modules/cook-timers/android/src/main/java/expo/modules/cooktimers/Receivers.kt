package expo.modules.cooktimers

import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** A timer's exact alarm went off: start the ring. */
class AlarmReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_RING = "expo.modules.cooktimers.RING"
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_RING) return
    val id = intent.getStringExtra(TimerAlarms.EXTRA_ID) ?: return
    val timer = TimerStore.find(context, id) ?: return
    // A minute added just as it was going off: not yet.
    if (timer.endsAt > System.currentTimeMillis() + 1_000) {
      TimerAlarms.arm(context, timer)
      return
    }
    RingService.ring(context, timer)
  }
}

/** +1 min and Stop on a running timer's notification, with the app open or closed. */
class TimerActionReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_ADD_MINUTE = "expo.modules.cooktimers.ADD_MINUTE"
    const val ACTION_STOP = "expo.modules.cooktimers.STOP"
    /** Stop on the backup ring (no Alarms & reminders): it has already run out. */
    const val ACTION_STOP_RING = "expo.modules.cooktimers.STOP_RING"
    const val EXTRA_NAME = "name"
    const val EXTRA_ENDS = "endsAt"
    private const val MINUTE_MS = 60_000L
  }

  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra(TimerAlarms.EXTRA_ID) ?: return
    val now = System.currentTimeMillis()
    when (intent.action) {
      ACTION_ADD_MINUTE -> {
        val timer = TimerStore.find(context, id) ?: return
        TimerAlarms.schedule(context, timer.copy(endsAt = timer.endsAt + MINUTE_MS))
        TimerStore.enqueue(context, "added", id, now, MINUTE_MS)
      }
      ACTION_STOP -> {
        TimerAlarms.cancel(context, id)
        TimerStore.enqueue(context, "stopped", id, now)
      }
      ACTION_STOP_RING -> {
        TimerStore.enqueue(context, "stopped", id, now)
        val name = intent.getStringExtra(EXTRA_NAME) ?: ""
        val endsAt = intent.getLongExtra(EXTRA_ENDS, now)
        // Replaces the ringing notification (same id): quiet from here.
        TimerNotifications.showFinished(context, RunningTimer(id, name, endsAt))
      }
      else -> return
    }
    CookTimersModule.tellQueued()
  }
}

/**
 * After a restart or an app update, both of which clear every alarm, and
 * when Alarms & reminders is turned on or off: running timers are put back,
 * and one that ended while the phone was off is marked finished at its time.
 */
class RestartReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED -> {
        TimerAlarms.restore(context)
        CookTimersModule.tellAlertState()
      }
    }
  }
}
