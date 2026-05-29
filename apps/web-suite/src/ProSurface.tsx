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
        <span className="pro-surface__summaryLabel">{manifest.name} features</span>
        <span className="pro-surface__counts">
          {manifest.entitlements.free.length + manifest.entitlements.pro.length} ·{' '}
          {manifest.entitlements.pro.length} Pro
        </span>
        <span
          className={`pro-badge pro-badge--${isPro ? 'unlocked' : 'locked'}`}
          data-testid={`pro-status-${manifest.id}`}
        >
          {isPro ? 'Pro unlocked' : 'Pro locked'}
        </span>
      </summary>

      <div className="pro-surface__body">
        {/* One flat, color-coded feature list: Pro items carry a PRO tag
            (green once unlocked). No separate Free/Pro lists. */}
        <ul
          className={`entitlements${isPro ? ' entitlements--unlocked' : ''}`}
          data-testid={`features-list-${manifest.id}`}
        >
          {manifest.entitlements.free.map((id) => (
            <li key={`free-${id}`}>{id}</li>
          ))}
          {manifest.entitlements.pro.map((id) => (
            <li key={`pro-${id}`} className="entitlements__pro" data-feature="pro">
              <span>{id}</span>
              <span className="pro-tag">Pro</span>
            </li>
          ))}
        </ul>

        <p className="pro-surface__note">
          {isPro
            ? `Pro unlocked${licensee !== null ? ` — licensed to ${licensee}` : ''}. Verified locally; no telemetry.`
            : 'Pro unlocks with a license key, verified locally. No account, no telemetry, no remote check.'}
        </p>
      </div>
    </details>
  );
}
