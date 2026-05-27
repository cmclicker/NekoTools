import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CodecApp } from '../CodecApp.js';

describe('CodecApp', () => {
  it('encodes Base64 by default and renders the output', () => {
    render(<CodecApp initialInput="hello" />);
    expect(screen.getByTestId('codec-output').textContent).toBe('aGVsbG8=');
  });

  it('decodes Base64 when the decode operation is selected initially', () => {
    render(
      <CodecApp initialInput="aGVsbG8=" initialUiState={{ operation: 'decode', codec: 'base64' }} />,
    );
    expect(screen.getByTestId('codec-output').textContent).toBe('hello');
  });

  it('switches operation via the radio control (encode -> decode)', () => {
    render(<CodecApp initialInput="aGVsbG8=" initialUiState={{ codec: 'base64' }} />);
    fireEvent.click(screen.getByTestId('codec-op-decode'));
    expect(screen.getByTestId('codec-output').textContent).toBe('hello');
  });

  it('switches codec via the radio control (Base64 -> Hex)', () => {
    render(<CodecApp initialInput="hi" />);
    expect(screen.getByTestId('codec-output').textContent).toBe('aGk=');
    fireEvent.click(screen.getByTestId('codec-name-hex'));
    expect(screen.getByTestId('codec-output').textContent).toBe('6869');
  });

  it('encodes URL percent-encoding', () => {
    render(<CodecApp initialInput="a b&c" initialUiState={{ codec: 'url' }} />);
    expect(screen.getByTestId('codec-output').textContent).toBe('a%20b%26c');
  });

  it('surfaces an invalid-Base64 diagnostic and the empty state on bad decode input', () => {
    render(
      <CodecApp
        initialInput="not base64!!"
        initialUiState={{ operation: 'decode', codec: 'base64' }}
      />,
    );
    expect(screen.getByTestId('codec-no-output')).toBeInTheDocument();
    expect(screen.getByText(/codec\.invalid_base64/)).toBeInTheDocument();
  });

  it('warns when a decode produces binary-looking output', () => {
    // "AAEC" is Base64 for bytes [0, 1, 2].
    render(
      <CodecApp initialInput="AAEC" initialUiState={{ operation: 'decode', codec: 'base64' }} />,
    );
    expect(screen.getByText(/codec\.binary_output/)).toBeInTheDocument();
  });

  it('shows an info diagnostic for empty input', () => {
    render(<CodecApp initialInput="" />);
    expect(screen.getByText(/codec\.empty_input/)).toBeInTheDocument();
  });

  it('copies the current output via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <CodecApp
        initialInput="hello"
        clipboardDeps={{
          apiWrite: async (t) => {
            writes.push(t);
          },
        }}
      />,
    );
    fireEvent.click(screen.getByTestId('codec-copy-output'));
    await waitFor(() => {
      expect(writes).toHaveLength(1);
    });
    expect(writes[0]).toBe('aGVsbG8=');
  });
});
