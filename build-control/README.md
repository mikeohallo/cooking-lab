# Build Control

> **Status, October 2026 — historical record.** This document, and the
> `acceptance/`, `prompts/`, `queue/`, `reports/`, `runner/` and `specs/`
> folders, describe the milestone / queue / runner process used from September
> to early October 2026, with ChatGPT in the Build Control role. That process is
> retired: Cooking Lab is now built in **slices**, with Claude as architect and
> engineer — see [`slices/README.md`](slices/README.md) for the current roles,
> loop and plan. Everything below is kept unchanged as part of the record.
> The owner's other projects are referred to here as Project A and Project B.

This directory holds the handoff record between implementation and acceptance for
Cooking Lab. It is process documentation only — nothing here affects the
application at build or run time.

## Roles

| Role | Responsibility |
|---|---|
| Mike | Product owner and physical-device tester. Performs any acceptance step that genuinely requires hands on hardware. |
| ChatGPT | Product/technical architect and Build Control authority. Reviews implementation reports and grants acceptance. |
| Claude Code | Implementation engineer. Implements bounded milestones, runs checks and builds, and produces evidence-based reports. |

## Milestone handoff sequence

1. **Implement** the bounded milestone. Do not begin the next milestone.
2. **Commit** the bounded implementation as its own commit.
3. **Write** the implementation report, including the implementation commit hash
   and the evidence gathered (commands run, results, build and device output).
4. **Commit** the report as a small subsequent Build Control/report commit. The
   report is written after the implementation commit so it can quote that hash.
5. **Push** both commits to `origin/main`.
6. **Review.** ChatGPT Build Control reviews the report; Mike performs any
   genuinely required physical or device acceptance.

## Reports

Each milestone implementation produces one Markdown implementation report in
`build-control/reports/`:

```
build-control/reports/M1_Implementation_Report.md
build-control/reports/M2_Implementation_Report.md
...
```

## Acceptance

Accepted milestones are recorded in `build-control/acceptance/`:

```
build-control/acceptance/M0_ACCEPTED.md
build-control/acceptance/M1_ACCEPTED.md
...
```

These files record controlled high-level acceptance information only — status,
acceptance date, implementation commit, verified artefact hashes and a short
outcome statement. They are not a substitute for the implementation report.

## Unattended operation

Milestone work may also be carried out unattended by a local runner. This does
not change any of the roles, the handoff sequence or the acceptance rules above —
it only changes who types the prompt.

```
ChatGPT Build Control commits a controlled prompt to GitHub
  -> activates exactly one queue instruction
  -> the local Cooking Lab runner detects and validates it
  -> the runner launches one bounded, non-interactive Claude Code child
  -> Claude performs only the authorised work, commits it,
     writes its Build Control report and commits that, then pushes origin/main
  -> ChatGPT Build Watch reviews the report
```

The runner **never invents work**. It can execute only a tracked Markdown prompt
under `build-control/prompts/` that a queue commit has explicitly activated, and
the queue file itself never carries commands.

| Path | Purpose |
|---|---|
| `build-control/prompts/` | tracked, executable Build Control prompts |
| `build-control/queue/NEXT_RUN.json` | the single active instruction (zero or one) |
| `build-control/queue/NEXT_RUN.schema.json` | the queue schema |
| `build-control/runner/` | runner and machine-wide protocol documentation |
| `scripts/build-control-runner.ps1` | the runner |
| `scripts/build-control-gate.ps1` | deny-by-default permission gate for the child |

Build Control publishes work in **two commits**: commit A adds the prompt, then
commit B activates `NEXT_RUN.json` with `expected_base_commit` set to A. The
runner verifies that B's first parent is A and that the prompt's git blob
SHA-256 matches `prompt_sha256`, so an activation always names the exact prompt
revision it authorises.

Unattended runs are additionally bounded by machine-wide rules that keep Cooking
Lab from colliding with Project A or with Mike working manually — a shared
execution lease, a global pause switch, and manual-Claude-session detection.

- Operating instructions, queue protocol, duplicate protection, permission model
  and git safety: **[`runner/README.md`](runner/README.md)**
- Machine-wide cross-application coordination:
  **[`runner/CROSS_APP_PROTOCOL.md`](runner/CROSS_APP_PROTOCOL.md)**

Pause all unattended application builds at any time by creating
`C:\Projects\.app-build-control\PAUSE_UNATTENDED`; resume by deleting it.

## Rules

- **Pushing is not acceptance.** No milestone is considered accepted merely
  because it was implemented, reported or pushed to `origin/main`. Acceptance is
  a Build Control decision recorded in `build-control/acceptance/`.
- **Release tags require explicit Build Control authorisation.** Do not create
  tags or releases on your own initiative.
- **Never commit** secrets, API keys, production signing material, keystores,
  APK or AAB binaries, or generated native/build artefacts (`android/`, `ios/`,
  `node_modules/`, build outputs). This holds unless a future controlled
  decision explicitly says otherwise. Generated native directories are build
  output under Continuous Native Generation, not authoritative configuration.
- **Report honestly.** Record what was actually observed. Never claim a check,
  build or physical device state that was not genuinely verified; state clearly
  what remains pending.
- **Unattended runs obey the same boundaries.** The runner may never authorise
  production signing, signing keys, secrets, external or cloud accounts and
  services, architecture or scope decisions, destructive data operations,
  release acceptance, tags, public distribution, Play Store actions,
  machine-wide toolchain changes or any physical device action. When a run
  reaches one of these it stops and reports **HUMAN ACTION REQUIRED**.
