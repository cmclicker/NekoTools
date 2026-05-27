import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildHeadersRegistration,
  FIXED_CLOCK,
  HEADERS_KIND_DOCUMENT,
  type HeadersDocument,
  type HeadersDocumentArtifact,
} from '@nekotools/lens-headers';
import type { Diagnostic } from '@nekotools/contracts';

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
  readonly diagnostics: readonly Diagnostic[];
}

export function parseHeadersText(raw: string): ParsedHeaders {
  const result = runParser(registry, 'headers', 'headers.text', {
    raw,
    source: { kind: 'paste', bytes: utf8ByteLength(raw) },
  });
  const doc = result.artifacts.find(
    (a): a is HeadersDocumentArtifact => a.kind === HEADERS_KIND_DOCUMENT,
  );
  let jsonOutput: string | null = null;
  if (doc !== undefined && doc.value.entries.length > 0) {
    jsonOutput = String(
      runExporter(registry, 'headers', 'headers.export.json', {
        artifacts: [doc],
        diagnostics: [],
      }).body,
    );
  }
  return {
    document: doc?.value ?? null,
    jsonOutput,
    diagnostics: result.diagnostics,
  };
}
