# Machine-wide unattended build coordination protocol

This document describes the coordination rules that let more than one
application on this machine run unattended Claude Code work without ever
colliding with each other, or with Mike working manually.

It is deliberately **implementation-neutral**. Cooking Lab implements it today;
Project A or any future application can adopt the same rules later without
changing anything here. Adopting it requires no change to Cooking Lab.

> Nothing in this document has been applied to Project A. Cooking Lab does not
> read, write or inspect any other application repository.

## 1. The shared directory

```
C:\Projects\.app-build-control\
```

This directory sits outside every application repository. It is **local only**
and must never be committed to any repository, and must never hold GitHub
credentials, Claude credentials, API keys or tokens.

It holds exactly two things:

| Path | Meaning |
|---|---|
| `app.lock.json` | the machine-wide application execution lease (present = held) |
| `PAUSE_UNATTENDED` | if present, no application may begin unattended work |

The Cooking Lab runner creates the directory on first use if it does not exist.

## 2. Application identifiers

Each participating application uses one stable identifier:

| Application | Identifier |
|---|---|
| Cooking Lab | `cooking-lab` |
| Project A | `project-a` *(reserved; not yet implemented)* |

## 3. The execution lease

Only one application may run unattended work at a time. Ownership is expressed
by the presence of `app.lock.json`:

```json
{
  "app": "cooking-lab",
  "pid": 24596,
  "child_pid": 21156,
  "instruction_id": "runner-self-test-001",
  "acquired_utc": "2026-09-03T10:55:41Z",
  "heartbeat_utc": "2026-09-03T10:58:11Z",
  "host": "MIKE-LAPTOP",
  "repo": "C:\\Projects\\cooking-lab"
}
```

Required fields are `app`, `pid`, `acquired_utc` and `heartbeat_utc`.
`instruction_id` is required where the owner is executing a queued instruction.
`child_pid` records the bounded worker process while one is running.

### Acquisition must be atomic

The lease is acquired by creating the file with *create-new* semantics, so two
runners racing cannot both succeed:

```powershell
[System.IO.File]::Open($LockFile, [System.IO.FileMode]::CreateNew,
                       [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
```

An owner refreshes `heartbeat_utc` at least every 30 seconds while it holds the
lease, and deletes the file to release it.

### Stale leases

A lease may be treated as stale **only when both** of the following hold:

1. the process recorded in `pid` no longer exists; **and**
2. `heartbeat_utc` is older than 15 minutes.

Elapsed time alone never makes a live lease stale. A running owner keeps its
lease however long its work takes.

### Absolute prohibitions

No participating application may ever:

- kill, signal or interfere with another application's process;
- take over a lease whose owner process is still alive;
- modify another application's repository;
- redirect another application's Claude session to its own work.

If the lease is held by someone else, the correct behaviour is to **wait and
retry**.

## 4. The pause switch

```
C:\Projects\.app-build-control\PAUSE_UNATTENDED
```

If this file exists, no application may begin unattended work. Runners keep
polling and waiting; they do not exit and do not queue up work to burst through
afterwards.

Mike owns this file. **No runner may create or delete it automatically.** The
one exception is a runner self-test, which may create it to prove the check
works and must then remove only the file it created itself.

This is the machine-wide emergency and manual-work stop.

## 5. Manual work has priority

Before acquiring the lease, a runner must conservatively check for an existing
**Claude Code CLI** process that it did not start. If one exists, Mike may be
working manually — on Project A or anything else — so the runner must not
start, must not interact with that process, and must simply wait.

### Distinguishing Claude Code from Claude Desktop

On Windows both the Claude desktop application and the Claude Code CLI run as
`claude.exe`. They must not be confused, or a runner would either never start or
would ignore a genuine manual session.

| Process | Executable path | Treat as manual session? |
|---|---|---|
| Claude desktop app | `...\WindowsApps\Claude_*\app\claude.exe` | **No** |
| Claude Code CLI | `...\Anthropic.ClaudeCode*\claude.exe`, or a path containing `ClaudeCode` / `.claude` / `claude-code` | **Yes** |

A runner must also be able to tell its own bounded child apart from an unrelated
session. Cooking Lab does this by process id and by parent process id.

If process enumeration fails for any reason, the runner must treat that as
"a manual session may exist" and decline to start. It must fail safe.

### Self-test allowance

A runner setup self-test necessarily runs from inside an existing Claude Code
session, so the check would always block it. The narrow allowance is:

- it exists **only** in explicit self-test mode (`-SelfTest`);
- it ignores **only** the specific process ids captured at runner start;
- any Claude Code process that appears later still blocks the run;
- it never applies to normal unattended operation.

## 6. Ordering

Every cycle performs these checks in this order, and stops at the first failure:

1. no conflicting instance of this runner is already live;
2. `PAUSE_UNATTENDED` is absent;
3. no foreign Claude Code CLI session is running;
4. `app.lock.json` is absent, or provably stale by the rule in §3;
5. the repository is on its expected branch, remote and is clean;
6. the queue holds exactly one valid, not-yet-consumed instruction;
7. **then** acquire the lease atomically.

After acquiring the lease, the pause switch and the foreign-session check are
re-tested once more, because either may have changed during validation. If
either now blocks, the runner stands down and releases the lease.

The lease is released only after the bounded child has exited **and** the
repository state has been assessed.

## 7. Adopting this protocol in another application

A new participant needs only to:

1. choose a stable application identifier;
2. implement §3 acquisition, heartbeat, release and the two-condition stale rule;
3. honour `PAUSE_UNATTENDED`;
4. implement §5 manual-session detection, failing safe;
5. never touch another application's processes, leases or repository.

Nothing in the shared directory is application-specific, so no coordination
change is required when a new participant joins.
