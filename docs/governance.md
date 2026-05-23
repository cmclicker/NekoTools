# Governance

How work moves through this repo.

## Rules

1. **No direct commits to `main`.** All work happens on a branch.
2. **Every change ships via a PR.** No exceptions for "small" changes.
3. **Phase advancement requires auditor approval.** A phase moves from
   active to complete only after the auditor reviews the PR diff,
   verifies CI status, and explicitly signs off.
4. **CI must be green** on a PR before merge. If CI is red, the PR is
   not mergeable — fix the cause, not the symptom.
5. **Documentation updates ship with the change that needs them.**
   Charter changes, roadmap shifts, license language tweaks, and new
   `offline-guard:allow` markers all live in the same PR as the code
   they justify.
6. **`docs/roadmap.md` is the canonical status source.** Current
   implementation status and the work queue live there; every other
   document defers to it (see "Source of truth" below).

## Source of truth

`docs/roadmap.md` is the **canonical** current-status and implementation
roadmap source for NekoTools. Its status board and Active Next Queue are
authoritative; any other document that describes implementation status
defers to the roadmap, and the roadmap wins on conflict.

- **PR bodies must declare status impact against `docs/roadmap.md`** —
  one of: `none`, `implementation-added`, `implementation-removed`,
  `roadmap-advanced`, `roadmap-amended`, or `documentation-only`.
- **Any PR that changes implementation status must update
  `docs/roadmap.md`** in the same PR (status board and/or Active Next
  Queue). This is Rule 5 applied to status.
- A generated machine-readable status file (`docs/project-status.json`)
  and generated status blocks are **not required** for this repo. They
  may be adopted later only with explicit owner authorization.
- The Validation Layer **must not block merge solely because
  `docs/project-status.json` is absent.** Roadmap-as-canonical is the
  ratified model; the absence of a generated-status workflow is not a
  defect and is not a merge blocker.

### Documentation drift policy

- **No implementation-status claim outside `docs/roadmap.md` may
  contradict roadmap state.** `README.md` and per-tool docs may
  *summarize* status, but where they disagree with the roadmap, the
  roadmap is correct.
- **Any detected status conflict must be corrected before merge
  authorization** — fix the contradicting document (or the roadmap, if
  the roadmap is the stale side) in the same PR.

### Queued enhancement (not yet implemented)

A future, lightweight governance check may be added to compare
open/merged PR references against `docs/roadmap.md` — flagging stale
`In review` / `Next` / `Done` markers and dangling PR-number references.
This is deliberately **not built here**; it is a future enhancement and
is **not** a merge blocker for any current PR.

## Branching convention

| Pattern                                 | Use for                                           |
| --------------------------------------- | ------------------------------------------------- |
| `phase-N/<short-topic>`                 | Phase-scoped work (e.g. `phase-1/nekojson-charter`). |
| `fix/<short-topic>`                     | Bug fixes outside the active phase.               |
| `docs/<short-topic>`                    | Documentation-only changes.                       |
| `chore/<short-topic>`                   | Repo hygiene (deps, configs, CI).                 |

Branches are deleted after merge.

## PR report shape

Every PR description must include this block so the auditor can verify
without reading the full diff:

```
Branch:          phase-1/nekojson-charter
Commit SHA:      <short SHA at the tip>
Changed files:   <list>
Commands run:    pnpm typecheck / pnpm test / pnpm offline-guard
CI status:       <green / red / pending>
Known issues:    <list, or "none">
Scope:           <one sentence: what this PR is and is not>
```

## What is allowed direct-to-main

Effectively nothing. Even single-character docs typo fixes go through
a `docs/<topic>` PR. The auditor reserves the right to mark a fast-path
exception in writing; without that exception, every change is a PR.

## What the auditor reviews

- The PR diff.
- Changed files vs the declared scope.
- CI / workflow check status.
- Whether docs match code.
- Architectural compliance with the doctrine (offline, open-core,
  contracts, charter gate).
- Whether the PR honors the [tool charter](tool-charter.md) reuse gate
  if it adds or modifies a tool.

## What the auditor does *not* review

- Local commit history before the PR.
- Transcript summaries of work.
- Verbal claims that tests passed.

Anything that is not visible in the PR or in CI does not count toward
approval.

## Phase advancement

A phase moves to "complete" when:

1. Its acceptance criteria in [release-checklist.md](release-checklist.md)
   are all PASS with evidence.
2. The final phase PR is merged via the PR flow above.
3. The auditor has explicitly approved phase advancement in writing.

A new phase does not start implementation work until the previous
phase is complete and a charter PR for the new phase has been merged.

## Post-merge default behavior

After every merge into `main`, the assistant / dev agent **must**:

1. `git checkout main && git pull --ff-only origin main`
2. `git fetch --prune origin` to drop the merged branch locally.
3. Read [`roadmap.md`](roadmap.md)'s **Active Next Queue**.
4. Identify the row whose `Status` is `Next` (or the lowest-numbered
   `Queued` row if `Next` was not advanced in the previous closeout).
5. Propose the branch name and PR scope for that item directly.
6. Begin the work — only ask the user for an override if the queue is
   genuinely ambiguous (multiple equally-valid forks, a strategic
   decision the queue doesn't capture, or a user message that
   conflicts with the queue).

Asking "what's next?" after a clean merge is a workflow bug. The
roadmap queue is the answer. If the queue is stale, the *first*
follow-up PR is always a small docs-only "roadmap closeout" PR that
advances the queue, before any feature work begins.

This applies across sessions. Treat it as the standing default.

## Enforcement

This document is the rulebook. Branch protection on `main` is the
mechanical enforcement and should be configured to require PR review +
CI green before merge. Until branch protection is configured, the rules
above are enforced by review and by this document.
