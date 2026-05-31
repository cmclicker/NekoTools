import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { UrlApp } from '../UrlApp.js';

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

// A URL with embedded credentials + tracking params + a non-standard port +
// a fragment, so both Pro exports produce non-trivial content.
const PRO_INPUT = 'http://alice:s3cr3t-token@example.com:8080/p?utm_source=news&fbclid=abc#section';

describe('UrlApp', () => {
  it('parses a URL and renders the component breakdown + query-param table', () => {
    render(<UrlApp initialInput="https://example.com:8080/a/b?x=1&y=2#frag" />);
    expect(screen.getByTestId('url-components')).toBeInTheDocument();
    expect(screen.getByTestId('url-field-scheme').textContent).toBe('https');
    expect(screen.getByTestId('url-field-host').textContent).toBe('example.com:8080');
    expect(screen.getByTestId('url-field-hostname').textContent).toBe('example.com');
    expect(screen.getByTestId('url-field-port').textContent).toBe('8080');
    expect(screen.getByTestId('url-field-pathname').textContent).toBe('/a/b');
    const table = screen.getByTestId('url-params-table');
    expect(within(table).getByText('x')).toBeInTheDocument();
    expect(within(table).getByText('y')).toBeInTheDocument();
  });

  it('renders a security/privacy diagnostic for a non-HTTPS scheme', () => {
    render(<UrlApp initialInput="http://example.com/" />);
    expect(screen.getByText(/url\.insecure_scheme/)).toBeInTheDocument();
  });

  it('reports embedded credentials by presence only — never the secret', () => {
    render(<UrlApp initialInput="https://alice:s3cr3t-token@example.com/" />);
    expect(screen.getByTestId('url-field-credentials').textContent).toMatch(
      /username present, password present/,
    );
    expect(screen.getByText(/url\.credentials_present/)).toBeInTheDocument();
    // The secret (and username) never appear in the parsed breakdown. Only
    // the user's own input textarea echoes them back; the component
    // breakdown, params table, normalized URL, and exports are all
    // credential-free.
    const breakdown = screen.getByTestId('url-components');
    expect(within(breakdown).queryByText(/s3cr3t-token/)).not.toBeInTheDocument();
    expect(within(breakdown).queryByText(/alice/)).not.toBeInTheDocument();
  });

  it('flags duplicate query keys', () => {
    render(<UrlApp initialInput="https://example.com/?a=1&a=2" />);
    expect(screen.getByText(/url\.duplicate_query_key/)).toBeInTheDocument();
  });

  it('switches to the normalized view (default port dropped, query sorted)', () => {
    render(
      <UrlApp
        initialInput="https://example.com:443/a?b=2&a=1"
        initialUiState={{ viewMode: 'normalized' }}
      />,
    );
    expect(screen.getByTestId('url-output').textContent).toBe('https://example.com/a?a=1&b=2');
  });

  it('switches to the params JSON view', () => {
    render(
      <UrlApp initialInput="https://example.com/?a=1&b=two" initialUiState={{ viewMode: 'params' }} />,
    );
    expect(JSON.parse(screen.getByTestId('url-output').textContent ?? '[]')).toEqual([
      { key: 'a', value: '1' },
      { key: 'b', value: 'two' },
    ]);
  });

  it('shows the empty-state and a parse error for an invalid URL', () => {
    render(<UrlApp initialInput="http://" />);
    expect(screen.getByTestId('url-no-document')).toBeInTheDocument();
    expect(screen.getByText(/url\.parse_error/)).toBeInTheDocument();
  });

  it('shows a relative-URL diagnostic for a relative reference', () => {
    render(<UrlApp initialInput="/just/a/path" />);
    expect(screen.getByText(/url\.relative_url/)).toBeInTheDocument();
  });

  it('encodes a component via encodeURIComponent', () => {
    render(<UrlApp />);
    fireEvent.change(screen.getByTestId('url-encode-input'), { target: { value: 'a b&c=d' } });
    fireEvent.click(screen.getByTestId('url-encode-btn'));
    const out = screen.getByTestId('url-encode-output');
    expect(out).toHaveAttribute('data-kind', 'encode');
    expect(out.textContent).toBe('a%20b%26c%3Dd');
  });

  it('decodes a component and surfaces a decode error without throwing', () => {
    render(<UrlApp />);
    fireEvent.change(screen.getByTestId('url-encode-input'), { target: { value: '%E0%A4%A' } });
    fireEvent.click(screen.getByTestId('url-decode-btn'));
    expect(screen.getByText(/url\.decode_error/)).toBeInTheDocument();
  });

  it('copies the current view output via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <UrlApp
        initialInput="https://example.com/?a=1"
        initialUiState={{ viewMode: 'normalized' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('url-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toBe('https://example.com/?a=1');
  });

  it('locks the audit + redaction Pro views when free', () => {
    render(<UrlApp initialInput={PRO_INPUT} initialUiState={{ viewMode: 'audit' }} />);
    expect(screen.getByTestId('url-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('url-output')).not.toBeInTheDocument();
  });

  it('unlocks the security audit via an injected Pro entitlement', () => {
    render(
      <UrlApp
        initialInput={PRO_INPUT}
        initialUiState={{ viewMode: 'audit' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('url-output').textContent ?? '';
    expect(out).toContain('# NekoURL audit');
    expect(out).toContain('audit.tracking_params');
    // The audit is credential-free — the embedded secret never appears.
    expect(out).not.toContain('s3cr3t-token');
  });

  it('unlocks the redaction preset via an injected Pro entitlement', () => {
    render(
      <UrlApp
        initialInput={PRO_INPUT}
        initialUiState={{ viewMode: 'redaction' }}
        entitlement={PRO}
      />,
    );
    const preset = JSON.parse(screen.getByTestId('url-output').textContent ?? '{}') as {
      kind?: string;
      redact?: { stripQueryParams?: string[] };
    };
    expect(preset.kind).toBe('redaction-preset');
    expect(preset.redact?.stripQueryParams).toEqual(['utm_source', 'fbclid']);
  });
});
