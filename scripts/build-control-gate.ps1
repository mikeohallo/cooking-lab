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

    This hook converts that into a real allowlist. It is enforced by the runner,
    not decided by the model.

    THE BASH SURFACE IS DELIBERATELY TINY
    ------------------------------------
    Bash exists for exactly two purposes:

      * the git operations the Build Control protocol requires, and
      * the three approved quality checks.

    Nothing else. There is no general shell: no echo, cat, ls, find, grep, sed,
    mkdir, cp, mv, node, npx, certutil or any other general-purpose command.
    Repository inspection is the Read/Glob/Grep tools' job and file changes are
    the Write/Edit tools' job, and both of those are path-confined here. A
    general command kept "for convenience" is a general command available for
    escape, so none are kept.

    LAYERS (evaluated in order, first denial wins)
    ----------------------------------------------
      1. Path safety        every path input must resolve inside the repository.
                            Secret-bearing paths are denied to reads as well as
                            writes; control-plane paths are denied to writes.
      2. Shell syntax       command substitution, process substitution, variable
                            expansion, redirection, heredocs and backgrounding
                            are refused, so an allowed command cannot carry a
                            disallowed one inside it.
      3. Content denials    references dangerous wherever they appear, including
                            any path token that leaves the repository.
      4. Per segment        the command is split on shell separators; EVERY
                            segment must be a git or npm call that passes its
                            own argument validation.
      5. git validation     subcommand allowlist, per-subcommand flag allowlist,
                            and every path argument proved repository-contained.
      6. npm validation     pinned script bodies, no pre/post lifecycle scripts,
                            and the resolved tool package, version and binary
                            verified against their pins.

    KNOWN CONSERVATIVE BEHAVIOUR
    ----------------------------
    Layers 2 and 3 scan the command outside single quotes. A commit message
    written as -m "a > b" or one naming an absolute path is therefore refused;
    the same message in single quotes, without an absolute path, is accepted.
    Refusing an honest command is a tolerable cost; allowing a smuggled one is
    not.

    CONTRACT
    --------
    stdin  : PreToolUse hook event JSON
    stdout : PreToolUse hookSpecificOutput JSON when denying
    exit 0 : decision delivered on stdout (allow = no output)
    exit 2 : internal error -> block (fail closed)

    Environment (set by the runner):
      COOKING_LAB_REPO_ROOT   absolute repo root; tools may not escape it
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
# Secret-bearing paths.
#
# Denied to EVERY file tool, reading included. A future milestone that
# genuinely needs a real secret must cross a human boundary explicitly,
# rather than letting an unattended child discover one.
#
# Patterns match the repository-relative, forward-slashed, lower-cased path.
# =====================================================================
$SecretRelPatterns = @(
    @{ p = '(^|/)\.git(/|$)';                   r = 'the Git directory (its config can carry remote credentials)' },
    @{ p = '(^|/)\.env($|\.)';                  r = 'environment secrets' },
    @{ p = '(^|/)\.npmrc$';                     r = 'npm credentials' },
    @{ p = '(^|/)_?\.?netrc$';                  r = 'netrc credentials' },
    @{ p = '(^|/)\.git-credentials$';           r = 'stored Git credentials' },
    @{ p = '(^|/)\.ssh(/|$)';                   r = 'SSH credentials' },
    @{ p = '(^|/)\.aws(/|$)';                   r = 'AWS credentials' },
    @{ p = '(^|/)\.gnupg(/|$)';                 r = 'GnuPG keyring' },
    @{ p = '(^|/)\.docker(/|$)';                r = 'Docker credentials' },
    @{ p = '(^|/)id_(rsa|dsa|ecdsa|ed25519)';   r = 'a private SSH key' },
    @{ p = '(^|/)secrets?\.json$';              r = 'a secrets file' },
    @{ p = '(^|/)credentials?(\.[a-z0-9]+)?$';  r = 'a credentials file' },
    @{ p = '(^|/)google-services\.json$';       r = 'Firebase service configuration' },
    @{ p = '(^|/)googleservice-info\.plist$';   r = 'Firebase service configuration' },
    @{ p = '(^|/)(keystore|signing|local|gradle)\.properties$'; r = 'signing or local build properties' },
    @{ p = '\.(keystore|jks|p12|pfx|p8|pem|key|cer|crt|der|mobileprovision|asc|gpg)$'; r = 'signing or key material' }
)

