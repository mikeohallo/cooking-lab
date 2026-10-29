# Cooking Lab — Runner Hardening Report

**Date:** 5 September 2026
**Machine:** `MSI` · Windows 11 · Claude Code CLI `2.1.240`
**Milestone status:** M0 **ACCEPTED**; M1 **not started**

## Scope

A bounded Build Control correction to the unattended runner only, addressing the
safety weaknesses raised in the first runner review.

**Corrected**

| Area | Files |
|---|---|
| Permission gate | `scripts/build-control-gate.ps1` |
| Runner | `scripts/build-control-runner.ps1` |
| Self-test suite | `scripts/build-control-selftest.ps1` *(new)* |
| Queue schema | `build-control/queue/NEXT_RUN.schema.json` |
| Runner documentation | `build-control/runner/README.md` |
| Cross-app protocol | `build-control/runner/CROSS_APP_PROTOCOL.md` |

**Untouched**

- Cooking Lab product and runtime behaviour — no change to `src/`, `app/`,
  `__tests__/`, `package.json`, `package-lock.json`, `app.config.ts`,
  `app.variants.json`, `babel.config.js`, `eslint.config.js`, `jest.config.js`,
  `jest.setup.ts`, `tsconfig.json`, `android/` or `README.md`. Verified by diff
  and by working-tree status against the pre-correction commit `90b717e`.
- Project A — not read, written, started or inspected. Verified by
  modification-time scan.
- No signing material created. No external service or account created. No live
  data introduced. No tag, no release.
- Milestone 1 was **not** started. The queue remains stood down
  (`allow_unattended: false`, `milestone: NONE`).
- Interactive and manual Claude Code configuration outside the runner is
  unchanged. The user settings file was never read or written by this work.

### Verified starting state

`main` clean and aligned with `origin/main` at `90b717e`. Existing runner
implementation and report commits identified as `9c85480` (runner),
`97c6d22` / `4c34c40` / `bad3c74` (self-test cycle) and `90b717e` (setup
report). `build-control/acceptance/M0_ACCEPTED.md` records M0 as ACCEPTED.

## Permission hardening

### Exact unattended Claude invocation, after correction

```
claude -p --output-format json --permission-mode acceptEdits
       --setting-sources ""
       --strict-mcp-config --mcp-config "{\"mcpServers\":{}}"
       --settings <repo>\.build-control-local\claude-settings.json
       --tools "Bash,Read,Write,Edit,Glob,Grep,TodoWrite"
```

Working directory is the repository root; the prompt is supplied on stdin;
`--dangerously-skip-permissions` and `--permission-mode bypassPermissions` are
not used.

The previous invocation used `--setting-sources user`. That inherited
user-level behaviour into the unattended child and has been removed
(see **Cross-app safety → uncontrolled settings** below).

### Command permissions

The gate is a `PreToolUse` hook — enforced by the runner, not decided by the
model — and is now a fail-closed allowlist in five layers.

**1. npm is no longer a loophole.** `npm run <anything>` is refused. Only three
named scripts may run, and each is **pinned** to the exact command it must still
resolve to in `package.json`:

| Script | Pinned command |
|---|---|
| `test` | `jest` |
| `typecheck` | `tsc --noEmit` |
| `lint` | `eslint .` |

Before allowing the call the gate reads `package.json` and compares. If a script
body no longer matches its pin, the call is denied and Build Control must
re-pin it. This closes the indirect path where an allowed *name* is edited to
run a disallowed *command*. A script is never permitted merely because the
invocation begins with `npm`. Extra arguments (`npm run lint -- --fix`) are
refused, as are `npm install`, `npm ci`, `npm exec`, `npm publish` and every
other subcommand.

**2. Nested and indirect execution is refused outright.** Command substitution
`$( )`, backticks, process substitution `<( )` / `>( )`, parameter expansion
`${ }`, variable expansion, arithmetic expansion, heredocs, all input/output
redirection, and backgrounding. Single-quoted spans are blanked before this scan
because they are literal to the shell, so an honest commit message is not
refused; double-quoted spans are **not** blanked, because bash still expands
inside them. Also refused: `eval`, `exec`, `source`, `xargs`, `env`, nested
shells (`bash -c`, `powershell -Command`, …), inline script evaluation
(`node -e`, `python -c`, …), environment-assignment prefixes, `git -c`
configuration injection, `git config` writes, and `find` with an action
predicate.

