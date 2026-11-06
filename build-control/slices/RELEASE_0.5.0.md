# Release 0.5.0 — kitchen timers and tabletop mode

**Status:** built, tests green on the desktop, the native code compiled in a
TEST build; not yet tried on a device
**Date:** 6 November 2026 (brief approved by Mike at 14:59 Sydney time); built the same day
**Version:** 0.5.0 (`versionCode` 9)
**Schema:** version 6 · **Backup format:** version 6
**Builds on:** 0.4.1 (`RELEASE_0.4.1.md`), at `7ecbab9`

Timers and tabletop mode, plus two fixes, from Mike's 0.5.0 brief, in one
development run, built from the pictures Mike approved (cover screen, inner
screen, tabletop mode). No new npm packages; one new Gradle dependency,
`androidx.window:window:1.5.1` (Jetpack WindowManager). No images. Design
Baseline v3 has a 0.5.0 section (section 10).

## What's in

1. **Timers in the notebook.** Migration 6 adds `timers`: id, cook, name,
   colour, length, started at, ends at, what was left while paused, when it
   ran out, when it was stopped. A timer is its end time, never a ticking
   count. Every write goes through the timer service as the user, like a
   reading; the assistant is refused. Colour by name: Meat warm, Veg green,
   Rest blue; any other name the next of plum and gold not taken, then round
   again; a name keeps its colour. A name's last length is read from the
   table. Backup format 6 carries timers; 1 to 5 still read, as having none.
   Export this cook adds "Timers: Rest 15 min, ended 7:42 pm". Deleting a
   cook cancels its timers in the timers module when its Undo window passes
   (or at the next start, if the app closed during it).
   The column for when a timer ran out is `ran_out_at`: the schema's guard
   against the rejected *cook* finish time (`finished_at`, from the first
   foundation trial) is left exactly as it was.
2. **Timer logic** (`src/timers/`, pure TypeScript): start, pause, resume,
   +1 and +5 min, stop, ran out, one that ended while the phone was off;
   the order (finished first, then the soonest); "4:32" and "1:05:00"; what
   TalkBack says ("Rest, 4 minutes 32 seconds left", "Rest is done", said
   once when it runs out; never a live region, so the seconds are not read as
   they tick). The dock's rules in `src/timers/dock.ts`.
3. **The timers module** (`modules/cook-timers`, Kotlin, Expo Modules API,
   autolinked from `./modules`): exact alarms (`setExactAndAllowWhileIdle`,
   RTC_WAKEUP, at the end time; inexact if Alarms & reminders is off, so it
   still rings, late); notification permission, asked the first time a timer
   starts; one ongoing notification per running timer with Android's own
   countdown, +1 min and Stop, on a quiet "Timers running" channel; the ring,
   a foreground service of type systemExempted playing the phone's alarm
   sound looping through the alarm stream, vibrating, with Stop, on a "Timer
   finished" channel, for up to five minutes, then a quiet "Rest finished at
   7:42 pm"; a restart receiver (also on an app update, which clears alarms
   too, and when Alarms & reminders changes); its own small store and queue
   (below); the fold's posture from WindowManager. A stub for the web preview;
   a mock in Jest.
4. **Screens.** Timer beside Oven and Internal. New timer: Meat, Veg, Rest,
   names used before, or typed; 5 to 90 minutes, or a minute at a time (a
   long press is five); a used name starts at its last length; "Start Rest ·
   15 min". Running timers above the composer on an open cook, and inside its
   Cooking now card on Home (and above Cook this again on a reviewed cook
   whose timers are still going). Tap for +1 min, +5 min, Pause/Resume, Stop
   (on Home as well); tap a finished one to stop it. One line when alerts are
   off or not on time, opening the setting. The review says in one line that
   running timers keep going.
5. **Tabletop mode**, as Design Baseline v3 section 10 describes: the page
   split at the fold, nothing across it; five big buttons (Timer, Oven,
   Internal, Photo, Note), each opening what it opens on the cook page (Note
   opens a note sheet sharing the composer's words); one Stop when a timer is
   done; screen kept on; back the moment it is not tabletop.
6. **Fixes.** (a) Every scroll view keeps its place through a live font-size
   or display-size change: the composer's footer, every sheet's body, the
   list of earlier versions, as well as each screen's own scrolling area.
   (b) The More menu's last line adds the text size: "0.5.0 (`<commit>`) ·
   752 × 835 · text 1.15".
7. **Web preview.** The open cook has Gravy, Veg and Meat running and Rest
   run out. New screens: `timers`, `timer-sheet`, `timer-done`, `tabletop`,
   `tabletop-done`, each reached by the screen's own controls.
   `?posture=tabletop&foldAt=<dp>` feeds the module's web stub.

## Permissions, and why

Each is in `app.config.ts` with its reason, and
`__tests__/androidPermissions.test.ts` holds the merged list to exactly
CAMERA and INTERNET (as before) and these six:

| Permission | Why |
|---|---|
| `POST_NOTIFICATIONS` | A running timer's countdown and the "is done" alarm. Asked the first time a timer starts, never before |
| `SCHEDULE_EXACT_ALARM` | To ring at the end, to the second, with the phone asleep. Mike can turn it off in Alarms & reminders; the app then says so |
| `RECEIVE_BOOT_COMPLETED` | A restart clears every alarm: running timers are put back, and one that ended meanwhile is marked finished at its time |
| `VIBRATE` | A finished timer vibrates while it rings. Blocked until 0.5.0; taken off the block list on purpose |
| `FOREGROUND_SERVICE` | The ring keeps sounding with the app closed, with its own notification and Stop |
| `FOREGROUND_SERVICE_SYSTEM_EXEMPTED` | The ring service's type: allowed for an app holding SCHEDULE_EXACT_ALARM that uses it to keep an alarm sounding |

`USE_EXACT_ALARM` is not used, and is on the block list in case anything
ever brings it. The module's own manifest declares no permission (only its
receivers and the ring service), and the test checks that too.

