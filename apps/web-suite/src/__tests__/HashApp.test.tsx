import { webcrypto } from 'node:crypto';

import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { HashApp } from '../HashApp.js';
import type { HashRunnerDeps } from '../hash-parse.js';

// Inject Node's Web Crypto so the UI tests compute *real* digests and assert
// against known vectors, without depending on the jsdom environment's crypto
// support. This is the same dependency-injection seam YamlApp uses for the
// clipboard.
const hashDeps: HashRunnerDeps = { subtle: webcrypto.subtle };

const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const SHA512_ABC =
  'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f';

describe('HashApp', () => {
  it('computes the SHA-256 digest of pasted text (real vector)', async () => {
    render(<HashApp initialInput="abc" hashDeps={hashDeps} />);
    await waitFor(() => {
      expect(screen.getByTestId('hash-hex').textContent).toBe(SHA256_ABC);
    });
    expect(screen.getByTestId('hash-algorithm').textContent).toBe('SHA-256');
    expect(screen.getByTestId('hash-bytes').textContent).toBe('3');
    // base64 is rendered and non-empty.
    expect(screen.getByTestId('hash-base64').textContent).toMatch(/.+/);
  });

  it('recomputes when the algorithm changes to SHA-512', async () => {
    render(<HashApp initialInput="abc" hashDeps={hashDeps} />);
    await waitFor(() => {
      expect(screen.getByTestId('hash-hex').textContent).toBe(SHA256_ABC);
    });
    fireEvent.click(screen.getByLabelText('SHA-512'));
    await waitFor(() => {
      expect(screen.getByTestId('hash-hex').textContent).toBe(SHA512_ABC);
    });
    expect(screen.getByTestId('hash-algorithm').textContent).toBe('SHA-512');
  });

  it('shows an info diagnostic for empty input but still hashes zero bytes', async () => {
    render(<HashApp initialInput="" hashDeps={hashDeps} />);
    await waitFor(() => {
      expect(screen.getByText(/hash\.empty_input/)).toBeInTheDocument();
    });
    // The SHA-256 of zero bytes is still produced.
    expect(screen.getByTestId('hash-hex').textContent).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(screen.getByTestId('hash-bytes').textContent).toBe('0');
  });

  it('copies the hex digest via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <HashApp
        initialInput="abc"
        hashDeps={hashDeps}
        clipboardDeps={{
          apiWrite: async (t) => {
            writes.push(t);
          },
        }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('hash-hex').textContent).toBe(SHA256_ABC);
    });
    fireEvent.click(screen.getByTestId('hash-copy-digest'));
    await waitFor(() => {
      expect(writes).toEqual([SHA256_ABC]);
    });
    const status = screen.getByTestId('hash-copy-status');
    expect(status).toHaveAttribute('data-target', 'digest');
    expect(status).toHaveAttribute('data-method', 'clipboard-api');
  });

  it('copies a JSON summary that parses and carries the digest fields', async () => {
    const writes: string[] = [];
    render(
      <HashApp
        initialInput="abc"
        hashDeps={hashDeps}
        clipboardDeps={{
          apiWrite: async (t) => {
            writes.push(t);
          },
        }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('hash-hex').textContent).toBe(SHA256_ABC);
    });
    fireEvent.click(screen.getByTestId('hash-copy-json'));
    await waitFor(() => {
      expect(writes).toHaveLength(1);
    });
    const summary = JSON.parse(writes[0]!) as Record<string, unknown>;
    expect(summary.algorithm).toBe('SHA-256');
    expect(summary.hex).toBe(SHA256_ABC);
    expect(summary.inputBytes).toBe(3);
  });
});
