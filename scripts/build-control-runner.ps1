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
# Test seams
#
# The self-test suite must be able to exercise the runner against a scratch
# repository, a scratch coordination directory and a stub worker, without ever
# touching the real ones. Those redirections are honoured ONLY in explicit
# self-test mode or when this script is dot-sourced as a library by the suite.
# In normal unattended operation every value below is the fixed production one,
# and no environment variable can change it.
# =====================================================================

$Script:LibraryOnly = ($env:COOKING_LAB_RUNNER_LIB_ONLY -eq '1')
$Script:TestSeams   = ($SelfTest.IsPresent -or $Script:LibraryOnly)

function Get-SeamValue {
    param([string]$Name, [string]$Default)
    if (-not $Script:TestSeams) { return $Default }
    $v = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($v)) { return $Default }
    return $v
}

# =====================================================================
# Configuration
# =====================================================================

$AppId          = 'cooking-lab'
$ExpectedBranch = 'main'
$ExpectedRemote = Get-SeamValue 'COOKING_LAB_EXPECTED_REMOTE' 'https://github.com/mikeohallo/cooking-lab.git'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Get-SeamValue 'COOKING_LAB_REPO_ROOT_OVERRIDE' ((Resolve-Path (Join-Path $ScriptDir '..')).Path.TrimEnd('\'))
$RepoRoot  = $RepoRoot.TrimEnd('\')

# The worker executable. Overridable only under a test seam, so the suite can
# prove "launches exactly once" against a stub instead of a real model call.
$ClaudeExe = Get-SeamValue 'COOKING_LAB_CLAUDE_EXE' 'claude'

$GlobalDir = Get-SeamValue 'COOKING_LAB_GLOBAL_DIR' 'C:\Projects\.app-build-control'
$PauseFile = Join-Path $GlobalDir 'PAUSE_UNATTENDED'
$LockFile  = Join-Path $GlobalDir 'app.lock.json'

$LocalDir   = Join-Path $RepoRoot '.build-control-local'
$StateFile  = Join-Path $LocalDir 'state\instructions.json'
$RunnerLock = Join-Path $LocalDir 'runner.lock'
$LogDir     = Join-Path $LocalDir 'logs'
$TmpDir     = Join-Path $LocalDir 'tmp'
# A runner-controlled, deliberately empty hooks directory. Git invoked by the
# bounded child is pointed here, so no pre-existing local hook can fire during
# an unattended commit or push. Local only; never committed.
$HooksDir   = Join-Path $LocalDir 'githooks'
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

# Terminal states an instruction can reach. STARTED is the only in-flight
# state; anything left in it means the run was interrupted.
$TerminalStates = @('COMPLETED', 'FAILED', 'HUMAN_ACTION_REQUIRED', 'BLOCKED', 'RECOVERY_REQUIRED')

# Every property the queue schema defines. Anything else is rejected outright.
$KnownQueueProperties = @(
    'instruction_id', 'prompt_path', 'prompt_sha256', 'expected_base_commit',
    'milestone', 'scope', 'allow_unattended', 'notes',
    'requires_commit', 'requires_push', 'expected_report_path'
)

$Script:HeldLock  = $false
$Script:LeaseToken = $null
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
    foreach ($d in @($LocalDir, $LogDir, $TmpDir, $HooksDir, (Split-Path -Parent $StateFile))) {
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

    $aliasReason = Test-NoShadowingGitAlias
    if ($null -ne $aliasReason) { return $aliasReason }

    return $null
}

# Git subcommands the permission gate permits the bounded child to run. Kept
# here so the alias precondition and the gate cannot drift apart silently.
$AllowedGitSubcommands = @(
    'status', 'diff', 'log', 'show', 'rev-parse', 'rev-list',
    'ls-files', 'fetch', 'add', 'commit', 'push'
)

function Test-NoShadowingGitAlias {
    <#  A git alias is expansion, not a subcommand: `[alias] status = !adb
        devices` would turn an allowed command into an arbitrary one, and the
        gate sees only the word "status". Aliases cannot be cleared through
        environment configuration, so the runner refuses to launch while one
        shadows an allowed subcommand.

        Returns $null when clear, else a reason.  #>

    $aliases = Invoke-Git @('config', '--get-regexp', '^alias\.')
    # Exit code 1 with no output simply means no alias is configured.
    if ($aliases.ExitCode -ne 0 -and -not [string]::IsNullOrWhiteSpace($aliases.Text)) {
        return "cannot read git alias configuration: $($aliases.Text)"
    }
    if ([string]::IsNullOrWhiteSpace($aliases.Text)) { return $null }

    $shadowing = @()
    foreach ($line in ($aliases.Text -split "`n")) {
        $name = ($line -split '\s+', 2)[0]
        if ($name -match '^alias\.(.+)$') {
            $sub = $Matches[1]
            if ($AllowedGitSubcommands -contains $sub) { $shadowing += $sub }
        }
    }
    if ($shadowing.Count -gt 0) {
        return ("git alias(es) shadow allowed subcommand(s): $($shadowing -join ', '). " +
                'An alias can expand an allowed command into an arbitrary one, so unattended work is refused until they are removed.')
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

    if ($q -isnot [System.Management.Automation.PSCustomObject]) {
        return Fail 'queue file must contain a single JSON object'
    }

    $present = @($q.PSObject.Properties.Name)

    # --- unknown properties (fail closed) ---------------------------------
    # A queue file the runner does not fully understand is never executed. This
    # also refuses any attempt to smuggle executable content into the queue.
    $executableish = @('command', 'commands', 'shell', 'script', 'scripts', 'args', 'argv', 'exec', 'run', 'env', 'hooks', 'tools', 'settings')
    foreach ($name in $present) {
        if ($KnownQueueProperties -contains $name) { continue }
        if ($executableish -contains $name.ToLowerInvariant()) {
            return Fail "queue file must not carry executable content (found field '$name')"
        }
        return Fail "queue file contains unknown property '$name'; the schema is closed and unknown fields are rejected"
    }

    # --- required properties ----------------------------------------------
    foreach ($field in @('instruction_id', 'prompt_path', 'prompt_sha256', 'expected_base_commit', 'milestone', 'scope', 'allow_unattended')) {
        if (-not ($present -contains $field)) {
            return Fail "queue file is missing required field '$field'"
        }
    }

    if ($q.allow_unattended -isnot [bool]) { return Fail 'allow_unattended must be a JSON boolean' }
    if (-not $q.allow_unattended) {
        return [pscustomobject]@{ Status = 'NONE'; Reason = 'allow_unattended is false; nothing is authorised'; Instruction = $null; ActivationCommit = $null }
    }

    # --- types --------------------------------------------------------------
    foreach ($field in @('instruction_id', 'prompt_path', 'prompt_sha256', 'expected_base_commit', 'milestone', 'scope')) {
        if ($q.$field -isnot [string]) { return Fail "field '$field' must be a JSON string" }
        if ([string]::IsNullOrWhiteSpace([string]$q.$field)) { return Fail "field '$field' must be a non-empty string" }
    }
    if (($present -contains 'notes') -and $q.notes -isnot [string]) {
        return Fail 'field ''notes'' must be a JSON string'
    }
    foreach ($field in @('requires_commit', 'requires_push')) {
        if (($present -contains $field) -and $q.$field -isnot [bool]) {
            return Fail "field '$field' must be a JSON boolean"
        }
    }
    if ($present -contains 'expected_report_path') {
        if ($q.expected_report_path -isnot [string]) { return Fail 'field ''expected_report_path'' must be a JSON string' }
        if ([string]$q.expected_report_path -notmatch '^build-control/reports/[A-Za-z0-9._-]+\.md$') {
            return Fail "expected_report_path must be a Markdown file directly inside build-control/reports/: '$($q.expected_report_path)'"
        }
    }

    # --- formats ------------------------------------------------------------
    $instructionId = [string]$q.instruction_id
    if ($instructionId -notmatch '^[A-Za-z0-9._-]{3,120}$') {
        return Fail "instruction_id contains unsupported characters: '$instructionId'"
    }
    if ([string]$q.prompt_sha256 -cnotmatch '^[0-9a-f]{64}$') {
        return Fail 'prompt_sha256 must be 64 lowercase hex characters'
    }
    if ([string]$q.expected_base_commit -cnotmatch '^[0-9a-f]{40}$') {
        return Fail 'expected_base_commit must be a full 40-character lowercase git SHA'
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

function Get-InstructionRequirements {
    <#  Resolves the completion requirements an instruction must satisfy.

        Both git requirements default to TRUE when the queue is silent. That is
        deliberate: a Build Control instruction that produces work is expected
        to commit and push it, and an unstated requirement must never be the
        reason something is called COMPLETED. A prompt that must not touch git
        - the runner self-test, for example - has to say so explicitly with
        requires_commit:false and requires_push:false.  #>
    param([Parameter(Mandatory = $true)]$Instruction)

    $present = @($Instruction.PSObject.Properties.Name)
    $requiresCommit = $true
    $requiresPush   = $true
    $reportPath     = $null
    if ($present -contains 'requires_commit')      { $requiresCommit = [bool]$Instruction.requires_commit }
    if ($present -contains 'requires_push')        { $requiresPush   = [bool]$Instruction.requires_push }
    if ($present -contains 'expected_report_path') { $reportPath     = [string]$Instruction.expected_report_path }

    return [pscustomobject]@{
        RequiresCommit     = $requiresCommit
        RequiresPush       = $requiresPush
        ExpectedReportPath = $reportPath
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
        'COMPLETED'             { return "SKIP:instruction '$id' already completed at $($rec.ended_utc)" }
        'FAILED'                { return "SKIP:instruction '$id' already ran and failed at $($rec.ended_utc); a new instruction is required" }
        'HUMAN_ACTION_REQUIRED' { return "SKIP:instruction '$id' stopped at a human-authorisation boundary at $($rec.ended_utc); a new instruction is required" }
        'BLOCKED'               { return "SKIP:instruction '$id' is blocked and will not be retried without a new Build Control instruction" }
        'RECOVERY_REQUIRED'     { return "SKIP:instruction '$id' is held in recovery pending a human decision" }
        'BLOCKED_RECOVERY'      { return "SKIP:instruction '$id' is held in recovery pending a human decision (legacy status)" }
        'STARTED'               {
            return ("BLOCK:instruction '$id' was STARTED at $($rec.started_utc) but never reached a terminal state. " +
                    'The previous run was interrupted and may already have committed or pushed; ' +
                    'it will not be repeated automatically.')
        }
        default                 { return "SKIP:instruction '$id' has unrecognised recorded status '$($rec.status)'" }
    }
}

# =====================================================================
# Completion assessment
# =====================================================================

function Get-CompletionAssessment {
    <#  Decides the terminal state of a bounded run.

        A Claude process exiting successfully is NOT sufficient to call an
        instruction COMPLETED. Every requirement appropriate to the instruction
        must hold, and anything ambiguous resolves away from COMPLETED.

        Returns: Status (one of $TerminalStates) plus the reasons observed.  #>
    param(
        [Parameter(Mandatory = $true)]$Run,           # Invoke-BoundedClaude result
        [Parameter(Mandatory = $true)]$Outcome,       # Get-ChildOutcome result
        [Parameter(Mandatory = $true)]$Verification   # New-RunVerification result
    )

    # Each failed check contributes (state, reason). The first entry decides the
    # recorded state; the rest are kept so the audit trail shows everything that
    # was wrong, not just the first thing noticed.
    $findings = New-Object System.Collections.ArrayList

    # --- the child itself ------------------------------------------------
    if ($Run.TimedOut) {
        [void]$findings.Add(@('FAILED', 'the child exceeded the maximum run time and was stopped'))
    }
    if ($Outcome.HumanActionRequired) {
        [void]$findings.Add(@('HUMAN_ACTION_REQUIRED', 'the child reported HUMAN ACTION REQUIRED'))
    }
    if ($null -ne $Run.ExitCode -and $Run.ExitCode -ne 0) {
        [void]$findings.Add(@('FAILED', "the child exited with code $($Run.ExitCode)"))
    }
    if ($Outcome.IsError -eq $true) {
        [void]$findings.Add(@('FAILED', 'the child reported is_error=true'))
    }
    if ($null -eq $Run.ExitCode -and $Outcome.IsError -ne $false) {
        [void]$findings.Add(@('FAILED', 'the child exit code was unreadable and the child did not report success'))
    }

    # --- repository state ------------------------------------------------
    if (-not $Verification.WorkingTreeClean) {
        [void]$findings.Add(@('RECOVERY_REQUIRED', 'the working tree is not clean after the run; partial work is ambiguous'))
    }
    if ($Verification.RequiresCommit -and ($Verification.HeadAfter -eq $Verification.HeadBefore)) {
        [void]$findings.Add(@('FAILED', 'the instruction required a commit but HEAD did not move'))
    }
    if (-not [string]::IsNullOrWhiteSpace($Verification.ExpectedReportPath)) {
        if (-not $Verification.ReportExists) {
            [void]$findings.Add(@('FAILED', "the required Build Control report '$($Verification.ExpectedReportPath)' does not exist"))
        } elseif (-not $Verification.ReportCommitted) {
            [void]$findings.Add(@('RECOVERY_REQUIRED', "the required report '$($Verification.ExpectedReportPath)' exists but is not committed"))
        }
    }
    if ($Verification.RequiresPush) {
        if (-not $Verification.RemoteReachable) {
            [void]$findings.Add(@('RECOVERY_REQUIRED', 'the push could not be confirmed because origin was unreachable'))
        } elseif (-not $Verification.PushedToOrigin) {
            [void]$findings.Add(@('RECOVERY_REQUIRED', "origin/$ExpectedBranch does not contain the local commits; the push did not reach GitHub"))
        } elseif (-not $Verification.OriginSynchronised) {
            [void]$findings.Add(@('RECOVERY_REQUIRED', "local $ExpectedBranch and origin/$ExpectedBranch are not synchronised"))
        }
    }

    if ($findings.Count -eq 0) {
        return [pscustomobject]@{
            Status  = 'COMPLETED'
            Reasons = @('every completion requirement for this instruction was verified')
        }
    }

    return [pscustomobject]@{
        Status  = [string]$findings[0][0]
        Reasons = @($findings | ForEach-Object { [string]$_[1] })
    }
}

function New-RunVerification {
    <#  Gathers the observable facts the completion assessment needs.

        Deliberately separated from the decision so the self-test suite can
        assess constructed states without running a child.  #>
    param(
        [Parameter(Mandatory = $true)][string]$HeadBefore,
        [Parameter(Mandatory = $true)]$Requirements
    )

    $headAfter   = (Invoke-Git @('rev-parse', 'HEAD')).Text
    $statusAfter = (Invoke-Git @('status', '--porcelain')).Text
    $clean       = [string]::IsNullOrWhiteSpace($statusAfter)

    $reportExists    = $false
    $reportCommitted = $false
    $reportPath      = $Requirements.ExpectedReportPath
    if (-not [string]::IsNullOrWhiteSpace($reportPath)) {
        $reportFull   = Join-Path $RepoRoot ($reportPath -replace '/', '\')
        $reportExists = (Test-Path -LiteralPath $reportFull)
        $tracked      = Invoke-Git @('ls-files', '--error-unmatch', '--', $reportPath)
        $reportCommitted = ($tracked.ExitCode -eq 0)
    }

    # Confirm the push actually reached GitHub rather than trusting the child.
    $remoteReachable = $true
    $pushed          = $false
    $synchronised    = $false
    if ($Requirements.RequiresPush) {
        $fetch = Invoke-Git @('fetch', 'origin', '--prune')
        if ($fetch.ExitCode -ne 0) {
            $remoteReachable = $false
        } else {
            $contains = Invoke-Git @('merge-base', '--is-ancestor', $headAfter, "origin/$ExpectedBranch")
            $pushed   = ($contains.ExitCode -eq 0)
            $originHead = Invoke-Git @('rev-parse', "origin/$ExpectedBranch")
            $synchronised = ($originHead.ExitCode -eq 0 -and $originHead.Text -eq $headAfter)
        }
    }

    return [pscustomobject]@{
        HeadBefore         = $HeadBefore
        HeadAfter          = $headAfter
        WorkingTreeStatus  = $statusAfter
        WorkingTreeClean   = $clean
        RequiresCommit     = [bool]$Requirements.RequiresCommit
        RequiresPush       = [bool]$Requirements.RequiresPush
        ExpectedReportPath = $reportPath
        ReportExists       = $reportExists
        ReportCommitted    = $reportCommitted
        RemoteReachable    = $remoteReachable
        PushedToOrigin     = $pushed
        OriginSynchronised = $synchronised
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

function Get-LeaseIdentity {
    <#  The ownership fingerprint of a lease.

        Any change of owner, generation, acquisition time or heartbeat produces
        a different fingerprint. Stale-lease reclaim is conditional on this
        value being unchanged, so a lease that was handed over while stale
        analysis was in progress can never be taken.  #>
    param($Lock)

    if ($null -eq $Lock -or $Lock -eq 'UNREADABLE') { return $null }
    $names = @($Lock.PSObject.Properties.Name)
    $get = {
        param($n)
        if ($names -contains $n) { return [string]$Lock.$n }
        return ''
    }
    return (@(
        (& $get 'owner_token'), (& $get 'app'), (& $get 'pid'),
        (& $get 'generation'), (& $get 'acquired_utc'), (& $get 'heartbeat_utc')
    ) -join '|')
}

function New-LeasePayload {
    param([string]$InstructionId = '', [int]$Generation = 1)
    $now = Get-UtcNowString
    return [ordered]@{
        app             = $AppId
        owner_token     = [guid]::NewGuid().ToString()
        generation      = $Generation
        pid             = $PID
        child_pid       = $null
        instruction_id  = $InstructionId
        acquired_utc    = $now
        heartbeat_utc   = $now
        host            = $env:COMPUTERNAME
        repo            = $RepoRoot
    }
}

function Request-GlobalLock {
    <#  Atomic first acquisition: CreateNew fails if the lease already exists.
        Returns $true on success.  #>
    param([string]$InstructionId = '')

    Initialize-GlobalDir
    $payload = New-LeasePayload -InstructionId $InstructionId -Generation 1

    try {
        $stream = [System.IO.File]::Open($LockFile, [System.IO.FileMode]::CreateNew,
                                         [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        try {
            $bytes = [System.Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Depth 6))
            $stream.Write($bytes, 0, $bytes.Length)
        } finally {
            $stream.Close()
        }
        $Script:HeldLock   = $true
        $Script:LeaseToken = [string]$payload.owner_token
        Write-RunnerLog "acquired machine-wide application lease ($AppId, pid $PID, token $($Script:LeaseToken))"
        return $true
    } catch [System.IO.IOException] {
        return $false
    }
}

function Invoke-LeaseReclaim {
    <#  Ownership-safe reclaim of a lease that stale analysis judged abandoned.

        The whole check-and-replace happens under ONE exclusive handle
        (FileShare::None). While that handle is open no other participant can
        create, read, replace or delete the lease, so the observation and the
        replacement cannot be separated by another process.

        Two properties make this safe:

          * The lease is REPLACED IN PLACE, never deleted and recreated.
            Deleting first would leave a window in which a third participant
            could legitimately CreateNew the lease and then have it removed
            underneath - exactly the race this corrects.

          * The replacement only happens if the ownership fingerprint captured
            during stale analysis is still the one in the file. If the lease
            changed hands in the meantime, nothing is written at all.

        Returns 'RECLAIMED' | 'CHANGED' | 'ABSENT' | 'ERROR:<reason>'.  #>
    param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$ObservedIdentity,
        [string]$InstructionId = ''
    )

    if ([string]::IsNullOrEmpty($ObservedIdentity)) { return 'CHANGED' }

    $fs = $null
    try {
        try {
            $fs = New-Object System.IO.FileStream(
                $LockFile,
                [System.IO.FileMode]::Open,
                [System.IO.FileAccess]::ReadWrite,
                [System.IO.FileShare]::None)
        } catch [System.IO.FileNotFoundException] {
            return 'ABSENT'
        } catch [System.IO.DirectoryNotFoundException] {
            return 'ABSENT'
        } catch [System.IO.IOException] {
            # Somebody else holds the lease file open: it is live, not ours.
            return 'CHANGED'
        }

        $reader  = New-Object System.IO.StreamReader($fs, [System.Text.Encoding]::UTF8, $false, 4096, $true)
        $current = $reader.ReadToEnd()
        $reader.Dispose()

        $currentObj = $null
        try { $currentObj = $current | ConvertFrom-Json } catch { $currentObj = $null }

        if ((Get-LeaseIdentity -Lock $currentObj) -ne $ObservedIdentity) {
            return 'CHANGED'
        }

        $generation = 0
        $names = @()
        if ($null -ne $currentObj) { $names = @($currentObj.PSObject.Properties.Name) }
        if ($names -contains 'generation') {
            try { $generation = [int]$currentObj.generation } catch { $generation = 0 }
        }

        $payload = New-LeasePayload -InstructionId $InstructionId -Generation ($generation + 1)
        $bytes   = [System.Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Depth 6))
        $fs.SetLength(0)
        $fs.Position = 0
        $fs.Write($bytes, 0, $bytes.Length)
        $fs.Flush()

        $Script:HeldLock   = $true
        $Script:LeaseToken = [string]$payload.owner_token
        return 'RECLAIMED'
    } catch {
        return "ERROR:$($_.Exception.Message)"
    } finally {
        if ($null -ne $fs) { $fs.Dispose() }
    }
}

function Request-GlobalLease {
    <#  Acquire the machine-wide lease, reclaiming a provably stale one if
        necessary. Never steals a live lease.

        Returns 'ACQUIRED' | 'RECLAIMED' | 'HELD' | 'CHANGED' | 'UNREADABLE'
                | 'ERROR:<reason>'  #>
    param([string]$InstructionId = '')

    Initialize-GlobalDir
    if (Request-GlobalLock -InstructionId $InstructionId) { return 'ACQUIRED' }

    $lock = Get-GlobalLock
    if ($null -eq $lock) {
        # Released in the gap between our failed CreateNew and this read.
        if (Request-GlobalLock -InstructionId $InstructionId) { return 'ACQUIRED' }
        return 'CHANGED'
    }
    if ($lock -eq 'UNREADABLE') { return 'UNREADABLE' }
    if (-not (Test-LockStale -Lock $lock)) { return 'HELD' }

    # Stale analysis said this lease is abandoned. Capture what we analysed and
    # only act if that is still exactly what is on disk.
    $identity = Get-LeaseIdentity -Lock $lock
    Write-RunnerLog -Level 'WARN' -Message ("machine-wide lease from '$($lock.app)' pid $($lock.pid) looks stale " +
                                            "(owner process gone and heartbeat older than $StaleHeartbeatMinutes min); " +
                                            'attempting ownership-verified reclaim')

    $result = Invoke-LeaseReclaim -ObservedIdentity $identity -InstructionId $InstructionId
    switch ($result) {
        'RECLAIMED' {
            Write-RunnerLog "reclaimed the stale machine-wide lease ($AppId, pid $PID, token $($Script:LeaseToken))"
            return 'RECLAIMED'
        }
        'ABSENT' {
            if (Request-GlobalLock -InstructionId $InstructionId) { return 'ACQUIRED' }
            return 'CHANGED'
        }
        'CHANGED' { return 'CHANGED' }
        default   { return $result }
    }
}

function Update-GlobalLockHeartbeat {
    <#  Refresh our own heartbeat. Writes only if the lease still carries our
        owner token, under an exclusive handle so the update cannot tear or
        land on somebody else's lease. Process ids are recycled by Windows;
        the token is not.  #>
    param([int]$ChildPid = 0)

    if (-not $Script:HeldLock) { return }
    $fs = $null
    try {
        $fs = New-Object System.IO.FileStream(
            $LockFile, [System.IO.FileMode]::Open,
            [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)

        $reader  = New-Object System.IO.StreamReader($fs, [System.Text.Encoding]::UTF8, $false, 4096, $true)
        $current = $reader.ReadToEnd()
        $reader.Dispose()

        $obj = $null
        try { $obj = $current | ConvertFrom-Json } catch { $obj = $null }
        if ($null -eq $obj) { return }
        $names = @($obj.PSObject.Properties.Name)
        if (-not ($names -contains 'owner_token')) { return }
        if ([string]$obj.owner_token -ne $Script:LeaseToken) { return }   # not ours any more

        $obj.heartbeat_utc = (Get-UtcNowString)
        if ($ChildPid -gt 0) { $obj.child_pid = $ChildPid }

        $bytes = [System.Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 6))
        $fs.SetLength(0)
        $fs.Position = 0
        $fs.Write($bytes, 0, $bytes.Length)
        $fs.Flush()
    } catch {
        # A heartbeat that cannot be written is not fatal; the lease simply
        # ages, and only a dead owner plus an old heartbeat makes it stale.
    } finally {
        if ($null -ne $fs) { $fs.Dispose() }
    }
}

function Remove-GlobalLock {
    <#  Release our own lease.

        The token is verified under an exclusive handle before the delete. The
        gap between closing that handle and deleting is not exploitable: while
        this process is alive its lease can never satisfy the stale test, and
        CreateNew cannot succeed while the file still exists.  #>
    if (-not $Script:HeldLock) { return }
    $fs = $null
    $ours = $false
    try {
        try {
            $fs = New-Object System.IO.FileStream(
                $LockFile, [System.IO.FileMode]::Open,
                [System.IO.FileAccess]::Read, [System.IO.FileShare]::None)
        } catch [System.IO.FileNotFoundException] {
            $Script:HeldLock = $false; $Script:LeaseToken = $null
            return
        }

        $reader  = New-Object System.IO.StreamReader($fs, [System.Text.Encoding]::UTF8, $false, 4096, $true)
        $current = $reader.ReadToEnd()
        $reader.Dispose()
        $fs.Dispose(); $fs = $null

        $obj = $null
        try { $obj = $current | ConvertFrom-Json } catch { $obj = $null }
        if ($null -ne $obj) {
            $names = @($obj.PSObject.Properties.Name)
            $ours  = ($names -contains 'owner_token') -and ([string]$obj.owner_token -eq $Script:LeaseToken)
        }

        if (-not $ours) {
            Write-RunnerLog -Level 'WARN' -Message 'machine-wide lease is no longer ours; not releasing it'
            return
        }

        Remove-Item -Path $LockFile -Force -ErrorAction Stop
        Write-RunnerLog 'released machine-wide application lease'
    } catch {
        Write-RunnerLog -Level 'WARN' -Message "could not release machine-wide lease: $($_.Exception.Message)"
    } finally {
        if ($null -ne $fs) { $fs.Dispose() }
        $Script:HeldLock   = $false
        $Script:LeaseToken = $null
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

function Set-ChildGitEnvironment {
    <#  Suppresses Git hook execution for everything the runner launches.

        A `git commit` or `git push` performed by the unattended child must not
        fire a pre-existing local hook: a hook is arbitrary code the queue never
        authorised, and .git/hooks may already contain one.

        This is done with GIT_CONFIG_COUNT/KEY/VALUE, which git reads as extra
        configuration for this process tree only. It *adds* core.hooksPath
        pointing at a runner-controlled empty directory. It writes no config
        file, so Mike's global and manual Git configuration is untouched, and it
        does not displace the system credential.helper that authenticates
        pushes to GitHub - verified empirically.

        The runner's own git calls inherit this too, which is intended.  #>

    if (-not (Test-Path $HooksDir)) { New-Item -ItemType Directory -Path $HooksDir -Force | Out-Null }

    # Fail closed if anything ever appears in the "empty" hooks directory.
    $stray = @(Get-ChildItem -LiteralPath $HooksDir -Force -ErrorAction SilentlyContinue)
    if ($stray.Count -gt 0) {
        throw "the runner-controlled hooks directory is not empty: $HooksDir"
    }

    $env:GIT_CONFIG_COUNT   = '1'
    $env:GIT_CONFIG_KEY_0   = 'core.hooksPath'
    $env:GIT_CONFIG_VALUE_0 = $HooksDir
    # Never block an unattended run on an interactive credential prompt.
    $env:GIT_TERMINAL_PROMPT = '0'

    $effective = Invoke-Git @('config', '--get', 'core.hooksPath')
    if ($effective.Text -ne $HooksDir) {
        throw "git hook suppression did not take effect (core.hooksPath is '$($effective.Text)', expected '$HooksDir')"
    }
    Write-RunnerLog "git hooks suppressed for the bounded child (core.hooksPath -> $HooksDir)"
}

function Set-ChildNpmEnvironment {
    <#  Bounds the approved quality commands.

        npm_config_ignore_scripts stops pre/post lifecycle scripts running,
        while still running the named script - verified on npm 11.17.0. The
        gate additionally refuses any package.json that defines one, so neither
        control stands alone.

        The offline settings mean an approved command can never reach the
        network to fetch a package.  #>

    $env:npm_config_ignore_scripts  = 'true'
    $env:npm_config_offline         = 'true'
    $env:npm_config_audit           = 'false'
    $env:npm_config_fund            = 'false'
    $env:npm_config_update_notifier = 'false'
    $env:npm_config_yes             = 'false'
    Write-RunnerLog 'npm lifecycle scripts and network fetches disabled for the bounded child'
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

    Set-ChildGitEnvironment
    Set-ChildNpmEnvironment

    # --setting-sources "" loads NO user, project or local settings, so no
    # user-level hook, permission rule or model preference can reach this
    # child. The gate is supplied separately through --settings, which is not
    # a settings *source* and is therefore still honoured. Both halves of that
    # behaviour were verified empirically on CLI 2.1.240 rather than assumed.
    # --strict-mcp-config with an empty server map removes inherited MCP
    # servers, so the child has no tool surface beyond --tools.
    $argString = '-p --output-format json --permission-mode acceptEdits ' +
                 '--setting-sources "" ' +
                 '--strict-mcp-config --mcp-config "{\"mcpServers\":{}}" ' +
                 ('--settings "{0}" ' -f $settings) +
                 ('--tools "{0}"' -f $ChildTools)

    Write-RunnerLog -Level 'RUN' -Message "launching bounded Claude child for '$InstructionId' with prompt $PromptRelPath"
    Write-RunnerLog "child invocation: $ClaudeExe $argString"

    $started = Get-UtcNowString
    $proc = Start-Process -FilePath $ClaudeExe `
                          -ArgumentList $argString `
                          -WorkingDirectory $RepoRoot `
                          -RedirectStandardInput $promptFull `
                          -RedirectStandardOutput $outFile `
                          -RedirectStandardError $errFile `
                          -NoNewWindow -PassThru

    # Touch the handle once while the process is alive. Start-Process -PassThru
    # otherwise discards it on exit and ExitCode reads back as $null.
    try { $null = $proc.Handle } catch { }

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
    $proc.Refresh()
    $exitCode = $null
    try { $exitCode = $proc.ExitCode } catch { }
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
        IsError              = $null
        Result               = $null
        PermissionDenied     = 0
        NumTurns             = $null
        HumanActionRequired  = $false
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

    # A child that reached a human-authorisation boundary says so in its final
    # message. That signal outranks a clean exit code: the work is not done.
    if (-not [string]::IsNullOrWhiteSpace($summary.Result)) {
        if ($summary.Result -match '(?i)HUMAN[ _]ACTION[ _]REQUIRED') {
            $summary.HumanActionRequired = $true
        }
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
    #
    # This is a read-only look. A stale lease is NOT reclaimed here: ownership
    # is only taken at step 8, when the runner is actually ready to run, and
    # only through the ownership-verified protocol.
    $lock = Get-GlobalLock
    if ($lock -eq 'UNREADABLE') {
        Write-RunnerLog -Level 'BLOCK' -Message 'machine-wide lease file is unreadable; not starting'
        return
    }
    if ($null -ne $lock -and -not (Test-LockStale -Lock $lock)) {
        Write-RunnerLog -Level 'BLOCK' -Message "machine-wide application lease is held by '$($lock.app)' (pid $($lock.pid)); waiting"
        return
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
        if ($state.ContainsKey($id)) {
            $rec = @{}
            foreach ($p in $state[$id].PSObject.Properties) { $rec[$p.Name] = $p.Value }
            if ([string]$rec['status'] -eq 'STARTED') {
                # An interrupted run. The previous child may already have
                # committed or pushed, so the outcome is unknown. Preserve the
                # evidence and hand it to a human; never re-run it.
                $rec['status'] = 'RECOVERY_REQUIRED'
                $rec['ended_utc'] = (Get-UtcNowString)
                $rec['notes'] = ('previous run was interrupted before reaching a terminal state; ' +
                                 'held for a human decision rather than repeated. ' +
                                 "Evidence: $($rec['log_dir'])")
                Write-RunnerLog -Level 'BLOCK' -Message "instruction '$id' moved from STARTED to RECOVERY_REQUIRED"
            } else {
                $rec['status'] = 'BLOCKED'
                $rec['notes']  = 'refused: ' + $consumable.Substring(6)
            }
            Set-InstructionRecord -InstructionId $id -Record $rec
        }
        Write-HumanActionRequired "review instruction '$id'; a new explicit Build Control instruction is required before it can run again"
        return
    }

    # 8. acquire the machine-wide lease, reclaiming a provably stale one only
    #    through the ownership-verified protocol
    $lease = Request-GlobalLease -InstructionId $id
    switch ($lease) {
        'ACQUIRED'   { }
        'RECLAIMED'  { }
        'HELD'       { Write-RunnerLog -Level 'BLOCK' -Message 'another application holds the machine-wide lease; waiting'; return }
        'CHANGED'    { Write-RunnerLog -Level 'BLOCK' -Message 'the machine-wide lease changed hands during acquisition; retrying next cycle'; return }
        'UNREADABLE' { Write-RunnerLog -Level 'BLOCK' -Message 'machine-wide lease file is unreadable; not starting'; return }
        default      {
            Write-RunnerLog -Level 'BLOCK' -Message "could not acquire the machine-wide lease: $lease"
            return
        }
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

        $requirements = Get-InstructionRequirements -Instruction $inst
        $headBefore   = (Invoke-Git @('rev-parse', 'HEAD')).Text
        $runDir       = Join-Path $LogDir $id

        # 9. mark STARTED before launching, so an interrupted run is detectable
        #    and enough state survives a crash to work out what happened
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
            runner_pid           = $PID
            head_before          = $headBefore
            log_dir              = $runDir
            requires_commit      = $requirements.RequiresCommit
            requires_push        = $requirements.RequiresPush
            expected_report_path = $requirements.ExpectedReportPath
            notes                = ''
        }

        # 10. run exactly one bounded child
        $run = Invoke-BoundedClaude -PromptRelPath ([string]$inst.prompt_path) -InstructionId $id

        # 11. post-run verification and completion assessment
        #
        # A successful exit is only one of the requirements. The repository is
        # inspected directly, and where a push was required origin is queried
        # rather than the child's account of it being trusted.
        $outcome      = Get-ChildOutcome -Run $run
        $verification = New-RunVerification -HeadBefore $headBefore -Requirements $requirements
        $assessment   = Get-CompletionAssessment -Run $run -Outcome $outcome -Verification $verification
        $finalStatus  = $assessment.Status

        $notes = @()
        $notes += "exit_code=$(if ($null -eq $run.ExitCode) { 'unreadable' } else { $run.ExitCode })"
        $notes += "child_is_error=$($outcome.IsError)"
        $notes += "head_before=$($verification.HeadBefore)"
        $notes += "head_after=$($verification.HeadAfter)"
        $notes += "clean=$($verification.WorkingTreeClean)"
        if ($verification.RequiresPush) {
            $notes += "pushed_to_origin=$($verification.PushedToOrigin)"
            $notes += "origin_synchronised=$($verification.OriginSynchronised)"
        }
        if (-not [string]::IsNullOrWhiteSpace($verification.ExpectedReportPath)) {
            $notes += "report_exists=$($verification.ReportExists)"
            $notes += "report_committed=$($verification.ReportCommitted)"
        }
        if ($outcome.PermissionDenied -gt 0) {
            $notes += "permission_denials=$($outcome.PermissionDenied)"
            Write-RunnerLog -Level 'WARN' -Message "the permission gate denied $($outcome.PermissionDenied) tool call(s) during this run"
        }
        $notes += $assessment.Reasons

        if (-not $verification.WorkingTreeClean) {
            Write-RunnerLog -Level 'WARN' -Message "working tree is not clean after the run:`n$($verification.WorkingTreeStatus)"
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
            runner_pid           = $PID
            head_before          = $verification.HeadBefore
            head_after           = $verification.HeadAfter
            log_dir              = $run.RunDir
            requires_commit      = $requirements.RequiresCommit
            requires_push        = $requirements.RequiresPush
            expected_report_path = $requirements.ExpectedReportPath
            notes                = ($notes -join '; ')
        }

        Write-RunnerLog -Level 'RUN' -Message "instruction '$id' recorded as $finalStatus (exit $($run.ExitCode))"
        foreach ($r in $assessment.Reasons) { Write-RunnerLog "  assessment: $r" }

        if ($finalStatus -ne 'COMPLETED') {
            Write-RunnerLog -Level 'BLOCK' -Message "the bounded run did not reach COMPLETED ($finalStatus); it will not be relaunched automatically"
            Write-HumanActionRequired "review the $finalStatus run for '$id' under $($run.RunDir)"
        }
    }
    finally {
        Remove-GlobalLock
    }
}

# =====================================================================
# Entry point
# =====================================================================

# Dot-sourced by the self-test suite to exercise the real functions without
# starting a polling loop. Nothing below this point runs in that mode.
if ($Script:LibraryOnly) { return }

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
