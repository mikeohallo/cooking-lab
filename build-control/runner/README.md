# Cooking Lab — unattended Build Control runner

Infrastructure only. Nothing here affects Cooking Lab at build or run time.

| Component | Path |
|---|---|
| Runner | `scripts/build-control-runner.ps1` |
| Permission gate | `scripts/build-control-gate.ps1` |
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
  "allow_unattended": true
}
```

To stand the queue down, set `allow_unattended` to `false`. There is never more
than one pending instruction.

## Duplicate-execution protection

An instruction is identified by `instruction_id` + `prompt_sha256` +
`expected_base_commit`, recorded in `.build-control-local/state/instructions.json`.

| Recorded status | Meaning | Next cycle |
|---|---|---|
| `STARTED` | written immediately **before** the child launches | not repeated; moved to `BLOCKED_RECOVERY` and reported as HUMAN ACTION REQUIRED |
| `COMPLETED` | child exited and the repository was assessed | skipped |
| `FAILED` | child failed, timed out, or reported an error | skipped; a new instruction is required |
| `BLOCKED_RECOVERY` | an interrupted run awaiting a human decision | skipped |

Merely *seeing* an instruction never consumes it. Reusing an `instruction_id`
for a different prompt or base commit is refused outright.

After a crash or restart, a `STARTED` instruction is **never** blindly repeated —
the previous child may already have committed or pushed. It is held for a human
decision.

## Permission model

The child is launched with:

```
claude -p --output-format json --permission-mode acceptEdits
       --setting-sources user --settings <generated> --tools "Bash,Read,Write,Edit,Glob,Grep,TodoWrite"
```

`--dangerously-skip-permissions` and `--permission-mode bypassPermissions` are
**not used**, and the runner is not a wrapper for unrestricted shell access.

This matters, because of a property of the CLI that was verified rather than
assumed (CLI 2.1.240): in `-p` mode there is no terminal to answer a permission
prompt, so a tool call that would normally prompt is simply **allowed** — even
under `--permission-mode manual`. Permission modes alone therefore do not bound
an unattended child, and a deny list alone is only a blacklist.

`scripts/build-control-gate.ps1` closes that gap. It is a `PreToolUse` hook, so
it is enforced by the runner rather than decided by the model, and it is
**deny-by-default**:

- `--tools` limits the child to seven built-in tools; nothing else exists for it
  (no web access, no subagents).
- Every `Bash` command is split on `;`, `&&`, `||` and `|`, and **every** segment
  must match the allowlist — an allowed prefix cannot smuggle a tail.
- Hard denials always win: destructive git, history rewrite, tagging, force push,
  signing tools, `adb`/device access, outbound network, global toolchain changes,
  machine persistence, references to another application repository, nested
  unattended Claude launches, and any permission bypass.
- Every file-touching tool call must resolve inside this repository. Other
  application repositories are denied explicitly, by absolute path.
- An internal gate error fails **closed** (exit 2 blocks the call).

Denials are recorded in the child's JSON output and counted in the runner log.

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
