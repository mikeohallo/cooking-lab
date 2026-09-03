<#
.SYNOPSIS
    Cooking Lab - unattended Build Control runner.

.DESCRIPTION
    Polls the controlled Build Control queue and, when exactly one valid
    instruction is activated, launches a single bounded non-interactive Claude
    Code child to carry it out.

    The runner never invents work. It can only activate a tracked prompt file
    under build-control/prompts/ that a queue commit explicitly authorises.

    It also protects Mike's other application development: Cooking Lab will not
    start unattended while another application owns the machine-wide lease,
    while a manual Claude Code session is running, or while unattended work is
    paused.

.PARAMETER Once
    Run a single polling cycle and exit. Used for controlled tests.

.PARAMETER SelfTest
    Runner setup self-test mode. Narrowly documented allowance only: the Claude
    Code CLI processes that already exist when the runner starts are recorded as
    a baseline and ignored by manual-Claude detection, so the self-test can
    spawn its child from inside an existing Claude session. Never applies to
    normal unattended operation. See build-control/runner/CROSS_APP_PROTOCOL.md.

.PARAMETER PollSeconds
    Polling interval. Default 180 (3 minutes).

.PARAMETER MaxChildMinutes
    Hard ceiling on a single bounded Claude run. Prevents a hung child from
    holding the machine-wide lease indefinitely.

.EXAMPLE
    powershell -NoProfile -File .\scripts\build-control-runner.ps1
#>

[CmdletBinding()]
param(
    [switch]$Once,
    [switch]$SelfTest,
    [int]$PollSeconds = 180,
    [int]$MaxChildMinutes = 240
)

Set-StrictMode -Version 1.0
$ErrorActionPreference = 'Stop'

# =====================================================================
# Configuration
# =====================================================================

$AppId          = 'cooking-lab'
$ExpectedRemote = 'https://github.com/mikeohallo/cooking-lab.git'
$ExpectedBranch = 'main'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = (Resolve-Path (Join-Path $ScriptDir '..')).Path.TrimEnd('\')

$GlobalDir = 'C:\Projects\.app-build-control'
$PauseFile = Join-Path $GlobalDir 'PAUSE_UNATTENDED'
$LockFile  = Join-Path $GlobalDir 'app.lock.json'

$LocalDir   = Join-Path $RepoRoot '.build-control-local'
$StateFile  = Join-Path $LocalDir 'state\instructions.json'
$RunnerLock = Join-Path $LocalDir 'runner.lock'
$LogDir     = Join-Path $LocalDir 'logs'
$TmpDir     = Join-Path $LocalDir 'tmp'
$RunnerLog  = Join-Path $LogDir 'runner.log'

$QueueRelPath  = 'build-control/queue/NEXT_RUN.json'
$PromptDirRel  = 'build-control/prompts'

# Other application repositories on this machine. The permission gate refuses
# any tool call that resolves inside these, and the runner never inspects them.
$ProtectedPaths = @(
    'C:\Projects\ProjectA',
    'C:\Projects\cooking-lab-cloud-prototype-archive'
)

# A lease is stale only when the owning process is gone AND the heartbeat is old.
$StaleHeartbeatMinutes = 15
$HeartbeatSeconds      = 30

# Built-in tools the bounded child may use. Anything absent from this list is
# not available to the child at all (verified on CLI 2.1.240).
$ChildTools = 'Bash,Read,Write,Edit,Glob,Grep,TodoWrite'

$Script:HeldLock  = $false
$Script:HeldRunnerLock = $false
$Script:BaselineClaudePids = @()

# =====================================================================
# Logging
# =====================================================================

function Write-RunnerLog {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet('INFO', 'WARN', 'BLOCK', 'RUN', 'HUMAN')][string]$Level = 'INFO'
    )
    $stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    $line  = "$stamp [$Level] $Message"
    Write-Host $line
    try {
        if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
        Add-Content -Path $RunnerLog -Value $line -Encoding utf8
    } catch { }
}

function Write-HumanActionRequired {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-RunnerLog -Level 'HUMAN' -Message "HUMAN ACTION REQUIRED - $Message"
}

# =====================================================================
# Utilities
# =====================================================================

function Get-UtcNowString { (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }

function Initialize-LocalDirs {
    foreach ($d in @($LocalDir, $LogDir, $TmpDir, (Split-Path -Parent $StateFile))) {
        if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    }
}

function Invoke-Git {
    param([Parameter(Mandatory = $true)][string[]]$GitArgs)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $raw  = & git -C $RepoRoot @GitArgs 2>&1
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prev
    }
    $text = ($raw | ForEach-Object { $_.ToString() }) -join "`n"
    return [pscustomobject]@{ ExitCode = $code; Text = $text.Trim() }
}

