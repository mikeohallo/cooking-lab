<#
  Cooking Lab phone check (7 Nov 2026).

  Fetches the newest TEST APK that GitHub built for main (the "Test APK"
  workflow), installs it on the bench phone plugged into this PC, checks the
  things only a phone can show, and puts the phone back as it found it. Writes
  a report to ..\runs\ beside this script's folder. No Claude Code involved:
  double-click phone-check.cmd.

    phone-check.cmd                     the standing checks, about 4 minutes
    phone-check.cmd -Shots home,cook    also screenshots of those screens at the
                                        Fold 8's sizes (inner 752, cover 360),
                                        text 1.0 and 1.3, with an hour-long timer

  Standing checks: the build is main's newest commit; it installs over the
  last one with data kept; the app holds the exact-alarm permission; a
  1-minute timer rings through the normal alarm on time; nothing in the crash
  log. Each says PASS or FAIL in the report.

  It never turns the screen off, reboots, force-stops the app, answers a prompt
  on the phone or opens another app. Screen reads are never used: timers tick
  on screen. A setting it couldn't read before it changed it is reported as
  FAIL, never guessed back.

  Works in Windows PowerShell 5.1 and PowerShell 7.
#>
param(
  [string[]]$Shots = @(),
  [string]$Repo = 'mikeohallo/cooking-lab',
  [string]$Adb = '',
  [string]$Gh = 'gh',
  [int]$PollSeconds = 2
)

# Native tools (adb, gh) write warnings to stderr; that must not stop the run.
$ErrorActionPreference = 'Continue'
$Pkg = 'com.cookinglab.personal.test'
$Cook = 'phone-check'
$Root = Split-Path -Parent $PSScriptRoot
$Stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$Tmp = $env:TEMP; if (-not $Tmp) { $Tmp = [IO.Path]::GetTempPath() }
$Work = Join-Path $Tmp "cooking-lab-phone-check-$Stamp"
New-Item -ItemType Directory -Force -Path $Work | Out-Null
$Lines = New-Object System.Collections.Generic.List[string]
$script:Fails = 0

function Now { Get-Date -Format 'HH:mm:ss' }
function Say([string]$t) { $Lines.Add($t); Write-Host $t }
function Note([string]$t) { Say "- $(Now) $t" }
function Pass([string]$t) { Say "- **PASS** $(Now) $t" }
function Fail([string]$t) { $script:Fails++; Say "- **FAIL** $(Now) $t" }

$ReportPath = $null
function Write-Report {
  if (-not $ReportPath) { $script:ReportPath = Join-Path $Root "runs\$Stamp-phone-check.md" }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ReportPath) | Out-Null
  [IO.File]::WriteAllText($ReportPath, ($Lines -join "`r`n") + "`r`n", (New-Object Text.UTF8Encoding $false))
}

# ---------------------------------------------------------------- tools

if (-not $Adb) {
  $cand = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
  if (Test-Path $cand) { $Adb = $cand } else { $Adb = 'adb' }
}
function A { & $Adb @args 2>&1 | ForEach-Object { "$_" } }
function Sh([string]$cmd) { (A shell $cmd) -join "`n" }

Say "# Cooking Lab phone check, $(Get-Date -Format 'd MMM yyyy, HH:mm')"
Say ''

# ---------------------------------------------------------------- the build

