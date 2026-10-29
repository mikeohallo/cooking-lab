# Runner setup self-test — evidence

Date: 3 September 2026. Machine: `MSI`. Claude Code CLI `2.1.240`.

No Milestone 1 work was performed. No Cooking Lab application or runtime file was
changed. Project A was not read, written, started or inspected.

All runs used `-Once -SelfTest` except test F, which deliberately used normal
mode. The `-SelfTest` allowance ignores only the Claude Code CLI process ids
present when the runner starts (here, pid `30236` — the interactive session that
set the runner up); see `CROSS_APP_PROTOCOL.md` §5.

## A. Normal queue path

Activation followed the two-commit protocol: commit `97c6d22` published the
prompt, commit `4c34c40` activated `NEXT_RUN.json` with
`expected_base_commit = 97c6d22`, and `4c34c40` was `HEAD`.

```
[INFO] queue validated: instruction 'runner-self-test-002' (RUNNER) -> build-control/prompts/RUNNER_SELF_TEST.md
[INFO] acquired machine-wide application lease (cooking-lab, pid 9540)
[RUN]  launching bounded Claude child for 'runner-self-test-002'
[INFO] child invocation: claude -p --output-format json --permission-mode acceptEdits
       --setting-sources user --settings "...\.build-control-local\claude-settings.json"
       --tools "Bash,Read,Write,Edit,Glob,Grep,TodoWrite"
[RUN]  child Claude pid 800
[RUN]  child Claude exited with code 0
[WARN] the permission gate denied 1 tool call(s) during this run
[RUN]  instruction 'runner-self-test-002' recorded as COMPLETED (exit 0)
[INFO] released machine-wide application lease
```

**Child exit code: 0.** Child JSON: `is_error: false`, `num_turns: 6`,
`session_id: 423af068-bbcd-40aa-8a83-1f96535998e1`.

The child proved it read the exact prompt by returning the prompt's verification
token as its final message:

```
SELF_TEST_OK COOKING-LAB-RUNNER-SELFTEST-7F3A9C21
```

The gate probe required by the prompt was refused in flight and recorded in the
child's own `permission_denials`:

```
tool: Bash   command: adb devices
reason: Cooking Lab Build Control gate: physical device operation
        (human authorisation required) is not permitted unattended -> adb devices
```

The child's evidence file is at
`.build-control-local/selftest/RUNNER_SELF_TEST_EVIDENCE.md` (untracked by
design). It records repository top level `<repo>`, commit
`4c34c401ad796177e2f91632686b9891b6fbb354`, a clean working tree,
`instruction_id: runner-self-test-002`, and the quoted gate refusal.

### A defect the self-test found and fixed

The first run (`runner-self-test-001`, commits `9c85480` / `643e567`) did
everything correctly — `is_error: false`, token returned, gate probe refused,
tree clean — but the runner recorded it as `FAILED`, because
`Start-Process -PassThru` discards the process handle on exit and `$proc.ExitCode`
read back as `$null`.

