import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildJwtRegistration,
  FIXED_CLOCK,
  JWT_KIND_DOCUMENT,
  type JwtDocument,
  type JwtDocumentArtifact,
} from '@nekotools/lens-jwt';
import type { Diagnostic } from '@nekotools/contracts';

/**
 * NekoJWT UI parse helper, extracted out of JwtApp for testability —
 * the same engine-adapter seam the other tools provide.
 *
 * `source.bytes` is the UTF-8 byte length, matching what the engine's
 * `jwt.text` parser uses. The registry is a module singleton so parser
 * identity is stable across App re-renders.
 */

const SHARED_UTF8_ENCODER = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return SHARED_UTF8_ENCODER.encode(value).byteLength;
}

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildJwtRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedJwt {
  /** The primary jwt.document, or null when the run emitted none. */
  readonly document: JwtDocument | null;
  /** Header as pretty-printed JSON. */
  readonly headerJson: string | null;
  /** Payload as pretty-printed JSON. */
  readonly payloadJson: string | null;
  /** Claims table as JSON. */
  readonly claimsJson: string | null;
  readonly diagnostics: readonly Diagnostic[];
  readonly inputBytes: number;
}

/**
 * Run `jwt.text` over raw JWT input and render the engine's exporters.
 * Output strings come from the real engine exporters (not re-derived in
 * the UI), so the tab can't drift from the engine's behavior.
 */
export function parseJwtText(raw: string): ParsedJwt {
  const bytes = utf8ByteLength(raw);
  const result = runParser(registry, 'jwt', 'jwt.text', {
    raw,
    source: { kind: 'paste', bytes },
  });

  const documentArtifact = result.artifacts.find(
    (a): a is JwtDocumentArtifact => a.kind === JWT_KIND_DOCUMENT,
  );

  let headerJson: string | null = null;
  let payloadJson: string | null = null;
  let claimsJson: string | null = null;
  if (documentArtifact !== undefined) {
    headerJson = String(
      runExporter(registry, 'jwt', 'jwt.export.header.json', {
        artifacts: [documentArtifact],
        diagnostics: [],
      }).body,
    );
    payloadJson = String(
      runExporter(registry, 'jwt', 'jwt.export.payload.json', {
        artifacts: [documentArtifact],
        diagnostics: [],
      }).body,
    );
    claimsJson = String(
      runExporter(registry, 'jwt', 'jwt.export.claims.table.json', {
        artifacts: [documentArtifact],
        diagnostics: [],
      }).body,
    );
  }

  return {
    document: documentArtifact?.value ?? null,
    headerJson,
    payloadJson,
    claimsJson,
    diagnostics: result.diagnostics,
    inputBytes: bytes,
  };
}