function Get-GitBlobSha256 {
    <#  SHA-256 of the blob exactly as stored in git.

        The prompt hash is defined on blob content, not on the checked-out file,
        because core.autocrlf makes working-tree bytes machine-dependent. This
        gives Build Control a hash it can compute deterministically anywhere.  #>
    param(
        [Parameter(Mandatory = $true)][string]$Revision,
        [Parameter(Mandatory = $true)][string]$RelPath
    )
    if (-not (Test-Path $TmpDir)) { New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null }
    $tmp = Join-Path $TmpDir ('blob-' + [guid]::NewGuid().ToString('N') + '.bin')
    try {
        $spec = '{0}:{1}' -f $Revision, $RelPath
        $p = Start-Process -FilePath 'git' `
                           -ArgumentList @('-C', "`"$RepoRoot`"", 'cat-file', 'blob', $spec) `
                           -RedirectStandardOutput $tmp -NoNewWindow -Wait -PassThru
        if ($p.ExitCode -ne 0) { return $null }
        return (Get-FileHash -Path $tmp -Algorithm SHA256).Hash.ToLower()
    } catch {
        return $null
    } finally {
        if (Test-Path $tmp) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
    }
}

function Test-ProcessAlive {
    param([Parameter(Mandatory = $true)][int]$ProcessId)
    if ($ProcessId -le 0) { return $false }
    try {
        $p = Get-Process -Id $ProcessId -ErrorAction Stop
        return ($null -ne $p)
    } catch {
        return $false
    }
}

# =====================================================================
# Repository preconditions and safe synchronisation
# =====================================================================

function Test-RepoPreconditions {
    <# Returns $null when the repository is safe to operate on, else a reason. #>

    if (-not (Test-Path (Join-Path $RepoRoot '.git'))) { return "not a git repository: $RepoRoot" }

    $branch = Invoke-Git @('rev-parse', '--abbrev-ref', 'HEAD')
    if ($branch.ExitCode -ne 0) { return "cannot read current branch: $($branch.Text)" }
    if ($branch.Text -ne $ExpectedBranch) { return "branch is '$($branch.Text)', expected '$ExpectedBranch'" }

    $remote = Invoke-Git @('config', '--get', 'remote.origin.url')
    if ($remote.Text -ne $ExpectedRemote) { return "origin is '$($remote.Text)', expected '$ExpectedRemote'" }

    $status = Invoke-Git @('status', '--porcelain')
    if ($status.ExitCode -ne 0) { return "cannot read status: $($status.Text)" }
    if (-not [string]::IsNullOrWhiteSpace($status.Text)) {
        return "working tree is not clean:`n$($status.Text)"
    }

    return $null
}

function Invoke-SafeSync {
    <#  Fast-forward only. Never merges, rebases, resets or resolves conflicts.
        Returns: 'OK' | 'NETWORK' | 'DIVERGED' | 'ERROR:<reason>'  #>

    $fetch = Invoke-Git @('fetch', 'origin', '--prune')
    if ($fetch.ExitCode -ne 0) {
        Write-RunnerLog -Level 'WARN' -Message "git fetch failed (treating as temporary network fault): $($fetch.Text)"
        return 'NETWORK'
    }

    $counts = Invoke-Git @('rev-list', '--left-right', '--count', "origin/$ExpectedBranch...$ExpectedBranch")
    if ($counts.ExitCode -ne 0) { return "ERROR:cannot compare with origin: $($counts.Text)" }

    $parts = $counts.Text -split '\s+'
    if ($parts.Count -lt 2) { return "ERROR:unexpected rev-list output '$($counts.Text)'" }
    $behind = [int]$parts[0]
    $ahead  = [int]$parts[1]

    if ($behind -gt 0 -and $ahead -gt 0) {
        return 'DIVERGED'
    }
    if ($behind -gt 0) {
        Write-RunnerLog "local is $behind commit(s) behind origin/$ExpectedBranch; fast-forwarding"
        $ff = Invoke-Git @('merge', '--ff-only', "origin/$ExpectedBranch")
        if ($ff.ExitCode -ne 0) { return "ERROR:fast-forward failed: $($ff.Text)" }
    }
    return 'OK'
}

# =====================================================================
# Queue validation
# =====================================================================

