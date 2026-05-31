import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { NdjsonApp } from '../NdjsonApp.js';

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

  it('locks the JSON Schema + CSV Pro views when free', () => {
    render(
      <NdjsonApp initialInput={'{"id":1,"name":"a"}\n{"id":2}'} initialUiState={{ viewMode: 'schema' }} />,
    );
    expect(screen.getByTestId('ndjson-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('ndjson-output')).not.toBeInTheDocument();
  });

  it('unlocks the inferred JSON Schema via an injected Pro entitlement', () => {
    render(
      <NdjsonApp
        initialInput={'{"id":1,"name":"a"}\n{"id":2}'}
        initialUiState={{ viewMode: 'schema' }}
        entitlement={PRO}
      />,
    );
    expect(screen.getByTestId('ndjson-output').textContent ?? '').toContain('"type": "object"');
  });

  it('unlocks the flattened CSV via an injected Pro entitlement', () => {
    render(
      <NdjsonApp
        initialInput={'{"id":1,"name":"a"}\n{"id":2}'}
        initialUiState={{ viewMode: 'csv' }}
        entitlement={PRO}
      />,
    );
    expect((screen.getByTestId('ndjson-output').textContent ?? '').split('\n')[0]).toBe('id,name');
  });
});