Fixed in commit `97c6d22`: the handle is touched while the child is alive, the
process is refreshed before reading, and an unreadable exit code is treated as
unknown (falling back to the child's reported outcome) instead of as failure. A
genuinely unknown outcome still fails closed.

The `FAILED` record for `runner-self-test-001` is deliberately retained in local
state as evidence.

## B. Duplicate protection

Re-running the runner with the same activated instruction:

```
[INFO] queue validated: instruction 'runner-self-test-002' (RUNNER) -> ...
[INFO] instruction 'runner-self-test-002' already completed at 2026-09-03T11:03:20Z
[INFO] runner stopped
```

No child was launched and no lease was acquired. Local state after both runs:

| instruction_id | status | exit code | notes |
|---|---|---|---|
| `runner-self-test-001` | `FAILED` | unreadable | the defect above; never retried automatically |
| `runner-self-test-002` | `COMPLETED` | `0` | `child_is_error=False`, `permission_denials=1`, HEAD unchanged |

## C. Cross-application lease (simulated `project-a`)

A live placeholder process (pid `25116`) stood in as the foreign owner. **My
Recovery was never started, read or touched** — only a lease file naming
`project-a` was written to the shared directory.

```
[BLOCK] machine-wide application lease is held by 'project-a' (pid 25116); waiting
```

Cooking Lab refused to launch. Afterwards the foreign lease was still present,
still owned by `project-a`, and its owner process was still alive — the runner
neither stole nor removed it, and never signalled the process.

### Stale-lease rule (both conditions required)

| Owner process | Heartbeat age | Result |
|---|---|---|
| alive (pid 25116) | 60 minutes | **not stale** — `[BLOCK] lease is held by 'project-a'`; lease left intact |
| dead | 60 minutes | stale — `[WARN] ... process gone and heartbeat older than 15 min; reclaiming` |

Elapsed time alone never released a live lease.

## D. Global pause

With `<coordination folder>\PAUSE_UNATTENDED` present:

```
[BLOCK] unattended work is paused (<coordination folder>\PAUSE_UNATTENDED present); waiting
```

No lease was acquired and no child was launched. The runner did **not** delete
the pause file; the self-test removed only the file it had created itself.

## E. Lease acquire and release

Across the successful run: lease absent before → `acquired machine-wide
application lease (cooking-lab, pid 9540)` → `released machine-wide application
lease` → lease absent after. Every blocked run above ended with no lease file
present, so nothing was ever left held.

## F. Manual Claude Code protection

Run in **normal mode** (no `-SelfTest`) while an interactive Claude Code session
was live:

```
[BLOCK] another Claude Code session is running (pid 30236); manual work has priority - not starting Cooking Lab
```

The runner did not launch, did not interact with that session and did not kill
it. Eight Claude **desktop** processes were running at the same time and were
correctly ignored — they are not Claude Code (see `CROSS_APP_PROTOCOL.md` §5).

Process enumeration failure is handled by declining to start; that branch is
fail-safe by construction and was not artificially induced.

## G. Application integrity

Files changed since the M0-accepted commit `9978d60`:

```
.gitignore
build-control/README.md
build-control/prompts/RUNNER_SELF_TEST.md
build-control/queue/NEXT_RUN.json
build-control/queue/NEXT_RUN.schema.json
build-control/runner/CROSS_APP_PROTOCOL.md
build-control/runner/README.md
scripts/build-control-gate.ps1
scripts/build-control-runner.ps1
```

`git diff --stat 9978d60 HEAD` restricted to `app/`, `src/`, `__tests__/`,
`app.config.ts`, `app.variants.json`, `package.json`, `package-lock.json`,
`babel.config.js`, `jest.config.js`, `jest.setup.ts`, `eslint.config.js`,
`tsconfig.json` and `README.md` returned **no output**: no application, product
or runtime file was touched.

Working tree clean. No tags exist. Nothing under `.build-control-local/` is
tracked.

## Permission gate unit tests

The gate was also exercised directly with 30 synthetic `PreToolUse` events
before it was wired into the runner: **30 passed, 0 failed.**

Allowed: `git status`, `git log`, `npm test`, `npx tsc --noEmit`, `git add`,
`git commit`, `git push origin main`, `cat`, and `Write`/`Edit` to paths inside
the repository.

Denied: `rm -rf`, `git status && curl ...` (tail smuggling after an allowed
prefix), `git log | python evil.py`, `adb devices`, any reference to
`<other app repo>`, `git push --force`, `git tag`, `git reset --hard`,
`git rebase`, an unknown binary, `keytool`, `npm install -g`, `schtasks`, a
nested `claude -p`, reads of the shared coordination directory, redirection to
an absolute path, and `Write`/`Edit`/`Read` targeting another application
repository, a `..` traversal, or any path outside the repository.

## Queue state after the self-test

`build-control/queue/NEXT_RUN.json` has been stood down to
`allow_unattended: false`, so the self-test cannot relaunch. Three independent
mechanisms now prevent a repeat: the stood-down flag, the local `COMPLETED`
record, and the activation-protocol check (the stand-down commit means the
activation commit is no longer `HEAD`). The queue mechanism itself is intact and
ready for the next Build Control instruction.
