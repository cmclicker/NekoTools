import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { TomlApp } from '../TomlApp.js';

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

describe('TomlApp', () => {
  it('decodes TOML and renders the JSON view + document stats', () => {
    render(<TomlApp initialInput={'title = "x"\n[server]\nport = 8080'} />);
    expect(screen.getByTestId('toml-stat-valid').textContent).toBe('yes');
    expect(screen.getByTestId('toml-stat-tables').textContent).toBe('1');
    expect(screen.getByTestId('toml-stat-keys').textContent).toBe('2');
    expect(JSON.parse(screen.getByTestId('toml-output').textContent ?? '{}')).toEqual({
      title: 'x',
      server: { port: 8080 },
    });
  });

  it('switches to the normalized TOML view', () => {
    render(
      <TomlApp
        initialInput={'port = 8080\n[server]\nhost = "localhost"'}
        initialUiState={{ viewMode: 'normalized' }}
      />,
    );
    const body = screen.getByTestId('toml-output').textContent ?? '';
    expect(body).toContain('port = 8080');
    expect(body).toContain('[server]');
  });

  it('surfaces a parse-error diagnostic with its line number', () => {
    render(<TomlApp initialInput={'ok = 1\nthis is broken'} />);
    expect(screen.getByText(/toml\.parse_error/)).toBeInTheDocument();
    expect(screen.getByTestId('toml-stat-valid').textContent).toBe('no');
  });

  it('flags a duplicate key', () => {
    render(<TomlApp initialInput={'x = 1\nx = 2'} />);
    expect(screen.getByText(/toml\.duplicate_key/)).toBeInTheDocument();
  });

  it('shows the empty-state for whitespace-only input', () => {
    render(<TomlApp initialInput={'   '} />);
    expect(screen.getByTestId('toml-no-document')).toBeInTheDocument();
    expect(screen.getByText(/toml\.empty_input/)).toBeInTheDocument();
  });

  it('copies the current view output via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <TomlApp
        initialInput={'port = 8080'}
        initialUiState={{ viewMode: 'normalized' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('toml-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toBe('port = 8080');
  });

  it('locks the TypeScript + JSON Schema Pro views when free', () => {
    render(
      <TomlApp initialInput={'title = "x"'} initialUiState={{ viewMode: 'types' }} />,
    );
    expect(screen.getByTestId('toml-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('toml-output')).not.toBeInTheDocument();
  });

  it('unlocks the TypeScript type via an injected Pro entitlement', () => {
    render(
      <TomlApp
        initialInput={'title = "x"\n[server]\nport = 8080'}
        initialUiState={{ viewMode: 'types' }}
        entitlement={PRO}
      />,
    );
    expect(screen.getByTestId('toml-output').textContent ?? '').toContain(
      'export type Config = {',
    );
  });

  it('renders the inferred JSON Schema in the schema view when Pro', () => {
    render(
      <TomlApp
        initialInput={'title = "x"\n[server]\nport = 8080'}
        initialUiState={{ viewMode: 'schema' }}
        entitlement={PRO}
      />,
    );
    expect(screen.getByTestId('toml-output').textContent ?? '').toContain('"type": "object"');
  });
});
