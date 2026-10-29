# Cooking Lab — Launch Diagnostic from the Fold

**Report date:** 16 October 2026
**Capture:** 15 October 2026, 23:52, device local time
**Author:** Claude Code (implementation engineer)
**Nature:** Diagnostic evidence only. No code, configuration, dependency or
native artefact was changed, and nothing was rebuilt.

## 1. Scope

Mike reported a launch problem on the connected Fold and asked for a logcat
diagnosis with an explicit procedure: clear the log, launch the app with
`am start` on its launcher activity, wait 8 seconds, then dump the log filtered
to the tags `ReactNativeJS`, `AndroidRuntime`, `ExpoModulesCore` and the app's
own process, reporting every error, warning and JS log line verbatim. Rebuilding
was explicitly excluded.

The headline result is that **logcat records no launch failure, and more
importantly cannot record one at this commit.** Section 7 sets out why.

## 2. Subject under test

| | |
|---|---|
| Commit built and installed | `5a5032c077d1af86d1fd7ee10159b7094afe1f6d` |
| APK | `android/app/build/outputs/apk/release/app-release.apk` |
| APK SHA-256 | `fcd9c80c21f1fe9b6d60ccf86951e6dcf2e538a0936b8ea967bd59c5da3f9b7c` |
| APK size | 122,773,147 bytes |
| Variant | `APP_VARIANT=test` |
| Package / label | `com.cookinglab.personal.test` / Cooking Lab Test |
| `versionName` / `versionCode` | `0.0.0` / `1` |
| `minSdk` / `targetSdk` | 24 / 36 |
| Signing | template debug keystore (`CN=Android Debug`). No production signing identity exists or was used. |
| Device | the Fold, serial `[serial redacted]` |
| Launcher activity | `com.cookinglab.personal.test/.MainActivity` |

**Install conditions.** The APK was installed with `adb install -r` as an
upgrade over the build of 7 September. App data was **not** cleared, so this was
not a genuine first run. `firstInstallTime` remained 2026-09-03;
`lastUpdateTime` became 2026-10-15 23:26:18.

**Applicability to the current tip.** The findings below were re-checked against
`65a1af4161b6f64a7c9f0f32adb90e164ca5aec5`, the tip of `origin/main` when this
report was written. That commit is test-only — it adds
`__tests__/routes.test.tsx` and nothing else — and changes none of the
conclusions. Its sole reference to `describeStartup` is a test mock
(`describeStartup: () => 'test'`), which independently confirms the finding in
section 7 that the function has no production caller.

## 3. Procedure actually run

```
adb logcat -c
adb shell am start -n com.cookinglab.personal.test/.MainActivity
sleep 8
adb shell pidof com.cookinglab.personal.test
adb logcat -d -v threadtime > logcat-full.log
```

`am start` reported:

```
Starting: Intent { cmp=com.cookinglab.personal.test/.MainActivity }
```

The app was not running beforehand (`pidof` returned empty). The full buffer
captured 1,454 lines. Filtering to the four requested sources — the three tags
plus process 28052 — yields 241 lines, distributed by level as:

| Level | Lines |
|---|---|
| D (debug) | 95 |
| W (warning) | 72 |
| I (info) | 63 |
| V (verbose) | 7 |
| E (error) | 4 |

## 4. Outcome in one line

The app launched successfully, drew its window in 170 ms, and was still alive,
resumed and focused at the end of the window. It produced exactly one JS log
line — React Native's own — and no error attributable to Cooking Lab code.

Liveness checks after the capture:

```
pidof com.cookinglab.personal.test   -> 28052   (unchanged since launch)
mFocusedApp    = ActivityRecord{98305355 u0 com.cookinglab.personal.test/.MainActivity t34131}
mFocusedWindow = com.cookinglab.personal.test/com.cookinglab.personal.test.MainActivity
mCurrentFocus  = Window{4254eb u0 com.cookinglab.personal.test/com.cookinglab.personal.test.MainActivity}
```

No ANR was recorded. No `Force finishing`, no `am_anr`, no process restart.

