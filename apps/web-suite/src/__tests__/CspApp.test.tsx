import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { CspApp } from '../CspApp.js';

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

describe('CspApp', () => {
  it('renders the directive table (free, default view)', () => {
    render(<CspApp initialInput={"default-src 'self'; script-src 'self' 'unsafe-inline'"} />);
    const table = screen.getByTestId('csp-table');
    expect(within(table).getByText('default-src')).toBeInTheDocument();
    expect(within(table).getByText('script-src')).toBeInTheDocument();
  });

  it('shows JSON output in the json view', () => {
    render(<CspApp initialInput={"default-src 'self'"} initialUiState={{ viewMode: 'json' }} />);
    const json = JSON.parse(screen.getByTestId('csp-output').textContent ?? '{}');
    expect(json.directives[0].name).toBe('default-src');
  });

  it('surfaces a security diagnostic via the Diagnostics panel', () => {
    render(<CspApp initialInput={"script-src 'unsafe-inline'"} />);
    expect(screen.getByText(/csp\.unsafe_inline/)).toBeInTheDocument();
  });

  it('locks the audit + hardened Pro views when free', () => {
    render(<CspApp initialInput={"script-src 'unsafe-inline'"} initialUiState={{ viewMode: 'audit' }} />);
    expect(screen.getByTestId('csp-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('csp-output')).not.toBeInTheDocument();
  });

  it('unlocks the posture audit via an injected Pro entitlement', () => {
    render(
      <CspApp
        initialInput={"script-src 'unsafe-inline' 'unsafe-eval'"}
        initialUiState={{ viewMode: 'audit' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('csp-output').textContent ?? '';
    expect(out).toContain('# NekoCSP posture audit');
    expect(out).toContain('csp.unsafe_eval');
  });

  it('renders the hardened policy in the hardened view when Pro', () => {
    render(
      <CspApp
        initialInput={"script-src 'unsafe-inline' 'unsafe-eval'; img-src *"}
        initialUiState={{ viewMode: 'hardened' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('csp-output').textContent ?? '';
    expect(out).toContain('# NekoCSP hardened policy');
    // Assert on the emitted policy line, not the changelog comment above it
    // (the changelog legitimately names the tokens it removed).
    const policy = out.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#')).at(-1) ?? '';
    expect(policy).not.toContain("'unsafe-inline'");
    expect(policy).toContain("default-src 'self'");
  });

  it('shows the empty-state for whitespace-only input', () => {
    render(<CspApp initialInput={'   '} />);
    expect(screen.getByTestId('csp-no-document')).toBeInTheDocument();
    expect(screen.getByText(/csp\.empty_input/)).toBeInTheDocument();
  });

  it('copies the JSON view via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <CspApp
        initialInput={"default-src 'self'"}
        initialUiState={{ viewMode: 'json' }}
        clipboardDeps={{
          apiWrite: async (t) => {
            writes.push(t);
          },
        }}
      />,
    );
    fireEvent.click(screen.getByTestId('csp-copy-json'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(JSON.parse(writes[0] ?? '{}').directives[0].name).toBe('default-src');
  });
});
