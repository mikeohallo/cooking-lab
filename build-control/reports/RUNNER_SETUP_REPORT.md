# Cooking Lab — Unattended Runner Setup Report

Date: 3 September 2026. Machine: `MSI` (Windows 11, PowerShell 5.1).

## 1. Scope completed

**Runner components**

| Component | Path |
|---|---|
| Polling runner | `scripts/build-control-runner.ps1` |
| Deny-by-default permission gate | `scripts/build-control-gate.ps1` |
| Executable prompt surface | `build-control/prompts/` |
| Queue + schema | `build-control/queue/NEXT_RUN.json`, `NEXT_RUN.schema.json` |
| Runner documentation | `build-control/runner/README.md` |
| Machine-wide protocol | `build-control/runner/CROSS_APP_PROTOCOL.md` |
| Self-test evidence | `build-control/runner/SELF_TEST_EVIDENCE.md` |
| Self-test prompt | `build-control/prompts/RUNNER_SELF_TEST.md` |
| Local-only state (gitignored) | `.build-control-local/` |
| Unattended protocol section | `build-control/README.md` |

**Cross-application mechanism**

`<coordination folder>\` — outside every repository, never committed —
holding the machine-wide execution lease `app.lock.json` and the pause switch
`PAUSE_UNATTENDED`. Cooking Lab's identifier is `cooking-lab`; `project-a` is
reserved for future adoption.

**Deliberately not changed**

No Cooking Lab product, application or runtime file. No M1 work. No Android or
native change, no build, no device access. No production signing identity or
signing material. No cloud, CI or external infrastructure. No dependency or
toolchain change. No tags. No Windows power configuration change. No service,
scheduled task, registry autorun or any other reboot persistence.

**Project A and `<archived prototype>` were not
read, written, started, inspected or modified.** The only artefact naming
`project-a` is a simulated lease file that the self-test wrote into the shared
coordination directory and then removed.

## 2. Claude Code CLI capability

**Installed version:** `2.1.240` (`claude.exe`, WinGet package
`Anthropic.ClaudeCode`).

**Non-interactive invocation selected:**

```
claude -p --output-format json --permission-mode acceptEdits
       --setting-sources user
       --settings <generated>\.build-control-local\claude-settings.json
       --tools "Bash,Read,Write,Edit,Glob,Grep,TodoWrite"
