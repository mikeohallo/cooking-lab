package expo.modules.cooktimers

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.util.Calendar

/**
 * The timers' notifications (0.5.0), on two channels:
 *  - "Timers running", quiet: one ongoing notification per running timer,
 *    with Android's own countdown to its end and +1 min and Stop;
 *  - "Timer finished", high importance: the ring's notification, with Stop.
 * When a ring ends, a quiet "Rest finished at 7:42 pm" is left behind.
 */
object TimerNotifications {
  const val RUNNING_CHANNEL = "cook_timers_running"
  const val FINISHED_CHANNEL = "cook_timers_finished"
  /** The ring's own notification, while the ring service is in the foreground. */
  const val RING_NOTIFICATION = 0x7173

  private val ICON = android.R.drawable.ic_lock_idle_alarm

  fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    val running = NotificationChannel(RUNNING_CHANNEL, "Timers running", NotificationManager.IMPORTANCE_LOW).apply {
      setSound(null, null)
      enableVibration(false)
      setShowBadge(false)
    }
    // The ring service plays the sound and vibrates itself, through the alarm
    // stream; the channel stays silent so they are never doubled.
    val finished = NotificationChannel(FINISHED_CHANNEL, "Timer finished", NotificationManager.IMPORTANCE_HIGH).apply {
      setSound(null, null)
      enableVibration(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannel(running)
    manager.createNotificationChannel(finished)
  }

  /** One id per timer: its ongoing notification, and later its "finished at" line, replace each other. */
  fun idFor(timerId: String): Int = timerId.hashCode() and 0x3fffffff

  private fun openApp(context: Context): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    launch.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
    return PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun action(context: Context, action: String, timerId: String): PendingIntent {
    val intent = Intent(context, TimerActionReceiver::class.java)
      .setAction(action)
      .setData(TimerAlarms.uriFor(timerId))
      .putExtra(TimerAlarms.EXTRA_ID, timerId)
    return PendingIntent.getBroadcast(context, idFor(timerId), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  @SuppressLint("MissingPermission")
  private fun post(context: Context, id: Int, notification: Notification) {
    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return
    try {
      manager.notify(id, notification)
    } catch (_: SecurityException) {
      // Notifications were turned off between the check and the post.
    }
  }

  /** The ongoing countdown for a running timer, on the quiet channel. */
  fun showRunning(context: Context, timer: RunningTimer) {
    ensureChannels(context)
    val notification = NotificationCompat.Builder(context, RUNNING_CHANNEL)
      .setSmallIcon(ICON)
      .setContentTitle(timer.name)
      .setContentText("Ends ${clock(timer.endsAt)}")
      .setWhen(timer.endsAt)
      .setShowWhen(true)
      .setUsesChronometer(true)
      .setChronometerCountDown(true)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
      .setContentIntent(openApp(context))
      .addAction(0, "+1 min", action(context, TimerActionReceiver.ACTION_ADD_MINUTE, timer.id))
      .addAction(0, "Stop", action(context, TimerActionReceiver.ACTION_STOP, timer.id))
      .build()
    post(context, idFor(timer.id), notification)
  }

  /** The ring's notification: which timers are done, and Stop. */
  fun ringing(context: Context, timers: Collection<RunningTimer>): Notification {
    ensureChannels(context)
    val names = timers.map { it.name }
    val title = when (names.size) {
      0 -> "Timer done"
      1 -> "${names[0]} is done"
      else -> "${names.dropLast(1).joinToString(", ")} and ${names.last()} are done"
    }
    val ended = timers.maxOfOrNull { it.endsAt } ?: System.currentTimeMillis()
    val stop = PendingIntent.getService(
      context,
      RING_NOTIFICATION,
      Intent(context, RingService::class.java).setAction(RingService.ACTION_STOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    return NotificationCompat.Builder(context, FINISHED_CHANNEL)
      .setSmallIcon(ICON)
      .setContentTitle(title)
      .setContentText("Ended ${clock(ended)}")
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setSilent(true)
      .setContentIntent(openApp(context))
      .addAction(0, "Stop", stop)
      .build()
  }

  /** What a ring leaves behind once it stops: "Rest finished at 7:42 pm", quiet. */
  fun showFinished(context: Context, timer: RunningTimer) {
    ensureChannels(context)
    val notification = NotificationCompat.Builder(context, RUNNING_CHANNEL)
      .setSmallIcon(ICON)
      .setContentTitle("${timer.name} finished at ${clock(timer.endsAt)}")
      .setShowWhen(false)
      .setSilent(true)
      .setAutoCancel(true)
      .setContentIntent(openApp(context))
      .build()
    post(context, idFor(timer.id), notification)
  }

  fun cancel(context: Context, timerId: String) {
    NotificationManagerCompat.from(context).cancel(idFor(timerId))
  }

  /** "7:42 pm", as the app writes a time. */
  fun clock(at: Long): String {
    val calendar = Calendar.getInstance().apply { timeInMillis = at }
    val hours = calendar.get(Calendar.HOUR_OF_DAY)
    val twelve = if (hours % 12 == 0) 12 else hours % 12
    val minutes = calendar.get(Calendar.MINUTE).toString().padStart(2, '0')
    return "$twelve:$minutes ${if (hours < 12) "am" else "pm"}"
  }
}
