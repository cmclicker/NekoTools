import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { EnvDocument } from '@nekotools/lens-env';

import { EnvTableView, filterEntries, mask } from '../EnvTableView.js';

const sampleDoc: EnvDocument = {
  entries: [
    {
      key: 'DATABASE_URL',
      value: 'postgres://localhost/app',
      quoting: 'none',
      exportPrefix: false,
      startLine: 1,
      endLine: 1,
    },
    {
      key: 'PORT',
      value: '8080',
      quoting: 'none',
      exportPrefix: false,
      startLine: 2,
      endLine: 2,
    },
    {
      key: 'DEBUG',
      value: 'true',
      quoting: 'double',
      exportPrefix: true,
      startLine: 3,
      endLine: 3,
    },
  ],
  lines: [
    { kind: 'entry', entryIndex: 0, line: 1, endLine: 1 },
    { kind: 'entry', entryIndex: 1, line: 2, endLine: 2 },
    { kind: 'entry', entryIndex: 2, line: 3, endLine: 3 },
  ],
};

describe('EnvTableView', () => {
  it('renders one row per entry with key + value + quoting + line', () => {
    render(
      <EnvTableView
        document={sampleDoc}
        searchQuery=""
        activeKey={null}
        onSelectKey={() => {}}
        maskValues={false}
      />,
    );
    const rows = screen.getAllByTestId('env-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain('DATABASE_URL');
    expect(rows[0]?.textContent).toContain('postgres://localhost/app');
    expect(rows[2]?.textContent).toContain('export');
    expect(rows[2]?.textContent).toContain('DEBUG');
  });

  it('substring-filters by key and value (case-insensitive)', () => {
    render(
      <EnvTableView
        document={sampleDoc}
        searchQuery="POSTGRES"
        activeKey={null}
        onSelectKey={() => {}}
        maskValues={false}
      />,
    );
    expect(screen.getAllByTestId('env-row')).toHaveLength(1);
    expect(screen.getByText('DATABASE_URL')).toBeInTheDocument();
  });

  it('shows the no-matches hint when the query excludes everything', () => {
    render(
      <EnvTableView
        document={sampleDoc}
        searchQuery="zzz-no-such-thing"
        activeKey={null}
        onSelectKey={() => {}}
        maskValues={false}
      />,
    );
    expect(screen.getByTestId('env-table-no-matches')).toBeInTheDocument();
  });

  it('shows the empty-state hint when the document has no entries', () => {
    render(
      <EnvTableView
        document={{ entries: [], lines: [] }}
        searchQuery=""
        activeKey={null}
        onSelectKey={() => {}}
        maskValues={false}
      />,
    );
    expect(screen.getByTestId('env-table-empty')).toBeInTheDocument();
  });

  it('marks the active row with aria-selected=true', () => {
    render(
      <EnvTableView
        document={sampleDoc}
        searchQuery=""
        activeKey="PORT"
        onSelectKey={() => {}}
        maskValues={false}
      />,
    );
    const portRow = screen.getByText('PORT').closest('tr');
    expect(portRow).toHaveAttribute('aria-selected', 'true');
    const dbRow = screen.getByText('DATABASE_URL').closest('tr');
    expect(dbRow).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking a row calls onSelectKey with the key', () => {
    const onSelectKey = vi.fn();
    render(
      <EnvTableView
        document={sampleDoc}
        searchQuery=""
        activeKey={null}
        onSelectKey={onSelectKey}
        maskValues={false}
      />,
    );
    fireEvent.click(screen.getByText('PORT').closest('tr')!);
    expect(onSelectKey).toHaveBeenCalledWith('PORT');
  });

  it('mask=true replaces non-empty values with the dot mask while keeping keys visible', () => {
    render(
      <EnvTableView
        document={sampleDoc}
        searchQuery=""
        activeKey={null}
        onSelectKey={() => {}}
        maskValues
      />,
    );
    const dbRow = screen.getByText('DATABASE_URL').closest('tr')!;
    const value = within(dbRow).getByTestId('env-row-value');
    expect(value.textContent).toBe('••••••••');
    // The key is unchanged.
    expect(dbRow.textContent).toContain('DATABASE_URL');
  });

  it('mask=true leaves empty values rendered as (empty), not as the dot mask', () => {
    const docWithEmpty: EnvDocument = {
      entries: [
        { key: 'EMPTY', value: '', quoting: 'none', exportPrefix: false, startLine: 1, endLine: 1 },
      ],
      lines: [{ kind: 'entry', entryIndex: 0, line: 1, endLine: 1 }],
    };
    render(
      <EnvTableView
        document={docWithEmpty}
        searchQuery=""
        activeKey={null}
        onSelectKey={() => {}}
        maskValues
      />,
    );
    const row = screen.getByText('EMPTY').closest('tr')!;
    const value = within(row).getByTestId('env-row-value');
    expect(value.textContent).toBe('(empty)');
  });
});

describe('filterEntries', () => {
  it('empty query returns everything', () => {
    expect(filterEntries(sampleDoc.entries, '')).toHaveLength(sampleDoc.entries.length);
  });

  it('whitespace-only query returns everything', () => {
    expect(filterEntries(sampleDoc.entries, '   ')).toHaveLength(sampleDoc.entries.length);
  });

  it('matches against the decoded value (case-insensitive)', () => {
    const filtered = filterEntries(sampleDoc.entries, 'TRUE');
    expect(filtered.map((e) => e.key)).toEqual(['DEBUG']);
  });
});

describe('mask helper', () => {
  it('returns a fixed-width dot string independent of input length', () => {
    expect(mask('short')).toBe('••••••••');
    expect(mask('a-much-longer-value-with-secrets')).toBe('••••••••');
  });
});
