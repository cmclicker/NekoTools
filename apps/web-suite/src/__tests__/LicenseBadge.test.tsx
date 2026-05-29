import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { LicenseBadge } from '../LicenseBadge.js';
import {
  DEV_LICENSE_PUBLIC_KEY,
  LicenseProvider,
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

function mount() {
  return render(
    <LicenseProvider deps={{ storage: memory(), publicKey: DEV_LICENSE_PUBLIC_KEY }}>
      <LicenseBadge />
    </LicenseProvider>,
  );
}

describe('LicenseBadge', () => {
  it('shows the Free state with a key-entry form', () => {
    mount();
    expect(screen.getByTestId('suite-license-status').textContent).toMatch(/Free/);
    expect(screen.getByTestId('suite-license-input')).toBeInTheDocument();
    expect(screen.getByTestId('suite-license-apply')).toBeDisabled();
  });

  it('unlocks Pro and shows the licensee after a valid key is applied', async () => {
    mount();
    fireEvent.change(screen.getByTestId('suite-license-input'), {
      target: { value: SAMPLE_PRO_LICENSE_KEY },
    });
    fireEvent.click(screen.getByTestId('suite-license-apply'));

    await waitFor(() =>
      expect(screen.getByTestId('suite-license-status').textContent).toMatch(/Licensed to/),
    );
    expect(screen.getByTestId('suite-license-status').textContent).toContain('NekoTools Dev');
    // The entry form is replaced by the Pro badge.
    expect(screen.queryByTestId('suite-license-input')).not.toBeInTheDocument();
    expect(screen.getByTestId('suite-license-clear')).toBeInTheDocument();
  });

  it('surfaces an error and stays Free for an invalid key', async () => {
    mount();
    fireEvent.change(screen.getByTestId('suite-license-input'), {
      target: { value: 'totally-bogus-key' },
    });
    fireEvent.click(screen.getByTestId('suite-license-apply'));

    await waitFor(() => expect(screen.getByTestId('suite-license-error')).toBeInTheDocument());
    expect(screen.getByTestId('suite-license-status').textContent).toMatch(/Free/);
  });

  it('Remove reverts a Pro unlock back to Free', async () => {
    mount();
    fireEvent.change(screen.getByTestId('suite-license-input'), {
      target: { value: SAMPLE_PRO_LICENSE_KEY },
    });
    fireEvent.click(screen.getByTestId('suite-license-apply'));
    await waitFor(() => expect(screen.getByTestId('suite-license-clear')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('suite-license-clear'));
    expect(screen.getByTestId('suite-license-input')).toBeInTheDocument();
    expect(screen.getByTestId('suite-license-status').textContent).toMatch(/Free/);
  });
});
