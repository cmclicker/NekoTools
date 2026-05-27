import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { UrlApp } from '../UrlApp.js';

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
});