# =====================================================================
# Control-plane paths.
#
# Denied to MUTATING tools only. Reading stays allowed where it is
# legitimate: an authorised prompt may read the queue entry that activated
# it. A child that could rewrite the gate, forge its own COMPLETED record,
# author its own next instruction, or swap the tooling the gate verifies
# would have no boundary at all.
# =====================================================================
$ControlRelPatterns = @(
    @{ p = '^\.githooks(/|$)';                  r = 'Git hooks' },
    @{ p = '(^|/)hooks/(pre|post|commit|applypatch|prepare|update|push)[a-z-]*$'; r = 'a Git hook script' },
    @{ p = '^\.gitattributes$';                 r = 'Git attributes (can install content filters that execute)' },
    @{ p = '^\.gitmodules$';                    r = 'Git submodule configuration' },
    @{ p = '(^|/)\.gitconfig$';                 r = 'Git configuration' },
    @{ p = '^\.gitignore$';                     r = 'the repository ignore rules' },
    @{ p = '^\.claude(/|$)';                    r = 'Claude Code configuration for this repository' },
    @{ p = '^claude\.md$';                      r = 'CLAUDE.md (instructions inherited by future sessions)' },
    @{ p = '^node_modules(/|$)';                r = 'installed dependencies, including the executables the gate verifies' },
    @{ p = '^package(-lock)?\.json$';           r = 'the dependency manifest the gate pins its quality commands against' },
    @{ p = '^\.build-control-local($|/(?!selftest($|/)))'; r = 'runner state, locks, generated settings or logs' },
    @{ p = '^build-control/queue(/|$)';         r = 'the Build Control queue (a child may never authorise its own next run)' },
    @{ p = '^build-control/acceptance(/|$)';    r = 'milestone acceptance records (Build Control authority)' },
    @{ p = '^scripts/build-control-';           r = 'the runner, the permission gate or the self-test suite' }
)

# =====================================================================
# Path forms that leave the repository, or reach machine state.
# Applied to raw tool arguments and to every Bash command.
# =====================================================================
$ForbiddenPathTokens = @(
    @{ p = '[A-Za-z]:[\\/]';                    r = 'a drive-absolute path' },
    @{ p = '\\\\[^\\\s]';                       r = 'a UNC/network path' },
    @{ p = '(^|[\s''"=])//[^\s/]';              r = 'a UNC/network path' },
    @{ p = '(^|[\s''"=])[\\/][^\s\\/]';         r = 'a root-absolute path' },
    @{ p = '(^|[\s''"=(])~[\\/]';               r = 'home-directory expansion' },
    @{ p = '(^|[\s''"=(/\\])\.\.([\\/]|$)';     r = 'parent-directory traversal' },
    @{ p = '%[A-Za-z_][A-Za-z0-9_]*%';          r = 'Windows environment-variable expansion' }
)

# =====================================================================
# Approved quality commands.
#
# Each is pinned to the script body it must still resolve to, and to the
# package, version and binary that body must still reach. Build Control
# re-pins deliberately when a dependency changes; until then the gate fails
# closed. Name matching alone is never sufficient.
# =====================================================================
$QualityCommands = @{
    'test'      = @{ body = 'jest';        package = 'jest';       version = '29.7.0'; bin = 'jest';   binPath = './bin/jest.js' }
    'typecheck' = @{ body = 'tsc --noEmit'; package = 'typescript'; version = '6.0.3';  bin = 'tsc';    binPath = './bin/tsc' }
    'lint'      = @{ body = 'eslint .';    package = 'eslint';     version = '9.39.5'; bin = 'eslint'; binPath = './bin/eslint.js' }
}

