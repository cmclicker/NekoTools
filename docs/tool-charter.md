# Tool Charter

Every proposed tool must answer these questions before any code is
written. The charter is the reuse gate: if a tool cannot answer them, it
is not yet a tool — it is an idea, and ideas wait.

## The 10 questions

1. **Artifact kind.** Which artifact kind does this tool inspect or produce?
2. **Parser.** Which parser contract does it use or extend?
3. **Diagnostic.** Which diagnostic contract does it use or extend?
4. **Export.** Which export contract does it use or extend?
5. **Graph / table / matrix primitive.** Which projection does it use, or
   does it explicitly opt out?
6. **Workspace.** Which workspace object does it persist?
7. **Reuse.** Which existing package does it reuse instead of duplicating?
8. **Offline policy.** What is its offline policy? (default:
   `network-forbidden`)
9. **Entitlements.** What is free? What is Pro? What is out of both?
10. **Out of scope.** What is explicitly *not* this tool's job?

A tool that cannot answer 1–7 has no architecture and must wait.
A tool that cannot answer 8 violates the product doctrine and is rejected.
A tool that cannot answer 9–10 has no business model and produces scope
creep.

## Where the answers live

Every tool's answers are encoded in its `ToolManifest`. The manifest is
schema-validated at registration time. CI rejects a manifest that
violates the rules.

## How to propose a new tool

1. Open a PR adding `docs/tools/<id>.md` answering the 10 questions in prose.
2. Add a draft `ToolManifest` (no implementation yet).
3. Run `pnpm test` — the manifest schema must pass.
4. Get charter review before implementation begins.

## What "reuse" means in practice

A new tool fails the gate if it:

- Defines its own ad-hoc artifact shape instead of extending the
  Artifact contract.
- Re-implements parsing/diagnostic/export primitives that already exist.
- Invents a new workspace format.
- Bypasses the runtime registry.
- Adds a network dependency to the core product.

The platform exists so the 20th tool is days of work, not months.
Skipping the gate is the failure mode that breaks that property.
