import type { Artifact } from '@nekotools/contracts';

import type { LicenseMeta } from './license.js';

/**
 * NekoLicense artifact kinds (namespaced under `license.*`).
 *
 *   `license.parsed` — the result of identifying a pasted LICENSE text:
 *                      detected SPDX id, any explicit SPDX tag, all
 *                      signature matches, and the license's category +
 *                      permissions/conditions/limitations. Heuristic; no
 *                      network.
 */
export const LICENSE_KIND_PARSED = 'license.parsed';

export const ALL_LICENSE_KINDS = [LICENSE_KIND_PARSED] as const;

export type { LicenseMeta } from './license.js';

/** The parsed body of a `license.parsed` artifact. */
export interface LicenseReport {
  readonly primary: string | null;
  readonly spdxTag: string | null;
  readonly matches: readonly string[];
  readonly meta: LicenseMeta | null;
}

export type LicenseParsedArtifact = Artifact<'license.parsed', LicenseReport>;
export type LicenseArtifact = LicenseParsedArtifact;

export const LICENSE_PARSED_EXPORT_KINDS = [LICENSE_KIND_PARSED] as const;
