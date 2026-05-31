import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { IniApp } from '../IniApp.js';

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

describe('IniApp', () => {
  it('renders sections + entries with counts', () => {
    render(<IniApp initialInput={'[server]\nhost = localhost\nport = 8080'} />);
    expect(screen.getByTestId('ini-stat-sections').textContent).toBe('1');
    expect(screen.getByTestId('ini-stat-keys').textContent).toBe('2');
    const sections = screen.getByTestId('ini-sections');
    expect(within(sections).getByText('server')).toBeInTheDocument();
    expect(within(sections).getByText('host')).toBeInTheDocument();
  });

  it('converts to JSON', () => {
    render(<IniApp initialInput={'[s]\nk = v'} initialUiState={{ viewMode: 'json' }} />);
    expect(JSON.parse(screen.getByTestId('ini-output').textContent ?? '{}')).toEqual({ s: { k: 'v' } });
  });

  it('warns on a duplicate key', () => {
    render(<IniApp initialInput={'[s]\nk = 1\nk = 2'} />);
    expect(screen.getByText(/ini\.duplicate_key/)).toBeInTheDocument();
  });

  it('shows the empty-state for whitespace-only input', () => {
    render(<IniApp initialInput={'   '} />);
    expect(screen.getByTestId('ini-no-document')).toBeInTheDocument();
    expect(screen.getByText(/ini\.empty_input/)).toBeInTheDocument();
  });

  it('switches to the normalized view', () => {
    render(<IniApp initialInput={'[s]\nk = v'} initialUiState={{ viewMode: 'normalized' }} />);
    expect(screen.getByTestId('ini-output').textContent).toContain('[s]');
    expect(screen.getByTestId('ini-output').textContent).toContain('k=v');
  });

  it('copies the JSON view via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <IniApp
        initialInput={'[s]\nk = v'}
        initialUiState={{ viewMode: 'json' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('ini-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(JSON.parse(writes[0] ?? '{}')).toEqual({ s: { k: 'v' } });
  });

  it('locks the dotenv + TOML Pro views when free', () => {
    render(
      <IniApp
        initialInput={'[server]\nhost = localhost'}
        initialUiState={{ viewMode: 'env' }}
      />,
    );
    expect(screen.getByTestId('ini-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('ini-output')).not.toBeInTheDocument();
  });

  it('unlocks the dotenv view via an injected Pro entitlement', () => {
    render(
      <IniApp
        initialInput={'[server]\nhost = localhost'}
        initialUiState={{ viewMode: 'env' }}
        entitlement={PRO}
      />,
    );
    expect(screen.queryByTestId('ini-locked')).not.toBeInTheDocument();
    expect(screen.getByTestId('ini-output').textContent ?? '').toContain('SERVER_HOST=localhost');
  });

  it('unlocks the TOML view via an injected Pro entitlement', () => {
    render(
      <IniApp
        initialInput={'[server]\nhost = localhost'}
        initialUiState={{ viewMode: 'toml' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('ini-output').textContent ?? '';
    expect(out).toContain('[server]');
    expect(out).toContain('host = "localhost"');
  });

  it('loads a local file into the input (read locally, never uploaded)', async () => {
    render(<IniApp initialInput={'[server]\nhost = localhost'} />);
    const file = new File(['[s]\nloaded=true'], 'sample.ini', { type: 'text/plain' });
    fireEvent.change(screen.getByTestId('ini-file'), { target: { files: [file] } });
    await waitFor(() =>
      expect((screen.getByTestId('ini-input') as HTMLTextAreaElement).value).toContain(
        'loaded=true',
      ),
    );
  });
});