# =====================================================================
# Approved git subcommands.
#
#   flags    regex every leading flag must match
#   args     'none' | 'revs' | 'paths' | 'revs+paths' | 'message' | 'add' | 'literal'
#   literal  exact remaining argument list, when args = 'literal'
# =====================================================================
$GitRules = @{
    'status'    = @{ flags = '^(--porcelain(=v[12])?|-s|--short|-b|--branch|--no-renames|--untracked-files(=(all|normal|no))?|-u(all|no|normal)?)$'; args = 'paths' }
    'diff'      = @{ flags = '^(--cached|--staged|--stat|--shortstat|--numstat|--name-only|--name-status|--no-color|--no-ext-diff|--find-renames|-U[0-9]+|--unified=[0-9]+)$'; args = 'revs+paths' }
    'log'       = @{ flags = '^(--oneline|--stat|--shortstat|--numstat|--name-only|--name-status|--no-color|--no-ext-diff|--graph|--decorate|--reverse|--first-parent|-[0-9]+|-n|--max-count=[0-9]+|--format=[^\s]*|--pretty(=[^\s]*)?)$'; args = 'revs+paths' }
    'show'      = @{ flags = '^(--stat|--shortstat|--numstat|--name-only|--name-status|--no-color|--no-ext-diff|--format=[^\s]*|--pretty(=[^\s]*)?|-s|--no-patch)$'; args = 'revs+paths' }
    'rev-parse' = @{ flags = '^(--abbrev-ref|--short(=[0-9]+)?|--verify|--quiet|-q|--show-toplevel|--is-inside-work-tree)$'; args = 'revs' }
    'rev-list'  = @{ flags = '^(--count|--left-right|--max-count=[0-9]+|--first-parent|-[0-9]+)$'; args = 'revs' }
    'ls-files'  = @{ flags = '^(--cached|--others|--modified|--deleted|--error-unmatch|--exclude-standard|-z)$'; args = 'paths' }
    'fetch'     = @{ flags = '^(--prune|--no-tags|--quiet|-q)$'; args = 'literal'; literal = @('origin') }
    'add'       = @{ flags = '^(-A|--all|-n|--dry-run|-v|--verbose)$'; args = 'add' }
    'commit'    = @{ flags = '^(-m|--message|--allow-empty-message|-q|--quiet)$'; args = 'message' }
    'push'      = @{ flags = '^(--quiet|-q)$'; args = 'literal'; literal = @('origin', 'main') }
}

# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------

function Split-Tokens {
    <# Shell-ish tokenisation that keeps quoted spans as single tokens. #>
    param([string]$Text)
    $tokens = @()
    foreach ($m in [regex]::Matches($Text, '"[^"]*"|''[^'']*''|\S+')) { $tokens += $m.Value }
    return $tokens
}

function Remove-Quotes {
    param([string]$Token)
    if ($Token.Length -ge 2) {
        if (($Token[0] -eq '"' -and $Token[-1] -eq '"') -or ($Token[0] -eq "'" -and $Token[-1] -eq "'")) {
            return $Token.Substring(1, $Token.Length - 2)
        }
    }
    return $Token
}

$script:RepoRootFull = ''