**3. Command position anchoring.** Executable denials are anchored at the start
of a command segment. The word "make" inside a commit message is no longer
confused with running `make`.

**4. Every segment must clear the allowlist.** The command is split on `;`,
`&&`, `||` and `|`; an allowed prefix cannot smuggle a tail.

**5. Still denied unless a future authorised prompt explicitly permits them:**
`adb`, `emulator`, `fastboot`, `scrcpy`, `gradlew`/`gradle`, Expo, `xcodebuild`,
`pod`, `cmake`, `make`, `ninja`, `java`/`javac`, signing tools (`keytool`,
`jarsigner`, `apksigner`, `zipalign`, `gpg`, `openssl`, `signtool`), outbound
network (`curl`, `wget`, `ssh`, `scp`, …), release tagging, force push, history
rewrite, remote reconfiguration, machine persistence, registry writes, global
toolchain changes, references to another application repository, direct
manipulation of the coordination directory, nested Claude launches, and any
permission bypass.

An internal gate error fails **closed** (exit 2 blocks the call).

### File permissions

Repository containment was not sufficient on its own. Mutating tools (`Write`,
`Edit`, `MultiEdit`, `NotebookEdit`) are now additionally refused on:

| Category | Refused |
|---|---|
| Git internals | `.git/` (objects, refs, config, hooks), `.githooks/`, `.gitattributes`, `.gitmodules`, `.gitconfig` |
| Credentials | `.npmrc`, `.netrc`, `.git-credentials`, `.ssh/`, `.aws/`, `.gnupg/` |
| Signing files | `*.keystore`, `*.jks`, `*.p12`, `*.pfx`, `*.p8`, `*.pem`, `*.key`, `*.cer`, `*.crt`, `*.mobileprovision`, `keystore.properties`, `signing.properties` |
| Environment secrets | `.env`, `.env.*`, `secrets.json`, `google-services.json`, `GoogleService-Info.plist` |
| Claude configuration | `.claude/`, `CLAUDE.md` |
| Control plane | `scripts/build-control-*`, `.build-control-local/` (except `selftest/`), `build-control/queue/`, `build-control/acceptance/` |

The last row is the one that closes the widest hole: a child able to rewrite the
gate, forge its own `COMPLETED` record, or author its own next instruction would
have had no boundary at all. Changing the runner, the gate or the queue now
requires an authorised interactive session.

Reading remains permitted where it is legitimate — an authorised prompt may read
the queue entry that activated it. Only mutation is refused. Every file-touching
call must still resolve inside this repository, and other application
repositories are denied by absolute path.

### Known conservative behaviour

Layer 2 refuses redirection and expansion characters outside single quotes, so
`git commit -m "a > b"` is refused while `git commit -m 'a > b'` is accepted.
Refusing an honest command is a tolerable cost; allowing a smuggled one is not.

## Completion-state hardening

**A Claude process exiting successfully is no longer sufficient to record
COMPLETED.** Five states are distinguished:

| State | Meaning |
|---|---|
| `COMPLETED` | every requirement appropriate to the instruction was verified |
| `FAILED` | the child failed, timed out, reported an error, or a required commit or report never appeared |
| `HUMAN_ACTION_REQUIRED` | the child stopped at an authorisation boundary |
| `BLOCKED` | the runner refused to launch it and will not retry without a new instruction |
| `RECOVERY_REQUIRED` | the outcome is ambiguous and awaits a human decision |

`STARTED` remains the only non-terminal state, written immediately before the
child launches.

After the child exits, the runner inspects the repository itself. `COMPLETED`
requires **all** of:

- the child exited successfully and did not time out;
- the child did not report `HUMAN ACTION REQUIRED`;
- the working tree is clean;
- HEAD moved, where `requires_commit`;
- the declared report exists **and is tracked in git**, where declared;
- `origin/main` actually contains the commits and local and remote are
  synchronised, where `requires_push`.

The push check re-fetches and queries origin directly. The child's own account
of having pushed is never accepted as evidence.

