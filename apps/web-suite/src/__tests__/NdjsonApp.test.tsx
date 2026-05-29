import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { NdjsonApp } from '../NdjsonApp.js';

describe('NdjsonApp', () => {
  it('renders the records table with per-line validity', () => {
    render(<NdjsonApp initialInput={'{"a":1}\n{bad}\n{"a":3}'} />);
    expect(screen.getByTestId('ndjson-stat-count').textContent).toBe('3');
    expect(screen.getByTestId('ndjson-stat-valid').textContent).toBe('2');
    expect(screen.getByTestId('ndjson-stat-invalid').textContent).toBe('1');
    expect(screen.getByText(/ndjson\.parse_error/)).toBeInTheDocument();
  });

  it('shows the inferred shape', () => {
    render(<NdjsonApp initialInput={'{"id":1,"name":"a"}\n{"id":2}'} initialUiState={{ viewMode: 'shape' }} />);
    const table = screen.getByTestId('ndjson-shape');
    expect(within(table).getByText('id')).toBeInTheDocument();
    expect(within(table).getByText('name')).toBeInTheDocument();
  });

  it('converts to a JSON array (valid records only)', () => {
    render(<NdjsonApp initialInput={'{"a":1}\n{bad}\n{"a":2}'} initialUiState={{ viewMode: 'json' }} />);
    expect(JSON.parse(screen.getByTestId('ndjson-output').textContent ?? '[]')).toEqual([
      { a: 1 },
      { a: 2 },
    ]);
  });

  it('shows the empty-state for whitespace-only input', () => {
    render(<NdjsonApp initialInput={'   '} />);
    expect(screen.getByTestId('ndjson-no-document')).toBeInTheDocument();
    expect(screen.getByText(/ndjson\.empty_input/)).toBeInTheDocument();
  });

  it('copies the NDJSON view via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <NdjsonApp
        initialInput={'{ "a" : 1 }'}
        initialUiState={{ viewMode: 'ndjson' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('ndjson-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toBe('{"a":1}');
  });
});
