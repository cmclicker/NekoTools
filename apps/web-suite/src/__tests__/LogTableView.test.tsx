import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { LogEntry } from '@nekotools/lens-logs';

import { LogTableView, filterEntries } from '../LogTableView.js';

const entries: LogEntry[] = [
  {
    lineNumber: 1,
    raw: '{"level":"info","msg":"service started","svc":"api"}',
    format: 'json',
    message: 'service started',
    level: 'info',
    timestamp: '2026-05-21T10:00:00.000Z',
    timestampMs: Date.parse('2026-05-21T10:00:00.000Z'),
    fields: { svc: 'api' },
  },
  {
    lineNumber: 2,
    raw: 'level=error msg="upstream timeout" svc=db',
    format: 'logfmt',
    message: 'upstream timeout',
    level: 'error',
    fields: { svc: 'db' },
  },
  {
    lineNumber: 3,
    raw: 'a bare line',
    format: 'plain',
    message: 'a bare line',
    fields: {},
  },
];

describe('LogTableView', () => {
  it('renders one row per entry with line / time / level / message', () => {
    render(
      <LogTableView entries={entries} searchQuery="" activeLine={null} onSelectLine={() => {}} />,
    );
    const rows = screen.getAllByTestId('log-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain('service started');
    expect(rows[0]?.textContent).toContain('2026-05-21T10:00:00.000Z');
    expect(rows[1]?.textContent).toContain('upstream timeout');
  });

  it('applies a per-level color class to the level cell', () => {
    render(
      <LogTableView entries={entries} searchQuery="" activeLine={null} onSelectLine={() => {}} />,
    );
    const errorRow = screen.getByText('upstream timeout').closest('tr')!;
    const levelChip = within(errorRow).getByTestId('log-row-level');
    expect(levelChip).toHaveClass('log-level--error');
    expect(errorRow).toHaveAttribute('data-level', 'error');

    // An entry with no level renders the neutral `none` class.
    const bareRow = screen.getByText('a bare line').closest('tr')!;
    expect(bareRow).toHaveAttribute('data-level', 'none');
    expect(within(bareRow).getByTestId('log-row-level')).toHaveClass('log-level--none');
  });

  it('substring-filters by message / level / field (case-insensitive)', () => {
    render(
      <LogTableView
        entries={entries}
        searchQuery="UPSTREAM"
        activeLine={null}
        onSelectLine={() => {}}
      />,
    );
    const rows = screen.getAllByTestId('log-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('upstream timeout');
  });

  it('search matches a structured field value (e.g. svc=db)', () => {
    render(
      <LogTableView entries={entries} searchQuery="db" activeLine={null} onSelectLine={() => {}} />,
    );
    const rows = screen.getAllByTestId('log-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('upstream timeout');
  });

  it('shows the no-matches hint when the query excludes everything', () => {
    render(
      <LogTableView
        entries={entries}
        searchQuery="zzz-no-such-thing"
        activeLine={null}
        onSelectLine={() => {}}
      />,
    );
    expect(screen.getByTestId('log-table-no-matches')).toBeInTheDocument();
  });

  it('shows the empty-state hint when there are no entries', () => {
    render(<LogTableView entries={[]} searchQuery="" activeLine={null} onSelectLine={() => {}} />);
    expect(screen.getByTestId('log-table-empty')).toBeInTheDocument();
  });

  it('marks the active row with aria-selected=true and the highlight class', () => {
    render(
      <LogTableView entries={entries} searchQuery="" activeLine={2} onSelectLine={() => {}} />,
    );
    const errorRow = screen.getByText('upstream timeout').closest('tr')!;
    expect(errorRow).toHaveAttribute('aria-selected', 'true');
    expect(errorRow).toHaveClass('log-row--active');
    const infoRow = screen.getByText('service started').closest('tr')!;
    expect(infoRow).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking a row calls onSelectLine with the line number', () => {
    const onSelectLine = vi.fn();
    render(
      <LogTableView entries={entries} searchQuery="" activeLine={null} onSelectLine={onSelectLine} />,
    );
    fireEvent.click(screen.getByText('upstream timeout').closest('tr')!);
    expect(onSelectLine).toHaveBeenCalledWith(2);
  });
});

describe('filterEntries', () => {
  it('empty query returns everything', () => {
    expect(filterEntries(entries, '')).toHaveLength(entries.length);
  });

  it('whitespace-only query returns everything', () => {
    expect(filterEntries(entries, '   ')).toHaveLength(entries.length);
  });

  it('matches the level token', () => {
    expect(filterEntries(entries, 'ERROR').map((e) => e.lineNumber)).toEqual([2]);
  });

  it('matches a field key as well as a field value', () => {
    // both line 1 (svc=api) and line 2 (svc=db) carry the `svc` key.
    expect(filterEntries(entries, 'svc').map((e) => e.lineNumber)).toEqual([1, 2]);
  });
});