Anything ambiguous resolves **away** from `COMPLETED`:

| Observation | Recorded as |
|---|---|
| working tree unexpectedly dirty | `RECOVERY_REQUIRED` |
| child reported HUMAN ACTION REQUIRED | `HUMAN_ACTION_REQUIRED` |
| commits exist locally but not on origin | `RECOVERY_REQUIRED` |
| origin unreachable, so the push is unconfirmed | `RECOVERY_REQUIRED` |
| required report exists but uncommitted | `RECOVERY_REQUIRED` |
| required report missing, or required commit never made | `FAILED` |
| non-zero exit, timeout, or `is_error` | `FAILED` |

Requirements are declared per instruction via `requires_commit`,
`requires_push` and `expected_report_path`. Both git requirements **default to
true** when the queue is silent: an unstated requirement must never be the
reason something is called done. A prompt forbidden from touching git — the
runner self-test — must say so explicitly.

## Cross-app safety

### The stale-lock race, corrected

Previously, a lease judged stale was removed with `Remove-Item`. Deciding that a
lease is stale and acting on that decision are separate moments, and between
them the lease may legitimately have been released and re-acquired by another
process — whose live lease would then have been deleted.

The lease now carries an `owner_token` (a fresh GUID per acquisition) and a
`generation` counter. Those, with `app`, `pid`, `acquired_utc` and
`heartbeat_utc`, form an **ownership fingerprint**. Reclaim is:

1. stale analysis records the fingerprint it analysed;
2. the reclaim opens the lease file with `FileShare::None` — an exclusive
   handle, so no other participant can create, read, replace or delete it, and
   the check and the replacement cannot be separated;
3. under that handle the on-disk fingerprint is compared with the analysed one.
   **If it differs in any respect, nothing is written and the reclaim is
   abandoned**; the runner waits and retries later;
4. if it matches, the lease is **replaced in place** with an incremented
   `generation`.

Replacing in place is the point. Deleting first and recreating would leave a
window in which a third participant could legitimately `CreateNew` the lease and
then have it removed underneath — exactly the race being corrected. The file
never ceases to exist. A reclaim is also abandoned if the file cannot be opened
exclusively, since somebody holding it open means it is live.

Ownership is now taken only at the moment the runner is ready to launch. Earlier
cycle checks look at the lease read-only.

Heartbeat refresh and release are **token-verified**, not pid-verified — Windows
recycles process ids, so a pid can later point at an unrelated process. Neither
will write over or delete a lease that has become somebody else's.

### Rules maintained

- A live lock is never stolen: staleness still requires **both** a dead owner
  process **and** a heartbeat older than 15 minutes.
- No other application's Claude or Gradle process is ever killed or signalled.
  The runner only ever stops its own child.
- Project A or manual work blocks unattended Cooking Lab: a foreign Claude
  Code CLI process, or a live lease belonging to another application, blocks the
  launch. If process enumeration fails, the runner fails safe and declines.
- `PAUSE_UNATTENDED` blocks new unattended launches. The runner never creates or
  deletes it in normal operation.
- Manual work has priority throughout.
- Claude Desktop (`\WindowsApps\Claude_*`) is still correctly distinguished from
  the Claude Code CLI.

### Uncontrolled settings removed

The child previously ran with `--setting-sources user`, inheriting user-level
settings and hooks. It now runs with `--setting-sources ""`, which loads no
user, project or local settings — so no user-level hook can silently execute
during an unattended run — plus `--strict-mcp-config` with an empty server map,
so no inherited MCP server widens the tool surface beyond `--tools`.

The runner's own gate is still installed through `--settings`, which is not a
settings *source*. Both halves were **verified empirically** on CLI 2.1.240
rather than assumed:

| Condition | Settings-source hook | `--settings` hook |
|---|---|---|
| `--setting-sources project` | ran | — |
| `--setting-sources ""` | did **not** run | ran |

No unrestricted permission bypass was introduced: `--dangerously-skip-permissions`
and `--permission-mode bypassPermissions` remain unused, and the gate remains
deny-by-default. Interactive and manual Claude configuration outside the runner
is untouched; the runner reads no user settings file and writes only
`.build-control-local/claude-settings.json`, which is local and never committed.

