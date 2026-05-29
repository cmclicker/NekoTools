import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { UnicodeApp } from '../UnicodeApp.js';

describe('UnicodeApp', () => {
  it('renders a per-codepoint table with counts', () => {
    render(<UnicodeApp initialInput={'AB'} />);
    expect(screen.getByTestId('unicode-stat-cp').textContent).toBe('2');
    expect(screen.getByTestId('unicode-cp-0').textContent).toBe('U+0041');
    expect(screen.getByTestId('unicode-cp-1').textContent).toBe('U+0042');
  });

  it('counts an emoji as 1 code point / 2 UTF-16 units', () => {
    render(<UnicodeApp initialInput={'😀'} />);
    expect(screen.getByTestId('unicode-stat-cp').textContent).toBe('1');
    expect(screen.getByTestId('unicode-stat-units').textContent).toBe('2');
    expect(screen.getByTestId('unicode-cp-0').textContent).toBe('U+1F600');
  });

  it('shows the empty-state for truly empty input', () => {
    render(<UnicodeApp initialInput={''} />);
    expect(screen.getByTestId('unicode-no-document')).toBeInTheDocument();
    expect(screen.getByText(/unicode\.empty_input/)).toBeInTheDocument();
  });

  it('treats whitespace as content (not empty)', () => {
    render(<UnicodeApp initialInput={' '} />);
    expect(screen.getByTestId('unicode-stat-cp').textContent).toBe('1');
  });

  it('converts to a U+ list', () => {
    render(<UnicodeApp initialInput={'AB'} initialUiState={{ viewMode: 'normalized' }} />);
    expect(screen.getByTestId('unicode-output').textContent).toBe('U+0041 U+0042');
  });

  it('copies the markdown summary via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <UnicodeApp
        initialInput={'A'}
        initialUiState={{ viewMode: 'markdown' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('unicode-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toContain('# NekoUnicode export');
  });
});
