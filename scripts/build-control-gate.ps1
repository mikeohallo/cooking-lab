<#
    Cooking Lab - Build Control permission gate (PreToolUse hook)

    Deny-by-default guard for the unattended Build Control runner's Claude child.

    WHY THIS EXISTS
    ---------------
    In non-interactive mode (claude -p) there is no terminal to answer a
    permission prompt, so Claude Code does not block on one. Verified on CLI
    2.1.240: a tool call that would normally prompt is simply allowed to
    proceed, even under --permission-mode manual. A permission *deny* list is
    therefore the only thing the runner can rely on by default, and a deny list
    alone is a blacklist.

    This hook converts that into a real allowlist: every Bash command must match
    an explicit allow pattern, and every file-touching tool call must resolve
    inside the Cooking Lab repository. Anything else is denied.

    It is enforced by the runner, not decided by the model.

    CONTRACT
    --------
    stdin  : PreToolUse hook event JSON
    stdout : PreToolUse hookSpecificOutput JSON when denying
    exit 0 : decision delivered on stdout (allow = no output)
    exit 2 : internal error -> block (fail closed)

    Environment (set by the runner):
      COOKING_LAB_REPO_ROOT   absolute repo root; file tools may not escape it
      COOKING_LAB_DENY_PATHS  ';'-separated absolute paths that are always denied
#>

$ErrorActionPreference = 'Stop'

function Deny([string]$reason) {
    $payload = @{
        hookSpecificOutput = @{
            hookEventName            = 'PreToolUse'
            permissionDecision       = 'deny'
            permissionDecisionReason = "Cooking Lab Build Control gate: $reason"
        }
    }
    $payload | ConvertTo-Json -Depth 6 -Compress
    exit 0
}