## Queue validation

Runtime validation now matches the documented schema exactly and is **closed**.
A queue file is rejected for any of:

- an unknown property (the schema is closed — this also refuses any attempt to
  smuggle `command`, `script`, `args`, `hooks` or similar into the queue);
- a missing required property;
- a wrong JSON type (including `allow_unattended` as a string, `instruction_id`
  as a number, `requires_push` as a string);
- a malformed `prompt_sha256` (not 64 lowercase hex) or `expected_base_commit`
  (not a full 40-character lowercase SHA);
- path traversal, an absolute path, a path outside `build-control/prompts/`, or
  a symlink/reparse point;
- an untracked prompt path;
- a prompt/hash mismatch, or a prompt that changed between the base commit and
  the activation commit, or a checked-out prompt differing from the committed
  one;
- an invalid activation/base relationship — the commit that activated the queue
  must be `HEAD`, and its **first parent** must be `expected_base_commit`;
- `allow_unattended` that is not exactly `true`.

Three optional properties were added and documented: `requires_commit`,
`requires_push` and `expected_report_path` (constrained to
`build-control/reports/*.md`).

## Crash/restart behaviour

An instruction is recorded as `STARTED` immediately **before** the child
launches, together with `runner_pid`, `head_before`, the log directory, the
resolved completion requirements and the timestamps — enough to reconstruct what
happened after an interruption.

On the next cycle, a record still in `STARTED` means the previous run was
interrupted. The previous child may already have committed or pushed, so the
outcome is unknown. The runner:

- never re-runs it;
- preserves the record and its evidence;
- moves it to `RECOVERY_REQUIRED`;
- reports `HUMAN ACTION REQUIRED`;
- requires a **new explicit Build Control instruction** before any retry.

`RECOVERY_REQUIRED`, `FAILED`, `HUMAN_ACTION_REQUIRED` and `BLOCKED` are all
terminal: none of them runs again by itself. Reusing an `instruction_id` for a
different prompt or base commit is refused outright and recorded as `BLOCKED`.

## Self-test evidence

`scripts/build-control-selftest.ps1` — **150 checks, 150 passed, 0 failed**,
including the live invocation check.

The suite is harmless. It builds a scratch git repository with a local bare
origin, a scratch coordination directory and a stub worker, and never operates
on real repository state, the real machine-wide lease, or another application.
Those redirections are honoured only under the runner's documented test seams;
in normal unattended operation every path, remote and executable is the fixed
production value and no environment variable can change it.

Using a stub worker for the control-flow claims is deliberate: "launches exactly
once", "does not rerun", "does not blindly repeat" are claims about the runner's
control flow, and a launch counter proves them exactly. The real CLI invocation
is verified separately and live.

### Required proofs

