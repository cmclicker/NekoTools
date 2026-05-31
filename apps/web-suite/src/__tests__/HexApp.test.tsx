import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { HexApp } from '../HexApp.js';

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

  it('locks the C-array + base64 Pro views when free', () => {
    render(<HexApp initialInput={'ABC'} initialUiState={{ mode: 'text', viewMode: 'c-array' }} />);
    expect(screen.getByTestId('hex-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('hex-output')).not.toBeInTheDocument();
  });

  it('unlocks the C array via an injected Pro entitlement', () => {
    render(
      <HexApp
        initialInput={'ABC'}
        initialUiState={{ mode: 'text', viewMode: 'c-array' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('hex-output').textContent ?? '';
    expect(out).toContain('unsigned char data[] = {');
    expect(out).toContain('0x41, 0x42, 0x43');
  });

  it('renders base64 in the base64 view when Pro', () => {
    render(
      <HexApp
        initialInput={'ABC'}
        initialUiState={{ mode: 'text', viewMode: 'base64' }}
        entitlement={PRO}
      />,
    );
    expect(screen.getByTestId('hex-output').textContent).toBe('QUJD');
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
