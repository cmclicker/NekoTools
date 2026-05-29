import { useState, type ChangeEvent } from 'react';

import { SAMPLE_KEY_AVAILABLE, SAMPLE_PRO_LICENSE_KEY, useLicenseContext } from './license-store.js';

/**
 * Suite license control, rendered in the shell header. Free state shows a
 * paste-a-key form; Pro state shows "Licensed to …" plus a Remove button.
 * Verification is local + offline (see `license-store`). The signed
 * `licensee` is surfaced as gentle social friction against key sharing.
 */
export function LicenseBadge(): JSX.Element {
  const { licensee, isPro, error, applyKey, clear } = useLicenseContext();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const onApply = async (): Promise<void> => {
    setBusy(true);
    try {
      const ok = await applyKey(draft);
      if (ok) setDraft('');
    } finally {
      setBusy(false);
    }
  };

  if (isPro) {
    return (
      <div className="suite__license suite__license--pro" data-testid="suite-license">
        <span className="suite__licenseStatus" data-testid="suite-license-status">
          <span className="suite__licenseTier">Pro</span> Licensed to <strong>{licensee}</strong>
        </span>
        <button
          type="button"
          className="suite__licenseClear"
          onClick={clear}
          data-testid="suite-license-clear"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="suite__license" data-testid="suite-license">
      <span className="suite__licenseStatus" data-testid="suite-license-status">
        <span className="suite__licenseTier suite__licenseTier--free">Free</span>
      </span>
      <input
        type="text"
        className="suite__licenseInput"
        placeholder="Paste a license key to unlock Pro"
        value={draft}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
        spellCheck={false}
        aria-label="License key"
        data-testid="suite-license-input"
      />
      <button
        type="button"
        className="suite__licenseApply"
        onClick={onApply}
        disabled={busy || draft.trim() === ''}
        data-testid="suite-license-apply"
      >
        Unlock
      </button>
      {SAMPLE_KEY_AVAILABLE ? (
        <button
          type="button"
          className="suite__licenseSample"
          onClick={() => setDraft(SAMPLE_PRO_LICENSE_KEY)}
          data-testid="suite-license-sample"
        >
          Use sample key
        </button>
      ) : null}
      {error !== null ? (
        <span className="suite__licenseError" role="alert" data-testid="suite-license-error">
          {error}
        </span>
      ) : null}
    </div>
  );
}
