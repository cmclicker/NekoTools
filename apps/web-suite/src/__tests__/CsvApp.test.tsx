import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CsvApp } from '../CsvApp.js';

const PRO = {
  version: 1 as const,
  licenseId: 'X',
  licensee: 'Buyer',
  tier: 'pro' as const,
  features: ['*'],
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
  signature: 's',
};

describe('CsvApp', () => {
  it('renders CSV counts and table cells', () => {
    render(<CsvApp initialInput={'name,age\nAda,37\nLinus,55'} />);

    expect(screen.getByTestId('csv-counts').textContent).toContain('2');
    expect(screen.getByTestId('csv-table').textContent).toContain('Ada');
    expect(screen.getByTestId('csv-table').textContent).toContain('Linus');
  });

  it('switches to TSV mode', () => {
    render(
      <CsvApp initialInput={'name\tlanguage\nGrace\tCOBOL'} initialUiState={{ delimiter: 'comma' }} />,
    );

    fireEvent.click(screen.getByTestId('csv-delimiter-tab'));

    expect(screen.getByTestId('csv-table').textContent).toContain('Grace');
    expect(screen.getByTestId('csv-table').textContent).toContain('COBOL');
  });

  it('can parse without a header row', () => {
    render(<CsvApp initialInput={'Ada,37'} />);

    fireEvent.click(screen.getByTestId('csv-has-header'));

    const table = screen.getByTestId('csv-table');
    expect(table.textContent).toContain('column_1');
    expect(table.textContent).toContain('Ada');
  });

  it('surfaces inconsistent-column diagnostics', () => {
    render(<CsvApp initialInput={'a,b\n1\n2,3,4'} />);

    expect(screen.getByText(/csv\.inconsistent_columns/)).toBeInTheDocument();
  });

  it('copies normalized CSV through the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <CsvApp
        initialInput={'name,note\nAda,"hello, world"'}
        clipboardDeps={{
          apiWrite: async (text) => {
            writes.push(text);
          },
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('csv-copy-normalized'));
    await waitFor(() => {
      expect(writes).toHaveLength(1);
    });
    expect(writes[0]).toBe('name,note\nAda,"hello, world"');
  });

  it('locks the Pro views (profile / schema / cleaning) when free', () => {
    render(
      <CsvApp initialInput={'name,age\nAda,37'} initialUiState={{ viewMode: 'profile' }} />,
    );
    expect(screen.getByTestId('csv-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('csv-output')).not.toBeInTheDocument();
  });

  it('renders the column profile in the profile view when Pro', () => {
    render(
      <CsvApp
        initialInput={'name,age\nAda,37'}
        initialUiState={{ viewMode: 'profile' }}
        entitlement={PRO}
      />,
    );
    expect(screen.queryByTestId('csv-locked')).not.toBeInTheDocument();
    expect(screen.getByTestId('csv-output').textContent ?? '').toContain(
      '# NekoCSV column profile',
    );
  });

  it('renders the inferred JSON Schema in the schema view when Pro', () => {
    render(
      <CsvApp
        initialInput={'name,age\nAda,37'}
        initialUiState={{ viewMode: 'schema' }}
        entitlement={PRO}
      />,
    );
    expect(screen.getByTestId('csv-output').textContent ?? '').toContain('"type": "object"');
  });

  it('renders the cleaning recipe in the cleaning view when Pro', () => {
    render(
      <CsvApp
        initialInput={'name,age\nAda,\nLinus,55'}
        initialUiState={{ viewMode: 'cleaning' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('csv-output').textContent ?? '';
    expect(out).toContain('"tool": "csv"');
    expect(out).toContain('"steps"');
  });
});
