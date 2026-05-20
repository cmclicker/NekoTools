# Release Checklist

Phase 0 is done when every box below is checked.

## Contracts

- [ ] Nine TS contracts exist under `packages/contracts/src/`.
- [ ] Every contract file exports a type whose root has a `version` field.
- [ ] `CONTRACT_VERSION` is pinned at `1`.
- [ ] `packages/contracts/src/__tests__/contracts.test.ts` passes.

## Schemas

- [ ] Nine JSON Schemas exist under `packages/schemas/schemas/`.
- [ ] Every schema declares `"$id"` under `schemas.nekotools.local/`.
- [ ] Every schema declares `version: { const: 1 }`.
- [ ] Every schema has at least one valid fixture and one invalid fixture.
- [ ] `packages/schemas/src/__tests__/schemas.test.ts` passes.

## Runtime

- [ ] `ToolRegistry` rejects duplicate registrations.
- [ ] `ToolRegistry` rejects parsers/exporters not declared in the manifest.
- [ ] `runParser` converts thrown exceptions into error diagnostics.
- [ ] `runExporter` refuses unsupported artifact kinds.
- [ ] `jsonWorkspaceSerializer` round-trips losslessly.
- [ ] `jsonWorkspaceSerializer.deserialize` refuses malformed JSON.
- [ ] `jsonWorkspaceSerializer.serialize` refuses schema-invalid workspaces.
- [ ] `validateManifest` flags features declared as both free and pro.
- [ ] `isFeatureAllowed` blocks Pro features under the free entitlement.

## Offline guard

- [ ] Dependency denylist exists.
- [ ] Import / URL denylist exists.
- [ ] Scanner walks the repo, skipping `node_modules` and build artefacts.
- [ ] Scanner flags banned dependencies.
- [ ] Scanner flags external CDN imports.
- [ ] Scanner flags literal `fetch('https://...')` calls.
- [ ] `pnpm offline-guard` exits non-zero on violations.
- [ ] CI runs `offline-guard.yml`.

## NekoBinary

- [ ] Five parsers: decimal, binary, hex, base64, utf8.
- [ ] Each parser emits structured diagnostics for malformed input
      instead of throwing.
- [ ] Three exporters: JSON, Markdown, plaintext.
- [ ] Manifest passes `validateManifest`.
- [ ] Manifest declares `networkPolicy: 'network-forbidden'`.
- [ ] Manifest declares zero Pro features (Phase 0).
- [ ] End-to-end conformance test passes:
      parser → diagnostic → export → workspace round-trip.

## Documentation

- [ ] `docs/product-doctrine.md`
- [ ] `docs/tool-charter.md`
- [ ] `docs/contract-versioning.md`
- [ ] `docs/artifact-model.md`
- [ ] `docs/offline-policy.md`
- [ ] `docs/monetization-model.md`
- [ ] `docs/open-core-strategy.md`
- [ ] `docs/roadmap.md`
- [ ] `docs/release-checklist.md` (this file)

## Repo hygiene

- [ ] `pnpm install` succeeds with a frozen lockfile.
- [ ] `pnpm typecheck` succeeds.
- [ ] `pnpm test` succeeds.
- [ ] `pnpm lint` succeeds.
- [ ] `pnpm offline-guard` succeeds.
- [ ] `README.md` explains the local-only doctrine and Phase 0 scope.
- [ ] `LICENSE` clarifies trademark + commercial-use clause.

When every box is checked, Phase 0 is complete and Phase 1 (NekoJSON)
can begin.
