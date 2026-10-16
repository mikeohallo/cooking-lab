# App icon

One drawing — a notebook page with a thermometer, in the app's sage and
amber — in two forms:

| File | Used for |
| --- | --- |
| `production-icon.png` / `test-icon.png` | the plain square icon (`icon` in `app.config.ts`) |
| `production-adaptive-foreground.png` / `test-adaptive-foreground.png` | the Android adaptive-icon foreground layer, drawn inside the launcher safe zone on a transparent canvas; the background is the sage `#526A55` set in `app.config.ts` |

The TEST variant carries a red TEST tag inside the safe zone so the two
installed apps are told apart on the home screen.

The `.svg` files beside each `.png` are the sources; the PNGs are 1024×1024
renders of them. Edit the SVG, re-render, commit both.
