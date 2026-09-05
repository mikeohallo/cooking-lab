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
    inside the Cooking Lab repository and outside its protected areas.

    It is enforced by the runner, not decided by the model.

    LAYERS (evaluated in order, first denial wins)
    ----------------------------------------------
      1. Path safety        every path input must resolve inside the repository;
                            mutating tools may not touch protected areas.
      2. Shell syntax       command substitution, process substitution, variable
                            expansion, redirection, heredocs and backgrounding
                            are refused, so an allowed command cannot carry a
                            disallowed one inside it.
      3. Content denials    references that are dangerous wherever they appear.
      4. Per segment        the command is split on shell separators. EVERY
                            segment must clear the command-position denials and
                            match the allowlist, so an allowed prefix cannot
                            smuggle a tail.
      5. npm verification   only named scripts run, and their package.json
                            bodies must still equal the pinned expected command.

    KNOWN CONSERVATIVE BEHAVIOUR
    ----------------------------
    Layer 2 refuses redirection and expansion characters outside single quotes.
    A commit message written as -m "a > b" is therefore refused; the same
    message in single quotes is accepted. Refusing an honest command is a
    tolerable cost; allowing a smuggled one is not.

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

# =====================================================================
# Protected areas inside the repository
#
# Mutating tools may never write here. Reading stays allowed: an authorised
# prompt may legitimately read the queue file that activated it, but nothing
# may ever write to it.
#
# Patterns are matched against the repository-relative, forward-slashed,
# lower-cased path.
# =====================================================================
$ProtectedRelPatterns = @(
    @{ p = '(^|/)\.git(/|$)';                   r = 'the Git directory (objects, refs, config and hooks)' },
    @{ p = '^\.githooks(/|$)';                  r = 'Git hooks' },
    @{ p = '(^|/)hooks/(pre|post|commit|applypatch|prepare|update|push)[a-z-]*$'; r = 'a Git hook script' },
    @{ p = '^\.gitattributes$';                 r = 'Git attributes (can install content filters that execute)' },
    @{ p = '^\.gitmodules$';                    r = 'Git submodule configuration' },
    @{ p = '(^|/)\.gitconfig$';                 r = 'Git configuration' },
    @{ p = '^\.claude(/|$)';                    r = 'Claude Code configuration for this repository' },
    @{ p = '^claude\.md$';                      r = 'CLAUDE.md (instructions inherited by future sessions)' },
    # Runner state, locks, generated settings and logs are off limits: a child
    # that could write instructions.json could forge its own COMPLETED record.
    # The selftest/ subdirectory stays writable because authorised self-test
    # prompts deposit their evidence there.
    @{ p = '^\.build-control-local($|/(?!selftest($|/)))'; r = 'runner state, locks, generated settings or logs' },
    @{ p = '^build-control/queue(/|$)';         r = 'the Build Control queue (a child may never authorise its own next run)' },
    @{ p = '^build-control/acceptance(/|$)';    r = 'milestone acceptance records (Build Control authority)' },
    @{ p = '^scripts/build-control-';           r = 'the runner, the permission gate or the self-test suite' },
    @{ p = '(^|/)\.ssh(/|$)';                   r = 'SSH credentials' },
    @{ p = '(^|/)\.aws(/|$)';                   r = 'AWS credentials' },
    @{ p = '(^|/)\.gnupg(/|$)';                 r = 'GnuPG keyring' },
    @{ p = '(^|/)\.npmrc$';                     r = 'npm credentials' },
    @{ p = '(^|/)_?\.?netrc$';                  r = 'netrc credentials' },
    @{ p = '(^|/)\.git-credentials$';           r = 'stored Git credentials' },
    @{ p = '(^|/)\.env($|\.)';                  r = 'environment secrets' },
    @{ p = '(^|/)secrets\.json$';               r = 'secrets file' },
    @{ p = '(^|/)google-services\.json$';       r = 'Firebase service configuration' },
    @{ p = '(^|/)googleservice-info\.plist$';   r = 'Firebase service configuration' },
    @{ p = '(^|/)(keystore|signing|local|gradle)\.properties$'; r = 'signing or local build properties' },
    @{ p = '\.(keystore|jks|p12|pfx|p8|pem|key|cer|crt|mobileprovision)$'; r = 'signing or key material' }
)

