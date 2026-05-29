import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { JwtApp } from '../JwtApp.js';

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

const VALID =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vLXVzZXIiLCJpc3MiOiJkZW1vLWlzc3VlciIsImF1ZCI6ImRlbW8tYXBwIiwiZXhwIjo5OTk5OTk5OTk5LCJpYXQiOjE3MTY3MzYwMDB9.test';
const EXPIRED =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaXNzIjoiaXNzdWVyIiwiYXVkIjoiYXVkaWVuY2UiLCJleHAiOjEsImlhdCI6MCwibmJmIjowfQ.test';

describe('JwtApp', () => {
  it('decodes a JWT and shows the summary (free)', () => {
    render(<JwtApp initialInput={VALID} />);
    expect(screen.getByTestId('jwt-summary').textContent).toContain('HS256');
  });

  it('shows header JSON in the header view', () => {
    render(<JwtApp initialInput={VALID} initialUiState={{ viewMode: 'header' }} />);
    expect(screen.getByTestId('jwt-header-output').textContent).toContain('"alg": "HS256"');
  });

  it('locks the audit + SARIF Pro views when free', () => {
    render(<JwtApp initialInput={VALID} initialUiState={{ viewMode: 'audit' }} />);
    expect(screen.getByTestId('jwt-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('jwt-audit-output')).not.toBeInTheDocument();
  });

  it('unlocks the claims audit via an injected Pro entitlement', () => {
    render(<JwtApp initialInput={EXPIRED} initialUiState={{ viewMode: 'audit' }} entitlement={PRO} />);
    const out = screen.getByTestId('jwt-audit-output').textContent ?? '';
    expect(out).toContain('claims & security audit');
    expect(out).toContain('jwt.token_expired');
  });

  it('renders SARIF 2.1.0 when Pro', () => {
    render(<JwtApp initialInput={VALID} initialUiState={{ viewMode: 'sarif' }} entitlement={PRO} />);
    expect(JSON.parse(screen.getByTestId('jwt-sarif-output').textContent ?? '{}').version).toBe('2.1.0');
  });

  it('always shows the verify panel — locked/disabled when free, enabled when Pro (no tier layout shift)', () => {
    const { unmount } = render(<JwtApp initialInput={VALID} />);
    expect(screen.getByTestId('jwt-verify-panel')).toBeInTheDocument();
    expect(screen.getByTestId('jwt-verify-key')).toBeDisabled();
    expect(screen.getByTestId('jwt-verify-run')).toBeDisabled();
    expect(screen.getByTestId('jwt-verify-locked')).toBeInTheDocument();
    unmount();
    render(<JwtApp initialInput={VALID} entitlement={PRO} />);
    expect(screen.getByTestId('jwt-verify-panel')).toBeInTheDocument();
    expect(screen.getByTestId('jwt-verify-key')).not.toBeDisabled();
    expect(screen.getByTestId('jwt-verify-run')).not.toBeDisabled();
    expect(screen.queryByTestId('jwt-verify-locked')).not.toBeInTheDocument();
  });

  it('verifies a signature via the offline verifier', async () => {
    const verify = vi.fn(async () => ({ verified: true, alg: 'HS256', status: 'verified' as const }));
    render(<JwtApp initialInput={VALID} entitlement={PRO} verify={verify} />);
    fireEvent.change(screen.getByTestId('jwt-verify-key'), { target: { value: 'topsecret' } });
    fireEvent.click(screen.getByTestId('jwt-verify-run'));
    await waitFor(() =>
      expect(screen.getByTestId('jwt-verify-result')).toHaveAttribute('data-verified', 'true'),
    );
    expect(verify).toHaveBeenCalled();
  });

  it('really verifies an HS256 token end-to-end with the shared secret', async () => {
    // Build a genuinely-signed HS256 token in the test, then verify via the UI.
    const enc = (s: string) => new TextEncoder().encode(s);
    const b64url = (b: Uint8Array) => {
      let bin = '';
      for (const x of b) bin += String.fromCharCode(x);
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    const h = b64url(enc('{"alg":"HS256","typ":"JWT"}'));
    const p = b64url(enc('{"sub":"x","exp":9999999999}'));
    const key = await crypto.subtle.importKey('raw', enc('s3cr3t'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc(`${h}.${p}`)));
    const token = `${h}.${p}.${b64url(sig)}`;

    render(<JwtApp initialInput={token} entitlement={PRO} />);
    fireEvent.change(screen.getByTestId('jwt-verify-key'), { target: { value: 's3cr3t' } });
    fireEvent.click(screen.getByTestId('jwt-verify-run'));
    await waitFor(() =>
      expect(screen.getByTestId('jwt-verify-result')).toHaveAttribute('data-verified', 'true'),
    );
  });

  // FLAGSHIP (wedge): the offline signature outcome is NekoJWT's headline
  // security signal — it must flow past the UI into the CI-consumable SARIF,
  // not stay a UI-only badge. A failing verification has to surface as a
  // `jwt.signature_invalid` SARIF result, or the Pro export is hollow.
  it('flows a failed signature verification into the SARIF export (jwt.signature_invalid)', async () => {
    const verify = vi.fn(async () => ({
      verified: false,
      alg: 'HS256',
      status: 'invalid' as const,
      reason: 'signature does not match',
    }));
    render(
      <JwtApp
        initialInput={VALID}
        initialUiState={{ viewMode: 'sarif' }}
        entitlement={PRO}
        verify={verify}
      />,
    );
    // Before verifying, the SARIF must NOT already carry a signature finding.
    expect(screen.getByTestId('jwt-sarif-output').textContent ?? '').not.toContain(
      'jwt.signature_invalid',
    );
    fireEvent.change(screen.getByTestId('jwt-verify-key'), { target: { value: 'WRONG' } });
    fireEvent.click(screen.getByTestId('jwt-verify-run'));
    await waitFor(() =>
      expect(screen.getByTestId('jwt-sarif-output').textContent ?? '').toContain(
        'jwt.signature_invalid',
      ),
    );
    // ...and it lands as a SARIF "error" level (high severity), not a note.
    const sarif = JSON.parse(screen.getByTestId('jwt-sarif-output').textContent ?? '{}') as {
      runs: { results: { ruleId: string; level: string }[] }[];
    };
    const sig = sarif.runs[0]?.results.find((r) => r.ruleId === 'jwt.signature_invalid');
    expect(sig?.level).toBe('error');
  });
});
