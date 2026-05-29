import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import {
  DEV_LICENSE_PUBLIC_KEY,
  SAMPLE_PRO_LICENSE_KEY,
  useLicense,
  type StorageLike,
  type UseLicenseDeps,
} from '../license-store.js';

const STORAGE_KEY = 'nekotools.license-key';

function memory(seed?: Record<string, string>): StorageLike {
  const m = new Map<string, string>(Object.entries(seed ?? {}));
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

function deps(storage: StorageLike): UseLicenseDeps {
  // Verify against the dev signing identity (real Ed25519, no network).
  return { storage, publicKey: DEV_LICENSE_PUBLIC_KEY };
}

describe('useLicense', () => {
  it('starts Free when nothing is stored', () => {
    const { result } = renderHook(() => useLicense(deps(memory())));
    expect(result.current.isPro).toBe(false);
    expect(result.current.licensee).toBeNull();
    expect(result.current.entitlement.tier).toBe('free');
  });

  it('unlocks Pro from a valid key and persists it', async () => {
    const storage = memory();
    const { result } = renderHook(() => useLicense(deps(storage)));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.applyKey(SAMPLE_PRO_LICENSE_KEY);
    });

    expect(ok).toBe(true);
    expect(result.current.isPro).toBe(true);
    expect(result.current.licensee).toBe('NekoTools Dev');
    expect(result.current.error).toBeNull();
    expect(storage.getItem(STORAGE_KEY)).toBe(SAMPLE_PRO_LICENSE_KEY);
  });

  it('rejects a tampered key: stays Free, surfaces an error, persists nothing', async () => {
    const storage = memory();
    const { result } = renderHook(() => useLicense(deps(storage)));

    const tampered = SAMPLE_PRO_LICENSE_KEY.slice(0, -4) + 'AAAA';
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.applyKey(tampered);
    });

    expect(ok).toBe(false);
    expect(result.current.isPro).toBe(false);
    expect(result.current.error).toMatch(/signature/i);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('refuses an empty key with a friendly message', async () => {
    const { result } = renderHook(() => useLicense(deps(memory())));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.applyKey('   ');
    });
    expect(ok).toBe(false);
    expect(result.current.error).toMatch(/paste a license key/i);
  });

  it('clear() reverts to Free and removes the stored key', async () => {
    const storage = memory();
    const { result } = renderHook(() => useLicense(deps(storage)));
    await act(async () => {
      await result.current.applyKey(SAMPLE_PRO_LICENSE_KEY);
    });
    expect(result.current.isPro).toBe(true);

    act(() => {
      result.current.clear();
    });
    expect(result.current.isPro).toBe(false);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('restores a previously persisted valid key on mount', async () => {
    const storage = memory({ [STORAGE_KEY]: SAMPLE_PRO_LICENSE_KEY });
    const { result } = renderHook(() => useLicense(deps(storage)));
    await waitFor(() => expect(result.current.isPro).toBe(true));
    expect(result.current.licensee).toBe('NekoTools Dev');
  });

  it('drops a stored key that no longer verifies on mount', async () => {
    const storage = memory({ [STORAGE_KEY]: 'not.a.valid.key' });
    renderHook(() => useLicense(deps(storage)));
    await waitFor(() => expect(storage.getItem(STORAGE_KEY)).toBeNull());
  });
});
