import type { ContractVersion } from './version.js';

/**
 * Offline Policy — every tool declares its relationship with the network.
 *
 * The product doctrine says no NekoTools feature may require an internet
 * connection for its primary function. This contract encodes that as a
 * machine-checkable property of each tool's manifest. The offline-guard
 * package enforces it in CI.
 */
export interface OfflinePolicy {
  readonly version: ContractVersion;
  readonly networkPolicy: NetworkPolicy;
  readonly dataCollection: 'none';
  readonly requiresAccount: false;
  readonly requiresInternetForCoreFeatures: false;
  readonly offlineSupported: true;
  readonly notes?: string;
}

/**
 * - "network-forbidden": the tool MUST NOT touch the network. Default.
 * - "explicit-import-only": the tool analyzes data the user pasted or
 *   imported. It MUST NOT fetch live data. Reserved for network-adjacent
 *   tools (NekoHeaders, NekoDNS, NekoTLS, NekoCORS).
 * - "optional-user-initiated-network": reserved for a hypothetical future
 *   tier. Phase 0 forbids this value in the manifest schema.
 */
export type NetworkPolicy =
  | 'network-forbidden'
  | 'explicit-import-only'
  | 'optional-user-initiated-network';

export const DEFAULT_OFFLINE_POLICY: OfflinePolicy = {
  version: 1,
  networkPolicy: 'network-forbidden',
  dataCollection: 'none',
  requiresAccount: false,
  requiresInternetForCoreFeatures: false,
  offlineSupported: true,
};