function Test-PromptPathAllowed {
    param([Parameter(Mandatory = $true)][string]$Path)

    if ($Path -match '\\')            { return "prompt_path must use forward slashes: '$Path'" }
    if ($Path -match '^[A-Za-z]:')    { return "prompt_path must not be absolute: '$Path'" }
    if ($Path.StartsWith('/'))        { return "prompt_path must not be absolute: '$Path'" }
    if ($Path -match '(^|/)\.\.(/|$)'){ return "prompt_path must not traverse upwards: '$Path'" }
    if ($Path -notmatch "^$([regex]::Escape($PromptDirRel))/[A-Za-z0-9._-]+\.md$") {
        return "prompt_path must be a Markdown file directly inside $PromptDirRel/: '$Path'"
    }

    # Reject reparse points / symlinks that would escape the prompt directory.
    $full = Join-Path $RepoRoot ($Path -replace '/', '\')
    if (Test-Path $full) {
        $item = Get-Item -LiteralPath $full -Force
        if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            return "prompt file is a reparse point/symlink: '$Path'"
        }
        $resolved = [System.IO.Path]::GetFullPath($item.FullName)
        $promptDirFull = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot ($PromptDirRel -replace '/', '\')))
        if (-not $resolved.StartsWith($promptDirFull + '\', [StringComparison]::OrdinalIgnoreCase)) {
            return "prompt file resolves outside $PromptDirRel/: '$resolved'"
        }
    }
    return $null
}

function Read-QueueInstruction {
    <#  Validates the queue file against the activation protocol.

        Returns an object: Status = 'NONE' | 'READY' | 'INVALID', with Reason
        and (when READY) the validated Instruction plus activation commit.  #>

    $queueFull = Join-Path $RepoRoot ($QueueRelPath -replace '/', '\')
    if (-not (Test-Path $queueFull)) {
        return [pscustomobject]@{ Status = 'NONE'; Reason = 'no queue file'; Instruction = $null; ActivationCommit = $null }
    }

    try {
        $rawText = Get-Content -Raw -Path $queueFull
    } catch {
        return [pscustomobject]@{ Status = 'INVALID'; Reason = "cannot read queue file: $($_.Exception.Message)"; Instruction = $null; ActivationCommit = $null }
    }

    if ([string]::IsNullOrWhiteSpace($rawText)) {
        return [pscustomobject]@{ Status = 'NONE'; Reason = 'queue file is empty'; Instruction = $null; ActivationCommit = $null }
    }

    try {
        $q = $rawText | ConvertFrom-Json
    } catch {
        return [pscustomobject]@{ Status = 'INVALID'; Reason = "queue file is not valid JSON: $($_.Exception.Message)"; Instruction = $null; ActivationCommit = $null }
    }

    function Fail($reason) {
        return [pscustomobject]@{ Status = 'INVALID'; Reason = $reason; Instruction = $null; ActivationCommit = $null }
    }

    # --- required fields -------------------------------------------------
    foreach ($field in @('instruction_id', 'prompt_path', 'prompt_sha256', 'expected_base_commit', 'milestone', 'scope', 'allow_unattended')) {
        if (-not ($q.PSObject.Properties.Name -contains $field)) {
            return Fail "queue file is missing required field '$field'"
        }
    }

    if ($q.allow_unattended -isnot [bool]) { return Fail "allow_unattended must be a JSON boolean" }
    if (-not $q.allow_unattended) {
        return [pscustomobject]@{ Status = 'NONE'; Reason = 'allow_unattended is false; nothing is authorised'; Instruction = $null; ActivationCommit = $null }
    }

    foreach ($field in @('instruction_id', 'prompt_path', 'prompt_sha256', 'expected_base_commit', 'milestone', 'scope')) {
        if ([string]::IsNullOrWhiteSpace([string]$q.$field)) { return Fail "field '$field' must be a non-empty string" }
    }

    $instructionId = [string]$q.instruction_id
    if ($instructionId -notmatch '^[A-Za-z0-9._-]{3,120}$') {
        return Fail "instruction_id contains unsupported characters: '$instructionId'"
    }
    if ([string]$q.prompt_sha256 -notmatch '^[0-9a-f]{64}$') {
        return Fail "prompt_sha256 must be 64 lowercase hex characters"
    }
    if ([string]$q.expected_base_commit -notmatch '^[0-9a-f]{40}$') {
        return Fail "expected_base_commit must be a full 40-character git SHA"
    }

    # The queue may only activate a tracked prompt. It carries no commands.
    foreach ($forbidden in @('command', 'commands', 'shell', 'script', 'args')) {
        if ($q.PSObject.Properties.Name -contains $forbidden) {
            return Fail "queue file must not carry executable content (found field '$forbidden')"
        }
    }

    $promptPath = [string]$q.prompt_path
    $pathReason = Test-PromptPathAllowed -Path $promptPath
    if ($null -ne $pathReason) { return Fail $pathReason }

    # --- activation protocol --------------------------------------------
    # A = expected_base_commit (the commit that published the prompt)
    # B = the commit that activated this queue file; B's first parent must be A
    $head = Invoke-Git @('rev-parse', 'HEAD')
    if ($head.ExitCode -ne 0) { return Fail "cannot resolve HEAD" }
    $headSha = $head.Text

    $act = Invoke-Git @('log', '-1', '--format=%H', '--', $QueueRelPath)
    if ($act.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($act.Text)) {
        return Fail "cannot determine the commit that activated $QueueRelPath"
    }
    $activation = $act.Text

    if ($activation -ne $headSha) {
        return Fail ("queue activation commit $activation is not HEAD ($headSha); " +
                     "commits have landed after activation, so this instruction must be re-activated by Build Control")
    }

    $parent = Invoke-Git @('rev-parse', "$activation^1")
    if ($parent.ExitCode -ne 0) { return Fail "activation commit $activation has no first parent" }
    if ($parent.Text -ne [string]$q.expected_base_commit) {
        return Fail ("activation commit first parent is $($parent.Text) but expected_base_commit is $($q.expected_base_commit); " +
                     'the queue commit must directly follow the prompt commit')
    }

    # --- prompt must be tracked and present at both A and B --------------
    $tracked = Invoke-Git @('ls-files', '--error-unmatch', '--', $promptPath)
    if ($tracked.ExitCode -ne 0) { return Fail "prompt file is not tracked in git: '$promptPath'" }

    $shaAtBase = Get-GitBlobSha256 -Revision ([string]$q.expected_base_commit) -RelPath $promptPath
    if ($null -eq $shaAtBase) { return Fail "prompt file does not exist at expected_base_commit: '$promptPath'" }

    $shaAtActivation = Get-GitBlobSha256 -Revision $activation -RelPath $promptPath
    if ($null -eq $shaAtActivation) { return Fail "prompt file does not exist at the activation commit: '$promptPath'" }

    if ($shaAtBase -ne $shaAtActivation) {
        return Fail "prompt file changed between the base commit and the activation commit"
    }
    if ($shaAtActivation -ne [string]$q.prompt_sha256) {
        return Fail ("prompt SHA-256 mismatch: queue declares $($q.prompt_sha256) but the tracked prompt is $shaAtActivation")
    }

    # The working copy must match the committed prompt. The clean-tree
    # precondition already guarantees this; verify explicitly rather than assume.
    $dirty = Invoke-Git @('diff', '--quiet', 'HEAD', '--', $promptPath)
    if ($dirty.ExitCode -ne 0) { return Fail "the checked-out prompt file differs from the committed prompt" }

    return [pscustomobject]@{
        Status           = 'READY'
        Reason           = 'valid'
        Instruction      = $q
        ActivationCommit = $activation
    }
}

# =====================================================================
# Local instruction state (duplicate-execution protection)
# =====================================================================

function Read-InstructionState {
    if (-not (Test-Path $StateFile)) { return @{} }
    try {
        $txt = Get-Content -Raw -Path $StateFile
        if ([string]::IsNullOrWhiteSpace($txt)) { return @{} }
        $obj = $txt | ConvertFrom-Json
        $map = @{}
        foreach ($p in $obj.PSObject.Properties) { $map[$p.Name] = $p.Value }
        return $map
    } catch {
        Write-RunnerLog -Level 'WARN' -Message "instruction state file unreadable; treating as empty: $($_.Exception.Message)"
        return @{}
    }
}

function Write-InstructionState {
    param([Parameter(Mandatory = $true)][hashtable]$State)
    Initialize-LocalDirs
    ($State | ConvertTo-Json -Depth 8) | Set-Content -Path $StateFile -Encoding utf8
}

function Set-InstructionRecord {
    param(
        [Parameter(Mandatory = $true)][string]$InstructionId,
        [Parameter(Mandatory = $true)][hashtable]$Record
    )
    $state = Read-InstructionState
    $state[$InstructionId] = $Record
    Write-InstructionState -State $state
}

function Test-InstructionConsumable {
    <#  Duplicate-execution policy.

        An instruction is identified by instruction_id + prompt_sha256 +
        expected_base_commit. A record is written as STARTED immediately before
        the child launches and only moves to COMPLETED/FAILED after the child
        exits and the repository has been assessed.

        Returns: 'RUN' | 'SKIP:<reason>' | 'BLOCK:<reason>'  #>
    param(
        [Parameter(Mandatory = $true)]$Instruction,
        [Parameter(Mandatory = $true)][string]$ActivationCommit
    )

    $id    = [string]$Instruction.instruction_id
    $state = Read-InstructionState
    if (-not $state.ContainsKey($id)) { return 'RUN' }

    $rec = $state[$id]

    $sameIdentity = ($rec.prompt_sha256 -eq [string]$Instruction.prompt_sha256) -and
                    ($rec.expected_base_commit -eq [string]$Instruction.expected_base_commit)

    if (-not $sameIdentity) {
        return ("BLOCK:instruction_id '$id' has already been used locally for a different prompt/base " +
                "(recorded sha $($rec.prompt_sha256) base $($rec.expected_base_commit)). " +
                'Build Control must issue a new instruction_id.')
    }

    switch ([string]$rec.status) {
        'COMPLETED'        { return "SKIP:instruction '$id' already completed at $($rec.ended_utc)" }
        'FAILED'           { return "SKIP:instruction '$id' already ran and failed at $($rec.ended_utc); a new instruction is required" }
        'BLOCKED_RECOVERY' { return "SKIP:instruction '$id' is held in recovery pending a human decision" }
        'STARTED'          {
            return ("BLOCK:instruction '$id' was STARTED at $($rec.started_utc) but never completed. " +
                    'The previous run was interrupted; it will not be repeated automatically.')
        }
        default            { return "SKIP:instruction '$id' has unrecognised recorded status '$($rec.status)'" }
    }
}

# =====================================================================
# Machine-wide coordination (cross-application)
# =====================================================================

function Initialize-GlobalDir {
    if (-not (Test-Path $GlobalDir)) {
        New-Item -ItemType Directory -Path $GlobalDir -Force | Out-Null
        Write-RunnerLog "created machine-wide coordination directory $GlobalDir"
    }
}

function Test-GlobalPause {
    return (Test-Path $PauseFile)
}

function Get-GlobalLock {
    if (-not (Test-Path $LockFile)) { return $null }
    try {
        $txt = Get-Content -Raw -Path $LockFile
        if ([string]::IsNullOrWhiteSpace($txt)) { return $null }
        return ($txt | ConvertFrom-Json)
    } catch {
        return 'UNREADABLE'
    }
}

function Test-LockStale {
    <#  A lease is stale only when BOTH hold:
          1. the recorded owner process no longer exists; AND
          2. the heartbeat is older than $StaleHeartbeatMinutes.
        Time alone never makes a live lease stale.  #>
    param([Parameter(Mandatory = $true)]$Lock)

    $ownerPid = 0
    if ($Lock.PSObject.Properties.Name -contains 'pid') { $ownerPid = [int]$Lock.pid }
    if (Test-ProcessAlive -ProcessId $ownerPid) { return $false }

    $hb = $null
    if ($Lock.PSObject.Properties.Name -contains 'heartbeat_utc') {
        try { $hb = [datetime]::Parse([string]$Lock.heartbeat_utc, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AdjustToUniversal) } catch { $hb = $null }
    }
    if ($null -eq $hb) { return $false }

    $age = ((Get-Date).ToUniversalTime() - $hb).TotalMinutes
    return ($age -gt $StaleHeartbeatMinutes)
}

function Request-GlobalLock {
    <#  Atomic acquisition: CreateNew fails if the lease already exists.
        Returns $true on success.  #>
    param([string]$InstructionId = '')

    Initialize-GlobalDir
    $payload = @{
        app             = $AppId
        pid             = $PID
        child_pid       = $null
        instruction_id  = $InstructionId
        acquired_utc    = (Get-UtcNowString)
        heartbeat_utc   = (Get-UtcNowString)
        host            = $env:COMPUTERNAME
        repo            = $RepoRoot
    }

    try {
        $stream = [System.IO.File]::Open($LockFile, [System.IO.FileMode]::CreateNew,
                                         [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        try {
            $bytes = [System.Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Depth 6))
            $stream.Write($bytes, 0, $bytes.Length)
        } finally {
            $stream.Close()
        }
        $Script:HeldLock = $true
        Write-RunnerLog "acquired machine-wide application lease ($AppId, pid $PID)"
        return $true
    } catch [System.IO.IOException] {
        return $false
    }
}

function Update-GlobalLockHeartbeat {
    param([int]$ChildPid = 0)
    if (-not $Script:HeldLock) { return }
    try {
        $lock = Get-GlobalLock
        if ($null -eq $lock -or $lock -eq 'UNREADABLE') { return }
        if ([int]$lock.pid -ne $PID) { return }   # never write over another owner
        $lock.heartbeat_utc = (Get-UtcNowString)
        if ($ChildPid -gt 0) { $lock.child_pid = $ChildPid }
        ($lock | ConvertTo-Json -Depth 6) | Set-Content -Path $LockFile -Encoding utf8
    } catch { }
}

function Remove-GlobalLock {
    if (-not $Script:HeldLock) { return }
    try {
        $lock = Get-GlobalLock
        if ($lock -ne 'UNREADABLE' -and $null -ne $lock -and [int]$lock.pid -ne $PID) {
            Write-RunnerLog -Level 'WARN' -Message 'machine-wide lease is owned by another process; not releasing it'
            $Script:HeldLock = $false
            return
        }
        Remove-Item -Path $LockFile -Force -ErrorAction Stop
        Write-RunnerLog "released machine-wide application lease"
    } catch {
        Write-RunnerLog -Level 'WARN' -Message "could not release machine-wide lease: $($_.Exception.Message)"
    } finally {
        $Script:HeldLock = $false
    }
}

# =====================================================================
# Manual Claude Code detection
# =====================================================================

function Get-ClaudeCliProcesses {
    <#  Claude Code CLI processes only.

        The Claude *desktop* application also runs as claude.exe (under
        \WindowsApps\Claude_*). It is unrelated to Claude Code and must not be
        mistaken for a manual coding session, or the runner would never start.  #>
    try {
        $procs = Get-CimInstance Win32_Process -Filter "Name = 'claude.exe'" -ErrorAction Stop
    } catch {
        Write-RunnerLog -Level 'WARN' -Message "cannot enumerate processes; treating as 'manual session possible': $($_.Exception.Message)"
        return $null
    }

    $cli = @()
    foreach ($p in $procs) {
        $path = [string]$p.ExecutablePath
        if ([string]::IsNullOrWhiteSpace($path)) { continue }
        if ($path -match '(?i)\\WindowsApps\\Claude_') { continue }        # desktop app
        if ($path -match '(?i)ClaudeCode|\.claude|claude-code') { $cli += $p }
    }
    # Comma operator: an empty array must stay an array, not unroll to $null.
    return ,$cli
}

function Get-ForeignClaudeProcesses {
    <#  Claude Code CLI processes that this runner did not start.
        In -SelfTest the baseline captured at startup is excluded; see the
        documented allowance in build-control/runner/CROSS_APP_PROTOCOL.md.  #>
    param([int]$OwnChildPid = 0)

    $cli = Get-ClaudeCliProcesses
    if ($null -eq $cli) { return $null }

    $foreign = @()
    foreach ($p in $cli) {
        $procId = [int]$p.ProcessId
        if ($procId -eq $OwnChildPid) { continue }
        if ([int]$p.ParentProcessId -eq $PID) { continue }
        if ($SelfTest -and ($Script:BaselineClaudePids -contains $procId)) { continue }
        $foreign += $p
    }
    return ,$foreign
}

# =====================================================================
# Runner single-instance lock
# =====================================================================

function Request-RunnerLock {
    Initialize-LocalDirs
    if (Test-Path $RunnerLock) {
        try {
            $existing = Get-Content -Raw -Path $RunnerLock | ConvertFrom-Json
            if (Test-ProcessAlive -ProcessId ([int]$existing.pid)) {
                Write-RunnerLog -Level 'BLOCK' -Message "another Cooking Lab runner is already running (pid $($existing.pid))"
                return $false
            }
            Write-RunnerLog -Level 'WARN' -Message "removing stale runner lock from dead pid $($existing.pid)"
            Remove-Item $RunnerLock -Force
        } catch {
            Write-RunnerLog -Level 'WARN' -Message 'removing unreadable runner lock'
            Remove-Item $RunnerLock -Force -ErrorAction SilentlyContinue
        }
    }
    (@{ pid = $PID; started_utc = (Get-UtcNowString); self_test = [bool]$SelfTest } | ConvertTo-Json) |
        Set-Content -Path $RunnerLock -Encoding utf8
    $Script:HeldRunnerLock = $true
    return $true
}

function Remove-RunnerLock {
    if (-not $Script:HeldRunnerLock) { return }
    Remove-Item $RunnerLock -Force -ErrorAction SilentlyContinue
    $Script:HeldRunnerLock = $false
}

# =====================================================================
# Bounded Claude child
# =====================================================================

function New-ChildSettingsFile {
    <#  Generates the settings file that installs the deny-by-default
        permission gate for the child. Written locally (never committed) so the
        absolute hook path stays machine-specific.  #>
    Initialize-LocalDirs
    $gate = Join-Path $ScriptDir 'build-control-gate.ps1'
    if (-not (Test-Path $gate)) { throw "permission gate script not found: $gate" }

    $hookCommand = 'powershell -NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $gate
    $settings = @{
        hooks = @{
            PreToolUse = @(
                @{
                    matcher = '*'
                    hooks   = @( @{ type = 'command'; command = $hookCommand } )
                }
            )
        }
    }
    $path = Join-Path $LocalDir 'claude-settings.json'
    ($settings | ConvertTo-Json -Depth 8) | Set-Content -Path $path -Encoding utf8
    return $path
}

function Invoke-BoundedClaude {
    <#  Launches exactly one non-interactive Claude child for the validated
        prompt and waits for it. No unrestricted permission bypass is used.  #>
    param(
        [Parameter(Mandatory = $true)][string]$PromptRelPath,
        [Parameter(Mandatory = $true)][string]$InstructionId
    )

    $promptFull = Join-Path $RepoRoot ($PromptRelPath -replace '/', '\')
    $settings   = New-ChildSettingsFile

    $runDir = Join-Path $LogDir $InstructionId
    if (-not (Test-Path $runDir)) { New-Item -ItemType Directory -Path $runDir -Force | Out-Null }
    $outFile = Join-Path $runDir 'claude.stdout.json'
    $errFile = Join-Path $runDir 'claude.stderr.log'

    # The gate reads these; the child inherits them from this process.
    $env:COOKING_LAB_REPO_ROOT  = $RepoRoot
    $env:COOKING_LAB_DENY_PATHS = ($ProtectedPaths -join ';')

    $argString = '-p --output-format json --permission-mode acceptEdits ' +
                 '--setting-sources user ' +
                 ('--settings "{0}" ' -f $settings) +
                 ('--tools "{0}"' -f $ChildTools)

    Write-RunnerLog -Level 'RUN' -Message "launching bounded Claude child for '$InstructionId' with prompt $PromptRelPath"
    Write-RunnerLog "child invocation: claude $argString"

    $started = Get-UtcNowString
    $proc = Start-Process -FilePath 'claude' `
                          -ArgumentList $argString `
                          -WorkingDirectory $RepoRoot `
                          -RedirectStandardInput $promptFull `
                          -RedirectStandardOutput $outFile `
                          -RedirectStandardError $errFile `
                          -NoNewWindow -PassThru

    Write-RunnerLog -Level 'RUN' -Message "child Claude pid $($proc.Id)"
    Update-GlobalLockHeartbeat -ChildPid $proc.Id

    $deadline    = (Get-Date).AddMinutes($MaxChildMinutes)
    $lastBeat    = Get-Date
    $timedOut    = $false

    while (-not $proc.HasExited) {
        Start-Sleep -Seconds 5
        if (((Get-Date) - $lastBeat).TotalSeconds -ge $HeartbeatSeconds) {
            Update-GlobalLockHeartbeat -ChildPid $proc.Id
            $lastBeat = Get-Date
        }
        if ((Get-Date) -gt $deadline) {
            Write-RunnerLog -Level 'WARN' -Message "child exceeded $MaxChildMinutes minutes; stopping this runner's own child"
            try { $proc.Kill() } catch { }
            $timedOut = $true
            break
        }
    }

    $proc.WaitForExit()
    $exitCode = $proc.ExitCode
    $ended    = Get-UtcNowString

    Write-RunnerLog -Level 'RUN' -Message "child Claude exited with code $exitCode"

    return [pscustomobject]@{
        ExitCode    = $exitCode
        TimedOut    = $timedOut
        StartedUtc  = $started
        EndedUtc    = $ended
        StdoutFile  = $outFile
        StderrFile  = $errFile
        ChildPid    = $proc.Id
        RunDir      = $runDir
    }
}

function Get-ChildOutcome {
    <# Parses the child's JSON result for post-run assessment. #>
    param([Parameter(Mandatory = $true)]$Run)

    $summary = [pscustomobject]@{
        IsError          = $null
        Result           = $null
        PermissionDenied = 0
        NumTurns         = $null
    }
    try {
        if (Test-Path $Run.StdoutFile) {
            $txt = Get-Content -Raw -Path $Run.StdoutFile
            if (-not [string]::IsNullOrWhiteSpace($txt)) {
                $j = $txt | ConvertFrom-Json
                $summary.IsError  = $j.is_error
                $summary.Result   = [string]$j.result
                $summary.NumTurns = $j.num_turns
                if ($j.PSObject.Properties.Name -contains 'permission_denials' -and $null -ne $j.permission_denials) {
                    $summary.PermissionDenied = @($j.permission_denials).Count
                }
            }
        }
    } catch {
        Write-RunnerLog -Level 'WARN' -Message "could not parse child output: $($_.Exception.Message)"
    }
    return $summary
}

# =====================================================================
# One polling cycle
# =====================================================================

function Invoke-RunnerCycle {

    # 1. machine-wide pause
    if (Test-GlobalPause) {
        Write-RunnerLog -Level 'BLOCK' -Message "unattended work is paused ($PauseFile present); waiting"
        return
    }

    # 2. manual Claude Code activity
    $foreign = Get-ForeignClaudeProcesses
    if ($null -eq $foreign) {
        Write-RunnerLog -Level 'BLOCK' -Message 'cannot determine Claude Code process state; not starting'
        return
    }
    if ($foreign.Count -gt 0) {
        $pids = ($foreign | ForEach-Object { $_.ProcessId }) -join ', '
        Write-RunnerLog -Level 'BLOCK' -Message ("another Claude Code session is running (pid $pids); " +
                                                 'manual work has priority - not starting Cooking Lab')
        return
    }

    # 3. machine-wide application lease held by someone else
    $lock = Get-GlobalLock
    if ($lock -eq 'UNREADABLE') {
        Write-RunnerLog -Level 'BLOCK' -Message 'machine-wide lease file is unreadable; not starting'
        return
    }
    if ($null -ne $lock) {
        if (Test-LockStale -Lock $lock) {
            Write-RunnerLog -Level 'WARN' -Message ("machine-wide lease from '$($lock.app)' pid $($lock.pid) is stale " +
                                                    "(process gone and heartbeat older than $StaleHeartbeatMinutes min); reclaiming")
            Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
        } else {
            Write-RunnerLog -Level 'BLOCK' -Message "machine-wide application lease is held by '$($lock.app)' (pid $($lock.pid)); waiting"
            return
        }
    }

    # 4. repository preconditions
    $reason = Test-RepoPreconditions
    if ($null -ne $reason) {
        Write-RunnerLog -Level 'BLOCK' -Message "RUNNER BLOCKED - repository precondition failed: $reason"
        Write-HumanActionRequired "resolve the repository state before unattended work can continue"
        return
    }

    # 5. safe synchronisation
    $sync = Invoke-SafeSync
    switch ($sync) {
        'OK'       { }
        'NETWORK'  { Write-RunnerLog -Level 'WARN' -Message 'no network; will retry next cycle (stale work is never run)'; return }
        'DIVERGED' {
            Write-RunnerLog -Level 'BLOCK' -Message 'RUNNER BLOCKED - local main and origin/main have diverged; no automatic merge, rebase or reset'
            Write-HumanActionRequired 'reconcile local main with origin/main manually'
            return
        }
        default    {
            Write-RunnerLog -Level 'BLOCK' -Message "RUNNER BLOCKED - $sync"
            Write-HumanActionRequired 'inspect the repository synchronisation failure'
            return
        }
    }

    # 6. queue
    $queue = Read-QueueInstruction
    if ($queue.Status -eq 'NONE') {
        Write-RunnerLog "no pending instruction ($($queue.Reason)); waiting"
        return
    }
    if ($queue.Status -eq 'INVALID') {
        Write-RunnerLog -Level 'BLOCK' -Message "queue rejected: $($queue.Reason)"
        Write-HumanActionRequired 'Build Control must correct or withdraw the queued instruction'
        return
    }

    $inst = $queue.Instruction
    $id   = [string]$inst.instruction_id
    Write-RunnerLog "queue validated: instruction '$id' ($($inst.milestone)) -> $($inst.prompt_path)"

    # 7. duplicate-execution protection
    $consumable = Test-InstructionConsumable -Instruction $inst -ActivationCommit $queue.ActivationCommit
    if ($consumable -like 'SKIP:*') {
        Write-RunnerLog ($consumable.Substring(5))
        return
    }
    if ($consumable -like 'BLOCK:*') {
        Write-RunnerLog -Level 'BLOCK' -Message $consumable.Substring(6)
        $state = Read-InstructionState
        if ($state.ContainsKey($id) -and [string]$state[$id].status -eq 'STARTED') {
            $rec = @{}
            foreach ($p in $state[$id].PSObject.Properties) { $rec[$p.Name] = $p.Value }
            $rec['status'] = 'BLOCKED_RECOVERY'
            $rec['notes']  = 'previous run was interrupted; held for a human decision rather than repeated'
            Set-InstructionRecord -InstructionId $id -Record $rec
        }
        Write-HumanActionRequired "review instruction '$id' before it can run again"
        return
    }

    # 8. acquire the machine-wide lease atomically, then re-check nothing changed
    if (-not (Request-GlobalLock -InstructionId $id)) {
        Write-RunnerLog -Level 'BLOCK' -Message 'another application acquired the machine-wide lease first; waiting'
        return
    }

    try {
        if (Test-GlobalPause) {
            Write-RunnerLog -Level 'BLOCK' -Message 'unattended work was paused after the lease was acquired; standing down'
            return
        }
        $foreign2 = Get-ForeignClaudeProcesses
        if ($null -eq $foreign2 -or $foreign2.Count -gt 0) {
            Write-RunnerLog -Level 'BLOCK' -Message 'a Claude Code session appeared after the lease was acquired; standing down'
            return
        }

        # 9. mark STARTED before launching, so an interrupted run is detectable
        Set-InstructionRecord -InstructionId $id -Record @{
            instruction_id       = $id
            prompt_path          = [string]$inst.prompt_path
            prompt_sha256        = [string]$inst.prompt_sha256
            expected_base_commit = [string]$inst.expected_base_commit
            activation_commit    = $queue.ActivationCommit
            milestone            = [string]$inst.milestone
            status               = 'STARTED'
            started_utc          = (Get-UtcNowString)
            ended_utc            = $null
            exit_code            = $null
            notes                = ''
        }

        $headBefore = (Invoke-Git @('rev-parse', 'HEAD')).Text

        # 10. run exactly one bounded child
        $run = Invoke-BoundedClaude -PromptRelPath ([string]$inst.prompt_path) -InstructionId $id

        # 11. post-run repository assessment
        $outcome    = Get-ChildOutcome -Run $run
        $headAfter  = (Invoke-Git @('rev-parse', 'HEAD')).Text
        $statusAfter= (Invoke-Git @('status', '--porcelain')).Text

        $finalStatus = 'COMPLETED'
        if ($run.TimedOut -or $run.ExitCode -ne 0 -or $outcome.IsError -eq $true) { $finalStatus = 'FAILED' }

        $notes = @()
        $notes += "head_before=$headBefore"
        $notes += "head_after=$headAfter"
        if (-not [string]::IsNullOrWhiteSpace($statusAfter)) {
            $notes += 'working tree is NOT clean after the run'
            Write-RunnerLog -Level 'WARN' -Message "working tree is not clean after the run:`n$statusAfter"
            Write-HumanActionRequired 'uncommitted changes remain after the bounded run'
        }
        if ($outcome.PermissionDenied -gt 0) {
            $notes += "permission_denials=$($outcome.PermissionDenied)"
            Write-RunnerLog -Level 'WARN' -Message "the permission gate denied $($outcome.PermissionDenied) tool call(s) during this run"
        }
        if ($null -ne $outcome.Result -and $outcome.Result -match 'HUMAN ACTION REQUIRED') {
            Write-HumanActionRequired 'the bounded run reported a human-authorisation boundary'
            $notes += 'child reported HUMAN ACTION REQUIRED'
        }

        Set-InstructionRecord -InstructionId $id -Record @{
            instruction_id       = $id
            prompt_path          = [string]$inst.prompt_path
            prompt_sha256        = [string]$inst.prompt_sha256
            expected_base_commit = [string]$inst.expected_base_commit
            activation_commit    = $queue.ActivationCommit
            milestone            = [string]$inst.milestone
            status               = $finalStatus
            started_utc          = $run.StartedUtc
            ended_utc            = $run.EndedUtc
            exit_code            = $run.ExitCode
            notes                = ($notes -join '; ')
        }

        Write-RunnerLog -Level 'RUN' -Message "instruction '$id' recorded as $finalStatus (exit $($run.ExitCode))"
        if ($finalStatus -eq 'FAILED') {
            Write-RunnerLog -Level 'BLOCK' -Message 'the bounded run failed; it will not be relaunched automatically'
            Write-HumanActionRequired "review the failed run under $($run.RunDir)"
        }
    }
    finally {
        Remove-GlobalLock
    }
}

# =====================================================================
# Entry point
# =====================================================================

try {
    Initialize-LocalDirs
    Write-RunnerLog '============================================================'
    Write-RunnerLog "Cooking Lab Build Control runner starting (pid $PID)"
    Write-RunnerLog "repository: $RepoRoot"
    Write-RunnerLog "machine-wide coordination: $GlobalDir"
    if ($SelfTest) {
        Write-RunnerLog -Level 'WARN' -Message 'SELF-TEST MODE: pre-existing Claude Code CLI processes are ignored for this run only'
    }

    if (-not (Request-RunnerLock)) { exit 1 }

    $baseline = Get-ClaudeCliProcesses
    if ($null -ne $baseline) {
        $Script:BaselineClaudePids = @($baseline | ForEach-Object { [int]$_.ProcessId })
        if ($SelfTest -and $Script:BaselineClaudePids.Count -gt 0) {
            Write-RunnerLog "self-test baseline Claude Code pids ignored: $($Script:BaselineClaudePids -join ', ')"
        }
    }

    if ($Once) {
        Invoke-RunnerCycle
    } else {
        Write-RunnerLog "polling every $PollSeconds seconds; press Ctrl+C to stop"
        while ($true) {
            try {
                Invoke-RunnerCycle
            } catch {
                Write-RunnerLog -Level 'WARN' -Message "cycle error (continuing): $($_.Exception.Message)"
            }
            Start-Sleep -Seconds $PollSeconds
        }
    }
}
finally {
    Remove-GlobalLock
    Remove-RunnerLock
    Write-RunnerLog 'runner stopped'
}
