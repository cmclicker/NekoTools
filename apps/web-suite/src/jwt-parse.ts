import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildJwtRegistration,
  FIXED_CLOCK,
  JWT_KIND_DOCUMENT,
  type JwtDocument,
  type JwtDocumentArtifact,
} from '@nekotools/lens-jwt';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

export { verifyJwtSignature, type JwtVerifyKey, type JwtVerifyResult } from '@nekotools/lens-jwt';

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
  /** Pro: claims & security audit (markdown), or null when not entitled. */
  readonly audit: string | null;
  /** Pro: SARIF 2.1.0 of the audit, or null when not entitled. */
  readonly sarif: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
  readonly inputBytes: number;
}

/**
 * Run `jwt.text` over raw JWT input and render the engine's exporters.
 * Output strings come from the real engine exporters (not re-derived in
 * the UI), so the tab can't drift from the engine's behavior.
 */
export function parseJwtText(raw: string, entitlement: Entitlement = FREE_ENTITLEMENT): ParsedJwt {
  const bytes = utf8ByteLength(raw);
  const result = runParser(registry, 'jwt', 'jwt.text', {
    raw,
    source: { kind: 'paste', bytes },
  });

  const documentArtifact = result.artifacts.find(
    (a): a is JwtDocumentArtifact => a.kind === JWT_KIND_DOCUMENT,
  );

  // Free exporters take only the document; the Pro audit/SARIF also need the
  // diagnostics (for the clock-aware expiry/nbf findings).
  const freeInput = { artifacts: documentArtifact ? [documentArtifact] : [], diagnostics: [] };
  const proInput = { artifacts: documentArtifact ? [documentArtifact] : [], diagnostics: result.diagnostics };

  const run = (id: string): string | null =>
    documentArtifact ? String(runExporter(registry, 'jwt', id, freeInput).body) : null;
  // Pro exporters are gated: runExporter throws EntitlementError when free.
  const runPro = (id: string): string | null => {
    if (!documentArtifact) return null;
    try {
      return String(runExporter(registry, 'jwt', id, proInput, entitlement).body);
    } catch {
      return null;
    }
  };

  return {
    document: documentArtifact?.value ?? null,
    headerJson: run('jwt.export.header.json'),
    payloadJson: run('jwt.export.payload.json'),
    claimsJson: run('jwt.export.claims.table.json'),
    audit: runPro('jwt.export.claims.policy'),
    sarif: runPro('jwt.export.sarif'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
    inputBytes: bytes,
  };
}
