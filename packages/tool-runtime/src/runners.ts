import type {
  Artifact,
  Diagnostic,
  ExportInput,
  ExportResult,
  Parser,
  ParserInput,
  ParserResult,
} from '@nekotools/contracts';

import type { ToolRegistry } from './registry.js';

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
): ParserResult {
  const tool = registry.get(toolId);
  if (!tool) throw new Error(`unknown tool: ${toolId}`);
  const parser = tool.parsers.find((p) => p.id === parserId) as Parser | undefined;
  if (!parser) throw new Error(`unknown parser: ${toolId}/${parserId}`);

  try {
    return parser.parse(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const diagnostic: Diagnostic = {
      version: 1,
      id: `diag_runner_${Date.now().toString(36)}`,
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
): ExportResult {
  const tool = registry.get(toolId);
  if (!tool) throw new Error(`unknown tool: ${toolId}`);
  const exporter = tool.exporters.find((e) => e.id === exporterId);
  if (!exporter) throw new Error(`unknown exporter: ${toolId}/${exporterId}`);

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
