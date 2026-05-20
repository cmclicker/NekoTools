import type { OfflinePolicy } from './offline-policy.contract.js';
import type { ContractVersion } from './version.js';

/**
 * Tool Manifest — every tool's self-description.
 *
 * The runtime registers tools by manifest. The manifest declares what
 * artifacts the tool produces, what exporters it ships, what its offline
 * policy is, and what is free vs Pro. The reuse gate (see
 * docs/tool-charter.md) is enforced against this shape.
 */
export interface ToolManifest {
  readonly version: ContractVersion;
  readonly id: string;
  readonly name: string;
  readonly toolVersion: number;
  readonly summary: string;
  readonly artifactKinds: readonly string[];
  readonly parsers: readonly string[];
  readonly exporters: readonly string[];
  readonly graphProjectors?: readonly string[];
  readonly offlinePolicy: OfflinePolicy;
  readonly capabilities: ToolCapabilities;
  readonly entitlements: ToolEntitlements;
  readonly outOfScope: readonly string[];
}

export interface ToolCapabilities {
  readonly canSaveWorkspace: boolean;
  readonly canExport: boolean;
  readonly canDiff: boolean;
  readonly canProjectGraph: boolean;
}

/**
 * Declares which features are free and which require a Pro entitlement.
 * The actual Pro implementation is NOT in the public repo — see
 * docs/open-core-strategy.md.
 */
export interface ToolEntitlements {
  readonly free: readonly string[];
  readonly pro: readonly string[];
}
