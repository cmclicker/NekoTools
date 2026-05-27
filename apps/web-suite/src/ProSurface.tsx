import type { ToolManifest } from '@nekotools/contracts';

export interface ProSurfaceProps {
  readonly manifest: ToolManifest;
}

/**
 * The shared Free / Pro entitlement surface, rendered for every tool so
 * the monetization boundary is visible and consistent across the suite.
 *
 * Free entries are implemented in this local build. Pro entries are
 * advertising-only and shown **locked** — the Pro implementation is not
 * bundled here (no account, no telemetry, no remote check; see
 * docs/open-core-strategy.md). This component is presentation only: it
 * does not gate, unlock, or verify anything at runtime.
 */
export function ProSurface({ manifest }: ProSurfaceProps): JSX.Element {
  return (
    <section
      className="pro-surface"
      data-testid={`pro-surface-${manifest.id}`}
      aria-label={`${manifest.name} free and Pro features`}
    >
      <h3 className="pro-surface__heading">Free</h3>
      <ul className="entitlements entitlements--free" data-testid={`free-list-${manifest.id}`}>
        {manifest.entitlements.free.map((id) => (
          <li key={id}>{id}</li>
        ))}
      </ul>

      <h3 className="pro-surface__heading">
        Pro <span className="pro-badge">locked</span>
      </h3>
      <ul className="entitlements entitlements--pro" data-testid={`pro-list-${manifest.id}`}>
        {manifest.entitlements.pro.map((id) => (
          <li key={id} className="entitlements__locked">
            <span>{id}</span>
            <span className="pro-tag">Pro</span>
          </li>
        ))}
      </ul>

      <p className="pro-surface__note">
        Pro features are not bundled in this local build: no account, no telemetry, no remote check.
      </p>
    </section>
  );
}
