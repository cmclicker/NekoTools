import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { SortApp } from '../SortApp.js';

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
});
