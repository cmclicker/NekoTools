import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { BinaryApp } from '../BinaryApp.js';

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
});
