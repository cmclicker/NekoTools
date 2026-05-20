import type { Diagnostic } from '@nekotools/contracts';
import {
  runParser,
  sortDiagnostics,
  type ToolRegistry,
} from '@nekotools/tool-runtime';
import type { JsonDocumentArtifact } from '@nekotools/lens-json';

/**
 * Phase 1.1f parse-pipeline glue, extracted out of `App.tsx` so it is
 * unit-testable without jsdom.
 *
 * Two corrections from the PR #9 audit:
 *
 *   1. `hasDocument` distinguishes "valid parsed `null` document" from
 *      "no document artifact." The former renders as a `null` leaf in
 *      the tree; the latter must NOT render as a fake `null` tree
 *      root. Conflating them via `?? null` (the original buggy
 *      fallback) corrupted UI state on invalid input.
 *
 *   2. `sourceBytes` is the UTF-8 byte length of the raw input, not
 *      `raw.length` (which counts UTF-16 code units and under-counts
 *      non-ASCII payloads). The `ArtifactSource.bytes` contract is
 *      bytes; the App had to honor that. `utf8ByteLength` is the same
 *      pattern the parser-text large-document threshold uses.
 */
export interface ParsedInput {
  /**
   * The parsed JSON value, if `hasDocument` is true. May legitimately
   * be `null` for an input of `"null"`. Otherwise `undefined`.
   */
  readonly value: unknown;
  /** True iff `json.text` produced a `json.document` artifact. */
  readonly hasDocument: boolean;
  /** Diagnostics in deterministic severity-sorted order. */
  readonly diagnostics: readonly Diagnostic[];
  /** UTF-8 byte length of the raw input, as recorded in the artifact source. */
  readonly sourceBytes: number;
}

const SHARED_UTF8_ENCODER = new TextEncoder();

/** UTF-8 byte length of a string. Exported so tests can pin the math. */
export function utf8ByteLength(s: string): number {
  return SHARED_UTF8_ENCODER.encode(s).byteLength;
}

/**
 * Run `json.text` for the given input through the supplied registry
 * and return a UI-ready summary.
 */
export function parseInput(registry: ToolRegistry, raw: string): ParsedInput {
  const sourceBytes = utf8ByteLength(raw);
  const result = runParser(registry, 'json', 'json.text', {
    raw,
    source: { kind: 'paste', bytes: sourceBytes },
  });
  const sorted = sortDiagnostics(result.diagnostics);
  const doc = result.artifacts[0] as JsonDocumentArtifact | undefined;
  if (doc === undefined) {
    return { value: undefined, hasDocument: false, diagnostics: sorted, sourceBytes };
  }
  return { value: doc.value, hasDocument: true, diagnostics: sorted, sourceBytes };
}
