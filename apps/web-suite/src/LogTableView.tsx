import type { LogEntry } from '@nekotools/lens-logs';

import { matchesQuery, normalizeQuery } from './search.js';

interface LogTableViewProps {
  /** The entries to render — `document.entries`, or a filter result's entries. */
  readonly entries: readonly LogEntry[];
  readonly searchQuery: string;
  readonly activeLine: number | null;
  readonly onSelectLine: (lineNumber: number) => void;
}

/**
 * Table view for a parsed `log.document` (or `log.filter-result`). One
 * row per entry: Line / Time / Level / Message. Mirrors NekoEnv's
 * `EnvTableView` structure — one row per entry in source order, a
 * click selects the row, the active row gets `aria-selected` plus a
 * highlight class.
 *
 * Search is a case-insensitive substring match (the shared `search.ts`
 * helper) over the message, level, and the stringified fields, so a
 * user can narrow on a request id or any structured value without a
 * structured-filter round-trip. The structured filter (`LogFilter`) is
 * the engine-backed predicate; this free-text search is a pure view
 * narrowing on top of whatever entries the active filter produced.
 */
export function LogTableView({
  entries,
  searchQuery,
  activeLine,
  onSelectLine,
}: LogTableViewProps): JSX.Element {
  if (entries.length === 0) {
    return (
      <div role="status" className="empty-state" data-testid="log-table-empty">
        No log entries to show. Paste a log snapshot above.
      </div>
    );
  }

  const filtered = filterEntries(entries, searchQuery);

  if (filtered.length === 0) {
    return (
      <div role="status" className="empty-state" data-testid="log-table-no-matches">
        No entries match your search.
      </div>
    );
  }

  return (
    <div className="log-table" role="region" aria-label="NekoLogs table view">
      <table>
        <thead>
          <tr>
            <th scope="col">Line</th>
            <th scope="col">Time</th>
            <th scope="col">Level</th>
            <th scope="col">Message</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((entry, idx) => {
            const isActive = entry.lineNumber === activeLine;
            const level = entry.level ?? 'none';
            return (
              <tr
                key={`${entry.lineNumber}__${idx}`}
                aria-selected={isActive}
                className={isActive ? 'log-row log-row--active' : 'log-row'}
                onClick={() => onSelectLine(entry.lineNumber)}
                data-testid="log-row"
                data-line={entry.lineNumber}
                data-level={level}
              >
                <td className="log-row__line">{entry.lineNumber}</td>
                <td className="log-row__time">
                  <code data-testid="log-row-time">{entry.timestamp ?? '—'}</code>
                </td>
                <td className="log-row__level">
                  <span
                    className={`log-level log-level--${level}`}
                    data-testid="log-row-level"
                  >
                    {entry.level ?? '—'}
                  </span>
                </td>
                <td className="log-row__message">
                  <code data-testid="log-row-message">{entry.message || '(empty)'}</code>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Substring match against message + level + stringified fields;
 * empty query matches everything. Case-insensitive via the shared
 * `search.ts` helpers (same contract NekoJSON / NekoEnv search use).
 */
export function filterEntries(
  entries: readonly LogEntry[],
  query: string,
): readonly LogEntry[] {
  const normalized = normalizeQuery(query);
  if (normalized === '') return entries;
  return entries.filter((e) => {
    if (matchesQuery(e.message, normalized)) return true;
    if (e.level !== undefined && matchesQuery(e.level, normalized)) return true;
    for (const [key, value] of Object.entries(e.fields)) {
      if (matchesQuery(key, normalized) || matchesQuery(value, normalized)) return true;
    }
    return false;
  });
}