## What is kept outside the encrypted notebook while a timer runs

So that a timer can ring after the phone restarts, before the app has opened
the notebook, the timers module keeps a small store of its own (Android
shared preferences, private to the app):

- **For each running timer: its id (a random device-made id), its name, and
  when it ends.** Nothing else about the cook: not the dish, not the cook's
  id, no notes. The entry is removed when the timer ends, is paused, or is
  stopped.
- **A queue of what happened while the app was closed**: that a timer ran
  out, had a minute added or was stopped from its notification, each as the
  timer's id, a time and (for added time) how much. The app applies it to
  the notebook at its next launch, or at once when it is open, and the queue
  is emptied as it is read.
- A note that notifications have been asked for once.

While a timer runs its name also shows in its notification. Android's own
backup of app data is not turned off in this release; because an entry
lives only while its timer runs, little could be in one. Mike's call if he
wants it excluded.

## The commits

On `7ecbab9`, oldest first, all by Claude <noreply@anthropic.com>:

- `c6999f1` feat: kitchen timers in the notebook (schema 6, backup format 6)
- `1181874` feat: the timers module: exact alarms, the ring, restarts, and the fold's posture
- `c3b71ae` feat: timers on the cook page, in Cooking now and on the review, and tabletop mode
- `6dd8185` fix: a live font-size or display-size change keeps every scroll view's place
- `b35118c` fix: the More menu's last line says the text size
- `8ec6960` chore: version 0.5.0, versionCode 9
- this record, with Design Baseline v3 and the slices table: `docs: …` (the last commit)

## Checks

- `npm run check:secrets`, `npm run typecheck`, `npm run lint` (no
  warnings) and the full Jest suite: all pass at the head (101 suites, 2061
  tests). The commits in between were not each run through the suite.
- New tests: `timersModel` (the end-time arithmetic, order, colours, last
  length, words), `timersData` (writes as the user, refusals, backup format 6
  round trip byte for byte, formats 2 to 5 read, Export this cook, delete
  cancels), `cookTimersModule` (the module's JavaScript contract against its
  mock, the web stub and the Kotlin), `timerDock` (every window 320 to 1200
  at 1.0, 1.15 and 1.3, measured in the app's font), `timerScreens` (New
  timer, the dock and its actions, alerts, the queue, the review's line,
  Home, tabletop's layout fed a fold and back when flat, its five labels).
- Extended: `touchOverlap` (every new control, the full list behind "+ N
  more", tabletop's sheets), `contrast` (the timer pairs, both themes),
  `keepPlace` (timers, New timer open with its typed name, and the sheet's,
  footer's and page's scroll after a recreation), `versionLine`.
- Changed because they pinned version 5 or the old permission list:
  migrations and the schema and backup upgrade tests, `controlledModel`,
  `deleteNote`, `typeScale`, `androidPermissions`, `appConfig`, the
  synthetic fixture; and the preview tests learned the tabletop screens.
  None deleted.
- The Kotlin compiled in a throwaway TEST build (prebuild for TEST, then
  `assembleRelease`, arm64-v8a, CMake 3.31.6): BUILD SUCCESSFUL in 13 min
  58 s, no warnings from the module; not installed. The merged manifest asks
  for exactly CAMERA, INTERNET and the six above, and declares the ring
  service as systemExempted. It also carries androidx.core's own
  `<package>.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, a signature
  permission private to the app, which the permission test cannot see (it
  comes from a compiled library).

## Decisions

- **`ran_out_at`, not `finished_at`** (see 1).
- **Restart receiver also on an app update and on an Alarms & reminders
  change.** Both clear or change alarms; neither needs a permission.
- **A finished timer is left ringing until Stop**: the app never cancels an
  alarm that has gone off; Stop (in the app, the notification or tabletop
  mode) silences it.
- **Tapping a running timer in Cooking now opens its actions there**, as on
  the cook page.
- **At 320 dp with text at 1.3** a long name ("Yorkshire puddings" with
  22:10) does not fit a whole row and is cut with an ellipsis; TalkBack
  reads it whole. From 360 dp (the Fold's cover is 369) ordinary names fit.

## Not tried on a device

All of it: the brief said no install and no device work. The ring, the
notifications, the restart receiver, exact alarms and the posture from
WindowManager have been compiled, not run.
