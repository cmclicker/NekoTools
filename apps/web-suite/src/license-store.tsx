import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { Entitlement } from '@nekotools/contracts';
import { EMBEDDED_PUBLIC_KEY, FREE_ENTITLEMENT, verifyLicense } from '@nekotools/tool-runtime';

/**
 * Suite-wide license state. A NekoTools license key is a signed
 * entitlement (see `@nekotools/tool-runtime/license`). The user pastes a
 * key once; we verify it locally against the embedded vendor public key
 * (NO network), persist the raw key string in `localStorage`, and surface
 * the resulting entitlement to every tool through React context. Pro tools
 * read this context as their default entitlement — one unlock lights up the
 * whole suite, offline, forever.
 *
 * Losing the local key never voids the purchase: it is re-fetchable from
 * the vendor portal (the only online step is purchase / re-fetch).
 */

const STORAGE_KEY = 'nekotools.license-key';

/**
 * Local DEV signing identity. This public key matches a throwaway keypair
 * minted with `pnpm --filter @nekotools/tool-runtime keygen`; its private
 * key is NOT in the repo. It exists so the unlock flow is demoable offline
 * during development. Production builds use the real `EMBEDDED_PUBLIC_KEY`
 * (and the sample key below stops verifying), so shipping the sample is not
 * a monetization bypass.
 */
export const DEV_LICENSE_PUBLIC_KEY = 'm4Xdj6yxGwuYhzRndr4UI2gPnqnAqapuDuOGz6Av1Fg';

/** A pre-signed Pro license that verifies against `DEV_LICENSE_PUBLIC_KEY`. */
export const SAMPLE_PRO_LICENSE_KEY =
  'eyJ2ZXJzaW9uIjoxLCJsaWNlbnNlSWQiOiJsaWNfOTJjYzZhOTgiLCJsaWNlbnNlZSI6Ik5la29Ub29scyBEZXYiLCJ0aWVyIjoicHJvIiwiZmVhdHVyZXMiOlsiKiJdLCJpc3N1ZWRBdCI6IjIwMjYtMDUtMjlUMDY6Mjc6NDUuNDg1WiIsImV4cGlyZXNBdCI6bnVsbH0.B6oOWkW4Oib8AtJtnx1-ZvOqR9srfDMZC0qcbAcNlBIcgPfDEfvzOQbMfz3VoTAxjqmAJE-9tCZfAElPHamKAA';

/** Dev/test builds verify against the dev identity; prod uses the real key. */
const IS_DEV = Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
export const ACTIVE_PUBLIC_KEY = IS_DEV ? DEV_LICENSE_PUBLIC_KEY : EMBEDDED_PUBLIC_KEY;
/** Whether the one-click "use sample key" affordance is offered. */
export const SAMPLE_KEY_AVAILABLE = IS_DEV;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface UseLicenseDeps {
  /** Persistence backend. Defaults to `localStorage` (in-memory fallback). */
  readonly storage?: StorageLike;
  /** Public key to verify against. Defaults to the active (dev/prod) key. */
  readonly publicKey?: string | CryptoKey;
  /** Verify fn (injected in tests). Defaults to the real `verifyLicense`. */
  readonly verify?: typeof verifyLicense;
  /** Clock for expiry checks. */
  readonly now?: () => Date;
}

export interface LicenseState {
  readonly entitlement: Entitlement;
  /** `licensee` from a Pro entitlement, else `null`. */
  readonly licensee: string | null;
  readonly isPro: boolean;
  /** Last verification error message, or `null`. */
  readonly error: string | null;
  /** Verify + (on success) persist a pasted key. Returns whether it unlocked. */
  applyKey(key: string): Promise<boolean>;
  /** Drop the stored key and revert to Free. */
  clear(): void;
}

function inMemoryStorage(): StorageLike {
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

function resolveStorage(): StorageLike {
  try {
    if (typeof localStorage !== 'undefined' && localStorage !== null) return localStorage;
  } catch {
    /* localStorage access can throw in sandboxed contexts */
  }
  return inMemoryStorage();
}

/**
 * Suite license hook. Loads + verifies any persisted key on mount and
 * exposes apply/clear. Pure-local: the only crypto is an offline signature
 * check; there is never a network call.
 */
export function useLicense(deps: UseLicenseDeps = {}): LicenseState {
  const storage = useMemo(() => deps.storage ?? resolveStorage(), [deps.storage]);
  const publicKey = deps.publicKey ?? ACTIVE_PUBLIC_KEY;
  const verify = deps.verify ?? verifyLicense;
  const now = deps.now;

  const [entitlement, setEntitlement] = useState<Entitlement>(FREE_ENTITLEMENT);
  const [error, setError] = useState<string | null>(null);

  // Restore a previously pasted key on mount (verify before trusting it).
  useEffect(() => {
    const stored = storage.getItem(STORAGE_KEY);
    if (stored === null || stored.trim() === '') return;
    let cancelled = false;
    void (async () => {
      try {
        const ent = await verify(stored, publicKey, now?.());
        if (!cancelled) setEntitlement(ent);
      } catch {
        // A stored key that no longer verifies (tampered, expired, wrong
        // build) is dropped silently — the user simply sees Free again.
        if (!cancelled) storage.removeItem(STORAGE_KEY);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only: restore a persisted key once. Inputs are stable for the
    // app (module constants) and the provider's lifetime.
  }, []);

  const applyKey = useCallback(
    async (key: string): Promise<boolean> => {
      const trimmed = key.trim();
      if (trimmed === '') {
        setError('Paste a license key.');
        return false;
      }
      try {
        const ent = await verify(trimmed, publicKey, now?.());
        setEntitlement(ent);
        setError(null);
        storage.setItem(STORAGE_KEY, trimmed);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Invalid license key.');
        return false;
      }
    },
    [verify, publicKey, now, storage],
  );

  const clear = useCallback(() => {
    storage.removeItem(STORAGE_KEY);
    setEntitlement(FREE_ENTITLEMENT);
    setError(null);
  }, [storage]);

  const isPro = entitlement.tier !== 'free';
  return {
    entitlement,
    licensee: isPro ? entitlement.licensee : null,
    isPro,
    error,
    applyKey,
    clear,
  };
}

const FREE_STATE: LicenseState = {
  entitlement: FREE_ENTITLEMENT,
  licensee: null,
  isPro: false,
  error: null,
  applyKey: async () => false,
  clear: () => {},
};

const LicenseContext = createContext<LicenseState>(FREE_STATE);

export interface LicenseProviderProps {
  readonly children: ReactNode;
  readonly deps?: UseLicenseDeps | undefined;
}

export function LicenseProvider({ children, deps }: LicenseProviderProps): JSX.Element {
  const value = useLicense(deps);
  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
}

/** Read the suite-wide license state. Defaults to Free outside a provider. */
export function useLicenseContext(): LicenseState {
  return useContext(LicenseContext);
}
