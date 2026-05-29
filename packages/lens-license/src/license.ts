/**
 * Self-contained license detector: match pasted LICENSE text against a set
 * of well-known license signatures and honor an explicit
 * `SPDX-License-Identifier` tag. Heuristic phrase matching — not a
 * cryptographic license fingerprint. No deps, no network.
 */

export type LicenseCategory = 'permissive' | 'copyleft' | 'weak-copyleft' | 'public-domain';

export interface LicenseMeta {
  readonly spdxId: string;
  readonly name: string;
  readonly category: LicenseCategory;
  readonly permissions: readonly string[];
  readonly conditions: readonly string[];
  readonly limitations: readonly string[];
}

const COMMERCIAL = 'commercial use';
const MODIFY = 'modification';
const DISTRIBUTE = 'distribution';
const PRIVATE = 'private use';
const PATENT = 'patent use';
const NOTICE = 'license and copyright notice';
const STATE_CHANGES = 'state changes';
const DISCLOSE = 'disclose source';
const SAME_LICENSE = 'same license';
const NO_LIABILITY = 'liability';
const NO_WARRANTY = 'warranty';

export const LICENSE_META: Readonly<Record<string, LicenseMeta>> = {
  MIT: { spdxId: 'MIT', name: 'MIT License', category: 'permissive', permissions: [COMMERCIAL, MODIFY, DISTRIBUTE, PRIVATE], conditions: [NOTICE], limitations: [NO_LIABILITY, NO_WARRANTY] },
  ISC: { spdxId: 'ISC', name: 'ISC License', category: 'permissive', permissions: [COMMERCIAL, MODIFY, DISTRIBUTE, PRIVATE], conditions: [NOTICE], limitations: [NO_LIABILITY, NO_WARRANTY] },
  'Apache-2.0': { spdxId: 'Apache-2.0', name: 'Apache License 2.0', category: 'permissive', permissions: [COMMERCIAL, MODIFY, DISTRIBUTE, PRIVATE, PATENT], conditions: [NOTICE, STATE_CHANGES], limitations: [NO_LIABILITY, NO_WARRANTY, 'trademark use'] },
  'BSD-2-Clause': { spdxId: 'BSD-2-Clause', name: 'BSD 2-Clause "Simplified" License', category: 'permissive', permissions: [COMMERCIAL, MODIFY, DISTRIBUTE, PRIVATE], conditions: [NOTICE], limitations: [NO_LIABILITY, NO_WARRANTY] },
  'BSD-3-Clause': { spdxId: 'BSD-3-Clause', name: 'BSD 3-Clause "New" or "Revised" License', category: 'permissive', permissions: [COMMERCIAL, MODIFY, DISTRIBUTE, PRIVATE], conditions: [NOTICE], limitations: [NO_LIABILITY, NO_WARRANTY] },
  'MPL-2.0': { spdxId: 'MPL-2.0', name: 'Mozilla Public License 2.0', category: 'weak-copyleft', permissions: [COMMERCIAL, MODIFY, DISTRIBUTE, PRIVATE, PATENT], conditions: [DISCLOSE, NOTICE, SAME_LICENSE], limitations: [NO_LIABILITY, NO_WARRANTY, 'trademark use'] },
  'LGPL-3.0': { spdxId: 'LGPL-3.0', name: 'GNU Lesser General Public License v3.0', category: 'weak-copyleft', permissions: [COMMERCIAL, MODIFY, DISTRIBUTE, PRIVATE, PATENT], conditions: [DISCLOSE, NOTICE, SAME_LICENSE, STATE_CHANGES], limitations: [NO_LIABILITY, NO_WARRANTY] },
  'GPL-2.0': { spdxId: 'GPL-2.0', name: 'GNU General Public License v2.0', category: 'copyleft', permissions: [COMMERCIAL, MODIFY, DISTRIBUTE, PRIVATE], conditions: [DISCLOSE, NOTICE, SAME_LICENSE, STATE_CHANGES], limitations: [NO_LIABILITY, NO_WARRANTY] },
  'GPL-3.0': { spdxId: 'GPL-3.0', name: 'GNU General Public License v3.0', category: 'copyleft', permissions: [COMMERCIAL, MODIFY, DISTRIBUTE, PRIVATE, PATENT], conditions: [DISCLOSE, NOTICE, SAME_LICENSE, STATE_CHANGES], limitations: [NO_LIABILITY, NO_WARRANTY] },
  'AGPL-3.0': { spdxId: 'AGPL-3.0', name: 'GNU Affero General Public License v3.0', category: 'copyleft', permissions: [COMMERCIAL, MODIFY, DISTRIBUTE, PRIVATE, PATENT], conditions: [DISCLOSE, NOTICE, SAME_LICENSE, STATE_CHANGES, 'network use is distribution'], limitations: [NO_LIABILITY, NO_WARRANTY] },
  Unlicense: { spdxId: 'Unlicense', name: 'The Unlicense', category: 'public-domain', permissions: [COMMERCIAL, MODIFY, DISTRIBUTE, PRIVATE], conditions: [], limitations: [NO_LIABILITY, NO_WARRANTY] },
};

