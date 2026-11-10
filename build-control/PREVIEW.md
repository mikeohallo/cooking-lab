# The web preview

Added in 0.4.0, part 7. The app's real screens, drawn in a browser on the PC,
so the build chat can look at every screen at any size, font scale and theme
without a phone.

## What it is

- **The real app.** The same screens, components, tokens and fonts as the
  APK, bundled for the web with `react-native-web`.
- **A synthetic notebook.** On the web the app always runs in preview mode:
  an unencrypted SQLite database in memory, made by the app's own migrations
  and filled from the preview data set (`src/preview/seed.web.ts`) through the
  app's own services. Nothing is kept: a reload starts it again.
- **The preview data set.** Two open cooks (apple-cinnamon muffins a second
  time, with Last time, Next time, an Oven and an Internal reading, notes with
  one edited, and photos; a chicken traybake the first time); twelve reviewed
  cooks across all five meals, some with a cuisine (one Other) and some
  without; ratings from You, Guest and Guest 2, with an N/A and a line;
  ingredients and tags. Photos are flat colour blocks drawn in code. The only
  names are You, Guest and Guest 2.
- **Web only.** Every preview file ends `.web.ts` or `.web.tsx`
  (`src/preview/`, `src/data/runtime.web.ts`). Shared code reaches it in two
  places only, each behind `Platform.OS === 'web'`, which Metro removes from
  an Android bundle. `__tests__/previewNotInAndroid.test.ts` holds that shape.
- **Stubs.** The camera and photo library answer "cancelled"; sharing an
  export does nothing. The encrypted database, the key store and the phone's
  file system are never asked for on the web, so they need no stub.

## Build

```bash
npm run preview:web
```

This exports to `preview-web/` (git-ignored): `index.html`, one web bundle,
SQLite's worker and its `.wasm`, and the font files. About a minute.

## Serve

```bash
npm run preview:serve
```

Then open <http://127.0.0.1:8090/>. Another port: `npm run preview:serve -- 8095`.

`scripts/serve-preview.mjs` uses Node's own `http` module and no package. It
listens on 127.0.0.1 only, and answers any path that is not a file with
`index.html`, so the app's routes (`/cook/<id>`, `/household`) load directly.

### Headers

- **Needed:** `.wasm` served as `application/wasm`. SQLite runs as
  WebAssembly and the browser won't compile it as anything else.
- **Not needed:** the cross-origin isolation headers. The preview uses only
  expo-sqlite's async calls, which need no `SharedArrayBuffer`. The server
  sends them anyway (`Cross-Origin-Opener-Policy: same-origin`,
  `Cross-Origin-Embedder-Policy: require-corp`), as expo-sqlite's web docs
  ask; every file the preview loads is its own, so they block nothing.
- Any other static server works if it serves `.wasm` correctly and falls back
  to `index.html`.

### One tab at a time per address

expo-sqlite's web build takes a lock on its storage in the browser's private
file system (OPFS) when it starts, even for an in-memory database. A second
tab, or an `<iframe>`, on the same address shows "Cooking Lab could not open
its notebook". To look at two side by side, serve twice on two ports
(`npm run preview:serve -- 8091`); each port is its own address. The lock
holds nothing of the notebook.

## URLs

All options are query parameters and can be combined.

| Option | Values | What it does |
|---|---|---|
| `?screen=` | see below | Opens one screen directly, in the state the design pack shows. Without it, the whole app runs from Home |
| `?theme=` | `light`, `dark` | The theme. Without it, the browser's own light or dark setting decides, as the phone's does |
| `?fontScale=` | 0.5 to 3, e.g. `1.15` | Multiplies every text style's size and line height (a browser has no font scale). Spacing and drawn sizes stay, as on the phone |

| `?screen=` | What it shows | Design pack |
|---|---|---|
| `home` | Home: Cooking now (two cooks) and Your cooks | 01, 10, 13 |
| `filters` | Home with the Filters sheet open | 02 |
| `empty` | Home on an empty notebook | 03 |
| `whos-eating` | Who's eating (You, Guest) | 04 |
| `cook` | The muffins, cooked a second time: Next time, Last time, readings, notes, photos | 05, 11, 14 |
| `add-reading` | The same cook with Add a reading open on Internal | 06 |
| `review` | The review of that cook | 07, 12, 15 |
| `reviewed` | A reviewed cook: Who ate it? with You, Guest and Guest 2 (N/A) | 08 |
| `no-matches` | Home with a search that finds nothing | 09 |
| `undo` | Home just after a cook was deleted, with Cook deleted · Undo | 09 |
| `note-options` | The cook page with an edited note's options open | 09 |

Undo's bar shows for the app's own undo window (five seconds), then the cook
is gone; reload to see it again.

The window's size is the screen's size: about 369 × 800 for the Fold's cover
display, 792 × 880 for the Fold 8's inner display upright, 880 × 710 sideways.
Links on a `?screen=` page go into the whole app, keeping the theme and font
scale.

### Examples

- <http://127.0.0.1:8090/?screen=cook&theme=dark&fontScale=1.15>
- <http://127.0.0.1:8090/?screen=filters>
- <http://127.0.0.1:8090/cook/preview-cook-traybake?theme=light>

### For a script

Once a `?screen=` page has run its steps, `document.body.dataset.previewReady`
is `yes` (or `failed`, with a console warning saying why). Wait for it before a
screenshot. Sheets fade in over a moment after that.

## Screenshot checks

Added 10 Nov 2026 (R-060). `scripts/screenshots.mjs` draws every `?screen=`
page (the list in `src/preview/options.web.ts`, so a new screen is covered
without touching the script) at a phone width (369 × 800, the Fold's cover
display) and a laptop width (1280 × 800), in light and dark: 64 pages today.

```bash
npm run preview:web
node scripts/screenshots.mjs shoot preview-web ../shots/before
# make the change, npm run preview:web again, then:
node scripts/screenshots.mjs shoot preview-web ../shots/after
node scripts/screenshots.mjs compare ../shots/before ../shots/after --strict
```

- **Same pixels every time.** Chrome draws in software in sRGB, the clock is
  fixed (timers and "today" read the same), carets are hidden, and a page is
  shot only once three frames in a row match and its photos have decoded.
  Five runs on 10 Nov (two builds) were identical to the pixel, so the compare is
  exact: a hairline colour changed on purpose showed on 28 of 64 pages, all
  light, none dark.
- **CI** (`.github/workflows/screenshots.yml`) draws the commit before and
  this one on the same runner and compares them. A page that fails to draw is
  red; a page that changed is a yellow warning, named in the job summary, so a
  release that changes the look on purpose stays green. Text only: no image
  is uploaded.
- **What it is not:** the phone. It catches a change to how the preview draws
  a page, not how the Fold draws it (the note field is two lines on the web,
  for one). Changed pages are then looked at in the preview at real size.

## Tests

`__tests__/webPreview.test.tsx` opens the preview notebook on the Node SQLite
harness, checks it covers the list above, and draws every `?screen=` with its
steps, without an error.
