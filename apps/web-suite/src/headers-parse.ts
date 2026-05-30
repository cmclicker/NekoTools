import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildHeadersRegistration,
  FIXED_CLOCK,
  HEADERS_KIND_DOCUMENT,
  type HeadersDocument,
  type HeadersDocumentArtifact,
} from '@nekotools/lens-headers';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoHeaders UI parse helper — the engine-adapter seam, mirroring
 * yaml-parse.ts / logs-parse.ts. Runs the real `@nekotools/lens-headers`
 * parser + JSON exporter through a module-singleton registry.
 */

const SHARED_UTF8_ENCODER = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return SHARED_UTF8_ENCODER.encode(value).byteLength;
}

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildHeadersRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedHeaders {
  readonly document: HeadersDocument | null;
  /** Headers as a JSON object (name -> value); null when there are none. */
  readonly jsonOutput: string | null;
  /** Pro: security-posture audit (markdown), or null when not entitled. */
  readonly auditReport: string | null;
  /** Pro: SARIF 2.1.0 of the audit, or null when not entitled. */
  readonly sarif: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseHeadersText(
  raw: string,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): ParsedHeaders {
  const result = runParser(registry, 'headers', 'headers.text', {
    raw,
    source: { kind: 'paste', bytes: utf8ByteLength(raw) },
  });
  const doc = result.artifacts.find(
    (a): a is HeadersDocumentArtifact => a.kind === HEADERS_KIND_DOCUMENT,
  );
  const hasHeaders = doc !== undefined && doc.value.entries.length > 0;
  const exportInput = { artifacts: doc ? [doc] : [], diagnostics: [] };

  const jsonOutput = hasHeaders
    ? String(runExporter(registry, 'headers', 'headers.export.json', exportInput).body)
    : null;
  // Pro exporters are gated: runExporter throws EntitlementError when free.
  const runPro = (id: string): string | null => {
    if (!hasHeaders) return null;
    try {
      return String(runExporter(registry, 'headers', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

  return {
    document: doc?.value ?? null,
    jsonOutput,
    auditReport: runPro('headers.export.audit.report'),
    sarif: runPro('headers.export.sarif'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
  };
}
