package expo.modules.cooktimers

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import expo.modules.interfaces.permissions.PermissionsResponseListener
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Cooking Lab's timers module (0.5.0), through the Expo Modules API.
 *
 * What the JavaScript hands over for a running timer is its id, its name and
 * its end time; that is all this module keeps (`TimerStore`), and only while
 * the timer runs. The functions here match `src/CookTimers.types.ts`.
 */
class CookTimersModule : Module() {
  companion object {
    private var live: WeakReference<CookTimersModule>? = null

    /** Something was queued: tell the app if it is open. */
    fun tellQueued() {
      live?.get()?.sendQueued()
    }

    /** Notifications or Alarms & reminders may have changed: tell the app if it is open. */
    fun tellAlertState() {
      live?.get()?.sendAlertState()
    }
  }

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
  private var postureJob: Job? = null
  private var posture: Map<String, Any>? = null
  private var lastAlerts: Map<String, Any>? = null

  override fun definition() = ModuleDefinition {
    Name("CookTimers")

    Events("onQueued", "onAlertState", "onPosture")

    OnCreate {
      live = WeakReference(this@CookTimersModule)
      appContext.reactContext?.let { TimerNotifications.ensureChannels(it) }
    }

    OnDestroy {
      stopPosture()
      scope.cancel()
      if (live?.get() === this@CookTimersModule) live = null
    }

    OnActivityEntersForeground {
      startPosture()
      sendAlertState()
    }

    OnActivityEntersBackground {
      stopPosture()
    }

    Function("schedule") { id: String, name: String, endsAt: Double ->
      TimerAlarms.schedule(context, RunningTimer(id, name, endsAt.toLong()))
    }

    Function("cancel") { id: String ->
      TimerAlarms.cancel(context, id)
    }

    Function("alertState") {
      alertState(context)
    }

    AsyncFunction("requestNotifications") { promise: Promise ->
      val ctx = context
      val permissions = appContext.permissions
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || permissions == null) {
        promise.resolve(notificationState(ctx))
        return@AsyncFunction
      }
      TimerStore.markAsked(ctx)
      permissions.askForPermissions(
        PermissionsResponseListener {
          promise.resolve(notificationState(ctx))
          sendAlertState()
        },
        Manifest.permission.POST_NOTIFICATIONS,
      )
    }

    Function("openNotificationSettings") {
      val ctx = context
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName)
      } else {
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}"))
      }
      open(intent)
    }

    Function("openExactAlarmSettings") {
      val ctx = context
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        open(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${ctx.packageName}")))
      }
    }

    Function("takeQueued") {
      TimerStore.takeQueue(context)
    }

    Function("posture") {
      posture
    }
  }

  private fun open(intent: Intent) {
    val activity: Activity? = appContext.currentActivity
    if (activity != null) {
      activity.startActivity(intent)
    } else {
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }

  private fun notificationState(ctx: Context): String {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val granted = ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) ==
        PackageManager.PERMISSION_GRANTED
      if (granted) return if (NotificationManagerCompat.from(ctx).areNotificationsEnabled()) "granted" else "denied"
      return if (TimerStore.wasAsked(ctx)) "denied" else "undetermined"
    }
    return if (NotificationManagerCompat.from(ctx).areNotificationsEnabled()) "granted" else "denied"
  }

  private fun alertState(ctx: Context): Map<String, Any> =
    mapOf("notifications" to notificationState(ctx), "exactAlarms" to TimerAlarms.canScheduleExact(ctx))

  private fun sendQueued() {
    sendEvent("onQueued", mapOf("count" to 1))
  }

  private fun sendAlertState() {
    val ctx = appContext.reactContext ?: return
    val state = alertState(ctx)
    if (state != lastAlerts) {
      lastAlerts = state
      sendEvent("onAlertState", state)
    }
  }

  /** Where the fold is, from WindowManager, while the app is in front. */
  private fun startPosture() {
    val activity = appContext.currentActivity ?: return
    postureJob?.cancel()
    postureJob = scope.launch {
      WindowInfoTracker.getOrCreate(activity).windowLayoutInfo(activity).collect { info ->
        val density = activity.resources.displayMetrics.density
        val fold = info.displayFeatures.filterIsInstance<FoldingFeature>().firstOrNull()
        val next: Map<String, Any>? = fold?.let {
          mapOf(
            "tabletop" to (it.state == FoldingFeature.State.HALF_OPENED &&
              it.orientation == FoldingFeature.Orientation.HORIZONTAL),
            "foldTop" to (it.bounds.top / density).toDouble(),
            "foldBottom" to (it.bounds.bottom / density).toDouble(),
          )
        }
        if (next != posture) {
          posture = next
          sendEvent("onPosture", mapOf("posture" to next))
        }
      }
    }
  }

  private fun stopPosture() {
    postureJob?.cancel()
    postureJob = null
  }
}