## 5. Verbatim log

Every line in this section is reproduced exactly as captured, in
`threadtime` format (`date time pid tid level tag: message`). Nothing is
abridged, reordered or paraphrased.

### 5.1 `ReactNativeJS` — all levels — 1 line

```
10-15 23:52:06.138 28052 28075 I ReactNativeJS: Running "main"
```

This is the complete JS output for the entire 8-second window. `Running "main"`
is emitted by React Native itself, not by Cooking Lab.

### 5.2 `AndroidRuntime` — all levels — 0 lines

No lines. There was no Java or Kotlin exception, and no crash.

### 5.3 Errors — level `E` — 4 lines

```
10-15 23:52:05.966 28052 28052 E ashmem  : Pinning is deprecated since Android Q. Please use trim or other methods.
10-15 23:52:05.969 28052 28069 E Adreno-AppProfiles: QSPM AIDL service doesn't exist
10-15 23:52:05.990 28052 28052 E BufferQueueProducer: Unable to open libpenguin.so: dlopen failed: library "libpenguin.so" not found.
10-15 23:52:05.990 28052 28052 E b.personal.test: Unable to open libpenguin.so: dlopen failed: library "libpenguin.so" not found.
```

None of the four originates in Cooking Lab code. `ashmem` is a platform
deprecation notice; `Adreno-AppProfiles` and the two `libpenguin.so` lines are
Samsung/Qualcomm graphics-stack noise present for any application on this
device.

### 5.4 `ExpoModulesCore` — all levels — 6 lines

```
10-15 23:52:05.988 28052 28074 W ExpoModulesCore: Props class class expo.modules.ui.textfield.InnerTextFieldProps is not introspectable. Falling back to reflection-based props parsing, which may have performance implications. To fix this, annotate the props class with @OptimizedComposeProps.
10-15 23:52:06.031 28052 28074 W ExpoModulesCore: Props class class expo.modules.ui.textfield.PlaceholderProps is not introspectable. Falling back to reflection-based props parsing, which may have performance implications. To fix this, annotate the props class with @OptimizedComposeProps.
10-15 23:52:06.037 28052 28074 I ExpoModulesCore: ✅ AppContext was initialized
10-15 23:52:06.078 28052 28075 I ExpoModulesCore: ✅ JSI interop was installed
10-15 23:52:06.079 28052 28075 I ExpoModulesCore: ✅ Constants were exported
10-15 23:52:06.152 28052 28052 I ExpoModulesCore: ✅ JSI interop was installed
```

The three ticked lines confirm the Expo runtime came up: `AppContext was
initialized`, `JSI interop was installed`, `Constants were exported`. The two
warnings are performance advisories from Expo's own UI module, not faults.

### 5.5 Warnings — level `W` — 72 lines

Reproduced in full, including the 48 near-identical
`ViewManagerPropertyUpdater` lines, which are normal React Native view-manager
registration output.

