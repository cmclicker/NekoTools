import type { ToolManifest } from '@nekotools/contracts';

import { useLicenseContext } from './license-store.js';

export interface ProSurfaceProps {
  readonly manifest: ToolManifest;
}

/**
 * The Free / Pro entitlement surface for a tool. Collapsed by default (a
 * disclosure) so it doesn't clutter the workbench — expand to see the
 * feature split. It reflects the **live** suite entitlement: once a license
 * key is applied (header badge), Pro shows as unlocked here too.
 */
export function ProSurface({ manifest }: ProSurfaceProps): JSX.Element {
  const { isPro, licensee } = useLicenseContext();

  return (
    <details
      className="pro-surface"
      data-testid={`pro-surface-${manifest.id}`}
      aria-label={`${manifest.name} free and Pro features`}
    >
      <summary className="pro-surface__summary">
        <span className="pro-surface__summaryLabel">Free &amp; Pro features</span>
        <span className="pro-surface__counts">
          {manifest.entitlements.free.length} free · {manifest.entitlements.pro.length} Pro
        </span>
        <span
          className={`pro-badge pro-badge--${isPro ? 'unlocked' : 'locked'}`}
          data-testid={`pro-status-${manifest.id}`}
        >
          {isPro ? 'Pro unlocked' : 'Pro locked'}
        </span>
      </summary>

      <div className="pro-surface__body">
        <h3 className="pro-surface__heading">Free</h3>
        <ul className="entitlements entitlements--free" data-testid={`free-list-${manifest.id}`}>
          {manifest.entitlements.free.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>

        <h3 className="pro-surface__heading">Pro</h3>
        <ul
          className={`entitlements entitlements--pro${isPro ? ' entitlements--unlocked' : ''}`}
          data-testid={`pro-list-${manifest.id}`}
        >
          {manifest.entitlements.pro.map((id) => (
            <li key={id} className={isPro ? '' : 'entitlements__locked'}>
              <span>{id}</span>
              <span className="pro-tag">Pro</span>
            </li>
          ))}
        </ul>

        <p className="pro-surface__note">
          {isPro
            ? `Pro unlocked${licensee !== null ? ` — licensed to ${licensee}` : ''}. Verified locally; no account, no telemetry, no remote check.`
            : 'Unlock Pro with a license key, verified locally on your machine. No account, no telemetry, no remote check.'}
        </p>
      </div>
    </details>
  );
}