# npm scripts the unattended child may run, pinned to the exact command each
# must still resolve to in package.json. A script is never permitted merely
# because the invocation begins with "npm".
$AllowedNpmScripts = @{
    'test'      = 'jest'
    'typecheck' = 'tsc --noEmit'
    'lint'      = 'eslint .'
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

    $mutatingTools = @('Write', 'Edit', 'MultiEdit', 'NotebookEdit')
    $isMutating    = ($mutatingTools -contains $toolName)

    # ------------------------------------------------------------------
    # 1. Path safety.
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

        if ($isMutating) {
            $rel = ''
            if ($full.Length -gt $repoRoot.Length) { $rel = $full.Substring($repoRoot.Length + 1) }
            $rel = ($rel -replace '\\', '/').Trim('/').ToLowerInvariant()
            foreach ($rule in $ProtectedRelPatterns) {
                if ($rel -match $rule.p) {
                    Deny ("tool '$toolName' may not modify " + $rule.r + " -> $value")
                }
            }
        }
    }

    if ($toolName -ne 'Bash') { exit 0 }

    $cmd = [string]$ev.tool_input.command
    if ([string]::IsNullOrWhiteSpace($cmd)) { Deny 'empty Bash command.' }

    $normalised = ($cmd -replace '\s+', ' ').Trim()

    # Single-quoted spans are literal to the shell, so they are blanked before
    # the shell-syntax scan to avoid refusing an honest commit message. Double
    # quotes are NOT blanked: bash still expands $(...) and backticks inside
    # them.
    $scan = [regex]::Replace($normalised, "'[^']*'", "''")

    # ------------------------------------------------------------------
    # 2. Shell syntax. An allowed command must not be able to carry a
    #    disallowed one inside it.
    # ------------------------------------------------------------------
    $syntaxDeny = @(
        @{ p = '\$\(';         r = 'command substitution $( )' },
        @{ p = '`';            r = 'backtick command substitution' },
        @{ p = '\$\{';         r = 'shell parameter expansion ${ }' },
        @{ p = '\$\[';         r = 'shell arithmetic expansion' },
        @{ p = '\$[A-Za-z_]';  r = 'shell variable expansion' },
        @{ p = '<\(';          r = 'process substitution <( )' },
        @{ p = '>\(';          r = 'process substitution >( )' },
        @{ p = '<<';           r = 'heredoc input' },
        @{ p = '[<>]';         r = 'input/output redirection' },
        @{ p = '(?<!&)&(?!&)'; r = 'background execution' }
    )
    foreach ($rule in $syntaxDeny) {
        if ($scan -match $rule.p) {
            Deny ($rule.r + ' is not permitted unattended -> ' + $normalised)
        }
    }

    # ------------------------------------------------------------------
    # 3. Content denials - dangerous wherever they appear in the command.
    # ------------------------------------------------------------------
    $contentDeny = @(
        @{ p = '(?i)(project-a|projecta|cooking-lab-cloud-prototype-archive)'; r = 'reference to another application repository' },
        @{ p = '(?i)\.app-build-control';                r = 'direct manipulation of the cross-application coordination directory' },
        @{ p = '(?i)dangerously-skip-permissions';       r = 'permission bypass' },
        @{ p = '(?i)(--setting-sources|--settings)\b';   r = 'Claude settings manipulation' },
        @{ p = '(?i)(^|[\s;|&(])\.git[/\\]';             r = 'a direct path into the Git directory' }
    )
    foreach ($rule in $contentDeny) {
        if ($normalised -match $rule.p) {
            Deny ($rule.r + ' is not permitted unattended -> ' + $normalised)
        }
    }

    # ------------------------------------------------------------------
    # 4. Per-segment evaluation.
    #
    #    Command-position denials are anchored at the start of a segment, so
    #    the word "make" inside a commit message is not confused with running
    #    make. Every segment must then also match the allowlist.
    # ------------------------------------------------------------------
    $commandDeny = @(
        @{ p = '^rm\s+(-[a-z]*\s+)*-[a-z]*[rf]';                     r = 'recursive or forced delete' },
        @{ p = '^git\s+push\b.*(--force|--mirror|--delete|\s-f\b)';  r = 'force/destructive push' },
        @{ p = '^git\s+(reset\s+--hard|clean\s+-[a-z]*f)';           r = 'destructive git reset/clean' },
        @{ p = '^git\s+(rebase|filter-branch|filter-repo)\b';        r = 'history rewrite' },
        @{ p = '^git\s+tag\s+(?!-l)';                                r = 'release tagging (Build Control authority)' },
        @{ p = '^git\s+(remote\s+(add|set-url|remove)|submodule)\b'; r = 'remote or submodule reconfiguration' },
        @{ p = '^git\s+(checkout|switch)\b.*\s(-b|-B|--orphan)\b';   r = 'branch creation' },
        @{ p = '^git\s+-c\b';                                        r = 'per-command git configuration override (can execute arbitrary helpers)' },
        @{ p = '^git\s+--exec-path\b';                               r = 'git exec-path override' },
        @{ p = '^git\s+config\b(?!\s+--get\b)';                      r = 'git configuration change' },
        @{ p = '^git\s+(update-index|hook|difftool|mergetool|daemon|instaweb|send-email|am|apply|cherry-pick|revert|stash|worktree|notes|replace|bundle|archive|gc|prune)\b'; r = 'git operation outside the bounded protocol' },
        @{ p = '^(keytool|jarsigner|apksigner|zipalign|gpg|openssl|signtool)\b'; r = 'signing operation (human authorisation required)' },
        @{ p = '^(adb|emulator|fastboot|scrcpy)\b';                  r = 'physical device operation (human authorisation required)' },
        @{ p = '^(\./|\.\\)?gradlew?(\.bat)?\b';                     r = 'Gradle build (human authorisation required)' },
        @{ p = '^(xcodebuild|pod|ndk-build|cmake|make|ninja|javac|java)\b'; r = 'native build toolchain (human authorisation required)' },
        @{ p = '^(npx\s+)?expo\b';                                   r = 'Expo native/device operation (human authorisation required)' },
        @{ p = '^(curl|wget|Invoke-WebRequest|Invoke-RestMethod|ssh|scp|sftp|rsync|nc|telnet)\b'; r = 'outbound network access' },
        @{ p = '^(bash|sh|zsh|cmd|powershell|pwsh|wscript|cscript)\b'; r = 'nested shell invocation' },
        @{ p = '^(eval|exec|source|xargs|env)\b';                    r = 'indirect command execution' },
        @{ p = '^\.\s';                                              r = 'shell dot-sourcing' },
        @{ p = '^(node|python|python3|perl|ruby|php)\b\s+(-e|--eval|-c)\b'; r = 'inline script execution' },
        @{ p = '^npm\s+(publish|login|adduser|token|config|exec|pack|link)\b'; r = 'registry, account or configuration operation' },
        @{ p = '^npm\s+(install|i|add|update|upgrade|uninstall|remove|ci|audit)\b'; r = 'dependency or toolchain change' },
        @{ p = '^npx\s+(-|@)';                                       r = 'npx package fetch or inline call' },
        @{ p = '^eas\b';                                             r = 'external build service' },
        @{ p = '^(setx|schtasks|New-Service|Register-ScheduledTask|sc\.exe)\b'; r = 'machine persistence or startup change' },
        @{ p = '^reg\s+add\b';                                       r = 'registry modification' },
        @{ p = '^(chmod|chown|icacls|attrib|takeown|mklink|cp|mv|move|copy|del|erase|rmdir|tee|truncate|touch)\b'; r = 'file mutation outside the Write/Edit tools' },
        @{ p = '^find\b.*\s-(exec|execdir|ok|okdir|delete|fprint|fls)\b'; r = 'find with an action predicate' },
        @{ p = '^claude\b';                                          r = 'nested Claude Code launch' },
        @{ p = '^[A-Za-z_][A-Za-z0-9_]*=';                           r = 'environment assignment prefixing a command' }
    )

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
        # --- node toolchain: named checks only (verified in layer 5) ---
        '^npm\s+test\s*$',
        '^npm\s+run\s+(test|typecheck|lint)\s*$',
        '^npm\s+ls\b',
        '^npm\s+(--version|-v)\s*$',
        '^npx\s+(tsc|eslint|jest|prettier)\b',
        '^node\s+--version\s*$',
        # --- read-only inspection ---
        '^(echo|cat|head|tail|wc|ls|pwd|find|grep|rg|sort|uniq|diff|basename|dirname|date|hostname)\b',
        '^sed\s+-n\s+["'']?[0-9]+(,[0-9]+)?p["'']?\s+\S+$',
        '^(sha256sum|certutil\s+-hashfile)\b',
        '^Get-FileHash\b',
        '^mkdir\s+(-p\s+)?[^/\\-]',
        '^true$'
    )

    $segments = [regex]::Split($normalised, '(?:\|\||&&|;|\||\r?\n)') |
                ForEach-Object { $_.Trim() } |
                Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

    $cleanSegments = @()
    foreach ($seg in $segments) {
        $clean = ($seg -replace '^[\(\{]\s*', '').Trim()
        if ([string]::IsNullOrWhiteSpace($clean)) { continue }
        $cleanSegments += $clean

        foreach ($rule in $commandDeny) {
            if ($clean -match $rule.p) {
                Deny ($rule.r + ' is not permitted unattended -> ' + $clean)
            }
        }

        $ok = $false
        foreach ($pattern in $allow) {
            if ($clean -match $pattern) { $ok = $true; break }
        }
        if (-not $ok) {
            Deny ('command segment is not on the Build Control allowlist -> ' + $clean)
        }
    }

    if ($cleanSegments.Count -eq 0) { Deny 'no executable command segment found.' }

    # ------------------------------------------------------------------
    # 5. npm script verification.
    #
    #    Matching '^npm run lint' is not sufficient: package.json could have
    #    been changed so that "lint" now runs something else entirely. The
    #    script body must still equal the pinned expected command.
    # ------------------------------------------------------------------
    foreach ($seg in $cleanSegments) {
        $npmScript = $null
        if ($seg -match '^npm\s+test\s*$')            { $npmScript = 'test' }
        elseif ($seg -match '^npm\s+run\s+(\S+)\s*$') { $npmScript = $Matches[1] }
        if ($null -eq $npmScript) { continue }

        if (-not $AllowedNpmScripts.ContainsKey($npmScript)) {
            Deny "npm script '$npmScript' is not on the Build Control allowlist -> $seg"
        }

        $pkgPath = Join-Path $repoRoot 'package.json'
        if (-not (Test-Path -LiteralPath $pkgPath)) {
            Deny "cannot verify npm script '$npmScript': package.json not found."
        }
        $pkg = $null
        try {
            $pkg = Get-Content -Raw -LiteralPath $pkgPath | ConvertFrom-Json
        } catch {
            Deny "cannot verify npm script '$npmScript': package.json is unreadable."
        }
        if ($null -eq $pkg.scripts -or -not ($pkg.scripts.PSObject.Properties.Name -contains $npmScript)) {
            Deny "npm script '$npmScript' is not defined in package.json."
        }
        $actual   = ([string]$pkg.scripts.$npmScript).Trim()
        $expected = $AllowedNpmScripts[$npmScript]
        if ($actual -ne $expected) {
            Deny ("npm script '$npmScript' no longer matches its pinned command " +
                  "(expected '$expected', package.json declares '$actual'); " +
                  'Build Control must re-pin it before it may run unattended.')
        }
    }

    exit 0
}
catch {
    # Fail closed: an unhandled gate error must never widen permissions.
    [Console]::Error.WriteLine("Cooking Lab Build Control gate error (failing closed): $($_.Exception.Message)")
    exit 2
}
