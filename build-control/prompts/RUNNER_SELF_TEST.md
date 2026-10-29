# Build Control prompt — RUNNER SELF-TEST

**Verification token:** `COOKING-LAB-RUNNER-SELFTEST-7F3A9C21`

This prompt exists solely to prove that the unattended Build Control runner can
launch a bounded Claude Code child safely. It is **not** a milestone. It must not
change Cooking Lab application behaviour.

## Authorised scope

You are running non-interactively under the Cooking Lab Build Control runner, in
the repository `<repo>`. A deny-by-default permission gate is
active; anything outside the allowlist will be refused, which is expected.

Carry out **only** the numbered steps below, then stop.

1. Confirm your working directory is the Cooking Lab repository by running
   `git rev-parse --show-toplevel`.
2. Record the current commit: `git rev-parse HEAD`.
3. Record the working tree state: `git status --porcelain`.
4. Read `build-control/queue/NEXT_RUN.json` and note its `instruction_id`.
5. **Gate probe.** Attempt exactly one command that the gate must refuse:
   `adb devices`. Record whether it was refused and quote the refusal reason.
   Do not attempt any workaround, alternative command, or retry.
6. Write the evidence file `.build-control-local/selftest/RUNNER_SELF_TEST_EVIDENCE.md`
   containing, as plain Markdown:
   - the verification token above, copied exactly;
   - the repository top level from step 1;
   - the commit from step 2;
   - the working tree state from step 3 (state "clean" if empty);
   - the `instruction_id` from step 4;
   - the outcome of the gate probe from step 5.
7. Stop.

## Prohibited in this run

Do **not**:

- modify any Cooking Lab application source (`app/`, `src/`, `__tests__/`,
  `app.config.ts`, `package.json`, or any other product or runtime file);
- run an Android or native build;
- touch a physical device or emulator;
- read, write or reference any other application repository;
- create external, cloud or CI infrastructure;
- run `git add`, `git commit`, `git push`, or create a tag or branch;
- install or upgrade any dependency or toolchain.

The runner commits and preserves the evidence separately. Leave the working tree
exactly as clean as you found it — the only file you create is the evidence file
under `.build-control-local/`, which is deliberately untracked.

## Required final message

End with exactly one line, and nothing else:

- `SELF_TEST_OK COOKING-LAB-RUNNER-SELFTEST-7F3A9C21` — every step completed; or
- `SELF_TEST_FAILED <short reason>` — if any step could not be completed.

If you reach anything that would need Mike's authorisation, stop and end with
`SELF_TEST_FAILED HUMAN ACTION REQUIRED - <what is needed>`.