```

The prompt is delivered on **stdin** from the validated prompt file, so no
prompt content ever passes through a command line. The working directory is
locked to `<repo>`. `--output-format json` gives the exit
status, the child's own result, and its `permission_denials` list for the audit
trail.

**Permission approach — and why.**

This was determined empirically, not from historical syntax. The finding that
shaped the design:

> In `-p` mode there is no terminal to answer a permission prompt, so Claude Code
> does not block on one. A tool call that would normally prompt is simply
> **allowed to proceed** — verified on 2.1.240 even under
> `--permission-mode manual` with `--setting-sources ""`, where an arbitrary
> `Bash` command ran with `permission_denials: []`.

Permission modes alone therefore cannot bound an unattended child, and a deny
list alone is only a blacklist. Two mechanisms were verified to actually
restrict the child, and both are used:

1. **`--tools`** limits the child to seven built-in tools. Anything absent does
   not exist for it — no web access, no subagents. Verified: with `Bash` omitted
   the child reported no shell tool available and did not run the command.
2. **A `PreToolUse` hook** (`scripts/build-control-gate.ps1`) supplies a real
   allowlist, enforced by the runner rather than decided by the model. Verified:
   a non-allowlisted command was blocked before execution and recorded in
   `permission_denials`.

Gate behaviour:

- every `Bash` command is split on `;`, `&&`, `||` and `|`, and **every** segment
  must match the allowlist, so an allowed prefix cannot smuggle a tail;
- hard denials always win — destructive git, history rewrite, tagging, force
  push, signing tools, `adb`/device access, outbound network, global toolchain
  changes, machine persistence, references to another application repository,
  nested unattended Claude launches, and any permission bypass;
- every file-touching tool call must resolve inside this repository, with other
  application repositories denied explicitly by absolute path;
- an internal gate error **fails closed** (exit 2 blocks the call).

**Confirmation: no dangerous unrestricted bypass.** `--dangerously-skip-permissions`,
`--allow-dangerously-skip-permissions` and `--permission-mode bypassPermissions`
are not used anywhere in the runner, the gate or the generated settings, and the
gate denies any command containing `dangerously-skip-permissions`. The runner is
not a wrapper for unrestricted shell access: the child's shell is allowlisted
command-by-command.

## 3. Queue protocol

**Files.** One active instruction, `build-control/queue/NEXT_RUN.json`, against
the schema `NEXT_RUN.schema.json`. Zero or one pending instruction, never more.
The queue carries **no commands**; it can only activate a tracked Markdown prompt
under `build-control/prompts/`. Fields named `command`, `commands`, `shell`,
`script` or `args` are rejected outright.

**Schema.** `instruction_id`, `prompt_path`, `prompt_sha256`,
`expected_base_commit`, `milestone`, `scope`, `allow_unattended`, plus optional
`notes`. Path rules: repository-relative, forward slashes, directly inside
`build-control/prompts/`, `.md` only — absolute paths, `..` traversal,
reparse points/symlinks, untracked files and anything outside that directory are
all rejected.

**Prompt hash validation.** `prompt_sha256` is the SHA-256 of the prompt's **git
blob**, not the checked-out file, because `core.autocrlf` is enabled here and
working-tree bytes are machine-dependent while blob bytes are not:

```
git cat-file blob <commit>:build-control/prompts/M1.md | sha256sum
```

The runner verifies the hash at both commits and confirms the checked-out prompt
matches the committed prompt.

**Expected-base protocol.** Build Control publishes in two commits: commit A adds
the prompt, commit B activates the queue with `expected_base_commit = A`. Before
running, the runner requires that the commit which last touched `NEXT_RUN.json`
(B) is `HEAD`, that B's **first parent** is exactly A, and that the prompt exists
at both A and B unchanged. If commits have landed after activation, the
instruction must be re-activated by Build Control rather than guessed at.

**Duplicate protection.** An instruction is identified by `instruction_id` +
`prompt_sha256` + `expected_base_commit`, recorded in
`.build-control-local/state/instructions.json`. `STARTED` is written immediately
**before** the child launches; `COMPLETED`/`FAILED` only after the child exits
and the repository has been assessed. Seeing an instruction never consumes it.
Reusing an `instruction_id` for a different prompt or base commit is refused.

**Crash/restart behaviour.** A `STARTED` record found on restart is **never**
blindly repeated — the interrupted child may already have committed or pushed.
It is moved to `BLOCKED_RECOVERY`, reported as HUMAN ACTION REQUIRED, and held
for a human decision.

## 4. Cross-app safety

**Shared coordination path.** `<coordination folder>\` — outside all
repositories, never committed, and never holding GitHub credentials, Claude
credentials, API keys or tokens.

**Lease mechanism.** `app.lock.json` records owning application, owning PID,
child PID, instruction id, acquisition timestamp, heartbeat timestamp, host and
repository. Acquisition is atomic via `FileMode::CreateNew`, so two runners
racing cannot both succeed. The heartbeat refreshes at least every 30 seconds
while held; the lease is released only after the child exits **and** the
repository has been assessed.

**`PAUSE_UNATTENDED`.** If present, no unattended run may begin. The runner keeps
polling and never deletes it — Mike owns it. The only exception is a self-test,
which removes only the file it created itself.

**Manual Claude detection.** Before acquiring the lease the runner looks for a
Claude Code CLI process it did not start. If one exists it does not launch, does
not interact with it and does not kill it — it waits. Claude **desktop**
(`...\WindowsApps\Claude_*\app\claude.exe`) is correctly excluded; confusing it
with Claude Code would have meant the runner could never start. Enumeration
failure is treated as "a manual session may exist" and the runner declines to
start. The pause switch and this check are re-tested once more **after** the
lease is acquired, and the runner stands down if either now blocks.

**Stale-lock policy.** A lease is stale only when **both** hold: the recorded
owner process no longer exists, **and** the heartbeat is older than 15 minutes.
Elapsed time alone never releases a live lease. The runner never kills another
process, never steals a live lease, never modifies another application and never
redirects another Claude session.

**Confirmation: Project A was not modified.** Nothing was written to, read
from or executed in `<other app repo>`. Its participation in this protocol
is documented only, for future adoption.

## 5. Runner safety

**Locking.** A local single-instance lock (`.build-control-local/runner.lock`)
prevents two Cooking Lab runners; a dead-PID lock is cleared, a live one blocks.
The machine-wide lease then serialises across applications.

**Dirty/diverged repository.** The working tree must be clean before any launch.
If local `main` is behind `origin/main` the runner **fast-forwards only**. It
never merges, rebases, resets, force-updates, discards work, resolves conflicts
or rewrites history. If local and remote have diverged it records `RUNNER
BLOCKED` and `HUMAN ACTION REQUIRED` and does not run Claude.

**Network.** A failed fetch is treated as a temporary fault: wait and retry.
Connectivity loss is never treated as authorisation to run stale work, and never
damages the repository.

**Human boundaries.** The runner cannot authorise production signing, signing
keys or their backup/recovery, secret entry, external or cloud accounts and
services, architecture changes, destructive data operations, live-data
migration, release acceptance, tags, public distribution, Play Store actions,
machine-wide toolchain changes, product or scope decisions, weakening device
security, or any physical Fold action. When a run reaches such a boundary the
child stops safely, the runner logs `HUMAN ACTION REQUIRED` and returns to
waiting. It never sits waiting for Mike to fold, unfold, unlock or approve
anything. Unattended work stays at source level — types, lint, unit and
responsive tests — with physical device checks batched into a milestone's final
acceptance.

**Failure handling.** A child that exits unsuccessfully is not relaunched; the
failure is recorded and a new explicit instruction or recovery decision is
required. A child exceeding `-MaxChildMinutes` (default 240) is stopped — the
runner only ever stops its own child — and recorded as `FAILED`.

## 6. Self-test evidence

Full detail: `build-control/runner/SELF_TEST_EVIDENCE.md`. Summary:

| Test | Result |
|---|---|
| **A. Normal execution** | Queue validated, lease acquired, one child launched, prompt read exactly (returned the prompt's token `SELF_TEST_OK COOKING-LAB-RUNNER-SELFTEST-7F3A9C21`), completed, lease released |
| **Child Claude exit code** | **0** (`is_error: false`, `num_turns: 6`) |
| **B. Duplicate run** | Second run skipped: *"instruction 'runner-self-test-002' already completed"*. No child launched, no lease acquired |
| **C. Simulated Project A lease** | *"machine-wide application lease is held by 'project-a' (pid 25116); waiting"*. Refused to launch; foreign lease left intact and its owner left alive. Stale rule verified both ways: live owner + 60-min-old heartbeat → **not** stale; dead owner + old heartbeat → reclaimed |
| **D. `PAUSE_UNATTENDED`** | *"unattended work is paused ... waiting"*. No lease, no child. Runner did not delete the file |
| **E. Lease acquire/release** | Absent → acquired (`cooking-lab`, pid 9540) → released → absent. No blocked run ever left a lease held |
| **F. Manual-Claude protection** | Normal mode: *"another Claude Code session is running (pid 30236); manual work has priority - not starting"*. Eight Claude **desktop** processes correctly ignored |
| **G. Application integrity** | `git diff --stat` over `app/`, `src/`, `__tests__/`, `app.config.ts`, `package.json` and every other product file, from `9978d60` to `HEAD`: **no output**. Working tree clean, no tags, nothing under `.build-control-local/` tracked |

The permission gate was additionally unit-tested with 30 synthetic `PreToolUse`
events: **30 passed, 0 failed** — including tail-smuggling after an allowed
prefix, `..` traversal, and writes targeting another application repository.

**A defect the self-test found.** The first run (`runner-self-test-001`) did
everything correctly but was recorded as `FAILED`, because
`Start-Process -PassThru` discards the process handle on exit and `$proc.ExitCode`
read back as `$null`. Fixed in `97c6d22` and re-tested as `runner-self-test-002`,
which recorded `COMPLETED (exit 0)`. The `FAILED` record is retained as evidence.

**Queue cleanup.** `NEXT_RUN.json` is stood down to `allow_unattended: false`.
Three independent mechanisms prevent the self-test relaunching: the stood-down
flag, the local `COMPLETED` record, and the activation-protocol check. The queue
mechanism itself is intact and ready for the next instruction.

## 7. GitHub evidence

| Commit | Purpose |
|---|---|
| `9c85480330733b8dcdb9fd245eef5d108f55c489` | `chore: add unattended build control runner` — implementation |
| `643e5677449ec3d8243efdba27f9d1d6b7ca5398` | activation commit for `runner-self-test-001` |
| `97c6d22c2f759c0a074475d7e70a64ee41c45f9a` | `fix(build-control): capture the bounded child's exit code reliably` |
| `4c34c401ad796177e2f91632686b9891b6fbb354` | activation commit for `runner-self-test-002` |
| `bad3c74abc44e54d2dd2254f77ea174d5d166b9e` | self-test evidence + queue stand-down |

