import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { HexApp } from '../HexApp.js';

describe('HexApp', () => {
  it('dumps text input with offset + ascii gutter', () => {
    render(<HexApp initialInput={'ABC'} initialUiState={{ mode: 'text' }} />);
    expect(screen.getByTestId('hex-stat-bytes').textContent).toBe('3');
    const out = screen.getByTestId('hex-output').textContent ?? '';
    expect(out).toContain('00000000');
    expect(out).toContain('|ABC|');
  });

  it('decodes a hex string in hex mode', () => {
    render(<HexApp initialInput={'48 69'} initialUiState={{ mode: 'hex' }} />);
    expect(screen.getByTestId('hex-stat-bytes').textContent).toBe('2');
    expect(screen.getByTestId('hex-output').textContent ?? '').toContain('|Hi|');
  });

  it('switches modes via the toggle', () => {
    render(<HexApp initialInput={'4869'} initialUiState={{ mode: 'text' }} />);
    // In text mode '4869' is 4 bytes; switch to hex → 2 bytes "Hi".
    expect(screen.getByTestId('hex-stat-bytes').textContent).toBe('4');
    fireEvent.click(screen.getByTestId('hex-mode-hex'));
    expect(screen.getByTestId('hex-stat-bytes').textContent).toBe('2');
  });

  it('shows an invalid-state + diagnostic for bad hex', () => {
    render(<HexApp initialInput={'zz'} initialUiState={{ mode: 'hex' }} />);
    expect(screen.getByTestId('hex-no-document')).toBeInTheDocument();
    expect(screen.getByText(/hex\.invalid/)).toBeInTheDocument();
  });

  it('shows the empty-state for empty input', () => {
    render(<HexApp initialInput={''} />);
    expect(screen.getByTestId('hex-no-document')).toBeInTheDocument();
    expect(screen.getByText(/hex\.empty_input/)).toBeInTheDocument();
  });

  it('copies the dump via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <HexApp
        initialInput={'Hi'}
        initialUiState={{ mode: 'text' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('hex-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toContain('|Hi|');
  });
});
