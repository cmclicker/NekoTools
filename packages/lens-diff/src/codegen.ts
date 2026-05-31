import type { DiffHunk, DiffResult } from './kinds.js';

/**
 * NekoDiff Pro generators. Back `diff.export.semantic` (pro `diff.semantic`)
 * and `diff.export.bundle.signed` (pro `bundle.signed`).
 *
 * Both are pure, deterministic, offline functions of the parsed `diff.result`.
 *
 * Scope honesty (matches the amended manifest outOfScope): the semantic diff
 * is TOKEN- and JSON-key-level, not a per-language AST/grammar diff. It pairs
 * adjacent remove/add hunks and reports the intra-line word-level change, and
 * for json/yaml mode surfaces changed key paths from the line text. The signed
 * bundle emits a canonical, signable envelope; the Ed25519 signature is applied
 * by the owner-side tooling (exporters are synchronous, so the signature — if
 * any — is supplied via `ExportInput.options.signature`, computed out-of-band
 * over the canonical payload). Without a signature it is a valid UNSIGNED
 * signable bundle, never a fake "signed" claim.
 */

// --- semantic --------------------------------------------------------------

/** Split a line into word-ish tokens (runs of word chars vs. other chars). */
function tokenize(line: string): string[] {
  return line.match(/\w+|[^\w\s]+|\s+/g) ?? [];
}

/** A compact token-level change between a removed line and its paired add. */
function wordDiff(left: string, right: string): string {
  const a = tokenize(left);
  const b = tokenize(right);
  // Longest-common-subsequence over tokens (small lines; O(n*m) is fine).
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push(a[i]!);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push(`[-${a[i]!}-]`);
      i++;
    } else {
      out.push(`{+${b[j]!}+}`);
      j++;
    }
  }
  while (i < n) out.push(`[-${a[i++]!}-]`);
  while (j < m) out.push(`{+${b[j++]!}+}`);
  return out.join('');
}

/** A JSON/YAML key path from a `key: value` or `"key":` line, else null. */
function keyPathOf(text: string): string | null {
  const m = /^\s*"?([\w.-]+)"?\s*:/.exec(text);
  return m ? m[1]! : null;
}

/**
 * `diff.export.semantic` — a token/key-level semantic view over the line
 * hunks. Adjacent remove→add pairs are reported as an intra-line word diff;
 * for json/yaml mode, changed/added/removed key paths are summarized. Honest
 * scope: token + key level, not a language AST.
 */
export function toSemanticDiff(result: DiffResult): string {
  const out: string[] = [
    `# NekoDiff semantic diff (${result.mode})`,
    '',
    `- ${result.leftLabel} → ${result.rightLabel}`,
    `- token/key-level (not a per-language AST diff)`,
    '',
  ];
  if (!result.comparable) {
    out.push('Inputs were not reducible to a comparable form; see diagnostics.');
    return out.join('\n');
  }

  const hunks = result.hunks;
  const changes: string[] = [];
  const keyChanges: string[] = [];

  for (let i = 0; i < hunks.length; i++) {
    const h = hunks[i]!;
    const next: DiffHunk | undefined = hunks[i + 1];
    if (h.kind === 'remove' && next?.kind === 'add') {
      // A paired modification → intra-line word diff.
      changes.push(`~ ${wordDiff(h.text, next.text)}`);
      const kp = keyPathOf(h.text) ?? keyPathOf(next.text);
      if (kp !== null && result.mode !== 'text') keyChanges.push(`changed: ${kp}`);
      i++; // consume the paired add
    } else if (h.kind === 'remove') {
      changes.push(`- ${h.text}`);
      const kp = keyPathOf(h.text);
      if (kp !== null && result.mode !== 'text') keyChanges.push(`removed: ${kp}`);
    } else if (h.kind === 'add') {
      changes.push(`+ ${h.text}`);
      const kp = keyPathOf(h.text);
      if (kp !== null && result.mode !== 'text') keyChanges.push(`added: ${kp}`);
    }
  }

  if (result.mode !== 'text' && keyChanges.length > 0) {
    out.push('## Changed keys', '', ...keyChanges.map((k) => `- ${k}`), '');
  }
  out.push('## Token-level changes', '');
  out.push(changes.length > 0 ? changes.join('\n') : '(no differences)');
  out.push('');
  return out.join('\n');
}

// --- bundle.signed ---------------------------------------------------------

/** A small, deterministic non-crypto content digest (FNV-1a, hex). */
export function contentDigest(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export interface SignedBundle {
  readonly tool: 'diff';
  readonly version: 1;
  readonly result: DiffResult;
  /** FNV-1a digest of the canonical payload — what a signature signs over. */
  readonly contentDigest: string;
  /** Ed25519 signature (base64url) supplied by owner-side tooling, or null. */
  readonly signature: string | null;
  /** Identifier of the signing key, when signed. */
  readonly keyId: string | null;
  readonly note: string;
}

/**
 * `diff.export.bundle.signed` — a canonical, signable bundle of the diff
 * result. The canonical payload (tool/version/result, stable key order) gets
 * an FNV-1a `contentDigest`. If the caller supplies `options.signature`
 * (computed out-of-band with the Ed25519 signing key over that payload) and
 * `options.keyId`, they are embedded; otherwise `signature` is null and the
 * note marks it an unsigned signable bundle. Pure + synchronous — the async
 * crypto stays in the owner-side tooling, never in the shipped exporter.
 */
export function toSignedBundle(
  result: DiffResult,
  signature: string | null,
  keyId: string | null,
): string {
  // Canonical payload (stable field order) is what the digest/signature cover.
  const payload = JSON.stringify({ tool: 'diff', version: 1, result });
  const bundle: SignedBundle = {
    tool: 'diff',
    version: 1,
    result,
    contentDigest: contentDigest(payload),
    signature: signature ?? null,
    keyId: keyId ?? null,
    note:
      signature != null
        ? 'Signed bundle. Verify the signature over the canonical {tool,version,result} payload.'
        : 'Unsigned signable bundle. Sign contentDigest/payload with the vendor Ed25519 key to finalize.',
  };
  return JSON.stringify(bundle, null, 2);
}
