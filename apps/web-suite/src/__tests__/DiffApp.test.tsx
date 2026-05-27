import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { DiffApp } from '../DiffApp.js';

describe('DiffApp', () => {
  it('renders Left and Right input panes', () => {
    render(<DiffApp initialLeft="a" initialRight="b" />);
    expect(screen.getByTestId('diff-input-left')).toBeInTheDocument();
    expect(screen.getByTestId('diff-input-right')).toBeInTheDocument();
  });

  it('renders a unified hunk list and a changed-count summary for differing text', () => {
    render(<DiffApp initialLeft={'a\nb\nc'} initialRight={'a\nx\nc'} />);
    const output = screen.getByTestId('diff-output');
    const hunks = within(output).getAllByTestId('diff-hunk');
    expect(hunks.some((h) => h.getAttribute('data-kind') === 'add')).toBe(true);
    expect(hunks.some((h) => h.getAttribute('data-kind') === 'remove')).toBe(true);
    expect(screen.getByTestId('diff-summary').textContent).toMatch(/1 added, 1 removed/);
  });

  it('updates the diff when the Right pane is edited', () => {
    render(<DiffApp initialLeft={'a\nb'} initialRight={'a\nb'} />);
    // Identical to start — the identical empty-state is shown, no hunk list.
    expect(screen.getByTestId('diff-no-output').textContent).toMatch(/identical/i);
    fireEvent.change(screen.getByTestId('diff-input-right'), { target: { value: 'a\nZ' } });
    expect(screen.getByTestId('diff-output')).toBeInTheDocument();
  });

  it('treats reordered JSON keys as identical in JSON mode', () => {
    render(
      <DiffApp
        initialLeft={'{"b":2,"a":1}'}
        initialRight={'{"a":1,"b":2}'}
        initialUiState={{ mode: 'json' }}
      />,
    );
    expect(screen.getByTestId('diff-summary').textContent).toMatch(/No differences/i);
    expect(screen.getByTestId('diff-no-output')).toBeInTheDocument();
  });

  it('surfaces a parse_error diagnostic for invalid JSON in JSON mode', () => {
    render(
      <DiffApp initialLeft={'{"a":1}'} initialRight={'nope'} initialUiState={{ mode: 'json' }} />,
    );
    expect(screen.getByText(/diff\.parse_error/)).toBeInTheDocument();
    expect(screen.getByTestId('diff-summary').textContent).toMatch(/Not comparable/i);
  });

  it('shows the empty-side diagnostic when a pane is blank', () => {
    render(<DiffApp initialLeft={'a\nb'} initialRight="" />);
    expect(screen.getByText(/diff\.empty_input/)).toBeInTheDocument();
  });

  it('switches compare mode via the Text / JSON / YAML selector', () => {
    render(
      <DiffApp initialLeft={'{a: 1}'} initialRight={'a: 1'} initialUiState={{ mode: 'text' }} />,
    );
    // Text mode: "{a: 1}" and "a: 1" are different lines.
    expect(screen.getByTestId('diff-output')).toBeInTheDocument();
    // YAML mode: both normalize to the same document, so they are identical.
    fireEvent.click(screen.getByLabelText('YAML'));
    expect(screen.getByTestId('diff-summary').textContent).toMatch(/No differences/i);
  });

  it('copies the unified diff via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <DiffApp
        initialLeft={'a\nb\nc'}
        initialRight={'a\nx\nc'}
        clipboardDeps={{
          apiWrite: async (t) => {
            writes.push(t);
          },
        }}
      />,
    );
    fireEvent.click(screen.getByTestId('diff-copy'));
    await waitFor(() => {
      expect(writes).toHaveLength(1);
    });
    expect(writes[0]).toContain('--- Left');
    expect(writes[0]).toContain('+++ Right');
    expect(writes[0]).toContain('+ x');
    expect(writes[0]).toContain('- b');
  });
});
