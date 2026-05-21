import type { EnvDiff, EnvDiffHunk } from '@nekotools/lens-env';

interface EnvDiffViewProps {
  readonly diff: EnvDiff | null;
  /** When true, replace value text in hunk lines with a fixed mask. Keys remain visible. */
  readonly maskValues: boolean;
}

/**
 * Diff view for two parsed `env.document`s. Renders the unified-diff
 * hunk list from an `env.diff` artifact. The diff is computed against
 * the internal sorted canonical comparison form, so reordered keys
 * and quoting differences produce no noise.
 *
 * When `diff` is `null` (the user has not provided a compare-against
 * document yet, or the primary document is unparseable), an
 * empty-state hint is shown — diff is not "no document found"; it is
 * "supply two documents to diff against each other."
 *
 * Mask-values: when on, the right-hand side of each `KEY=VALUE` hunk
 * line is replaced with a fixed-width dot string. Keys, comparison
 * markers, and line structure stay visible.
 */
export function EnvDiffView({ diff, maskValues }: EnvDiffViewProps): JSX.Element {
  if (diff === null) {
    return (
      <div role="status" className="empty-state" data-testid="env-diff-empty">
        Paste a dotenv document into the &quot;Compare against&quot; box on the
        right to see a diff against the primary document.
      </div>
    );
  }

  if (diff.hunks.length === 0) {
    return (
      <div role="status" className="empty-state" data-testid="env-diff-identical">
        The two documents are identical under canonical comparison.
      </div>
    );
  }

  return (
    <div className="env-diff" role="region" aria-label="NekoEnv diff view">
      <header className="env-diff__header">
        <span className="env-diff__minus">--- {diff.leftArtifactId}</span>
        <span className="env-diff__plus">+++ {diff.rightArtifactId}</span>
      </header>
      <ol className="env-diff__hunks">
        {diff.hunks.map((h, i) => (
          <li
            key={i}
            className={`env-diff__hunk env-diff__hunk--${h.kind}`}
            data-testid="env-diff-hunk"
            data-kind={h.kind}
          >
            <span className="env-diff__marker" aria-hidden="true">
              {h.kind === 'add' ? '+' : h.kind === 'remove' ? '-' : ' '}
            </span>
            <code className="env-diff__text">{maskValues ? maskValueInHunk(h.text) : h.text}</code>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * For a `KEY=VALUE` (or `KEY="VALUE"`) line, replace the value with a
 * dot mask while keeping the key visible. Lines that don't match the
 * shape are returned unchanged — diagnostics and structural markers
 * shouldn't be masked.
 */
export function maskValueInHunk(text: string): string {
  const m = /^([A-Za-z_][A-Za-z0-9_]*=)(.*)$/.exec(text);
  if (!m) return text;
  const key = m[1] ?? '';
  return `${key}••••••••`;
}

// Re-export type alias for external test convenience.
export type { EnvDiffHunk };
