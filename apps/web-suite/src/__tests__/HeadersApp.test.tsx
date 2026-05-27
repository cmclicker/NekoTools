import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { HeadersApp } from '../HeadersApp.js';

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
});
