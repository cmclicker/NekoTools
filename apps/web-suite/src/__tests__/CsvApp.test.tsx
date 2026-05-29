import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CsvApp } from '../CsvApp.js';

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
});
