# Cooking Lab — unattended Build Control runner

Infrastructure only. Nothing here affects Cooking Lab at build or run time.

| Component | Path |
|---|---|
| Runner | `scripts/build-control-runner.ps1` |
| Permission gate | `scripts/build-control-gate.ps1` |
| Self-test suite | `scripts/build-control-selftest.ps1` |
| Prompts | `build-control/prompts/` |
| Queue | `build-control/queue/NEXT_RUN.json` (+ `NEXT_RUN.schema.json`) |
| Cross-app protocol | `build-control/runner/CROSS_APP_PROTOCOL.md` |
| Local state (never committed) | `.build-control-local/` |

## Operating the runner

```
START:   powershell -NoProfile -File .\scripts\build-control-runner.ps1
STOP:    Ctrl+C in that window
PAUSE:   create  C:\Projects\.app-build-control\PAUSE_UNATTENDED
RESUME:  delete  C:\Projects\.app-build-control\PAUSE_UNATTENDED
```

Useful switches: `-Once` (single cycle, for controlled tests), `-PollSeconds`
(default 180), `-MaxChildMinutes` (default 240), `-SelfTest` (documented
allowance described in `CROSS_APP_PROTOCOL.md` §5).

The runner is started manually. It deliberately installs **no** Windows service,
scheduled task, registry autorun or any other reboot persistence.

## What the runner may do

It may execute exactly one thing: a tracked Markdown prompt under
`build-control/prompts/` that a queue commit has explicitly activated. It never
invents work, and the queue file never carries commands.

## Queue protocol

Build Control publishes work in **two commits**:

1. **Commit A** adds or updates the prompt file, e.g.
   `build-control/prompts/M1.md`.
2. **Commit B** updates `build-control/queue/NEXT_RUN.json` with
   `expected_base_commit` set to **A**.

The runner then requires all of the following before it will act:

- the commit that last touched `NEXT_RUN.json` (commit B) is `HEAD`;
- B's **first parent** is exactly `expected_base_commit` (A);
- the prompt is tracked, and present at both A and B, unchanged between them;
- the prompt's git blob SHA-256 equals `prompt_sha256`;
- the checked-out prompt matches the committed prompt;
- `allow_unattended` is exactly `true`;
- `instruction_id`, `milestone` and `scope` are present and well-formed;
- the path is inside `build-control/prompts/` — no absolute path, no `..`, no
  symlink or reparse point, no untracked file;
- the instruction has not already been consumed locally.

Anything ambiguous is rejected. The runner never guesses.

### Computing `prompt_sha256`

The hash is of the **git blob**, not the checked-out file. `core.autocrlf` is
enabled on this machine, so working-tree bytes are machine-dependent while blob
bytes are not.

```
git cat-file blob <commit>:build-control/prompts/M1.md | sha256sum
```

### Example

```json
{
  "instruction_id": "m1-implementation-001",
  "prompt_path": "build-control/prompts/M1.md",
  "prompt_sha256": "<64 hex chars>",
  "expected_base_commit": "<40 hex chars — commit A>",
  "milestone": "M1",
  "scope": "Implement bounded M1 local persistence",
  "allow_unattended": true,
  "requires_commit": true,
  "requires_push": true,
  "expected_report_path": "build-control/reports/M1_REPORT.md"
}
```

To stand the queue down, set `allow_unattended` to `false`. There is never more
than one pending instruction.

### Strict schema

The runtime validator matches the documented schema exactly and is **closed**.
A queue file is rejected outright for any of: an unknown property, a missing
required property, a wrong JSON type, a malformed hash or commit id, path
traversal, a prompt outside `build-control/prompts/`, an untracked prompt, a
prompt/hash mismatch, an activation commit whose first parent is not
`expected_base_commit`, or `allow_unattended` that is not exactly `true`.

A queue file the runner does not *fully* understand is never executed.

### Completion requirements

Three optional properties declare what "done" means for the instruction:

| Property | Default | Meaning |
|---|---|---|
| `requires_commit` | `true` | HEAD must move |
| `requires_push` | `true` | the commits must be present on `origin/main` |
| `expected_report_path` | none | that report must exist and be tracked |

Both git requirements default to **true** when the queue is silent. An unstated
requirement must never be the reason something is called COMPLETED. A prompt
that is forbidden from touching git — the runner self-test, for example — has to
say so explicitly with `"requires_commit": false, "requires_push": false`.

## Instruction states

An instruction is identified by `instruction_id` + `prompt_sha256` +
`expected_base_commit`, recorded in `.build-control-local/state/instructions.json`.