try {
    $raw = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) { exit 0 }
    $ev = $raw | ConvertFrom-Json

    $toolName = [string]$ev.tool_name

    $repoRoot = $env:COOKING_LAB_REPO_ROOT
    if ([string]::IsNullOrWhiteSpace($repoRoot)) {
        Deny 'repository root not supplied to the gate; refusing to evaluate.'
    }
    $repoRoot = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd('\')

    $denyPaths = @()
    if (-not [string]::IsNullOrWhiteSpace($env:COOKING_LAB_DENY_PATHS)) {
        $denyPaths = $env:COOKING_LAB_DENY_PATHS -split ';' |
                     Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
                     ForEach-Object { $_.Trim().TrimEnd('\') }
    }

    # ------------------------------------------------------------------
    # File-touching tools: the resolved path must stay inside the repo.
    # ------------------------------------------------------------------
    foreach ($key in @('file_path', 'path', 'notebook_path')) {
        $value = $ev.tool_input.$key
        if ($null -eq $value) { continue }
        if ($value -isnot [string]) { continue }
        if ([string]::IsNullOrWhiteSpace($value)) { continue }

        $candidate = $value
        if (-not [System.IO.Path]::IsPathRooted($candidate)) {
            $candidate = Join-Path $repoRoot $candidate
        }
        $full = [System.IO.Path]::GetFullPath($candidate).TrimEnd('\')

        foreach ($d in $denyPaths) {
            if ($full -eq $d -or $full.StartsWith($d + '\', [StringComparison]::OrdinalIgnoreCase)) {
                Deny "tool '$toolName' targets a protected path belonging to another application ($value)."
            }
        }
        if (-not ($full -eq $repoRoot -or $full.StartsWith($repoRoot + '\', [StringComparison]::OrdinalIgnoreCase))) {
            Deny "tool '$toolName' targets '$value', which is outside the Cooking Lab repository."
        }
    }

    if ($toolName -ne 'Bash') { exit 0 }

    $cmd = [string]$ev.tool_input.command
    if ([string]::IsNullOrWhiteSpace($cmd)) { Deny 'empty Bash command.' }

    $normalised = ($cmd -replace '\s+', ' ').Trim()

    # ------------------------------------------------------------------
    # 1. Hard denials - never permitted under unattended operation. These
    #    are human-authorisation boundaries or destructive actions.
    # ------------------------------------------------------------------
    $hardDeny = @(
        @{ p = '(?i)\brm\s+(-[a-z]*\s+)*-[a-z]*[rf]';                      r = 'recursive or forced delete' },
        @{ p = '(?i)\bgit\s+push\b.*(--force|--mirror|--delete|\s-f\b)';   r = 'force/destructive push' },
        @{ p = '(?i)\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f)';            r = 'destructive git reset/clean' },
        @{ p = '(?i)\bgit\s+(rebase|filter-branch|filter-repo)\b';         r = 'history rewrite' },
        @{ p = '(?i)\bgit\s+tag\s+(?!-l)';                                 r = 'release tagging (Build Control authority)' },
        @{ p = '(?i)\bgit\s+(remote\s+(add|set-url|remove)|submodule)\b';  r = 'remote or submodule reconfiguration' },
        @{ p = '(?i)\bgit\s+(checkout|switch)\b.*\s(-b|-B|--orphan)\b';    r = 'branch creation' },
        @{ p = '(?i)\b(keytool|jarsigner|apksigner|gpg)\b';                r = 'signing operation (human authorisation required)' },
        @{ p = '(?i)\b(adb|emulator|fastboot)\b';                          r = 'physical device operation (human authorisation required)' },
        @{ p = '(?i)\b(curl|wget|Invoke-WebRequest|Invoke-RestMethod|ssh|scp)\b'; r = 'outbound network access' },
        @{ p = '(?i)\bnpm\s+(publish|login|adduser|token)\b';              r = 'registry or account operation' },
        @{ p = '(?i)\b(gradlew|gradle)\b.*(assemble|bundle)Release';       r = 'release build (human authorisation required)' },
        @{ p = '(?i)\beas\s+(build|submit|login)\b';                       r = 'external build service' },
        @{ p = '(?i)\b(setx|schtasks|New-Service|Register-ScheduledTask)\b'; r = 'machine persistence or startup change' },
        @{ p = '(?i)\breg\s+add\b';                                        r = 'registry modification' },
        @{ p = '(?i)\bnpm\s+(install|i)\s+.*-g\b';                         r = 'global toolchain change' },
        @{ p = '(?i)(project-a|projecta|cooking-lab-cloud-prototype-archive)'; r = 'reference to another application repository' },
        @{ p = '(?i)dangerously-skip-permissions';                         r = 'permission bypass' },
        @{ p = '(?i)\bclaude\b[^|;]*\s(-p|--print|--permission-mode)\b';   r = 'nested unattended Claude launch' },
        @{ p = '(?i)\.app-build-control';                                  r = 'direct manipulation of the cross-application coordination directory' }
    )
    foreach ($rule in $hardDeny) {
        if ($normalised -match $rule.p) {
            Deny ($rule.r + ' is not permitted unattended -> ' + $normalised)
        }
    }

    # ------------------------------------------------------------------
    # 2. Allowlist. The command is split on shell separators and EVERY
    #    segment must match, so an allowed prefix cannot smuggle a tail.
    # ------------------------------------------------------------------
    $allow = @(
        # --- git: inspection ---
        '^git\s+(status|log|show|diff|branch|remote|rev-parse|rev-list|ls-files|ls-tree|cat-file|show-ref|describe|check-ignore)\b',
        '^git\s+tag\s+-l\b',
        '^git\s+config\s+--get\b',
        '^git\s+fetch\b',
        '^git\s+merge\s+--ff-only\b',
        # --- git: the bounded commit/push the protocol authorises ---
        '^git\s+add\s+\S',
        '^git\s+commit\b',
        '^git\s+push\s+origin\s+main\s*$',
        '^git\s+push\s*$',
        # --- node toolchain: checks only ---
        '^npm\s+(test|run|ci|ls|--version)\b',
        '^npx\s+(tsc|eslint|jest|prettier)\b',
        '^node\s+--version\s*$',
        # --- read-only inspection ---
        '^(echo|cat|head|tail|wc|ls|pwd|find|grep|rg|sort|uniq|diff|basename|dirname|date|hostname)\b',
        '^sed\s+-n\b',
        '^(sha256sum|certutil\s+-hashfile)\b',
        '^Get-FileHash\b',
        '^mkdir\s+(-p\s+)?[^/\\-]',
        '^true$'
    )

    $segments = [regex]::Split($normalised, '(?:\|\||&&|;|\||\r?\n)') |
                ForEach-Object { $_.Trim() } |
                Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

    foreach ($seg in $segments) {
        $clean = $seg -replace '^[\(\{]\s*', ''
        $ok = $false
        foreach ($pattern in $allow) {
            if ($clean -match $pattern) { $ok = $true; break }
        }
        if (-not $ok) {
            Deny ('command segment is not on the Build Control allowlist -> ' + $clean)
        }
    }

    # Redirection to an absolute path would escape the repository.
    if ($normalised -match '>\s*(?<t>(?:[A-Za-z]:[\\/]|/)[^\s]+)') {
        Deny ("output redirection to an absolute path (" + $Matches['t'] + ") is not permitted.")
    }

    exit 0
}
catch {
    # Fail closed: an unhandled gate error must never widen permissions.
    [Console]::Error.WriteLine("Cooking Lab Build Control gate error (failing closed): $($_.Exception.Message)")
    exit 2
}