**Push result:** `9978d60..bad3c74  main -> main`, exit 0.

`origin/main` was at `bad3c74abc44e54d2dd2254f77ea174d5d166b9e` with local `main`
in sync when this report was written; this report is committed and pushed on top
of it. No tag, no release, no PR, no GitHub Actions, no CI/CD, no cloud service.

## 8. Overnight operating instructions

**START** — in `<repo>`:

```
powershell -NoProfile -File .\scripts\build-control-runner.ps1
```

**STOP:** press `Ctrl+C` in that window.

**PAUSE ALL UNATTENDED APP BUILDS:** create the file

```
<coordination folder>\PAUSE_UNATTENDED
```

**RESUME:** delete that file.

**HOW TO IDENTIFY:** the runner window prints lines tagged `[HUMAN]` reading
`HUMAN ACTION REQUIRED - <what is needed>`. The same lines are in
`.build-control-local\logs\runner.log`. Also watch for `[BLOCK] RUNNER BLOCKED`.

Keep the laptop plugged in and Windows awake. Closing the lid or sleeping pauses
execution; the runner resumes polling safely afterwards.

## 9. Security

- **No credentials added.** No GitHub token, Claude credential, API key or secret
  was created, stored or committed — not in the repository, not in
  `.build-control-local/`, not in `<coordination folder>\`.
- **No dangerous Claude bypass.** `--dangerously-skip-permissions` and
  `bypassPermissions` are not used; the gate denies any attempt to use them. The
  child's shell is allowlisted command-by-command and fails closed.
- **No startup persistence.** No Windows service, scheduled task, registry
  autorun or hidden autorun. The runner is started manually and does not survive
  reboot.
- **No app, cloud or signing changes.** No application or runtime file, no
  Android/native change, no build, no device access, no signing identity or
  material, no cloud or CI infrastructure, no dependency or toolchain change, no
  Windows power configuration change.
- Local runner state is gitignored and holds only locks, logs, timestamps,
  process ids and consumed-instruction records.

## 10. Blockers / deviations

Two deviations worth recording, both deliberate:

1. **Permission model.** The brief asked for the safest supported Claude Code
   permission model. Testing showed permission *modes* do not restrict a `-p`
   child at all (§2), so the requirement is met by `--tools` plus a
   deny-by-default `PreToolUse` gate rather than by a mode alone. This is
   stricter than a mode-based approach, not weaker.
2. **Two self-test instructions instead of one.** The first run exposed a genuine
   runner defect. Rather than editing local state to hide it, the fix was
   committed and a fresh instruction issued through the normal two-commit
   protocol. Both records are retained.

No other blockers. Nothing was left pending or unverified.

## 11. Assessment

**RUNNER READY FOR CONTROLLED TRIAL**

Milestone 1 has not been started.
