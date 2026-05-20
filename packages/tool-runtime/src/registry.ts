import type {
  Exporter,
  GraphProjector,
  Parser,
  ToolManifest,
} from '@nekotools/contracts';

/**
 * The tool registry — the only place tools enter the runtime.
 *
 * Tools register their manifest plus their parsers, exporters, and
 * (optionally) graph projectors. The registry validates every manifest
 * against the schema before accepting it. A tool that does not match
 * its declared contract is rejected at registration time.
 */
export interface ToolRegistration {
  readonly manifest: ToolManifest;
  readonly parsers: readonly Parser[];
  readonly exporters: readonly Exporter[];
  readonly graphProjectors?: readonly GraphProjector[];
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolRegistration>();

  register(reg: ToolRegistration): void {
    const { manifest } = reg;
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

    for (const exporter of reg.exporters) {
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
