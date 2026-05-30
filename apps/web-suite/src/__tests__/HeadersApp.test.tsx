import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { HeadersApp } from '../HeadersApp.js';

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

const INSECURE = 'content-type: text/html';

describe('HeadersApp', () => {
  it('parses headers and shows the Name/Value table by default', () => {
    render(<HeadersApp initialInput={'Content-Type: text/html\nServer: nginx\n'} />);
    const table = screen.getByTestId('headers-table');
    expect(table.textContent).toContain('Content-Type');
    expect(table.textContent).toContain('text/html');
    expect(table.textContent).toContain('Server');
  });

  it('switches to the JSON view (name -> value object)', () => {
    render(
      <HeadersApp initialInput={'Content-Type: text/html\n'} initialUiState={{ viewMode: 'json' }} />,
    );
    expect(JSON.parse(screen.getByTestId('headers-output').textContent ?? '{}')).toEqual({
      'Content-Type': 'text/html',
    });
  });

  it('surfaces a malformed-line diagnostic', () => {
    render(<HeadersApp initialInput={'this is not a header\n'} />);
    expect(screen.getByText(/headers\.malformed_line/)).toBeInTheDocument();
  });

  it('locks the audit + pack Pro views when free', () => {
    render(<HeadersApp initialInput={INSECURE} initialUiState={{ viewMode: 'audit' }} />);
    expect(screen.getByTestId('headers-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('headers-output')).not.toBeInTheDocument();
  });

  it('unlocks the security audit via an injected Pro entitlement', () => {
    render(
      <HeadersApp initialInput={INSECURE} initialUiState={{ viewMode: 'audit' }} entitlement={PRO} />,
    );
    const out = screen.getByTestId('headers-output').textContent ?? '';
    expect(out).toContain('# NekoHeaders security audit');
    expect(out).toContain('grade:');
  });

  it('renders the hardened CORS/CSP pack in the pack view when Pro', () => {
    render(
      <HeadersApp initialInput={INSECURE} initialUiState={{ viewMode: 'pack' }} entitlement={PRO} />,
    );
    const out = screen.getByTestId('headers-output').textContent ?? '';
    expect(out).toContain('# NekoHeaders hardened CORS + CSP pack');
    expect(out).toContain('Strict-Transport-Security:');
  });

  it('copies the JSON via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <HeadersApp
        initialInput={'X-A: 1\n'}
        initialUiState={{ viewMode: 'json' }}
        clipboardDeps={{
          apiWrite: async (t) => {
            writes.push(t);
          },
        }}
      />,
    );
    fireEvent.click(screen.getByTestId('headers-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(JSON.parse(writes[0] ?? '{}')).toEqual({ 'X-A': '1' });
  });
});
