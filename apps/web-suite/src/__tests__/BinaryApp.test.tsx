import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { BinaryApp } from '../BinaryApp.js';

// A literal Pro entitlement injected via the `entitlement` prop, so the unlock
// test doesn't depend on the license context / a pasted key.
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

describe('BinaryApp', () => {
  it('parses decimal input and renders derived hex and binary forms', () => {
    render(<BinaryApp initialInput="42" />);

    const output = screen.getByTestId('binary-output');
    expect(output.textContent).toContain('binary.number');
    expect(output.textContent).toContain('0x2a');
    expect(output.textContent).toContain('0b101010');
  });

  it('decodes Base64 input to hex bytes', () => {
    render(<BinaryApp initialInput="aGVsbG8=" initialUiState={{ mode: 'base64' }} />);

    const output = screen.getByTestId('binary-output');
    expect(output.textContent).toContain('binary.bytes');
    expect(output.textContent).toContain('68656c6c6f');
    expect(output.textContent).toContain('hello');
  });

  it('switches modes through the radio control', () => {
    render(<BinaryApp initialInput="6869" initialUiState={{ mode: 'decimal' }} />);

    fireEvent.click(screen.getByTestId('binary-mode-hex'));

    const output = screen.getByTestId('binary-output');
    expect(output.textContent).toContain('binary.bytes');
    expect(output.textContent).toContain('hi');
  });

  it('surfaces invalid binary diagnostics and empty output state', () => {
    render(<BinaryApp initialInput="102" initialUiState={{ mode: 'binary' }} />);

    expect(screen.getByTestId('binary-no-output')).toBeInTheDocument();
    expect(screen.getByText(/binary\.invalid_digit/)).toBeInTheDocument();
  });

  it('copies plaintext export through the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <BinaryApp
        initialInput="42"
        clipboardDeps={{
          apiWrite: async (text) => {
            writes.push(text);
          },
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('binary-copy-plaintext'));
    await waitFor(() => {
      expect(writes).toHaveLength(1);
    });
    expect(writes[0]).toContain('binary.number');
    expect(writes[0]).toContain('42');
  });

  it('locks the byte-map + batch-report Pro views when free', () => {
    render(<BinaryApp initialInput="42" initialUiState={{ viewMode: 'byte-map' }} />);

    expect(screen.getByTestId('binary-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('binary-pro-output')).not.toBeInTheDocument();
    expect(screen.queryByText('# NekoBinary byte map')).not.toBeInTheDocument();
  });

  it('unlocks the byte map via an injected Pro entitlement', () => {
    render(
      <BinaryApp initialInput="42" initialUiState={{ viewMode: 'byte-map' }} entitlement={PRO} />,
    );

    const output = screen.getByTestId('binary-pro-output');
    expect(output.textContent).toContain('# NekoBinary byte map');
    expect(output.textContent).toContain('| offset | hex | decimal | binary | ascii |');
    expect(screen.queryByTestId('binary-locked')).not.toBeInTheDocument();
  });

  it('unlocks the batch report via an injected Pro entitlement and the view switcher', () => {
    render(<BinaryApp initialInput="42" entitlement={PRO} />);

    // The default free Summary view is shown first; switch to the Pro view.
    fireEvent.click(screen.getByTestId('binary-view-batch-report'));

    const output = screen.getByTestId('binary-pro-output');
    expect(output.textContent).toContain('# NekoBinary batch report');
    expect(screen.queryByTestId('binary-locked')).not.toBeInTheDocument();
  });
});
