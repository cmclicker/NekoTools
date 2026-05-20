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

## Enforcement

This document is the rulebook. Branch protection on `main` is the
mechanical enforcement and should be configured to require PR review +
CI green before merge. Until branch protection is configured, the rules
above are enforced by review and by this document.
