import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { CookiesApp } from '../CookiesApp.js';

describe('CookiesApp', () => {
  it('parses a Set-Cookie and renders the attribute table', () => {
    render(<CookiesApp initialInput={'sid=abc123; Domain=example.com; Path=/; Secure; HttpOnly; SameSite=Lax'} />);
    const table = screen.getByTestId('cookies-table');
    expect(within(table).getByText('sid')).toBeInTheDocument();
    expect(within(table).getByText('example.com')).toBeInTheDocument();
    expect(screen.getByTestId('cookies-stat-count').textContent).toBe('1');
  });

  it('masks the value by default and reveals it when unchecked', () => {
    render(<CookiesApp initialInput={'sid=supersecret; Secure; HttpOnly; SameSite=Lax'} />);
    expect(screen.getByTestId('cookies-value-0').textContent).not.toContain('supersecret');
    fireEvent.click(screen.getByTestId('cookies-mask'));
    expect(screen.getByTestId('cookies-value-0').textContent).toBe('supersecret');
  });

  it('surfaces security diagnostics for an insecure cookie', () => {
    render(<CookiesApp initialInput={'sid=x'} />);
    expect(screen.getByText(/cookie\.insecure/)).toBeInTheDocument();
    expect(screen.getByText(/cookie\.no_httponly/)).toBeInTheDocument();
  });

  it('switches to Cookie (request) mode and parses multiple pairs', () => {
    render(<CookiesApp initialInput={'a=1; b=2; c=3'} initialUiState={{ mode: 'cookie' }} />);
    expect(screen.getByTestId('cookies-stat-count').textContent).toBe('3');
  });

  it('shows the empty-state for whitespace-only input', () => {
    render(<CookiesApp initialInput={'   '} />);
    expect(screen.getByTestId('cookies-no-document')).toBeInTheDocument();
    expect(screen.getByText(/cookie\.empty_input/)).toBeInTheDocument();
  });

  it('copies the JSON view via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <CookiesApp
        initialInput={'sid=abc; Secure; HttpOnly; SameSite=Lax'}
        initialUiState={{ viewMode: 'json' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('cookies-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(JSON.parse(writes[0] ?? '[]')[0]).toMatchObject({ name: 'sid' });
  });
});
