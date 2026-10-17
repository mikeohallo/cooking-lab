# History rewrites

This repository keeps its record: every commit, in order, with its original
date, and old reports keep their original build dates and APK hashes. Its
history has been rewritten twice, both times for privacy. This note says what
changed, so old commit references still make sense.

## 16 October 2026 — before the repository went public

The project started in a private repository. Before publishing, its history
was rewritten with `git filter-repo` to take out the names of two unrelated
projects, the test phone's serial number and a personal email address
(authors now use GitHub's no-reply address), and the result was published as
this repository. Every commit id changed. The private original is kept and is
never pushed to or from.

Reports written before then cite the private repository's ids. Each one
below was checked against `filter-repo`'s own commit map; the new id is the
commit in this repository today (after the 18 October rewrite too).

| Old id (private) | Id here | Date | Commit |
|---|---|---|---|
| `1e06bbf` | `e2ac608` | 03 Sep 2026 | chore: bootstrap Cooking Lab Android shell |
| `9978d60` | `7f86c1c` | 03 Sep 2026 | chore: establish GitHub build control handoff |
| `9c85480` | `db2779d` | 03 Sep 2026 | chore: add unattended build control runner |
| `643e567` | `dbe7938` | 03 Sep 2026 | chore(build-control): activate runner self-test instruction |
| `97c6d22` | `cda0c6b` | 03 Sep 2026 | fix(build-control): capture the bounded child's exit code reliably |
| `4c34c40` | `e4806f5` | 03 Sep 2026 | chore(build-control): activate runner self-test re-run |
| `bad3c74` | `99f791f` | 03 Sep 2026 | chore(build-control): record runner self-test evidence and stand down the queue |
| `90b717e` | `b156329` | 03 Sep 2026 | docs(build-control): add unattended runner setup report |
| `c455f14` | `84dd467` | 05 Sep 2026 | fix: harden unattended build control runner |
| `a8165a9` | `4ccf6bc` | 05 Sep 2026 | docs(build-control): add runner hardening report |
| `b61f462` | `6997aa0` | 05 Sep 2026 | fix: close unattended runner command boundary |
| `dcf3f08` | `b42c212` | 05 Sep 2026 | chore(build-control): publish runner final controlled trial prompt |
| `b842259` | `60b6d10` | 05 Sep 2026 | chore(build-control): activate runner final controlled trial |
| `e06fe7f` | `7d5fca3` | 05 Sep 2026 | fix(build-control): accept absolute repository paths from file tools |
| `cd8b930` | `fb9ecf1` | 05 Sep 2026 | chore(build-control): re-activate runner final controlled trial |
| `75a473a` | `76506a8` | 05 Sep 2026 | fix(build-control): grant the child CLI permission rules for git and npm |
| `afe508d` | `eebde20` | 05 Sep 2026 | chore(build-control): activate runner final controlled trial (third attempt) |
| `a7ba973` | `fdb9542` | 05 Sep 2026 | chore(build-control): record runner final controlled trial evidence |
| `aeb9276` | `3acde97` | 05 Sep 2026 | chore(build-control): tighten M1 foundation trial prompt |
| `f265f76` | `e15de5e` | 05 Sep 2026 | chore(build-control): activate M1 foundation unattended trial |
| `a34ded9` | `f54708d` | 05 Sep 2026 | feat: establish M1 local data foundation |
| `dd1d1f2` | `559f80d` | 05 Sep 2026 | fix: align M1 foundation with controlled data model |
| `51993b0` | `993e0d0` | 05 Sep 2026 | docs(build-control): add M1 foundation correction report |
| `f831adf` | `0814e96` | 06 Sep 2026 | chore(build-control): stand down completed M1 correction queue |
| `f07d85e` | `d30da91` | 06 Sep 2026 | feat: implement M1 encrypted native persistence |
| `aef6c76` | `8da7f8a` | 06 Sep 2026 | docs(build-control): add M1 native persistence report |
| `fed53aa` | `751862d` | 06 Sep 2026 | fix: harden M1 transaction and photo failure safety |
| `22520e4` | `aab1afa` | 06 Sep 2026 | docs(build-control): add M1 native persistence safety correction report |
| `ce88286` | `3ecf5d0` | 07 Sep 2026 | fix: make M1 photo writes concurrency safe |
| `8a23a36` | `09800d1` | 07 Sep 2026 | docs(build-control): add M1 photo concurrency safety report |
| `1816126` | `35d3f1f` | 07 Sep 2026 | docs(build-control): prepare M2 core local loop specification |
| `5a5032c` | `ab521a0` | 15 Oct 2026 | feat: implement slice 1 — the core local cooking loop |
| `65a1af4` | `7f86218` | 15 Oct 2026 | test: mount the real route tree with expo-router's test renderer |
| `3377cd8` | `ce038c9` | 16 Oct 2026 | docs: launch diagnostic from the Fold |
| `bebf86e` | `8774c89` | 16 Oct 2026 | fix: keep the navigator mounted from launch; restore startup logging; own not-found screen |
| `06a0064` | `bdbe2d4` | 16 Oct 2026 | chore: prepare the repository to go public |
| `29591ab` | `f991229` | 16 Oct 2026 | fix: the routes folder is app/, pinned — not src/app |
| `fd86937` | `e05a350` | 16 Oct 2026 | fix: keep the composer above the keyboard on Android 15+ |

Later the same day, a report commit that named the test phone's serial was
replaced on `main` within minutes (`--force-with-lease`). Since then
`CLAUDE.md`, a pre-commit hook and CI all refuse serial-shaped strings.

## 18 October 2026 — screenshots

An outside review found that one screenshot showed the test phone's whole app
drawer, not just Cooking Lab, and that two others showed other apps'
notification icons in the status bar. In every commit that held them:

- `2026-10-16-icons-app-drawer.png` and `2026-10-16-icons-closeup.png` were
  cropped to the two Cooking Lab icons and their labels;
- `2026-10-16-rebuild-home.png` and `2026-10-16-rebuild-history-all.png` lost
  their status bar;
- a display id written into five report lines became "cover display" (and
  `-d <cover display id>` in the one command).

Nothing else changed: the code in every commit is byte-for-byte what it was.
The 24 commits from 16 October's *launch screen on the Fold* onward got new
ids. Commit messages and files in this repository that cited one of them now
cite its new id.
The old ids aren't listed here: GitHub can still show a rewritten commit by
its old id until its cached copies are cleared, and this page shouldn't point
to them.

`CLAUDE.md` and `build-control/slices/README.md` now say that a screenshot
shows Cooking Lab and nothing else, and that every image is opened and
checked before it is committed.