Say '## 1. The build'
if (-not (Get-Command $Gh -ErrorAction SilentlyContinue)) { Fail "GitHub CLI ('gh') isn't installed. Install it once: winget install GitHub.cli, then gh auth login. Nothing else was done."; Write-Report; exit 1 }
$auth = (& $Gh auth status 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { Fail "GitHub CLI isn't signed in. Run once: gh auth login. Nothing else was done."; Write-Report; exit 1 }

$main = (& $Gh api "repos/$Repo/commits/main" --jq .sha 2>&1 | Out-String).Trim()
$runJson = (& $Gh run list -R $Repo -w test-apk.yml -b main -s success -L 1 --json databaseId,headSha,createdAt 2>&1 | Out-String)
$run = $runJson | ConvertFrom-Json
if (-not $run -or $run.Count -eq 0) { Fail "no successful Test APK build for main yet. Nothing else was done."; Write-Report; exit 1 }
$run = @($run)[0]
$short = $run.headSha.Substring(0, 7)
$script:ReportPath = Join-Path $Root "runs\$Stamp-$short-phone-check.md"
Note "main is $($main.Substring(0,7)); newest successful TEST build is for $short (run $($run.databaseId), $($run.createdAt))"
if ($run.headSha -ne $main) { Fail "the newest TEST build isn't for main's newest commit; its build may still be running. Nothing else was done."; Write-Report; exit 1 }

$dl = Join-Path $Work 'apk'
& $Gh run download $run.databaseId -R $Repo -n cooking-lab-test-apk -D $dl 2>&1 | Out-Null
$apk = Get-ChildItem $dl -Filter "cooking-lab-test-$short.apk" | Select-Object -First 1
$shaFile = Get-ChildItem $dl -Filter "cooking-lab-test-$short.apk.sha256" | Select-Object -First 1
if (-not $apk -or -not $shaFile) { Fail "the build's APK or its SHA-256 wasn't in the download. Nothing else was done."; Write-Report; exit 1 }
$want = ((Get-Content $shaFile.FullName -Raw).Trim() -split '\s+')[0].ToLower()
$got = (Get-FileHash $apk.FullName -Algorithm SHA256).Hash.ToLower()
if ($want -ne $got) { Fail "SHA-256 doesn't match the build's ($got, expected $want). Nothing else was done."; Write-Report; exit 1 }
Pass "downloaded $($apk.Name), SHA-256 matches ($got)"

# ---------------------------------------------------------------- the phone, before

Say ''; Say '## 2. The phone'
$devs = @(A devices | Where-Object { $_ -match '\tdevice$' })
if ($devs.Count -ne 1) { Fail "exactly one phone must be plugged in (found $($devs.Count)). Nothing else was done."; Write-Report; exit 1 }
if ((Sh 'dumpsys power') -match 'mWakefulness=Asleep') { Fail "the phone's screen is off; it locks, and only Mike can unlock it. Nothing else was done."; Write-Report; exit 1 }

$Inner = $null; $Cover = $null
foreach ($id in ((Sh 'dumpsys display') | Select-String -AllMatches 'mDisplayId=(\d+)' | ForEach-Object { $_.Matches } | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)) {
  $size = Sh "wm size -d $id"
  if ($size -match 'Physical size: 1856x') { $Inner = $id }
  if ($size -match 'Physical size: 968x') { $Cover = $id }
}
if ($null -eq $Inner -or $null -eq $Cover) { Fail "couldn't tell the inner and cover screens apart. Nothing else was done."; Write-Report; exit 1 }

function Read-Ringer { $m = [regex]::Match((Sh 'dumpsys audio'), 'mode \(external\) = (\w+)'); if ($m.Success) { $m.Groups[1].Value } else { '' } }
function Read-AlarmVol { $m = [regex]::Match((Sh 'cmd media_session volume --stream 4 --get'), 'volume is (\d+)'); if ($m.Success) { $m.Groups[1].Value } else { '' } }
function Read-Notif { $m = [regex]::Match((Sh "dumpsys package $Pkg"), 'POST_NOTIFICATIONS: granted=(true|false)'); if ($m.Success) { $m.Groups[1].Value } else { '' } }

$Was = [ordered]@{
  font = (Sh 'settings get system font_scale').Trim()
  accel = (Sh 'settings get system accelerometer_rotation').Trim()
  rot = (Sh 'settings get system user_rotation').Trim()
  zen = (Sh 'settings get global zen_mode').Trim()
  ringer = Read-Ringer
  alarmvol = Read-AlarmVol
  notif = Read-Notif
  exactop = (Sh "appops get $Pkg SCHEDULE_EXACT_ALARM").Trim()
}
Note ("as found: " + (($Was.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join '; '))

$Launcher = ((Sh "cmd package resolve-activity --brief -c android.intent.category.LAUNCHER $Pkg") -split "`n" | Where-Object { $_ -match '/' } | Select-Object -Last 1).Trim()

function Fresh-App {
  # A new task from the launcher intent, so no earlier link is replayed.
  Sh "input keyevent KEYCODE_HOME" | Out-Null; Start-Sleep 1
  Sh "am kill $Pkg" | Out-Null; Start-Sleep 1
  Sh "am start -W -f 0x10008000 -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n $Launcher" | Out-Null
  Start-Sleep 4
}
function Link([string]$url, [int]$wait = 3) {
  Sh "am start -W -a android.intent.action.VIEW -d '$url' $Pkg" | Out-Null; Start-Sleep $wait
}
function Start-Timer([string]$name, [int]$seconds) { Link "cookinglab://test-timer?cook=$Cook&title=Phone%20check&name=$name&seconds=$seconds" 4 }
function Stop-Timers { Link "cookinglab://test-timer?cook=$Cook&stop=all" 3 }
function In-Front { (Sh 'dumpsys activity activities') -match "(topResumedActivity|mResumedActivity)[^\n]*$([regex]::Escape($Pkg))" }

# ---------------------------------------------------------------- put back, always

function Put-Back {
  Say ''; Say '## Put back'
  try { Stop-Timers } catch {}
  foreach ($id in @($Inner, $Cover)) { Sh "wm density reset -d $id" | Out-Null; Sh "wm size reset -d $id" | Out-Null }
  Sh 'cmd device_state state reset' | Out-Null
  Sh 'cmd window user-rotation free' | Out-Null
  foreach ($k in @('font', 'accel', 'rot', 'zen', 'ringer', 'alarmvol', 'notif')) {
    if (-not $Was[$k]) { Fail "couldn't read '$k' before the run, so it wasn't put back; check it by hand" }
  }
  if ($Was.font) { Sh "settings put system font_scale $($Was.font)" | Out-Null }
  if ($Was.rot) { Sh "settings put system user_rotation $($Was.rot)" | Out-Null }
  if ($Was.accel) { Sh "settings put system accelerometer_rotation $($Was.accel)" | Out-Null }
  if ($Was.ringer) { Sh "cmd audio set-ringer-mode $($Was.ringer)" | Out-Null }
  if ($Was.zen -eq '0') { Sh 'cmd notification set_dnd off' | Out-Null }
  if ($Was.alarmvol) { Sh "cmd media_session volume --stream 4 --set $($Was.alarmvol)" | Out-Null }
  if ($Was.notif -eq 'false') {
    Sh "pm revoke $Pkg android.permission.POST_NOTIFICATIONS" | Out-Null
    Sh "pm clear-permission-flags $Pkg android.permission.POST_NOTIFICATIONS user-set user-fixed" | Out-Null
  }
  $now = [ordered]@{
    font = (Sh 'settings get system font_scale').Trim(); accel = (Sh 'settings get system accelerometer_rotation').Trim()
    rot = (Sh 'settings get system user_rotation').Trim(); zen = (Sh 'settings get global zen_mode').Trim()
    ringer = Read-Ringer; alarmvol = Read-AlarmVol; notif = Read-Notif
  }
  $diff = @($now.Keys | Where-Object { $Was[$_] -and ($now[$_] -ne $Was[$_]) })
  if ($diff.Count -eq 0) { Pass "read back as found" } else { Fail ("not as found: " + (($diff | ForEach-Object { "$_ was $($Was[$_]), now $($now[$_])" }) -join '; ')) }
  $left = Sh 'dumpsys alarm' | Select-String -SimpleMatch $Pkg
  if ($left) { Fail "Cooking Lab alarms still set after the stop" } else { Pass "no Cooking Lab alarms left" }
}

try {
  # ------------------------------------------------------------ install and permission
  Say ''; Say '## 3. Install'
  Sh 'logcat -b crash -c' | Out-Null
  $r = (A install -r $apk.FullName) -join ' '
  $ver = [regex]::Match((Sh "dumpsys package $Pkg"), 'versionName=([^\n]+)').Groups[1].Value.Trim()
  if ($ver -match "\($short\)$") { Pass "installed over the last build ($r); version $ver" } else { Fail "version read back '$ver', expected ...($short)" }
  Sh "pm grant $Pkg android.permission.POST_NOTIFICATIONS" | Out-Null
  $exact = [regex]::Match((Sh "dumpsys package $Pkg"), 'USE_EXACT_ALARM: granted=(true|false)').Groups[1].Value
  if ($exact -eq 'true') { Pass "USE_EXACT_ALARM granted at install" } else { Fail "USE_EXACT_ALARM not granted ('$exact')" }

  # ------------------------------------------------------------ one ring
  Say ''; Say '## 4. One timer rings on time'
  Fresh-App
  Start-Timer 'Check' 60
  $alarm = (Sh 'dumpsys alarm') -split "`n"
  $i = 0; $ours = @(); foreach ($l in $alarm) { if ($l -match [regex]::Escape($Pkg)) { $ours += $alarm[$i..([Math]::Min($i + 3, $alarm.Count - 1))] }; $i++ }
  $oursText = ($ours -join ' ')
  if ($oursText -match 'window=0' -and $oursText -match 'exactAllowReason=') { Pass "set as an exact alarm ($([regex]::Match($oursText, 'exactAllowReason=\S+').Value))" } else { Fail "not an exact alarm: $($oursText.Substring(0, [Math]::Min(300, $oursText.Length)))" }
  $t = 0; $rang = $false
  while ($t -lt 120) {
    if ((Sh 'dumpsys notification --noredact') -match 'Check is done') { $rang = $true; break }
    Start-Sleep $PollSeconds; $t += $PollSeconds
  }
  if ($rang) {
    $audio = Sh 'dumpsys audio'
    $playing = $audio -match "u/pid:\d+/\d+ state:started attr:AudioAttributes: usage=USAGE_ALARM"
    $svc = (Sh "dumpsys activity services $Pkg") -match 'RingService'
    if ($playing -and $svc) { Pass "rang through the normal ring: RingService running, alarm sound playing ($t s after the poll began, due about 55 s in)" } else { Fail "'Check is done' shown but ring service running: $svc, alarm sound playing: $playing" }
  } else { Fail "no 'Check is done' within 120 s" }
  Stop-Timers
  $crash = @(Sh 'logcat -d -b crash' -split "`n" | Where-Object { $_ -match "$([regex]::Escape($Pkg))|FATAL" })
  if ($crash.Count -eq 0) { Pass "nothing in the crash log" } else { Fail "crash log: $($crash[0..([Math]::Min(4, $crash.Count - 1))] -join ' | ')" }

  # ------------------------------------------------------------ screenshots, if asked
  if ($Shots.Count -gt 0) {
    Say ''; Say "## 5. Screens: $($Shots -join ', ')"
    $ShotDir = Join-Path $Root "runs\$Stamp-$short-phone-check-screens"
    New-Item -ItemType Directory -Force -Path $ShotDir | Out-Null
    Add-Type -AssemblyName System.Drawing
    Start-Timer 'Meat' 8801; Start-Timer 'Gravy' 600
    $sizes = @(
      @{ name = 'inner-752'; state = 3; disp = $Inner; dens = 395 },
      @{ name = 'cover-360'; state = 0; disp = $Cover; dens = 430 }
    )
    foreach ($s in $sizes) {
      Sh "wm density 395 -d $Inner" | Out-Null; Sh "wm density 430 -d $Cover" | Out-Null
      Sh "cmd device_state state $($s.state)" | Out-Null
      Sh 'settings put system accelerometer_rotation 0' | Out-Null; Sh 'cmd window user-rotation lock 0' | Out-Null
      Start-Sleep 3
      foreach ($fs in @('1.0', '1.3')) {
        Sh "settings put system font_scale $fs" | Out-Null
        foreach ($screen in $Shots) {
          if (@('home', 'cook', 'review') -notcontains $screen) { Fail "unknown screen '$screen' (home, cook or review)"; continue }
          Fresh-App
          if ($screen -eq 'cook') { Link "cookinglab://cook/$Cook" 3 }
          if ($screen -eq 'review') { Link "cookinglab://cook/$Cook/review" 3 }
          $file = Join-Path $ShotDir "$screen-$($s.name)-fs$fs.png"
          if (-not (In-Front)) { Fail "$screen at $($s.name), text ${fs}: Cooking Lab Test wasn't in front, no shot"; continue }
          Sh 'screencap -p /sdcard/cl-phone-check.png' | Out-Null
          A pull /sdcard/cl-phone-check.png "$file.full" | Out-Null
          Sh 'rm -f /sdcard/cl-phone-check.png' | Out-Null
          # Crop the status bar and the navigation bar or taskbar, read from the window manager.
          $win = Sh 'dumpsys window'
          $img = [Drawing.Image]::FromFile("$file.full")
          try {
            $h = $img.Height; $top = 0; $bottom = $h
            foreach ($m in [regex]::Matches($win, 'frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\]')) {
              $t0 = [int]$m.Groups[2].Value; $b0 = [int]$m.Groups[4].Value
              if ($t0 -eq 0 -and $b0 -gt 0 -and $b0 -lt $h / 8 -and $b0 -gt $top) { $top = $b0 }
              if ($b0 -eq $h -and $t0 -gt $h * 7 / 8 -and $t0 -lt $bottom) { $bottom = $t0 }
            }
            $bmp = New-Object Drawing.Bitmap $img
            $part = $bmp.Clone((New-Object Drawing.Rectangle 0, $top, $img.Width, ($bottom - $top)), $bmp.PixelFormat)
            $part.Save($file, [Drawing.Imaging.ImageFormat]::Png); $part.Dispose(); $bmp.Dispose()
          } finally { $img.Dispose() }
          Remove-Item "$file.full"
          Note "shot $([IO.Path]::GetFileName($file)) (cropped to rows $top-$bottom)"
        }
      }
    }
    Stop-Timers
  }
}
catch { Fail "stopped early: $($_.Exception.Message)" }
finally {
  Put-Back
  Say ''
  if ($script:Fails -eq 0) { Say "**All checks passed.**" } else { Say "**$($script:Fails) check(s) failed.**" }
  Write-Report
  Remove-Item -Recurse -Force $Work -ErrorAction SilentlyContinue
  Write-Host "Report: $ReportPath"
}
