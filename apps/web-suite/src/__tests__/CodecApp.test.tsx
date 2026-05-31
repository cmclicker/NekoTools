import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CodecApp } from '../CodecApp.js';

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

  it('locks the batch-report + recipe-bundle Pro views when free', () => {
    render(<CodecApp initialInput="hello" initialUiState={{ viewMode: 'batch-report' }} />);
    expect(screen.getByTestId('codec-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('codec-output')).not.toBeInTheDocument();
    expect(screen.queryByText(/# NekoCodec batch report/)).not.toBeInTheDocument();
    // Switching to the other Pro view stays locked.
    fireEvent.click(screen.getByTestId('codec-view-recipe-bundle'));
    expect(screen.getByTestId('codec-locked')).toBeInTheDocument();
  });

  it('unlocks the batch report via an injected Pro entitlement', () => {
    render(
      <CodecApp
        initialInput="hello"
        initialUiState={{ viewMode: 'batch-report' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('codec-output').textContent ?? '';
    expect(out).toContain('# NekoCodec batch report');
    expect(out).toContain('| 1 | encode | base64 |');
    expect(screen.queryByTestId('codec-locked')).not.toBeInTheDocument();
  });

  it('unlocks the recipe bundle via an injected Pro entitlement', () => {
    render(
      <CodecApp
        initialInput="hello"
        initialUiState={{ viewMode: 'recipe-bundle' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('codec-output').textContent ?? '';
    expect(out).toContain('"tool": "codec"');
    expect(out).toContain('"operation": "encode"');
    expect(screen.queryByTestId('codec-locked')).not.toBeInTheDocument();
  });
});
