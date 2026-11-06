package expo.modules.cooktimers

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** A running timer as the module keeps it: its id, its name and when it ends (ms since the epoch). */
data class RunningTimer(val id: String, val name: String, val endsAt: Long)

/**
 * The module's own small store (0.5.0), outside the encrypted notebook so a
 * timer can ring after a restart, before the app has opened the notebook.
 *
 * It holds running timers only, each as its id, name and end time, and each
 * entry is removed when the timer ends or is stopped. Anything that happens
 * while the app is closed — a timer ran out, +1 min or Stop pressed in a
 * notification — is queued here as an id and a time, and the app applies it
 * to the notebook the next time it runs.
 */
object TimerStore {
  private const val FILE = "cook_timers"
  private const val RUNNING = "running"
  private const val QUEUE = "queue"
  private const val ASKED = "notifications_asked"

  private fun prefs(context: Context) = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  @Synchronized
  fun running(context: Context): List<RunningTimer> {
    val array = JSONArray(prefs(context).getString(RUNNING, "[]") ?: "[]")
    val timers = ArrayList<RunningTimer>()
    for (i in 0 until array.length()) {
      val item = array.optJSONObject(i) ?: continue
      val id = item.optString("id", "")
      if (id.isEmpty()) continue
      timers.add(RunningTimer(id, item.optString("name", ""), item.optLong("endsAt", 0L)))
    }
    return timers
  }

  fun find(context: Context, id: String): RunningTimer? = running(context).firstOrNull { it.id == id }

  @Synchronized
  fun put(context: Context, timer: RunningTimer) {
    write(context, running(context).filter { it.id != timer.id } + timer)
  }

  @Synchronized
  fun remove(context: Context, id: String) {
    write(context, running(context).filter { it.id != id })
  }

  private fun write(context: Context, timers: List<RunningTimer>) {
    val array = JSONArray()
    for (timer in timers) {
      array.put(JSONObject().put("id", timer.id).put("name", timer.name).put("endsAt", timer.endsAt))
    }
    prefs(context).edit().putString(RUNNING, array.toString()).apply()
  }

  /** Queue `ranOut`, `added` or `stopped` for the app. */
  @Synchronized
  fun enqueue(context: Context, kind: String, id: String, at: Long, addedMs: Long? = null) {
    val array = JSONArray(prefs(context).getString(QUEUE, "[]") ?: "[]")
    val event = JSONObject().put("kind", kind).put("id", id).put("at", at)
    if (addedMs != null) event.put("addedMs", addedMs)
    array.put(event)
    prefs(context).edit().putString(QUEUE, array.toString()).apply()
  }

  /** Everything queued, oldest first, and the queue emptied. */
  @Synchronized
  fun takeQueue(context: Context): List<Map<String, Any>> {
    val array = JSONArray(prefs(context).getString(QUEUE, "[]") ?: "[]")
    prefs(context).edit().putString(QUEUE, "[]").apply()
    val events = ArrayList<Map<String, Any>>()
    for (i in 0 until array.length()) {
      val item = array.optJSONObject(i) ?: continue
      val event = HashMap<String, Any>()
      event["kind"] = item.optString("kind", "")
      event["id"] = item.optString("id", "")
      event["at"] = item.optLong("at", 0L).toDouble()
      if (item.has("addedMs")) event["addedMs"] = item.optLong("addedMs", 0L).toDouble()
      events.add(event)
    }
    return events
  }

  fun markAsked(context: Context) {
    prefs(context).edit().putBoolean(ASKED, true).apply()
  }

  fun wasAsked(context: Context): Boolean = prefs(context).getBoolean(ASKED, false)
}
