import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { PasswordApp } from '../PasswordApp.js';

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

describe('PasswordApp', () => {
  it('shows the empty-state with no input', () => {
    render(<PasswordApp />);
    expect(screen.getByTestId('password-empty')).toBeInTheDocument();
  });

  it('rates a weak password low and surfaces a warning', () => {
    render(<PasswordApp initialInput="password" />);
    expect(screen.getByTestId('password-meter').getAttribute('data-score')).toBe('0');
    expect(screen.getByText(/password\.pattern/)).toBeInTheDocument();
  });

  it('rates a long passphrase highly', () => {
    render(<PasswordApp initialInput="correct horse battery staple xyzzy" />);
    expect(screen.getByTestId('password-meter').getAttribute('data-score')).toBe('4');
    expect(screen.getByTestId('password-label').textContent).toMatch(/Very strong/);
  });

  it('renders crack-time scenarios', () => {
    render(<PasswordApp initialInput="Tr0ub4dour&3xyz" />);
    expect(screen.getByTestId('password-crack-times').textContent).toMatch(/Offline, fast hash/);
  });

  it('masks input by default and reveals on toggle', () => {
    render(<PasswordApp initialInput="secret" />);
    expect(screen.getByTestId('password-input')).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByTestId('password-reveal'));
    expect(screen.getByTestId('password-input')).toHaveAttribute('type', 'text');
  });

  it('never renders the raw password in the JSON view', () => {
    render(<PasswordApp initialInput="MyS3cr3t!pass" initialUiState={{ viewMode: 'json' }} />);
    expect(screen.getByTestId('password-output').textContent).not.toContain('MyS3cr3t!pass');
  });

  it('copies the markdown summary via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <PasswordApp
        initialInput="Abcd1234!xyz"
        initialUiState={{ viewMode: 'markdown' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('password-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toContain('# NekoPassword export');
  });

  it('locks the Policy + Audit-CSV Pro views when free', () => {
    render(<PasswordApp initialInput="password" initialUiState={{ viewMode: 'policy' }} />);
    expect(screen.getByTestId('password-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('password-output')).not.toBeInTheDocument();
  });

  // FLAGSHIP (wedge): NekoPassword earns Pro by turning a strength assessment
  // into a CI-consumable policy verdict — a stable failing rule id at the right
  // severity — WITHOUT leaking the password. A view that only renders prose
  // could pass while emitting zero rules, so this pins the verdict end-to-end.
  it('flows a weak password into the Pro policy audit as a NON-COMPLIANT failing rule (no leak)', () => {
    // Distinctive weak input ("kitten" — short, lowercase-only) so the no-leak
    // assertion is meaningful (it isn't a substring of any rule id or label).
    render(<PasswordApp initialInput="kitten" initialUiState={{ viewMode: 'policy' }} entitlement={PRO} />);
    const out = screen.getByTestId('password-output').textContent ?? '';
    expect(out).toContain('NON-COMPLIANT');
    expect(out).toContain('password.policy.min_length');
    expect(out).not.toContain('kitten');
  });

  it('exports the Pro audit CSV with a stable header + failing rule', () => {
    render(<PasswordApp initialInput="kitten" initialUiState={{ viewMode: 'audit' }} entitlement={PRO} />);
    const out = screen.getByTestId('password-output').textContent ?? '';
    expect(out.split('\n')[0]).toBe('ruleId,status,severity,detail');
    expect(out).toMatch(/password\.policy\.min_length,fail,high/);
  });
});
