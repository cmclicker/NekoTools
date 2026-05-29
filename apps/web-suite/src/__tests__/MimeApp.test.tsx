import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { MimeApp } from '../MimeApp.js';

describe('MimeApp', () => {
  it('renders the per-entry table with essence + extensions', () => {
    render(<MimeApp initialInput={'text/html; charset=UTF-8'} />);
    expect(screen.getByTestId('mime-stat-count').textContent).toBe('1');
    expect(screen.getByTestId('mime-essence-0').textContent).toBe('text/html');
    const table = screen.getByTestId('mime-table');
    expect(table.textContent).toContain('charset=UTF-8');
  });

  it('resolves a bare extension', () => {
    render(<MimeApp initialInput={'png'} />);
    expect(screen.getByTestId('mime-essence-0').textContent).toBe('image/png');
  });

  it('marks an invalid type and emits a diagnostic', () => {
    render(<MimeApp initialInput={'not-a-mime'} />);
    expect(screen.getByTestId('mime-essence-0').textContent).toBe('(invalid)');
    expect(screen.getByText(/mime\.parse_error/)).toBeInTheDocument();
  });

  it('converts to an essence list', () => {
    render(<MimeApp initialInput={'text/html\npng'} initialUiState={{ viewMode: 'normalized' }} />);
    expect(screen.getByTestId('mime-output').textContent).toBe('text/html\nimage/png');
  });

  it('shows the empty-state for whitespace-only input', () => {
    render(<MimeApp initialInput={'   '} />);
    expect(screen.getByTestId('mime-no-document')).toBeInTheDocument();
    expect(screen.getByText(/mime\.empty_input/)).toBeInTheDocument();
  });

  it('copies the JSON view via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <MimeApp
        initialInput={'image/svg+xml'}
        initialUiState={{ viewMode: 'json' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('mime-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(JSON.parse(writes[0] ?? '{}').entries[0].value.suffix).toBe('xml');
  });
});