```
10-15 23:52:05.928 28052 28052 W SoLoader: Initializing SoLoader: 0
10-15 23:52:05.929 28052 28052 W SoLoader: Recording new base apk path: /data/app/~~VgqpelxFo8rzu0SA_CNU0A==/com.cookinglab.personal.test-LUDToG-XBTQxY1FoYBTWvA==/base.apk
10-15 23:52:05.929 28052 28052 W SoLoader: Previously recorded 0 base apk paths.
10-15 23:52:05.929 28052 28052 W SoLoader: SoLoader initialized: 8
10-15 23:52:05.973 28052 28052 W unknown:BridgelessReact: ReactHost{0}.startSurface(surfaceId = 0): Schedule
10-15 23:52:05.973 28052 28052 W unknown:BridgelessReact: ReactHost{0}.attachSurface(surfaceId = 0)
10-15 23:52:05.973 28052 28074 W unknown:BridgelessReact: ReactHost{0}.getOrCreateReactInstanceTask()
10-15 23:52:05.973 28052 28074 W unknown:BridgelessReact: ReactHost{0}.getOrCreateReactInstanceTask(): Start
10-15 23:52:05.973 28052 28074 W unknown:BridgelessReact: ReactHost{0}.getJSBundleLoader()
10-15 23:52:05.974 28052 28074 W unknown:BridgelessReact: ReactHost{0}.getOrCreateReactInstanceTask(): Creating BridgelessReactContext
10-15 23:52:05.974 28052 28074 W unknown:BridgelessReact: ReactHost{0}.getOrCreateReactInstanceTask(): Creating ReactInstance
10-15 23:52:05.977 28052 28052 W unknown:BridgelessReact: ReactHost{0}.onHostResume(activity)
10-15 23:52:05.977 28052 28052 W unknown:BridgelessReact: ReactHost{0}.ReactContext.onHostResume()
10-15 23:52:05.988 28052 28074 W ExpoModulesCore: Props class class expo.modules.ui.textfield.InnerTextFieldProps is not introspectable. Falling back to reflection-based props parsing, which may have performance implications. To fix this, annotate the props class with @OptimizedComposeProps.
10-15 23:52:05.990 28052 28052 W libc    : Access denied finding property "vendor.display.enable_optimal_refresh_rate"
10-15 23:52:05.990 28052 28052 W libc    : Access denied finding property "vendor.display.enable_optimal_refresh_rate"
10-15 23:52:05.993 28052 28069 W qdgralloc: getInterlacedFlag: getMetaData returned 3, defaulting to interlaced_flag = 0
10-15 23:52:06.031 28052 28074 W ExpoModulesCore: Props class class expo.modules.ui.textfield.PlaceholderProps is not introspectable. Falling back to reflection-based props parsing, which may have performance implications. To fix this, annotate the props class with @OptimizedComposeProps.
10-15 23:52:06.058 28052 28074 W unknown:BridgelessReact: ReactHost{0}.getOrCreateReactInstanceTask(): Loading JS Bundle
10-15 23:52:06.058 28052 28074 W unknown:BridgelessReact: ReactHost{0}.getOrCreateReactInstanceTask(): DevSupportManager.onNewReactContextCreated()
10-15 23:52:06.058 28052 28052 W unknown:BridgelessReact: ReactHost{0}.ReactContext.onHostResume()
10-15 23:52:06.058 28052 28074 W unknown:BridgelessReact: ReactHost{0}.startSurface(surfaceId = 0): Execute
10-15 23:52:06.058 28052 28052 W unknown:BridgelessReact: ReactHost{0}.getOrCreateReactInstanceTask(): Executing ReactInstanceEventListeners
10-15 23:52:06.075 28052 28075 W BridgelessReactContext: [WARNING] Bridgeless doesn't support CatalystInstance. Accessing an API that's not part of the new architecture is not encouraged usage.
10-15 23:52:06.097 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class expo.modules.kotlin.views.GroupViewManagerWrapper
10-15 23:52:06.097 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.facebook.react.uimanager.LayoutShadowNode
10-15 23:52:06.098 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.swmansion.rnscreens.ScreenContainerViewManager
10-15 23:52:06.098 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.swmansion.reanimated.view.REASharedTransitionBoundaryManager
10-15 23:52:06.098 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.swmansion.rnscreens.gamma.tabs.host.TabsHostViewManager
10-15 23:52:06.098 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.swmansion.rnscreens.ScreenStackHeaderConfigViewManager
10-15 23:52:06.098 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.swmansion.rnscreens.ScreenStackHeaderSubviewManager
10-15 23:52:06.098 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.swmansion.rnscreens.gamma.modals.formsheet.FormSheetHostViewManager
10-15 23:52:06.098 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.swmansion.rnscreens.gamma.scrollviewmarker.ScrollViewMarkerViewManager
10-15 23:52:06.099 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.swmansion.rnscreens.gamma.modals.formsheet.FormSheetContentWrapperViewManager
10-15 23:52:06.099 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.swmansion.rnscreens.ScreenContentWrapperManager
10-15 23:52:06.099 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.swmansion.rnscreens.gamma.stack.screen.StackScreenViewManager
10-15 23:52:06.099 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.th3rdwave.safeareacontext.SafeAreaViewManager
10-15 23:52:06.099 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.th3rdwave.safeareacontext.SafeAreaViewShadowNode
10-15 23:52:06.099 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.swmansion.rnscreens.ScreenViewManager
10-15 23:52:06.099 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.swmansion.rnscreens.gamma.stack.header.config.StackHeaderConfigViewManager
10-15 23:52:06.099 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.th3rdwave.safeareacontext.SafeAreaProviderManager
10-15 23:52:06.099 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.swmansion.rnscreens.SearchBarManager
10-15 23:52:06.099 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.swmansion.rnscreens.gamma.stack.host.StackHostViewManager
10-15 23:52:06.099 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.swmansion.rnscreens.ScreenFooterManager
10-15 23:52:06.099 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.swmansion.rnscreens.ModalScreenViewManager
10-15 23:52:06.099 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.swmansion.rnscreens.safearea.SafeAreaViewManager
10-15 23:52:06.099 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.swmansion.rnscreens.ScreenStackViewManager
10-15 23:52:06.100 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.swmansion.rnscreens.gamma.stack.header.subview.StackHeaderSubviewViewManager
10-15 23:52:06.100 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class org.reactnative.maskedview.RNCMaskedViewManager
10-15 23:52:06.100 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.swmansion.rnscreens.gamma.tabs.screen.TabsScreenViewManager
10-15 23:52:06.123 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.swmansion.gesturehandler.react.RNGestureHandlerButtonViewManager
10-15 23:52:06.123 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.facebook.react.views.safeareaview.ReactSafeAreaViewManager
10-15 23:52:06.123 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.facebook.react.views.modal.ReactModalHostManager
10-15 23:52:06.124 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.swmansion.gesturehandler.react.RNGestureHandlerDetectorViewManager
10-15 23:52:06.124 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.facebook.react.views.progressbar.ReactProgressBarViewManager
10-15 23:52:06.124 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.facebook.react.views.scroll.ReactHorizontalScrollViewManager
10-15 23:52:06.125 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.facebook.react.views.image.ReactImageManager
10-15 23:52:06.125 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.facebook.react.views.text.ReactTextViewManager
10-15 23:52:06.125 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.facebook.react.views.scroll.ReactHorizontalScrollContainerViewManager
10-15 23:52:06.126 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.facebook.react.views.unimplementedview.ReactUnimplementedViewManager
10-15 23:52:06.126 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.facebook.react.views.scroll.ReactScrollViewManager
10-15 23:52:06.126 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.facebook.react.views.view.ReactViewManager
10-15 23:52:06.126 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.facebook.react.views.drawer.ReactDrawerLayoutManager
10-15 23:52:06.127 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.facebook.react.views.switchview.ReactSwitchManager
10-15 23:52:06.127 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.facebook.react.views.swiperefresh.SwipeRefreshLayoutManager
10-15 23:52:06.127 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.facebook.react.views.textinput.ReactTextInputManager
10-15 23:52:06.128 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.facebook.react.views.text.SelectableTextViewManager
10-15 23:52:06.128 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.swmansion.gesturehandler.react.RNGestureHandlerRootViewManager
10-15 23:52:06.128 28052 28075 W unknown:ViewManagerPropertyUpdater: Could not find generated setter for class com.facebook.react.views.virtual.view.ReactVirtualViewManager
10-15 23:52:06.165 28052 28069 W qdgralloc: getInterlacedFlag: getMetaData returned 3, defaulting to interlaced_flag = 0
10-15 23:52:06.186 28052 28069 W qdgralloc: getInterlacedFlag: getMetaData returned 3, defaulting to interlaced_flag = 0
10-15 23:52:06.198 28052 28069 W qdgralloc: getInterlacedFlag: getMetaData returned 3, defaulting to interlaced_flag = 0
```