| # | Required proof | Result |
|---|---|---|
| 1 | valid queued prompt launches exactly once | **PASS** — launch counter = 1 after a full cycle |
| 2 | duplicate instruction does not rerun | **PASS** — counter stays 1 across two further cycles; recorded `COMPLETED` |
| 3 | invalid npm/script bypass attempts rejected | **PASS** — `npm run android`, `npm run start`, `npm run doctor`, arbitrary script names, extra args, `npm install`, `npm ci`, `npm exec`, `npx --yes` all refused; pinned scripts allowed; an allowed name refused once its `package.json` body no longer matches its pin |
| 4 | shell/nested execution bypass attempts rejected | **PASS** — `$( )`, substitution inside double quotes, backticks, `<( )`, `$VAR`, `${ }`, heredoc, `>` and `>>`, `&`, `bash -c`, `node -e`, `eval`, `xargs`, env prefix, `git -c`, `git config`, `&&`-smuggled tail, `|`-smuggled tail, nested `claude -p`, `find -exec`, `.git/` path |
| 5 | uncontrolled user settings are not loaded | **PASS** — live check: with a settings source present its `PreToolUse` hook runs; under `--setting-sources ""` it does not, while the `--settings` gate hook still does |
| 6 | simulated Project A ownership blocks Cooking Lab | **PASS** — live `project-a` lease blocks the launch and is left byte-identical |
| 7 | PAUSE_UNATTENDED blocks Cooking Lab | **PASS** — no launch while the file is present |
| 8 | manual Claude detection blocks unattended launch | **PASS** — a real out-of-tree process at a Claude Code CLI path is detected as foreign and blocks the launch |
| 9 | stale-lock recovery does not steal a changed/live lease | **PASS** — reclaim returns `CHANGED` when the fingerprint moved after stale analysis, the new live lease survives untouched, and no ownership is assumed; an unchanged stale lease *is* reclaimed, generation incremented, file never deleted |
| 10 | unknown queue fields are rejected | **PASS** — unknown properties, smuggled `command`/`script`, missing properties, wrong types, malformed hashes/SHAs, traversal, absolute paths, untracked prompts, hash mismatch, bad activation relationship |
| 11 | dirty repo cannot be marked COMPLETED | **PASS** — unit and end-to-end: a stub run leaving an artefact behind records `RECOVERY_REQUIRED` |
| 12 | HUMAN_ACTION_REQUIRED cannot be marked COMPLETED | **PASS** — unit and end-to-end: a stub reporting the boundary records `HUMAN_ACTION_REQUIRED` despite exit 0 |
| 13 | missing/unpushed report cannot be marked COMPLETED | **PASS** — missing report → `FAILED`; uncommitted report → `RECOVERY_REQUIRED`; unpushed, unsynchronised or unconfirmable push → `RECOVERY_REQUIRED`; end-to-end: a declared-but-never-written report records `FAILED` despite exit 0 |
| 14 | interrupted STARTED instruction does not blindly rerun | **PASS** — no launch; moved to `RECOVERY_REQUIRED`; `head_before` and `runner_pid` preserved; still does not run on the following cycle |
| 15 | no Cooking Lab runtime/product source changed | **PASS** — `git diff 90b717e..HEAD` over all product paths is empty, and the working tree is clean |
| 16 | no Project A files were touched | **PASS** — recursive modification-time scan of `<other app repo>` shows nothing modified during the run |

Additional checks passed beyond the required list: protected-file mutation
(21 paths), reused `instruction_id` refused and recorded `BLOCKED`, lease
released after each run, heartbeat and release refusing to act on a lease that
is no longer ours, requirement defaults, and the real coordination directory
left unwritten.

Local evidence file (untracked by design):
`.build-control-local/selftest/RUNNER_HARDENING_SELFTEST.md`.

### Production-path checks

The real runner was also exercised against the real repository with `-Once
-SelfTest`:

- dirty tree → `RUNNER BLOCKED — repository precondition failed`, `HUMAN ACTION
  REQUIRED`, no launch;
- clean tree, queue stood down → `no pending instruction (allow_unattended is
  false; nothing is authorised); waiting`, no launch;
- `<coordination folder>\` left empty throughout.

## GitHub evidence

| Item | Value |
|---|---|
| Base before correction | `90b717e672388420c3b5b91a532cfaa5b35be2ae` |
| Implementation commit | `c455f140d870f9af6bd419e5dd5edee0993c2709` — *fix: harden unattended build control runner* |
| Report commit | *(this document — see the commit that adds it)* |
| Push result | implementation commit pushed to `origin/main`: `90b717e..c455f14` |
| origin/main synchronisation | after push, `git rev-list --left-right --count origin/main...main` = `0 0` |

No tag. No release. No Milestone 1 work.

## Blockers

None.

## Assessment

**RUNNER READY FOR CONTROLLED TRIAL**

The specific weaknesses raised in the review are corrected and each is backed by
a test that fails if the correction is removed. The recommended first use
remains a controlled trial: a small, harmless, explicitly authorised instruction
whose outcome is easy to verify by hand, watched while it runs, before any
milestone work is queued.

Two things are worth stating plainly about the residual risk. First, the gate is
a pattern-based allowlist over a shell; it is deny-by-default and every known
bypass class raised in the review is now tested, but "no bypass exists" is not
something a test suite can establish. Second, the strongest guarantees here are
structural rather than behavioural — the child cannot modify the gate, the
runner, the queue or its own completion record, so a bounded run cannot widen
its own boundary even if it wanted to.

Milestone 1 has **not** been started.
