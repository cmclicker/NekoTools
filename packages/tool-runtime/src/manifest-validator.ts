import type { ToolManifest } from '@nekotools/contracts';
import { validate } from '@nekotools/schemas';

export interface ManifestValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

/**
 * Schema-validate a tool manifest. The schema enforces structure; this
 * function adds the cross-field invariants that JSON Schema cannot
 * express on its own.
 */
export function validateManifest(manifest: ToolManifest): ManifestValidationResult {
  const errors: string[] = [];

  const schemaResult = validate('toolManifest', manifest);
  if (!schemaResult.ok) {
    errors.push(...schemaResult.errors);
  }

  const freeAndPro = new Set<string>();
  for (const f of manifest.entitlements?.free ?? []) {
    if (freeAndPro.has(f)) {
      errors.push(`entitlements.free duplicates "${f}"`);
    }
    freeAndPro.add(f);
  }
  for (const p of manifest.entitlements?.pro ?? []) {
    if (freeAndPro.has(p)) {
      errors.push(`feature "${p}" is declared both free and pro`);
    }
  }

  return { ok: errors.length === 0, errors };
}
