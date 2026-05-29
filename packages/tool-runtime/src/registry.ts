import type {
  Exporter,
  GraphProjector,
  Parser,
  ToolManifest,
} from '@nekotools/contracts';

import { validateManifest } from './manifest-validator.js';

/**
 * The tool registry — the only place tools enter the runtime.
 *
 * Tools register their manifest plus their parsers, exporters, and
 * (optionally) graph projectors. The registry validates every manifest
 * against the schema AND against cross-field invariants before accepting
 * it. A tool that does not match its declared contract is rejected at
 * registration time — fail closed.
 */
export interface ToolRegistration {
  readonly manifest: ToolManifest;
  readonly parsers: readonly Parser[];
  readonly exporters: readonly Exporter[];
  readonly graphProjectors?: readonly GraphProjector[];
  /**
   * Pro exporters. In the single-build-gated model these ship in the binary
   * alongside the free ones, but `runExporter` refuses to run them without a
   * valid entitlement. They must still be declared in `manifest.exporters`.
   */
  readonly proExporters?: readonly Exporter[];
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolRegistration>();

  register(reg: ToolRegistration): void {
    const { manifest } = reg;

    const validation = validateManifest(manifest);
    if (!validation.ok) {
      throw new Error(
        `invalid manifest for "${manifest.id}": ${validation.errors.join('; ')}`,
      );
    }

    if (this.tools.has(manifest.id)) {
      throw new Error(`tool already registered: ${manifest.id}`);
    }

    for (const parser of reg.parsers) {
      if (parser.toolId !== manifest.id) {
        throw new Error(
          `parser "${parser.id}" toolId "${parser.toolId}" does not match manifest "${manifest.id}"`,
        );
      }
      if (!manifest.parsers.includes(parser.id)) {
        throw new Error(
          `parser "${parser.id}" not declared in manifest of "${manifest.id}"`,
        );
      }
    }

    for (const exporter of [...reg.exporters, ...(reg.proExporters ?? [])]) {
      if (exporter.toolId !== manifest.id) {
        throw new Error(
          `exporter "${exporter.id}" toolId "${exporter.toolId}" does not match manifest "${manifest.id}"`,
        );
      }
      if (!manifest.exporters.includes(exporter.id)) {
        throw new Error(
          `exporter "${exporter.id}" not declared in manifest of "${manifest.id}"`,
        );
      }
    }

    this.tools.set(manifest.id, reg);
  }

  get(toolId: string): ToolRegistration | undefined {
    return this.tools.get(toolId);
  }

  list(): readonly ToolRegistration[] {
    return [...this.tools.values()];
  }

  has(toolId: string): boolean {
    return this.tools.has(toolId);
  }
}
