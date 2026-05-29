import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { CspApp } from '../CspApp.js';

describe('CspApp', () => {
  it('renders directives + findings', () => {
    render(<CspApp initialInput={"default-src 'self'; script-src 'self' 'unsafe-inline'"} />);
    expect(screen.getByTestId('csp-stat-directives').textContent).toBe('2');
    const dirs = screen.getByTestId('csp-directives');
    expect(within(dirs).getByText('script-src')).toBeInTheDocument();
    expect(screen.getByTestId('csp-findings').textContent).toMatch(/unsafe-inline/);
  });

  it('surfaces an unsafe-inline diagnostic', () => {
    render(<CspApp initialInput={"script-src 'unsafe-inline'"} />);
    expect(screen.getByText(/csp\.unsafe_inline/)).toBeInTheDocument();
  });

  it('converts to normalized one-per-line output', () => {
    render(<CspApp initialInput={"default-src 'self'; img-src *"} initialUiState={{ viewMode: 'normalized' }} />);
    expect(screen.getByTestId('csp-output').textContent).toBe("default-src 'self';\nimg-src *");
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
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('csp-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(JSON.parse(writes[0] ?? '{}').directives[0].name).toBe('default-src');
  });
});
