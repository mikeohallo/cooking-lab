package expo.modules.cooktimers

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build

/**
 * A running timer's exact alarm (0.5.0): `setExactAndAllowWhileIdle`,
 * RTC_WAKEUP, at its end time, so it rings on time with the phone asleep.
 * Without Alarms & reminders (Android 12 and later) the alarm is set inexact:
 * it goes off perhaps late, rings through the backup channel's notification
 * (no ring service may start then), and the app says so.
 */
object TimerAlarms {
  const val EXTRA_ID = "timerId"

  fun uriFor(timerId: String): Uri = Uri.parse("cooklab-timer://timer/${Uri.encode(timerId)}")

  fun canScheduleExact(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    val manager = context.getSystemService(AlarmManager::class.java) ?: return false
    return manager.canScheduleExactAlarms()
  }

  private fun alarmIntent(context: Context, timerId: String): PendingIntent {
    val intent = Intent(context, AlarmReceiver::class.java)
      .setAction(AlarmReceiver.ACTION_RING)
      .setData(uriFor(timerId))
      .putExtra(EXTRA_ID, timerId)
    return PendingIntent.getBroadcast(
      context,
      TimerNotifications.idFor(timerId),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  /** Set (or move) the alarm for this timer. */
  fun arm(context: Context, timer: RunningTimer) {
    val manager = context.getSystemService(AlarmManager::class.java) ?: return
    val pending = alarmIntent(context, timer.id)
    try {
      if (canScheduleExact(context)) {
        manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timer.endsAt, pending)
      } else {
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timer.endsAt, pending)
      }
    } catch (_: SecurityException) {
      // Alarms & reminders was turned off between the check and the call.
      manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timer.endsAt, pending)
    }
  }

  /** The app started, resumed, or added time to a timer: keep it, arm it, show its countdown. */
  fun schedule(context: Context, timer: RunningTimer) {
    TimerStore.put(context, timer)
    arm(context, timer)
    TimerNotifications.showRunning(context, timer)
  }

  /** Paused, stopped or gone: no alarm, no notification, nothing kept, and quiet if it is ringing. */
  fun cancel(context: Context, timerId: String) {
    context.getSystemService(AlarmManager::class.java)?.cancel(alarmIntent(context, timerId))
    TimerStore.remove(context, timerId)
    TimerNotifications.cancel(context, timerId)
    RingService.silence(context, timerId)
  }

  /**
   * After a restart, an app update or a change to Alarms & reminders: every
   * kept timer still to come is armed again; one that ended meanwhile is
   * queued as having run out at its own end time, and leaves its line.
   */
  fun restore(context: Context) {
    val now = System.currentTimeMillis()
    for (timer in TimerStore.running(context)) {
      if (timer.endsAt > now) {
        arm(context, timer)
        TimerNotifications.showRunning(context, timer)
      } else {
        TimerStore.remove(context, timer.id)
        TimerStore.enqueue(context, "ranOut", timer.id, timer.endsAt)
        TimerNotifications.showFinished(context, timer)
      }
    }
    CookTimersModule.tellQueued()
  }
}
