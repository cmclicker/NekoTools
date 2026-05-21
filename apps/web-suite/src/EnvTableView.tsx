import type { EnvDocument, EnvEntry } from '@nekotools/lens-env';

interface EnvTableViewProps {
  readonly document: EnvDocument;
  readonly searchQuery: string;
  readonly activeKey: string | null;
  readonly onSelectKey: (key: string) => void;
  /** When true, render values as a placeholder so over-the-shoulder reads cannot leak secrets. */
  readonly maskValues: boolean;
}

/**
 * Table view for a parsed `env.document`. One row per entry in source
 * order (duplicates included — the last-occurrence-wins semantics
 * apply to `env.key` lookups, but the table is the *workbench* view
 * and surfaces every occurrence so the user can see what they wrote).
 *
 * Search is a case-insensitive substring match against keys + decoded
 * values. Mask-values renders every value as `••••••`; the toggle is
 * a pure rendering preference and does not modify the artifact.
 */
export function EnvTableView({
  document,
  searchQuery,
  activeKey,
  onSelectKey,
  maskValues,
}: EnvTableViewProps): JSX.Element {
  if (document.entries.length === 0) {
    return (
      <div role="status" className="empty-state" data-testid="env-table-empty">
        No entries to show. Paste a dotenv document above.
      </div>
    );
  }

  const filtered = filterEntries(document.entries, searchQuery);

  if (filtered.length === 0) {
    return (
      <div role="status" className="empty-state" data-testid="env-table-no-matches">
        No entries match your search.
      </div>
    );
  }

  return (
    <div className="env-table" role="region" aria-label="NekoEnv table view">
      <table>
        <thead>
          <tr>
            <th scope="col">Key</th>
            <th scope="col">Value</th>
            <th scope="col">Quoting</th>
            <th scope="col">Line</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((entry, idx) => {
            const isActive = entry.key === activeKey;
            const displayValue = maskValues && entry.value !== '' ? mask(entry.value) : entry.value;
            return (
              <tr
                key={`${entry.key}__${entry.startLine}__${idx}`}
                aria-selected={isActive}
                className={isActive ? 'env-row env-row--active' : 'env-row'}
                onClick={() => onSelectKey(entry.key)}
                data-testid="env-row"
                data-key={entry.key}
              >
                <td className="env-row__key">
                  {entry.exportPrefix ? (
                    <span className="env-row__export" title="export shell prefix">
                      export{' '}
                    </span>
                  ) : null}
                  <code>{entry.key}</code>
                </td>
                <td className="env-row__value">
                  <code data-testid="env-row-value">{displayValue || '(empty)'}</code>
                </td>
                <td className="env-row__quoting">{entry.quoting}</td>
                <td className="env-row__line">{entry.startLine}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Substring match against key + value; empty query matches everything. */
export function filterEntries(
  entries: readonly EnvEntry[],
  query: string,
): readonly EnvEntry[] {
  const q = query.trim().toLowerCase();
  if (q === '') return entries;
  return entries.filter(
    (e) => e.key.toLowerCase().includes(q) || e.value.toLowerCase().includes(q),
  );
}

/**
 * Render a value as a fixed-width dot string. Length is independent of
 * the underlying value so mask state never leaks value length.
 */
export function mask(_value: string): string {
  return '••••••••';
}
