import type {
  Artifact,
  Diagnostic,
  Entitlement,
  ExportInput,
  ExportResult,
  Parser,
  ParserInput,
  ParserResult,
} from '@nekotools/contracts';
import { FREE_ENTITLEMENT } from '@nekotools/contracts';

import { EntitlementError, grantsFeature } from './license.js';
import type { ToolRegistry } from './registry.js';

/**
 * Optional runtime injection points. The runner generates diagnostic
 * IDs for thrown-parser exceptions; that ID must be reproducible from
 * the same input, the same way artifact timestamps must be. Callers
 * that batch many runs and want monotonic IDs pass `diagnosticId`.
 * Tests and one-shot calls accept the deterministic default.
 */
export interface RunParserOptions {
  readonly diagnosticId?: () => string;
}

function defaultRunnerDiagnosticId(parserId: string): string {
  return `diag_runner_${parserId.replace(/\W+/g, '_')}`;
}

/**
 * Run a named parser. Parsers are pure: same input → same output. The
 * runner never silently swallows exceptions — if a parser throws, it
 * is upgraded to an error diagnostic so the UI can surface it.
 */
export function runParser(
  registry: ToolRegistry,
  toolId: string,
  parserId: string,
  input: ParserInput,
  options: RunParserOptions = {},
): ParserResult {
  const tool = registry.get(toolId);
  if (!tool) throw new Error(`unknown tool: ${toolId}`);
  const parser = tool.parsers.find((p) => p.id === parserId) as Parser | undefined;
  if (!parser) throw new Error(`unknown parser: ${toolId}/${parserId}`);

  try {
    return parser.parse(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const id = options.diagnosticId?.() ?? defaultRunnerDiagnosticId(parserId);
    const diagnostic: Diagnostic = {
      version: 1,
      id,
      severity: 'error',
      code: 'runner.parser_threw',
      message: `parser "${parserId}" threw: ${message}`,
    };
    return { artifacts: [], diagnostics: [diagnostic] };
  }
}

export function runExporter(
  registry: ToolRegistry,
  toolId: string,
  exporterId: string,
  input: ExportInput,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): ExportResult {
  const tool = registry.get(toolId);
  if (!tool) throw new Error(`unknown tool: ${toolId}`);

  const freeExporter = tool.exporters.find((e) => e.id === exporterId);
  const proExporter = tool.proExporters?.find((e) => e.id === exporterId);
  const exporter = freeExporter ?? proExporter;
  if (!exporter) throw new Error(`unknown exporter: ${toolId}/${exporterId}`);

  // Single-build gating: a Pro exporter ships in the binary but only runs
  // for a valid entitlement that grants it. Free callers get a clear error.
  if (proExporter !== undefined && !grantsFeature(entitlement, exporterId)) {
    throw new EntitlementError(`exporter "${exporterId}" requires a Pro license`, exporterId);
  }

  for (const artifact of input.artifacts) {
    if (!exporter.accepts.includes(artifact.kind)) {
      throw new Error(
        `exporter "${exporterId}" does not accept artifact kind "${artifact.kind}"`,
      );
    }
  }

  return exporter.export(input);
}

/**
 * Sort diagnostics highest-severity first, then by code, for deterministic
 * UI ordering and reproducible exports.
 */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): readonly Diagnostic[] {
  const rankOf = (s: Diagnostic['severity']): number => {
    switch (s) {
      case 'error':
        return 3;
      case 'warning':
        return 2;
      case 'info':
        return 1;
      case 'hint':
        return 0;
    }
  };
  return [...diagnostics].sort((a, b) => {
    const r = rankOf(b.severity) - rankOf(a.severity);
    if (r !== 0) return r;
    return a.code.localeCompare(b.code);
  });
}

export function findArtifact(
  artifacts: readonly Artifact[],
  id: string,
): Artifact | undefined {
  return artifacts.find((a) => a.id === id);
}
