import type { Workspace, WorkspaceSerializer } from '@nekotools/contracts';
import { validate } from '@nekotools/schemas';

/**
 * The canonical workspace serializer.
 *
 * Workspaces are JSON-on-disk. The serializer enforces schema validation
 * on both ends: a malformed save would silently corrupt user data, and
 * a malformed load would silently mis-render their tools. Both are
 * rejected loudly instead.
 */
export const jsonWorkspaceSerializer: WorkspaceSerializer = {
  version: 1,

  serialize(workspace: Workspace): string {
    const result = validate('workspace', workspace);
    if (!result.ok) {
      throw new Error(
        `cannot serialize: workspace failed schema validation: ${result.errors.join('; ')}`,
      );
    }
    return JSON.stringify(workspace, null, 2);
  },

  deserialize(raw: string): Workspace {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`cannot deserialize: invalid JSON: ${message}`);
    }
    const result = validate('workspace', parsed);
    if (!result.ok) {
      throw new Error(
        `cannot deserialize: workspace failed schema validation: ${result.errors.join('; ')}`,
      );
    }
    return parsed as Workspace;
  },
};
