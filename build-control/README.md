# Build Control

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
