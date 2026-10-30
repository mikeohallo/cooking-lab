# Cooking Lab

[![CI](https://github.com/mikeohallo/cooking-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/mikeohallo/cooking-lab/actions/workflows/ci.yml)

**For** one cook, on one Android phone, who wants a dish to get better each time it's made. **It does** three things today: records a cook as it happens (notes, photos, oven and food temperatures), asks one question afterwards and keeps the answer in the cook's own words, and finds any cook again by title or tag. Evidence is kept apart from interpretation, and nothing the cook writes is lost: an edit keeps the earlier words, and a cook is only deleted when its owner deletes it.

**Try it:** the app is built from this repo and installed on your own phone (see "Building the TEST APK"); there's nothing to download. Everything but the build runs anywhere with Node: `npm ci && npm test`.

**What's measured:** 1061 automated tests across 65 suites, run with typecheck, lint, a secrets check and a dependency audit on every push (badge above). The public repository has been through three outside assessments. The third called it "a substantial personal product with strong automated coverage", and found a screenshot showing the test phone's whole app drawer, wording that contradicted itself about privacy and history, a test-build screenshot that wasn't the test build, and a critical dependency advisory. Each was fixed: the screenshots were cropped in every commit (`build-control/history-rewrites.md` explains both history rewrites), a guard now stops mixed test builds, and advisories are triaged in `build-control/dependency-triage.md` with CI failing on any critical one.

**Where the AI is:** not in the app yet. Next, without AI, the app brings back last time's note when the same dish comes round again. After that, Claude may propose a summary and next-time suggestions after a review; the cook keeps, edits or discards them, and nothing enters the record without the cook's approval. Claude built the app as architect and engineer; the product owner set direction, made the product calls and tested on the phone. Privacy is the architecture: an encrypted database on the phone, no account, no cloud storage, no analytics.

A private, local-first cooking notebook for a single Android device.

    Cook -> Observe -> Review -> Learn -> Cook Again

## About this project

Cooking Lab is a personal product built to answer one question: does a kitchen
get better at a dish when it keeps an honest record of what actually happened?
The app records a cook as it happens — notes, temperatures, photographs —
asks one question afterwards, and stores the answer in the cook's own words.
Evidence is kept strictly separate from interpretation: an assistant may
*propose* findings and lessons, but nothing enters history until the cook
approves it. Nothing the cook writes is lost: an edit keeps the earlier words,
and a cook is only deleted when its owner deletes it.

It is also an experiment in how a product leader builds software with AI.
The product owner sets direction, makes product decisions and tests on the
phone; Claude acts as architect and engineer, writing the code, the tests and
the records in `build-control/`; Claude Code on the owner's PC handles native
builds and device installs. The repository keeps its record, including the
earlier milestone process and the lighter "slices" process that replaced it.
Its history has been rewritten twice for privacy — before it went public, and
to crop screenshots — and
[`build-control/history-rewrites.md`](./build-control/history-rewrites.md)
explains what changed and how old commit references map to new ones. The
working rules are in [`CLAUDE.md`](./CLAUDE.md); the current process and plan
are in [`build-control/slices/README.md`](./build-control/slices/README.md).

Privacy is the architecture, not a setting. Cooks are stored in an encrypted
database on the phone. There is no account, no cloud backend, no cloud storage
and no analytics, and none is planned. The only remote call the app is planned
to make is to an AI model, in a later slice.

**Current state (0.2.2):** a cook can be started in one tap and captured as
it happens:

* **Notes and photos.** A photo chosen from the Gallery goes into the timeline
  at the time it was taken, read from its own date and time (never its
  location); one taken with the camera goes in as it is taken.
* **Oven and Internal readings** in Celsius, each labelled with what it was
  taken of, plus a free-text reading for anywhere else.
* **Tags and search.** Cooks can be tagged in the kitchen's own words, and
  History searches titles and tags together, saying which cooks matched
  everything you typed and which matched part of it.
* **Editing with history.** Any note, and the verdict once a cook is reviewed,
  can be edited. The edit is kept beside the earlier words rather than over
  them: the timeline shows the latest, marked "edited", and every earlier
  version can be read with its time. The title can be changed on any cook.
* **Deleting a cook.** Long-press a cook, or use ⋯ on its page, then confirm.
  "Cook deleted · Undo" stays up for a few seconds; after that the cook, its
  notes, readings, photos and edits are gone for good.
* **The screen stays on** while an open cook is in front, so it doesn't sleep
  mid-cook. A toggle on the cook's page turns it off for that cook.

**On `main`, not yet in a build (0.3.0, part 1 of 2):** a meal type on every
cook; an Ingredients box at the top of every cook, every version kept; a review
that asks who ate it (one to five stars, or N/A for someone who didn't, a line,
guests) from a household list kept on the phone; *Cook this again*, which
starts a new cook with the same title, tags, meal type and ingredients and
shows what was said last time; and History searching ingredients and filtering
by meal type and by who gave how many stars. See
`build-control/slices/RELEASE_0.3.0_PART1.md`.

A cook is then reviewed with a verdict in the cook's own words and found again
in History. The cook screen scrolls however long a note gets, and the note box,
Send and the reading buttons stay reachable above the keyboard.

A photograph is re-encoded into the app's own private storage with its
metadata removed, so a picture of dinner does not carry the location of the
kitchen it was cooked in. It is a copy: deleting the original from the phone's
Gallery leaves the cook intact, and nothing is ever written back to the
Gallery.

Cooks are stored on the phone, and you choose what to export or share: every
cook as one portable backup file, or one cook as plain text, through the system
share sheet. An exported file is ordinary, readable text — it is not
encrypted, so it is as private as wherever you put it. AI suggestions, Cook
Again briefings and restoring from a backup are planned and not built yet (see
[`build-control/slices/`](./build-control/slices/README.md)).

## Quickstart

Everything except building the APK runs on any machine with Node:

```bash
node --version      # Node 22 or 24; CI uses 24
npm ci              # install exactly what package-lock.json says
npm run check:secrets
npm run typecheck
npm run lint
npm test
```

Those four checks are what CI runs on every push. Building an Android APK also
needs JDK 17 and the Android SDK (Android Studio installs both; set
`ANDROID_HOME`), and is described below.

## Baseline

| | |
|---|---|
| Framework | Expo SDK 57 (React Native 0.86, React 19.2) |
| Language | TypeScript, `strict` mode |
| Navigation | Expo Router (file-based, `app/`) |
| Package manager | npm |
| Platform | Android only |
| Native projects | Continuous Native Generation — `android/` is generated build output and is **not** committed |

## Application variants

The reserved Android identities live in [`app.variants.json`](./app.variants.json),
which is the single source of truth. `app.config.ts` reads it at build time to
stamp the native identity; `src/config/variants.ts` reads it at runtime.

| `APP_VARIANT` | Display name | Android package |
|---|---|---|
| *(unset)* / `production` | Cooking Lab | `com.cookinglab.personal` |
| `test` | Cooking Lab Test | `com.cookinglab.personal.test` |

The two packages occupy separate Android sandboxes and can be installed side by
side. An unrecognised `APP_VARIANT` is a hard error, never a silent fall back to
production. Only the TEST variant renders the TEST badge and notice; production
cannot reach that behaviour.

## Android permissions

The installed app has two, and the list is held in place by a test
(`__tests__/androidPermissions.test.ts`) that works out the merged manifest
from every installed native module and fails if anything else appears.

| Permission | Why |
|---|---|
| `CAMERA` | Taking a photograph of a cook. Android asks for camera access the first time a photo is taken, and not before. |
| `INTERNET` | Required by the Metro development client; the app itself makes no network calls. |

Everything else any dependency declares is stripped in `app.config.ts`.
Notably there is **no storage or media permission**: a picture from the phone
is chosen through Android's own system photo picker, which runs outside the
app and hands over the one file the person chose, so it needs no storage
permission and the app never has access to the photo library at all.

Keeping the screen on during a cook needs no permission either: it is a
property of the app's own window (`expo-keep-awake`), not a wake lock.

A photograph is re-encoded into app-private storage as a JPEG with its long
edge capped and every metadata segment removed — EXIF, GPS, XMP and comments —
by the app's own code rather than by trusting the platform to do it
(`src/data/photos/jpeg.ts`). Nothing is written back to the Gallery.

## Commands

```bash
npm run check:secrets    # nothing key-shaped in the tree (also runs in CI)
npm run typecheck        # tsc --noEmit (strict)
npm run lint             # eslint
npm test                 # jest (jest-expo + React Native Testing Library)
npm run doctor           # expo-doctor
npx expo install --check # dependency compatibility against the SDK

# Inspect the resolved config without building
node node_modules/expo/bin/cli config --type public
APP_VARIANT=test node node_modules/expo/bin/cli config --type public
```

## Building the TEST APK

Builds on Mike's PC start from a named commit and a clean tree — see
"Builds" in [`CLAUDE.md`](./CLAUDE.md). The APK's version name carries that
commit, e.g. `0.2.0 (e24bfd6)`.

```bash
APP_VARIANT=test npx expo prebuild --platform android --clean
cd android
APP_VARIANT=test ./gradlew assembleRelease --max-workers=2 -PreactNativeArchitectures=arm64-v8a
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

* Standalone — the JavaScript bundle is embedded, so **Metro is not required**.
* Signed with the shared, disposable Android **debug** keystore
  (`android/app/debug.keystore`), which is fine for a test app and nothing else.
* Drop `-PreactNativeArchitectures` to build all ABIs instead of arm64-v8a only.

`APP_VARIANT` must be set for both the prebuild and the Gradle invocation: the
first stamps the native identity, the second embeds the resolved app config
that the screens read. If they differ, the build stops and says so
([`plugins/withVariantGuard.js`](./plugins/withVariantGuard.js)); before that
guard existed, a TEST build once shipped with production's screens.

## Building the production APK

```bash
npx expo prebuild --platform android --clean
cd android
./gradlew assembleRelease --max-workers=2 -PreactNativeArchitectures=arm64-v8a
```

Same output path, and `APP_VARIANT` must be unset (or `production`) for both
steps. The difference is the signature: a production build is signed with
Cooking Lab's own release key, which
[`plugins/withReleaseSigning.js`](./plugins/withReleaseSigning.js) wires into
the generated project on every prebuild. The key and its password live on the
building machine only, as four lines in that machine's
`~/.gradle/gradle.properties`:

```
COOKING_LAB_STORE_FILE=<absolute path to the .jks>
COOKING_LAB_STORE_PASSWORD=<password>
COOKING_LAB_KEY_ALIAS=cooking-lab
COOKING_LAB_KEY_PASSWORD=<password>
```

Without them a production build **fails** with a message naming what is
missing. It never falls back to the debug key: an app anyone could sign an
update for is not the real app.

The key stays out of this repository because it lives outside it, on the
building machine. As a second line, `.gitignore` excludes
`*.jks` and `*.keystore`, and the secrets check (the pre-commit hook and CI)
refuses private-key blocks and other key-shaped text. Those checks catch
mistakes; they can't make a leak impossible. Losing the key is the one
unrecoverable event in this project, so it is backed up off the machine that
builds with it.

Installing on a phone that is not plugged in: copy the APK to the phone (Drive
is enough), tap it, allow the installer once. An update over an installed copy
keeps its data as long as the signature matches and `versionCode` has gone up —
so bump `versionCode` in `app.config.ts` for every build that will update an
installed app.

## Dependencies

`npm audit` findings are triaged in
[`build-control/dependency-triage.md`](./build-control/dependency-triage.md):
for each one, whether it ships in the app, whether hostile input can reach it,
and the fix or a dated reason to accept it. CI fails on any critical advisory;
lower ones are tracked there, so a green badge doesn't mean there are none.

## Responsive foundations

The Samsung Fold cover display is a first-class target. Layout decisions come
from one pure function, `computeLayoutMetrics` in `src/layout/responsive.ts`,
rather than ad-hoc width checks:

* usable down to 320 dp with no horizontal scrolling;
* touch targets of 48 dp minimum, 64 dp for primary actions;
* safe-area insets on all edges;
* content column centred and capped at 560 dp so text never stretches across an
  unfolded screen;
* no fixed heights, so Android font scaling grows the layout instead of clipping.

## Licence

MIT — see [`LICENSE`](./LICENSE). It covers the code and documentation. The
Cooking Lab name and icon are not part of it.
