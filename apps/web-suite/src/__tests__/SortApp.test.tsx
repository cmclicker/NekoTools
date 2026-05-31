import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { SortApp } from '../SortApp.js';

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

describe('SortApp', () => {
  it('sorts ascending by default and reports counts', () => {
    render(<SortApp initialInput={'banana\napple\ncherry'} />);
    expect(screen.getByTestId('sort-output').textContent).toBe('apple\nbanana\ncherry');
    expect(screen.getByTestId('sort-stat-in').textContent).toBe('3');
    expect(screen.getByTestId('sort-stat-out').textContent).toBe('3');
  });

  it('dedupes when Unique is toggled', () => {
    render(<SortApp initialInput={'a\nb\na'} initialUiState={{ options: { order: 'original' } }} />);
    fireEvent.click(screen.getByTestId('sort-unique'));
    expect(screen.getByTestId('sort-output').textContent).toBe('a\nb');
    expect(screen.getByTestId('sort-stat-removed').textContent).toBe('1');
  });

  it('sorts numerically when Numeric is toggled', () => {
    render(<SortApp initialInput={'10\n2\n1'} />);
    fireEvent.click(screen.getByTestId('sort-numeric'));
    expect(screen.getByTestId('sort-output').textContent).toBe('1\n2\n10');
  });

  it('shows the empty-state for whitespace-only input', () => {
    render(<SortApp initialInput={'   '} />);
    expect(screen.getByTestId('sort-no-document')).toBeInTheDocument();
    expect(screen.getByText(/sort\.empty_input/)).toBeInTheDocument();
  });

  it('copies the result via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <SortApp
        initialInput={'b\na'}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('sort-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toBe('a\nb');
  });

  it('locks the frequency Pro view when free', () => {
    render(
      <SortApp
        initialInput={'banana\napple\nbanana'}
        initialUiState={{ viewMode: 'frequency' }}
      />,
    );
    expect(screen.getByTestId('sort-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('sort-output')).not.toBeInTheDocument();
  });

  it('unlocks the frequency CSV via an injected Pro entitlement', () => {
    // Default options keep all lines (no unique), so frequencies are real counts.
    render(
      <SortApp
        initialInput={'banana\napple\nbanana\ncherry\napple\nbanana'}
        initialUiState={{ viewMode: 'frequency' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('sort-output').textContent ?? '';
    expect(out.split('\n')[0]).toBe('count,line');
    expect(out).toContain('3,banana');
    expect(out).toContain('2,apple');
  });

  it('loads a local file into the input (read locally, never uploaded)', async () => {
    render(<SortApp initialInput={'x\ny'} />);
    const file = new File(['banana\napple'], 'sample.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByTestId('sort-file'), { target: { files: [file] } });
    await waitFor(() =>
      expect((screen.getByTestId('sort-input') as HTMLTextAreaElement).value).toContain('banana'),
    );
  });
});
