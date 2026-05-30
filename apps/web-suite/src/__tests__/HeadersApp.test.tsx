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

// A response missing every hardening header + leaking Server / X-Powered-By.
const INSECURE = 'HTTP/1.1 200 OK\nContent-Type: text/html\nServer: nginx/1.25\nX-Powered-By: PHP/8.1\n';

describe('HeadersApp', () => {
  it('parses headers and shows the Name/Value table by default', () => {
    render(<HeadersApp initialInput={'Content-Type: text/html\nServer: nginx\n'} />);
    const table = screen.getByTestId('headers-table');
    expect(table.textContent).toContain('Content-Type');
    expect(table.textContent).toContain('text/html');
    expect(table.textContent).toContain('Server');
  });

  it('switches to the JSON view', () => {
    render(
      <HeadersApp initialInput={'Content-Type: text/html\n'} initialUiState={{ viewMode: 'json' }} />,
    );
    const out = screen.getByTestId('headers-output');
    expect(JSON.parse(out.textContent ?? '{}')).toEqual({ 'Content-Type': 'text/html' });
  });

  it('surfaces a malformed-line diagnostic', () => {
    render(<HeadersApp initialInput={'this is not a header\n'} />);
    expect(screen.getByText(/headers\.malformed_line/)).toBeInTheDocument();
  });

  it('surfaces basic security-hint diagnostics for a minimal header set', () => {
    render(<HeadersApp initialInput={'Content-Type: text/html\n'} />);
    expect(screen.getAllByText(/headers\.security_hint/).length).toBeGreaterThan(0);
  });

  it('copies the JSON via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <HeadersApp
        initialInput={'X-A: 1\n'}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('headers-copy-json'));
    await waitFor(() => {
      expect(writes).toHaveLength(1);
    });
    expect(JSON.parse(writes[0]!)).toEqual({ 'X-A': '1' });
  });

  it('locks the Audit + SARIF Pro views when free', () => {
    render(<HeadersApp initialInput={INSECURE} initialUiState={{ viewMode: 'sarif' }} />);
    expect(screen.getByTestId('headers-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('headers-output')).not.toBeInTheDocument();
  });

  // FLAGSHIP (wedge): the security-posture verdict must cross the UI into the
  // CI-consumable SARIF as a stable rule id at the right level — a view that
  // stopped at prose could pass while emitting zero results.
  it('flows an insecure response into the Pro SARIF export (missing_hsts @ error)', () => {
    render(<HeadersApp initialInput={INSECURE} initialUiState={{ viewMode: 'sarif' }} entitlement={PRO} />);
    const sarif = JSON.parse(screen.getByTestId('headers-output').textContent ?? '{}') as {
      version: string;
      runs: { results: { ruleId: string; level: string }[] }[];
    };
    expect(sarif.version).toBe('2.1.0');
    const hsts = sarif.runs[0]?.results.find((r) => r.ruleId === 'headers.audit.missing_hsts');
    expect(hsts?.level).toBe('error');
  });

  it('renders the Pro audit report with the verdict + a stable rule id', () => {
    render(<HeadersApp initialInput={INSECURE} initialUiState={{ viewMode: 'audit' }} entitlement={PRO} />);
    const out = screen.getByTestId('headers-output').textContent ?? '';
    expect(out).toContain('# NekoHeaders security audit');
    expect(out).toContain('ISSUES FOUND');
    expect(out).toContain('headers.audit.info_leak_server');
  });
});
