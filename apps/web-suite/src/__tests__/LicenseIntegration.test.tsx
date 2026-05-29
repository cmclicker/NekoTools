import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { App } from '../App.js';
import {
  DEV_LICENSE_PUBLIC_KEY,
  SAMPLE_PRO_LICENSE_KEY,
  type StorageLike,
} from '../license-store.js';

function memory(): StorageLike {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v);
    },
    removeItem: (k) => {
      m.delete(k);
    },
  };
}

describe('suite license integration', () => {
  it('a header unlock flows through to a Pro view in NekoSecrets', async () => {
    render(
      <App
        initialTool="secrets"
        licenseDeps={{ storage: memory(), publicKey: DEV_LICENSE_PUBLIC_KEY }}
        secretsApp={{
          initialInput: 'aws=AKIAIOSFODNN7EXAMPLE',
          initialUiState: { viewMode: 'sarif' },
        }}
      />,
    );

    // SARIF is a Pro view: locked while Free, and the Pro surface says so.
    expect(screen.getByTestId('secrets-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('secrets-output')).not.toBeInTheDocument();
    expect(screen.getByTestId('pro-status-secrets').textContent).toMatch(/Pro locked/i);

    // Apply a valid license in the shell header…
    fireEvent.change(screen.getByTestId('suite-license-input'), {
      target: { value: SAMPLE_PRO_LICENSE_KEY },
    });
    fireEvent.click(screen.getByTestId('suite-license-apply'));

    // …and the Pro SARIF output unlocks inside NekoSecrets.
    await waitFor(() => expect(screen.getByTestId('secrets-output')).toBeInTheDocument());
    expect(screen.queryByTestId('secrets-locked')).not.toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId('secrets-output').textContent ?? '{}').version).toBe(
      '2.1.0',
    );
    // The per-tool dev toggle disappears once a real license is active.
    expect(screen.queryByTestId('secrets-pro-toggle')).not.toBeInTheDocument();
    // And the Pro surface now reflects the unlock (the bug fix).
    expect(screen.getByTestId('pro-status-secrets').textContent).toMatch(/Pro unlocked/i);
  });
});
