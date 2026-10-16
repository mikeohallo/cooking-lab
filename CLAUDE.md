# Working on Cooking Lab

Instructions for any Claude or Claude Code session in this repository.

## Who does what

- **Mike** — product owner. Makes product decisions, uses the app, says what
  feels wrong, approves spending, signs into his own accounts. Not a
  developer: never hand him technical or infrastructure choices.
  His real notebook is the production app on **his own phone**, which is
  never connected to the PC; it is updated by sideloading the APK
  (Drive → tap → install). "The Fold" in this repo is the **test bench**
  plugged into the PC: everything on it, TEST and production alike, is
  disposable and may be wiped. Real cooking data is never on the Fold.
- **Claude (chat)** — architect and engineer. Writes the code, tests and
  records; reviews everything that comes back; decides technical questions.
- **Claude Code on Mike's PC** — everything that needs the PC or the connected
  Fold: native builds, installs, launches, logs, screenshots.

## The first action is always Claude's

Before asking Mike to do anything, find the way Claude or Claude Code can do it
instead. Mike is often away from the PC and the Fold; assume he is.

- **Seeing the Fold:** `adb shell am start -n com.cookinglab.personal.test/.MainActivity`,
  wait, then `adb exec-out screencap -p > <file>.png`. Look at the image yourself.
- **Device evidence travels through the repo:** write reports to
  `build-control/slices/reports/`, screenshots to
  `build-control/slices/reports/screens/`, commit, push to `origin main`.
  Never leave a finding only in a chat window.
- **Never write a device identifier into any file** — not the serial `adb`
  prints, not an IMEI, not an account name. The repo is public. Say "the Fold".
  `npm run check:secrets` refuses serial-shaped strings; a pre-commit hook
  (`scripts/hooks/pre-commit`, wired by `npm run prepare`) runs it on every
  commit, and CI runs it again. Write the report, then run the checks — not
  the other way round.
- **Prompts for Mike to carry are one line or a single block**, and only when no
  route exists without him.

## Conventions

- Work in slices (`build-control/slices/`). Push straight to `main`; no PRs.
- The milestone runner and queue (`build-control/queue/`, `scripts/build-control-*.ps1`)
  are retired. Do not use them.
- `npm run check:secrets`, `npm run typecheck`, `npm run lint` and `npm test`
  must pass before any push. CI runs all four on GitHub.
- Release builds strip `console.log`. Device-visible state belongs on screen,
  not in the log.
- **Never create a `src/app` folder.** Expo silently uses it as the routes
  folder instead of `app/`; that shipped a build with no Home screen. The
  routes root is pinned in `app.config.ts` and guarded by
  `__tests__/routerRoot.test.ts`.
- Two packages. TEST (`APP_VARIANT=test`, `com.cookinglab.personal.test`)
  is signed with the debug key and holds synthetic data only. Production
  (`com.cookinglab.personal`, no `APP_VARIANT`) is signed with Mike's release
  key from `~/.gradle/gradle.properties` on his PC — the build fails without
  it and never uses the debug key. Real cooking data lives only in production.
  The key, its password and its path never enter this tree or any report.
- British English, Celsius, sentence case.
