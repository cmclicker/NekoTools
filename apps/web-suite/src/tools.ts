import type { ToolManifest } from '@nekotools/contracts';
import { jsonManifest } from '@nekotools/lens-json';
import { envManifest } from '@nekotools/lens-env';
import { logsManifest } from '@nekotools/lens-logs';
import { yamlManifest } from '@nekotools/lens-yaml';
import { timeManifest } from '@nekotools/lens-time';

/**
 * The unified workbench tool registry.
 *
 * The shell renders the tab strip and the Free / Pro entitlement surface
 * from this list, so adding a tool to those surfaces is a one-line
 * registration here. (Each tool still mounts its own panel in `App.tsx`,
 * because the sub-apps have bespoke props / test seams; new tools add a
 * `TOOLS` entry plus their panel together.)
 */
export type ActiveTool = 'json' | 'env' | 'logs' | 'yaml' | 'time';

export interface ToolDescriptor {
  readonly id: ActiveTool;
  readonly label: string;
  readonly manifest: ToolManifest;
}

export const TOOLS: readonly ToolDescriptor[] = [
  { id: 'json', label: 'NekoJSON', manifest: jsonManifest },
  { id: 'env', label: 'NekoEnv', manifest: envManifest },
  { id: 'logs', label: 'NekoLogs', manifest: logsManifest },
  { id: 'yaml', label: 'NekoYAML', manifest: yamlManifest },
  { id: 'time', label: 'NekoTime', manifest: timeManifest },
];

export function toolById(id: ActiveTool): ToolDescriptor {
  const found = TOOLS.find((tool) => tool.id === id);
  if (found === undefined) {
    throw new Error(`unknown tool id: ${id}`);
  }
  return found;
}