| Recorded status | Meaning | Next cycle |
|---|---|---|
| `STARTED` | written immediately **before** the child launches; the only non-terminal state | not repeated; moved to `RECOVERY_REQUIRED` and reported as HUMAN ACTION REQUIRED |
| `COMPLETED` | every completion requirement was verified | skipped |
| `FAILED` | the child failed, timed out, reported an error, or a required commit or report never appeared | skipped; a new instruction is required |
| `HUMAN_ACTION_REQUIRED` | the child stopped at an authorisation boundary | skipped; a new instruction is required |
| `BLOCKED` | the runner refused to launch this instruction and will not retry it | skipped |
| `RECOVERY_REQUIRED` | the outcome is ambiguous and awaits a human decision | skipped |

Merely *seeing* an instruction never consumes it. Reusing an `instruction_id`
for a different prompt or base commit is refused outright and recorded as
`BLOCKED`.

### COMPLETED is earned, not assumed

**A Claude process exiting successfully is not sufficient.** After the child
exits, the runner inspects the repository itself and records `COMPLETED` only
when every requirement appropriate to the instruction holds:

- the child exited successfully and did not time out;
- the child did not report `HUMAN ACTION REQUIRED`;
- the working tree is clean;
- HEAD moved, where `requires_commit`;
- the declared report exists **and is tracked**, where one was declared;
- `origin/main` actually contains the commits, and local and remote are
  synchronised, where `requires_push`.

The push check re-fetches and queries origin. The child's own account of having
pushed is never accepted as evidence.

Anything ambiguous resolves **away** from `COMPLETED`:

| Observation | Recorded as |
|---|---|
| working tree unexpectedly dirty | `RECOVERY_REQUIRED` |
| child reported HUMAN ACTION REQUIRED | `HUMAN_ACTION_REQUIRED` |
| commits exist locally but not on origin | `RECOVERY_REQUIRED` |
| origin unreachable, so the push is unconfirmed | `RECOVERY_REQUIRED` |
| required report exists but is uncommitted | `RECOVERY_REQUIRED` |
| required report missing, or a required commit never made | `FAILED` |

### Crash and restart

After a crash or restart, a `STARTED` instruction is **never** blindly repeated —
the previous child may already have committed or pushed. The record keeps
`runner_pid`, `head_before`, the log directory and the timestamps, so what
happened can be reconstructed. The instruction moves to `RECOVERY_REQUIRED` and
a **new explicit Build Control instruction** is required before any retry.

## Permission model

The child is launched with exactly this invocation:

```
claude -p --output-format json --permission-mode acceptEdits
       --setting-sources ""
       --strict-mcp-config --mcp-config "{\"mcpServers\":{}}"
       --settings <generated>
       --tools "Bash,Read,Write,Edit,Glob,Grep,TodoWrite"
```

`--dangerously-skip-permissions` and `--permission-mode bypassPermissions` are
**not used**, and the runner is not a wrapper for unrestricted shell access.

### No uncontrolled configuration is inherited

`--setting-sources ""` loads **no** user, project or local settings. No
user-level hook, permission rule, environment injection or model preference can
reach the unattended child. `--strict-mcp-config` with an empty server map
removes inherited MCP servers, so the child's tool surface is exactly what
`--tools` names and nothing more.

`--settings <file>` is not a settings *source*; it is the runner's own
controlled settings, and it is still honoured. That combination is what makes
the gate installable while everything else is excluded.

Both halves were verified empirically on CLI 2.1.240, not assumed: with a
settings source present, its `PreToolUse` hook executes; with
`--setting-sources ""` the same hook does not, while the hook supplied through
`--settings` still does. `scripts/build-control-selftest.ps1 -LiveInvocationCheck`
re-runs that experiment.

Interactive Claude Code configuration is untouched. The runner reads no user
settings file and writes only `.build-control-local/claude-settings.json`, which
is local and never committed.

### The gate

A permission *mode* alone does not bound an unattended child. Verified on CLI
2.1.240: in `-p` mode there is no terminal to answer a permission prompt, so a
tool call that would normally prompt is simply **allowed** — even under
`--permission-mode manual`. A deny list alone is only a blacklist.

`scripts/build-control-gate.ps1` closes that gap. It is a `PreToolUse` hook, so
it is enforced by the runner rather than decided by the model, and it is a
**fail-closed allowlist** in five layers:

1. **Path safety.** Every file-touching call must resolve inside this
   repository; other application repositories are denied by absolute path.
2. **Shell syntax.** Command substitution `$( )`, backticks, process
   substitution, parameter and variable expansion, heredocs, redirection and
   backgrounding are refused outright, so an allowed command cannot carry a
   disallowed one inside it. Single-quoted spans are treated as literal, as
   bash does.
3. **Content denials.** References to another application repository, to the
   coordination directory, to `.git/` paths, to Claude settings flags, or to any
   permission bypass.
4. **Per-segment allowlist.** The command is split on `;`, `&&`, `||` and `|`,
   and **every** segment must clear the command-position denials and match an
   allow pattern — an allowed prefix cannot smuggle a tail.
5. **npm verification.** See below.

An internal gate error fails **closed** (exit 2 blocks the call). Denials are
recorded in the child's JSON output and counted in the runner log.