## 6. Timeline

| Device time | Event |
|---|---|
| 23:52:05.876 | process 28052 starts |
| 23:52:05.928 | `SoLoader: Initializing SoLoader: 0` |
| 23:52:05.973 | `ReactHost{0}.startSurface(surfaceId = 0): Schedule` |
| 23:52:05.998 | `ActivityTaskManager: Displayed com.cookinglab.personal.test/.MainActivity for user 0: +170ms` |
| 23:52:06.037 | `ExpoModulesCore: ✅ AppContext was initialized` |
| 23:52:06.058 | `ReactHost{0}.getOrCreateReactInstanceTask(): Loading JS Bundle` |
| 23:52:06.078 | `ExpoModulesCore: ✅ JSI interop was installed` |
| 23:52:06.138 | `ReactNativeJS: Running "main"` — the only JS line |
| 23:52:06.198 | last app line of substance |
| 23:52:11.489 | `ProfileInstaller: Skipping profile installation for com.cookinglab.personal.test` (background, unrelated) |
| 23:52:14.208 | capture taken |

## 7. Analysis — why this log cannot answer the question

**The first reading of this evidence was wrong, and the correction is the
finding.** The M1 acceptance evidence
(`build-control/reports/M1_NATIVE_PERSISTENCE_REPORT.md` §10) rested on a JS log
line appearing at launch:

```
I ReactNativeJS: Cooking Lab storage created at schema version 1
I ReactNativeJS: Cooking Lab storage opened at schema version 1
```

`created` versus `opened` was the specific evidence that the SecureStore key and
the SQLCipher database had survived a restart and were read back with that key.
Neither line appears in this capture. The obvious inference — that startup hung
before the database opened — is **not supported**, because the line can no
longer be emitted at all:

- `src/data/startup.ts:42` exports `describeStartup()`, which still builds the
  string `Cooking Lab storage ${state} at schema version ${...}` at line 47.
- `describeStartup` has **no callers** in `src`, `app` or `__tests__` other than
  a mock in the new `__tests__/routes.test.tsx`. In production code it is dead.
- `grep -rnE "console\.(log|warn|error)" src app` returns **nothing**. The
  application emits no console output of any kind.

Slice 1 therefore dropped the logging that M1's device evidence depended on. The
consequence is specific and worth stating plainly: **at this commit a healthy
startup and a silently hung startup produce byte-identical logcat output.** The
absence of the storage line is evidence about the logging, not about the
storage.

What the log does say positively is that the launch itself is sound: the window
was drawn in 170 ms, the Expo runtime initialised, the JS bundle loaded and
executed its entry point, the process held one PID throughout, it remained the
resumed and focused activity, and nothing raised an exception or an ANR.

## 8. Conclusion

No launch failure is visible, and none can be ruled out either. Whatever Mike
observed on the Fold is not accompanied by any diagnostic signal in logcat,
because this build produces none beyond React Native's own startup chatter.

Two things follow, neither of which was carried out under this task:

1. **Determining what is actually on screen** requires looking at the device —
   a screenshot or Mike's own observation. Logcat has been exhausted as a source
   for this question.
2. **Restoring launch-time logging** is a prerequisite for any future
   device-runtime evidence, including re-establishing the `created` / `opened`
   distinction that M1 acceptance relied on. Until `describeStartup` has a real
   caller, device evidence of a successful startup cannot be produced at all.

## 9. Limits of this evidence

Recorded so that this report is not read as more than it is:

- The app was **not launched from a clean data state**. App data was not
  cleared, so this capture says nothing about first-run behaviour.
- **No UI verification was performed.** No screenshot was taken and neither the
  cover nor the inner display was checked.
- The window observed was **8 seconds**. Behaviour after that is not covered.
- A **single** launch was observed. Nothing here speaks to intermittency.
- Nothing was rebuilt, reinstalled or modified; the working tree was clean
  before and after.

## 10. Note on this report's location

`build-control/README.md` places implementation reports in
`build-control/reports/`. This file was written to
`build-control/slices/reports/` because Mike specified that path explicitly. It
is a diagnostic record, not a milestone implementation report, and it grants no
acceptance.