function Test-RepoContainedPath {
    <# Returns a denial reason, or $null when the path is safely inside. #>
    param([string]$Raw)

    $value = Remove-Quotes $Raw
    if ([string]::IsNullOrWhiteSpace($value)) { return 'an empty path argument' }

    foreach ($rule in $ForbiddenPathTokens) {
        if ($value -match $rule.p) { return ($rule.r + " ($value)") }
    }
    if ([System.IO.Path]::IsPathRooted($value)) { return "an absolute path ($value)" }

    $full = ''
    try {
        $full = [System.IO.Path]::GetFullPath((Join-Path $script:RepoRootFull $value)).TrimEnd('\')
    } catch {
        return "an unresolvable path ($value)"
    }
    if (-not ($full -eq $script:RepoRootFull -or $full.StartsWith($script:RepoRootFull + '\', [StringComparison]::OrdinalIgnoreCase))) {
        return "a path outside the Cooking Lab repository ($value)"
    }
    return $null
}

function Test-SafeRevision {
    <#  A revision token: refs, SHAs and ranges. Deliberately narrow, and it
        can never look like a path or a flag.  #>
    param([string]$Raw)
    $value = Remove-Quotes $Raw
    if ($value -notmatch '^[A-Za-z0-9][A-Za-z0-9._@^~/-]*$') { return $false }
    if ($value -match '(^|/)\.\.(/|$)') { return $false }
    return $true
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
    $script:RepoRootFull = $repoRoot

    $denyPaths = @()
    if (-not [string]::IsNullOrWhiteSpace($env:COOKING_LAB_DENY_PATHS)) {
        $denyPaths = $env:COOKING_LAB_DENY_PATHS -split ';' |
                     Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
                     ForEach-Object { $_.Trim().TrimEnd('\') }
    }

    $mutatingTools = @('Write', 'Edit', 'MultiEdit', 'NotebookEdit')
    $isMutating    = ($mutatingTools -contains $toolName)

    # ------------------------------------------------------------------
    # 1. Path safety for every file-touching tool.
    # ------------------------------------------------------------------
    foreach ($key in @('file_path', 'path', 'notebook_path')) {
        $value = $ev.tool_input.$key
        if ($null -eq $value) { continue }
        if ($value -isnot [string]) { continue }
        if ([string]::IsNullOrWhiteSpace($value)) { continue }

        foreach ($rule in $ForbiddenPathTokens) {
            if ($value -match $rule.p) {
                Deny "tool '$toolName' uses $($rule.r) -> $value"
            }
        }

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

        $rel = ''
        if ($full.Length -gt $repoRoot.Length) { $rel = $full.Substring($repoRoot.Length + 1) }
        $rel = ($rel -replace '\\', '/').Trim('/').ToLowerInvariant()

        foreach ($rule in $SecretRelPatterns) {
            if ($rel -match $rule.p) {
                Deny ("tool '$toolName' may not access " + $rule.r + " -> $value (secret-bearing paths are denied to reads as well as writes)")
            }
        }
        if ($isMutating) {
            foreach ($rule in $ControlRelPatterns) {
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
    # the syntax scan to avoid refusing an honest commit message. Double quotes
    # are NOT blanked: bash still expands $(...) and backticks inside them.
    $scan = [regex]::Replace($normalised, "'[^']*'", "''")

    # ------------------------------------------------------------------
    # 2. Shell syntax.
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
    # 3. Content denials, including any path form that leaves the repository.
    # ------------------------------------------------------------------
    $contentDeny = @(
        @{ p = '(?i)(project-a|projecta|cooking-lab-cloud-prototype-archive)'; r = 'a reference to another application repository' },
        @{ p = '(?i)\.app-build-control';                r = 'direct manipulation of the cross-application coordination directory' },
        @{ p = '(?i)dangerously-skip-permissions';       r = 'a permission bypass' },
        @{ p = '(?i)(--setting-sources|--settings)\b';   r = 'Claude settings manipulation' },
        @{ p = '(?i)(^|[\s;|&(])\.git[/\\]';             r = 'a direct path into the Git directory' },
        @{ p = '(?i)(^|[\s;|&(])node_modules[/\\]';      r = 'a direct path into node_modules' }
    )
    foreach ($rule in $contentDeny) {
        if ($normalised -match $rule.p) {
            Deny ($rule.r + ' is not permitted unattended -> ' + $normalised)
        }
    }
    foreach ($rule in $ForbiddenPathTokens) {
        if ($scan -match $rule.p) {
            Deny ($rule.r + ' is not permitted in an unattended command -> ' + $normalised)
        }
    }

    # ------------------------------------------------------------------
    # 4. Per-segment evaluation.
    # ------------------------------------------------------------------
    $commandDeny = @(
        @{ p = '^(adb|emulator|fastboot|scrcpy)\b';                  r = 'a physical device operation (human authorisation required)' },
        @{ p = '^(\./|\.\\)?gradlew?(\.bat)?\b';                     r = 'a Gradle build (human authorisation required)' },
        @{ p = '^(npx\s+)?expo\b';                                   r = 'an Expo native/device operation (human authorisation required)' },
        @{ p = '^(xcodebuild|pod|ndk-build|cmake|make|ninja|javac|java)\b'; r = 'a native build toolchain (human authorisation required)' },
        @{ p = '^(keytool|jarsigner|apksigner|zipalign|gpg|openssl|signtool)\b'; r = 'a signing operation (human authorisation required)' },
        @{ p = '^(curl|wget|Invoke-WebRequest|Invoke-RestMethod|ssh|scp|sftp|rsync|nc|telnet|ftp)\b'; r = 'outbound network access' },
        @{ p = '^(bash|sh|zsh|cmd|powershell|pwsh|wscript|cscript)\b'; r = 'a nested shell invocation' },
        @{ p = '^(eval|exec|source|xargs|env|start)\b';              r = 'indirect command execution' },
        @{ p = '^(node|npx|python|python3|perl|ruby|php|deno|bun)\b'; r = 'direct interpreter execution' },
        @{ p = '^(cd|pushd|popd|chdir|Set-Location)\b';              r = 'changing the working directory' },
        @{ p = '^(cp|copy|mv|move|rm|del|erase|rmdir|rd|mkdir|md|touch|tee|truncate|ln|mklink|New-Item|Copy-Item|Move-Item|Remove-Item)\b'; r = 'filesystem manipulation outside the Write/Edit tools' },
        @{ p = '^(chmod|chown|icacls|attrib|takeown|setfacl)\b';     r = 'a permission or ownership change' },
        @{ p = '^(echo|cat|type|head|tail|more|less|wc|ls|dir|pwd|find|findstr|grep|rg|sed|awk|sort|uniq|tree|where|which|basename|dirname|date|hostname|whoami|set|printenv|Get-Content|Get-ChildItem|Get-FileHash|certutil|sha256sum)\b'; r = 'a general-purpose shell command (use the Read, Glob and Grep tools instead)' },
        @{ p = '^(setx|schtasks|New-Service|Register-ScheduledTask|sc\.exe|reg)\b'; r = 'a machine persistence or configuration change' },
        @{ p = '^claude\b';                                          r = 'a nested Claude Code launch' },
        @{ p = '^[A-Za-z_][A-Za-z0-9_]*=';                           r = 'an environment assignment prefixing a command' }
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
    }
    if ($cleanSegments.Count -eq 0) { Deny 'no executable command segment found.' }

    # ------------------------------------------------------------------
    # 5 and 6. Only git and npm remain. Each is validated in full.
    # ------------------------------------------------------------------
    foreach ($seg in $cleanSegments) {
        $tokens = Split-Tokens $seg
        $head   = $tokens[0]

        # =============================================================
        # git
        # =============================================================
        if ($head -eq 'git') {
            if ($tokens.Count -lt 2) { Deny "bare 'git' is not a permitted command." }

            # Any global option before the subcommand can change context:
            # -C, --git-dir, --work-tree, -c, --exec-path, --namespace.
            $sub = $tokens[1]
            if ($sub.StartsWith('-')) {
                Deny "git global option '$sub' is not permitted; it can move or reconfigure the repository context."
            }
            if (-not $GitRules.ContainsKey($sub)) {
                Deny "git subcommand '$sub' is not on the Build Control allowlist."
            }

            $rule = $GitRules[$sub]
            $rest = @()
            if ($tokens.Count -gt 2) { $rest = $tokens[2..($tokens.Count - 1)] }

            # --- literal argument lists (fetch, push) -----------------
            if ($rule.args -eq 'literal') {
                $positional = @()
                foreach ($t in $rest) {
                    if ($t.StartsWith('-')) {
                        if ($t -notmatch $rule.flags) { Deny "flag '$t' is not permitted with 'git $sub'." }
                    } else {
                        $positional += (Remove-Quotes $t)
                    }
                }
                $expected = @($rule.literal)
                if ($positional.Count -ne $expected.Count) {
                    Deny "'git $sub' must be called exactly as 'git $sub $($expected -join ' ')'."
                }
                for ($i = 0; $i -lt $expected.Count; $i++) {
                    if ($positional[$i] -ne $expected[$i]) {
                        Deny "'git $sub' must be called exactly as 'git $sub $($expected -join ' ')'."
                    }
                }
                continue
            }

            # --- commit: -m messages only -----------------------------
            if ($rule.args -eq 'message') {
                $sawMessage = $false
                $expectValue = $false
                foreach ($t in $rest) {
                    if ($expectValue) { $expectValue = $false; continue }   # the message text itself
                    if ($t.StartsWith('-')) {
                        if ($t -notmatch $rule.flags) {
                            Deny "flag '$t' is not permitted with 'git commit'; only -m messages are allowed."
                        }
                        if ($t -eq '-m' -or $t -eq '--message') { $sawMessage = $true; $expectValue = $true }
                        continue
                    }
                    Deny "'git commit' accepts only -m messages; '$t' is not permitted."
                }
                if (-not $sawMessage) { Deny "'git commit' must supply its message with -m." }
                continue
            }

            # --- add --------------------------------------------------
            if ($rule.args -eq 'add') {
                if ($rest.Count -eq 0) { Deny "'git add' must name what to stage." }
                foreach ($t in $rest) {
                    if ($t.StartsWith('-')) {
                        if ($t -notmatch $rule.flags) { Deny "flag '$t' is not permitted with 'git add'." }
                        continue
                    }
                    $bare = Remove-Quotes $t
                    if ($bare -eq '.') { continue }
                    $reason = Test-RepoContainedPath $t
                    if ($null -ne $reason) { Deny "'git add' argument uses $reason" }
                }
                continue
            }

            # --- status / diff / log / show / rev-parse / rev-list / ls-files
            $afterSeparator = $false
            foreach ($t in $rest) {
                if ($t -eq '--') { $afterSeparator = $true; continue }

                if ($afterSeparator) {
                    $reason = Test-RepoContainedPath $t
                    if ($null -ne $reason) { Deny "'git $sub' path argument uses $reason" }
                    continue
                }

                if ($t.StartsWith('-')) {
                    if ($t -notmatch $rule.flags) { Deny "flag '$t' is not permitted with 'git $sub'." }
                    continue
                }

                $allowsRevs  = ($rule.args -eq 'revs' -or $rule.args -eq 'revs+paths')
                $allowsPaths = ($rule.args -eq 'paths' -or $rule.args -eq 'revs+paths')

                if ($allowsRevs -and (Test-SafeRevision $t)) { continue }
                if ($allowsPaths) {
                    $reason = Test-RepoContainedPath $t
                    if ($null -ne $reason) { Deny "'git $sub' argument uses $reason" }
                    continue
                }
                Deny "'git $sub' argument '$t' is not a permitted revision."
            }
            continue
        }

        # =============================================================
        # npm
        # =============================================================
        if ($head -eq 'npm') {
            $npmScript = $null
            if ($seg -match '^npm\s+test\s*$')            { $npmScript = 'test' }
            elseif ($seg -match '^npm\s+run\s+(\S+)\s*$') { $npmScript = Remove-Quotes $Matches[1] }
            else {
                Deny "only 'npm test' and 'npm run <approved script>' are permitted -> $seg"
            }

            if (-not $QualityCommands.ContainsKey($npmScript)) {
                Deny "npm script '$npmScript' is not on the Build Control allowlist -> $seg"
            }
            $pin = $QualityCommands[$npmScript]

            $pkgPath = Join-Path $repoRoot 'package.json'
            if (-not (Test-Path -LiteralPath $pkgPath)) {
                Deny "cannot verify npm script '$npmScript': package.json not found."
            }
            $pkg = $null
            try { $pkg = Get-Content -Raw -LiteralPath $pkgPath | ConvertFrom-Json }
            catch { Deny "cannot verify npm script '$npmScript': package.json is unreadable." }

            if ($null -eq $pkg.scripts) { Deny 'package.json declares no scripts.' }
            $scriptNames = @($pkg.scripts.PSObject.Properties.Name)

            if (-not ($scriptNames -contains $npmScript)) {
                Deny "npm script '$npmScript' is not defined in package.json."
            }
            $actual = ([string]$pkg.scripts.$npmScript).Trim()
            if ($actual -ne $pin.body) {
                Deny ("npm script '$npmScript' no longer matches its pinned command " +
                      "(expected '$($pin.body)', package.json declares '$actual'); " +
                      'Build Control must re-pin it before it may run unattended.')
            }

            # Lifecycle scripts are an execution path of their own. The runner
            # also sets npm_config_ignore_scripts for the child; this refuses
            # them outright as well, so neither control stands alone.
            foreach ($stage in @('pre', 'post')) {
                $lifecycle = $stage + $npmScript
                if ($scriptNames -contains $lifecycle) {
                    Deny ("package.json defines a '$lifecycle' lifecycle script; " +
                          "'npm run $npmScript' will not be permitted while it exists.")
                }
            }

            # The script body must still reach the pinned package, version and
            # binary. node_modules and package.json are unwritable by the child,
            # so this is a corroborating check rather than the primary control.
            $toolPkgPath = Join-Path $repoRoot ("node_modules\{0}\package.json" -f $pin.package)
            if (-not (Test-Path -LiteralPath $toolPkgPath)) {
                Deny "cannot verify npm script '$npmScript': $($pin.package) is not installed."
            }
            $toolPkg = $null
            try { $toolPkg = Get-Content -Raw -LiteralPath $toolPkgPath | ConvertFrom-Json }
            catch { Deny "cannot verify npm script '$npmScript': $($pin.package) package.json is unreadable." }

            if (([string]$toolPkg.version) -ne $pin.version) {
                Deny ("$($pin.package) is version $($toolPkg.version) but the gate pins $($pin.version); " +
                      'Build Control must re-pin the approved quality commands before they may run unattended.')
            }

            $declaredBin = $null
            if ($null -ne $toolPkg.bin) {
                if ($toolPkg.bin -is [string]) { $declaredBin = [string]$toolPkg.bin }
                elseif (@($toolPkg.bin.PSObject.Properties.Name) -contains $pin.bin) { $declaredBin = [string]$toolPkg.bin.$($pin.bin) }
            }
            if ($declaredBin -ne $pin.binPath) {
                Deny ("$($pin.package) declares its '$($pin.bin)' binary as '$declaredBin' but the gate pins '$($pin.binPath)'; " +
                      'the execution chain has changed and must be re-pinned.')
            }

            $binFull = [System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $toolPkgPath) ($declaredBin -replace '/', '\')))
            if (-not $binFull.StartsWith((Join-Path $repoRoot 'node_modules') + '\', [StringComparison]::OrdinalIgnoreCase)) {
                Deny "the resolved $($pin.bin) binary is outside this repository's node_modules."
            }
            if (-not (Test-Path -LiteralPath $binFull)) {
                Deny "the pinned $($pin.bin) binary is missing at '$declaredBin'."
            }

            # The .bin shim npm actually spawns must still point at that binary.
            $shim = Join-Path $repoRoot ("node_modules\.bin\{0}.cmd" -f $pin.bin)
            if (Test-Path -LiteralPath $shim) {
                $shimText = Get-Content -Raw -LiteralPath $shim
                $expectedFragment = ($pin.package + '/' + ($pin.binPath -replace '^\./', ''))
                $shimNormalised = ($shimText -replace '\\', '/')
                if ($shimNormalised -notmatch [regex]::Escape($expectedFragment)) {
                    Deny ("the node_modules/.bin/$($pin.bin) shim no longer resolves to $expectedFragment; " +
                          'the execution chain may have been substituted.')
                }
            }
            continue
        }

        Deny "command '$head' is not on the Build Control allowlist; only bounded git and approved quality commands are permitted -> $seg"
    }

    exit 0
}
catch {
    # Fail closed: an unhandled gate error must never widen permissions.
    [Console]::Error.WriteLine("Cooking Lab Build Control gate error (failing closed): $($_.Exception.Message)")
    exit 2
}