### npm is not a loophole

`npm run <anything>` is **not** permitted. Only three named scripts may run —
`test`, `typecheck`, `lint` — and a script is never allowed merely because the
invocation begins with `npm`.

Each allowed name is **pinned** to the exact command it must still resolve to in
`package.json`:

| Script | Pinned command |
|---|---|
| `test` | `jest` |
| `typecheck` | `tsc --noEmit` |
| `lint` | `eslint .` |

Before allowing the call, the gate reads `package.json` and compares. If a
script body has changed, the call is denied and Build Control must re-pin it.
That closes the indirect path where an allowed name is edited to run something
else. Extra arguments (`npm run lint -- --fix`) are refused, as are
`npm install`, `npm ci`, `npm exec`, `npm publish` and every other subcommand.

`adb`, `gradlew`/`gradle`, Expo, native toolchains, emulators and signing tools
remain denied. They stay denied unless a future authorised prompt explicitly
permits them, which would require a change here first.

### Files the child may never modify

Repository containment is not enough on its own, so mutating tools (`Write`,
`Edit`, `MultiEdit`, `NotebookEdit`) are additionally refused on:

- `.git/` — objects, refs, configuration and hooks; also `.githooks/`,
  `.gitattributes` (content filters execute), `.gitmodules`, `.gitconfig`;
- credentials — `.npmrc`, `.netrc`, `.git-credentials`, `.ssh/`, `.aws/`,
  `.gnupg/`;
- signing material — `*.keystore`, `*.jks`, `*.p12`, `*.pfx`, `*.p8`, `*.pem`,
  `*.key`, `*.cer`, `*.crt`, `*.mobileprovision`, `keystore.properties`,
  `signing.properties`;
- environment secrets — `.env`, `.env.*`, `secrets.json`,
  `google-services.json`, `GoogleService-Info.plist`;
- Claude configuration — `.claude/`, `CLAUDE.md`;
- the control plane itself — `scripts/build-control-*`, `.build-control-local/`
  (except `selftest/`), `build-control/queue/`, `build-control/acceptance/`.

The last group matters most: a child that could rewrite the gate, forge its own
`COMPLETED` record, or author its own next instruction would have no boundary at
all. Changing the runner, the gate or the queue requires an authorised
interactive session, not an unattended one.

Reading remains allowed where it is legitimate — an authorised prompt may read
the queue entry that activated it. Only mutation is refused.

## Self-test

```
powershell -NoProfile -File .\scripts\build-control-selftest.ps1
powershell -NoProfile -File .\scripts\build-control-selftest.ps1 -LiveInvocationCheck
```

The suite is harmless: it builds a scratch git repository with a local bare
origin, a scratch coordination directory and a stub worker, and never operates
on real repository state, the real machine-wide lease, or another application.
`-LiveInvocationCheck` additionally makes one small real model call to confirm
the hardened flag set behaves as documented.

Those redirections are honoured only under the runner's documented test seams —
`-SelfTest`, or the library-load mode the suite uses. In normal unattended
operation every path, remote and executable is the fixed production value and no
environment variable can change it.

## Git safety

The working tree must be clean before any launch. If local `main` is behind
`origin/main`, the runner fast-forwards **only**. It never merges, rebases,
resets, force-updates, discards work, resolves conflicts or rewrites history.

If local and remote have diverged, the runner records `RUNNER BLOCKED` and
`HUMAN ACTION REQUIRED` and does not run Claude.

A failed fetch is treated as a temporary network fault: the runner waits and
retries. Loss of connectivity is never treated as authorisation to run stale
work.

## Human boundaries

The runner cannot authorise production signing, signing keys or their backup,
secret entry, external or cloud accounts and services, architecture changes,
destructive data operations, live-data migration, release acceptance, tags,
public distribution, Play Store actions, machine-wide toolchain changes, product
or scope decisions, weakening device security, or any physical device action.

A queued prompt may describe such a boundary only when Build Control explicitly
authorised it in that prompt. When a run reaches one, the child stops safely and
the report says **HUMAN ACTION REQUIRED**; the runner logs it at level `HUMAN`
and returns to waiting.

The runner never waits indefinitely for a physical action on the Samsung Fold.
Unattended work should stay at source level — types, lint, unit and responsive
tests — with physical device checks batched into a milestone's final acceptance.

## Laptop and network

- The laptop must be plugged in and Windows must stay awake.
- Closing the lid or letting the machine sleep pauses execution; the runner
  resumes its polling loop safely after resume.
- Windows power configuration is never modified automatically.
- Temporary network failure causes a wait and retry, never repository damage.

## Failure handling

A child that exits unsuccessfully is **not** relaunched. The failure is recorded
and the runner waits for a new explicit instruction or recovery decision. A child
that exceeds `-MaxChildMinutes` is stopped — the runner only ever stops its own
child — and the run is recorded as `FAILED`.
