/**
 * Every contract in NekoTools ships with a `version` field.
 *
 * Versioning policy (see docs/contract-versioning.md):
 *   - patch  : adds optional fields; existing tools keep working.
 *   - minor  : adds new artifact kinds, diagnostics, exports, capabilities.
 *   - major  : changes required fields or field meanings; requires migration.
 *
 * Phase 0 ships at version 1 across every contract. The field exists from
 * day one so changes are never silent.
 */
export const CONTRACT_VERSION = 1 as const;
export type ContractVersion = typeof CONTRACT_VERSION;
