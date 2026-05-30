import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildCspRegistration,
  FIXED_CLOCK,
  CSP_KIND_PARSED,
  type CspParsedArtifact,
  type CspReport,
} from '@nekotools/lens-csp';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoCSP UI parse helper, extracted out of CspApp for testability — the
 * same engine-adapter seam the other tools provide. Output strings come
 * from the real engine exporters (not re-derived in the UI), so the tab
 * can't drift from the engine. The Pro posture-report + hardened-policy
 * exporters are gated: `runExporter` throws `EntitlementError` for a free
 * caller, surfaced here as `null` so the UI shows the Pro-lock. Pure-local;
 * no network, ever.
 */

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildCspRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedCsp {
  /** The parsed report (directives + findings + count), or null when none. */
  readonly document: CspReport | null;
  /** Directives + findings as pretty-printed JSON (free). */
  readonly jsonOutput: string;
  /** Pro: CSP posture audit report (markdown), or null when not entitled. */
  readonly auditReport: string | null;
  /** Pro: hardened-policy suggestion (header + changelog), or null when not entitled. */
  readonly hardened: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Run `csp.text` over raw policy input and render the engine's exporters.
 * The free `jsonOutput` always renders; `auditReport` / `hardened` render
 * only for a Pro entitlement (otherwise `null`).
 */
export function parseCspText(raw: string, entitlement: Entitlement = FREE_ENTITLEMENT): ParsedCsp {
  const result = runParser(registry, 'csp', 'csp.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });

  const artifact = result.artifacts.find(
    (a): a is CspParsedArtifact => a.kind === CSP_KIND_PARSED,
  );
  const input = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };

  const run = (id: string): string =>
    artifact ? String(runExporter(registry, 'csp', id, input).body) : '';
  // Pro exporters are gated: runExporter throws EntitlementError when free.
  const runPro = (id: string): string | null => {
    if (!artifact) return null;
    try {
      return String(runExporter(registry, 'csp', id, input, entitlement).body);
    } catch {
      return null;
    }
  };

  return {
    document: artifact?.value ?? null,
    jsonOutput: run('csp.export.json'),
    auditReport: runPro('csp.export.report'),
    hardened: runPro('csp.export.hardened'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
  };
}
