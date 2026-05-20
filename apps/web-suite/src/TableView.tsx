import { useMemo } from 'react';
import { buildTableModel, formatCell, type TableModel } from './table-model.js';
import { filterTableRows } from './search.js';

interface TableViewProps {
  /** The parsed JSON value to render. */
  readonly value: unknown;
  /** Optional search query. Filters rows by cell contents (case-insensitive). */
  readonly searchQuery?: string;
}

/**
 * Phase 1.1g table view.
 *
 * Renders a JSON array of objects as a tabular grid. When the root
 * is not a tabular shape (not an array, or no object elements), a
 * "not applicable" hint is shown — the table view doesn't try to
 * force non-tabular data into rows.
 */
export function TableView({ value, searchQuery }: TableViewProps): JSX.Element {
  const model: TableModel = useMemo(() => buildTableModel(value), [value]);
  const visibleRows = useMemo(
    () => (searchQuery ? filterTableRows(model.rows, model.columns, searchQuery) : model.rows),
    [model.rows, model.columns, searchQuery],
  );

  if (!model.applicable) {
    return (
      <div className="table table--not-applicable" role="status" data-testid="table-not-applicable">
        <p>{model.notApplicableReason}</p>
        <p className="table__hint">
          Switch to the Tree or Text view to inspect this document.
        </p>
      </div>
    );
  }

  return (
    <div className="table" role="region" aria-label="JSON table view">
      <table className="table__grid">
        <thead>
          <tr>
            <th scope="col" className="table__row-num">#</th>
            {model.columns.map((col) => (
              <th key={col} scope="col">
                <code>{col}</code>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.length === 0 ? (
            <tr>
              <td
                colSpan={model.columns.length + 1}
                className="table__empty"
                data-testid="table-no-matches"
              >
                No rows match the current search.
              </td>
            </tr>
          ) : (
            visibleRows.map((row) => (
              <tr key={row.index} data-row-index={row.index}>
                <th scope="row" className="table__row-num">{row.index}</th>
                {model.columns.map((col) => {
                  const cell = row.cells.get(col);
                  const display = cell ? formatCell(cell) : '';
                  return (
                    <td
                      key={col}
                      data-present={cell?.present ?? false}
                      data-kind={cell?.kind ?? ''}
                      className={`table__cell${
                        cell?.present === false ? ' table__cell--missing' : ''
                      }`}
                    >
                      {cell?.present ? display : <span aria-hidden="true">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