interface Signature {
  readonly spdxId: string;
  test(norm: string): boolean;
}

// Ordered most-specific-first.
const SIGNATURES: readonly Signature[] = [
  { spdxId: 'MIT', test: (n) => n.includes('permission is hereby granted, free of charge') },
  { spdxId: 'ISC', test: (n) => n.includes('permission to use, copy, modify, and/or distribute this software') },
  { spdxId: 'Apache-2.0', test: (n) => n.includes('apache license') && n.includes('version 2.0') },
  { spdxId: 'AGPL-3.0', test: (n) => n.includes('gnu affero general public license') },
  { spdxId: 'LGPL-3.0', test: (n) => n.includes('gnu lesser general public license') && n.includes('version 3') },
  { spdxId: 'GPL-3.0', test: (n) => n.includes('gnu general public license') && n.includes('version 3') },
  { spdxId: 'GPL-2.0', test: (n) => n.includes('gnu general public license') && n.includes('version 2') },
  { spdxId: 'MPL-2.0', test: (n) => n.includes('mozilla public license') && n.includes('2.0') },
  { spdxId: 'Unlicense', test: (n) => n.includes('this is free and unencumbered software released into the public domain') },
  { spdxId: 'BSD-3-Clause', test: (n) => n.includes('redistribution and use in source and binary forms') && n.includes('neither the name') },
  { spdxId: 'BSD-2-Clause', test: (n) => n.includes('redistribution and use in source and binary forms') && !n.includes('neither the name') },
];

export interface LicenseDetection {
  /** Explicit SPDX-License-Identifier tag found in the text, if any. */
  readonly spdxTag: string | null;
  /** Best-guess SPDX id, or null when unrecognized. */
  readonly primary: string | null;
  /** All signatures that matched (SPDX ids), in priority order. */
  readonly matches: readonly string[];
  /** Metadata for the primary license, when known. */
  readonly meta: LicenseMeta | null;
}

export function detectLicense(text: string): LicenseDetection {
  const tagMatch = /SPDX-License-Identifier:\s*([A-Za-z0-9.\-+]+)/i.exec(text);
  const spdxTag = tagMatch ? (tagMatch[1] ?? null) : null;

  const norm = text.toLowerCase().replace(/\s+/g, ' ');
  const matches: string[] = [];
  for (const sig of SIGNATURES) {
    if (sig.test(norm)) matches.push(sig.spdxId);
  }

  // Prefer a signature match; fall back to a recognized SPDX tag.
  let primary = matches[0] ?? null;
  if (primary === null && spdxTag !== null && spdxTag in LICENSE_META) primary = spdxTag;

  return { spdxTag, primary, matches, meta: primary !== null ? (LICENSE_META[primary] ?? null) : null };
}
