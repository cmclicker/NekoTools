import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildLogsRegistration,
  FIXED_CLOCK,
  LOG_KIND_DOCUMENT,
  LOG_KIND_FILTER_RESULT,
  LOG_KIND_HISTOGRAM,
  LOG_KIND_SUMMARY,
  type LogArtifact,
  type LogDocument,
  type LogDocumentArtifact,
  type LogFilter,
  type LogFilterResult,
  type LogFilterResultArtifact,
  type LogHistogram,
  type LogHistogramArtifact,
  type LogSummary,
  type LogSummaryArtifact,
} from '@nekotools/lens-logs';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoLogs UI parse helpers, extracted out of LogsApp for testability —
 * the same engine-adapter seam NekoJSON's `parse-input.ts` and
 * NekoEnv's `env-parse.ts` provide.
 *
 * Two reasons this lives here:
 *
 *   1. `source.bytes` must be the UTF-8 byte length, not `raw.length`
 *      (which counts JS UTF-16 code units and under-counts non-ASCII
 *      payloads). The engine's `log.text` parser computes its own
 *      byte length for the large-document threshold; the UI records the
 *      same UTF-8 count into `source.bytes` so the two stay honest.
 *   2. The shared registry needs to be a singleton, so the parser
 *      identity (and its FIXED_CLOCK timestamp) is stable across
 *      App re-renders.
 */

const SHARED_UTF8_ENCODER = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return SHARED_UTF8_ENCODER.encode(value).byteLength;
}

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildLogsRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedLogs {
  /** The primary log.document, or null when the run emitted none. */
  readonly document: LogDocument | null;
  /** Stable id of the document artifact — needed to run log.filter. */
  readonly documentArtifactId: string | null;
  readonly summary: LogSummary | null;
  readonly histogram: LogHistogram | null;
  /**
   * Pro: markdown incident report (`log.export.report.incident`), or null
   * when not entitled / no document. Fed the summary + document artifacts.
   */
  readonly incidentReport: string | null;
  /**
   * Pro: stacked-bar SVG of the histogram (`log.export.histogram.svg`), or
   * null when not entitled / no histogram. Fed the histogram artifact only.
   */
  readonly histogramSvg: string | null;
  /**
   * Pro: markdown message clusters (`log.export.patterns.clusters`), or null
   * when not entitled / no document. Fed the document (entries) artifact.
   */
  readonly patternsClusters: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
  /** UTF-8 byte length of the raw input (recorded into source.bytes). */
  readonly inputBytes: number;
}

/**
 * Run `log.text` over raw log input. A single run emits three artifacts
 * (`log.document` + `log.summary` + `log.histogram`); pull each out of
 * `result.artifacts` by kind rather than by positional index so a
 * future artifact-ordering change cannot silently mis-wire the views.
 */
export function parseLogText(
  raw: string,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): ParsedLogs {
  const bytes = utf8ByteLength(raw);
  const result = runParser(registry, 'logs', 'log.text', {
    raw,
    source: { kind: 'paste', bytes },
  });

  const documentArtifact = result.artifacts.find(
    (a): a is LogDocumentArtifact => a.kind === LOG_KIND_DOCUMENT,
  );
  const summaryArtifact = result.artifacts.find(
    (a): a is LogSummaryArtifact => a.kind === LOG_KIND_SUMMARY,
  );
  const histogramArtifact = result.artifacts.find(
    (a): a is LogHistogramArtifact => a.kind === LOG_KIND_HISTOGRAM,
  );

  // Pro exporters have NARROW accept-kinds and the runtime enforces
  // `accepts` against EVERY input artifact, so each must be fed only the
  // subset of kinds it declares — never the whole artifact list (mirrors
  // the engine conformance test's `only(...kinds)` helper). A free
  // entitlement makes `runExporter` throw EntitlementError, surfaced here
  // as null so the UI shows the Pro-lock (same pattern as hex-parse.ts).
  const runPro = (id: string, artifacts: readonly LogArtifact[]): string | null => {
    if (artifacts.length === 0) return null;
    try {
      return String(
        runExporter(registry, 'logs', id, { artifacts, diagnostics: result.diagnostics }, entitlement)
          .body,
      );
    } catch {
      return null;
    }
  };

  // log.export.report.incident accepts [log.summary, log.document].
  const incidentInput: LogArtifact[] = [];
  if (summaryArtifact) incidentInput.push(summaryArtifact);
  if (documentArtifact) incidentInput.push(documentArtifact);
  // log.export.histogram.svg accepts [log.histogram].
  const histogramInput: LogArtifact[] = histogramArtifact ? [histogramArtifact] : [];
  // log.export.patterns.clusters accepts [log.document, log.filter-result];
  // a plain parse run has only the document (entries) to cluster.
  const clustersInput: LogArtifact[] = documentArtifact ? [documentArtifact] : [];

  return {
    document: documentArtifact?.value ?? null,
    documentArtifactId: documentArtifact?.id ?? null,
    summary: summaryArtifact?.value ?? null,
    histogram: histogramArtifact?.value ?? null,
    incidentReport: runPro('log.export.report.incident', incidentInput),
    histogramSvg: runPro('log.export.histogram.svg', histogramInput),
    patternsClusters: runPro('log.export.patterns.clusters', clustersInput),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
    inputBytes: bytes,
  };
}

export interface AppliedLogFilter {
  readonly result: LogFilterResult | null;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Run `log.filter` over a loaded document. Returns the
 * `log.filter-result` value plus any diagnostics. An invalid filter
 * fails closed in the engine: no artifact, a `log.filter.invalid`
 * error diagnostic — surfaced here so the UI can show it.
 */
export function applyLogFilter(
  document: LogDocument,
  documentArtifactId: string,
  filter: LogFilter,
): AppliedLogFilter {
  const result = runParser(registry, 'logs', 'log.filter', {
    raw: '',
    source: { kind: 'derived', from: [documentArtifactId] },
    hints: { document, documentArtifactId, filter },
  });
  const artifact = result.artifacts.find(
    (a): a is LogFilterResultArtifact => a.kind === LOG_KIND_FILTER_RESULT,
  );
  // Re-key the filter run's diagnostics. Both `log.text` and
  // `log.filter` mint ids from independent `diag_N` sequences, so a
  // filter diagnostic (`diag_1`) would collide with a parse diagnostic
  // (`diag_1`) once the UI concatenates the two lists for the shared
  // <Diagnostics> component, which keys by `id`. Namespacing here keeps
  // every rendered key unique without touching the engine or the
  // shared component.
  const diagnostics = result.diagnostics.map((d) => ({ ...d, id: `filter:${d.id}` }));
  return {
    result: artifact?.value ?? null,
    diagnostics,
  };
}
