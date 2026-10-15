# Working on Cooking Lab

Instructions for any Claude or Claude Code session in this repository.

## Who does what

- **Mike** — product owner. Makes product decisions, uses the app on the Fold,
  says what feels wrong, approves spending, signs into his own accounts. Not a
  developer: never hand him technical or infrastructure choices.
- **Claude (chat)** — architect and engineer. Writes the code, tests and
  records; reviews everything that comes back; decides technical questions.
- **Claude Code on Mike's PC** — everything that needs the PC or the connected
  Fold: native builds, installs, launches, logs, screenshots.

## The first action is always Claude's

Before asking Mike to do anything, find the way Claude or Claude Code can do it
instead. Mike is often away from the PC and the Fold; assume he is.

- **Seeing the phone:** `adb shell am start -n com.cookinglab.personal.test/.MainActivity`,
  wait, then `adb exec-out screencap -p > <file>.png`. Look at the image yourself.
- **Device evidence travels through the repo:** write reports to
  `build-control/slices/reports/`, screenshots to
  `build-control/slices/reports/screens/`, commit, push to `origin main`.
  Never leave a finding only in a chat window.
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
- TEST package only (`APP_VARIANT=test`, `com.cookinglab.personal.test`) until
  Mike approves production signing. Synthetic data only in TEST.
- British English, Celsius, sentence case.
