import { jsonManifest } from '@nekotools/lens-json';

/**
 * Phase 1.1e shell.
 *
 * Renders a read-only manifest summary panel for NekoJSON. The point
 * of this PR is to prove the build pipeline + workspace wiring; the
 * actual NekoJSON views (tree, text, table, search, copy) ship in
 * Phase 1.1f / 1.1g / 1.1h.
 */
export function App(): JSX.Element {
  return (
    <main className="suite">
      <header className="suite__header">
        <h1>NekoTools</h1>
        <p className="suite__tagline">
          Local-only, air-gapped-capable, zero-telemetry developer workbenches.
        </p>
        <p className="suite__phase">
          Web shell — Phase 1.1e. Hosting <strong>{jsonManifest.name}</strong>{' '}
          (manifest view only; interactive views land in Phase 1.1f+).
        </p>
      </header>

      <section className="card">
        <h2>{jsonManifest.name}</h2>
        <p className="card__summary">{jsonManifest.summary}</p>

        <dl className="kv">
          <dt>Tool id</dt>
          <dd>
            <code>{jsonManifest.id}</code>
          </dd>
          <dt>Tool version</dt>
          <dd>{jsonManifest.toolVersion}</dd>
          <dt>Offline policy</dt>
          <dd>
            <code>{jsonManifest.offlinePolicy.networkPolicy}</code>
          </dd>
          <dt>Data collection</dt>
          <dd>
            <code>{jsonManifest.offlinePolicy.dataCollection}</code>
          </dd>
        </dl>

        <h3>Capabilities (this build)</h3>
        <ul className="caps">
          {(
            Object.entries(jsonManifest.capabilities) as ReadonlyArray<[string, boolean]>
          ).map(([k, v]) => (
            <li key={k} className={v ? 'caps__on' : 'caps__off'}>
              <code>{k}</code>: {v ? 'yes' : 'no'}
            </li>
          ))}
        </ul>

        <h3>Free entitlements</h3>
        <ul className="entitlements">
          {jsonManifest.entitlements.free.map((id) => (
            <li key={id}>
              <code>{id}</code>
            </li>
          ))}
        </ul>

        <h3>Pro entitlements (declared, not in this build)</h3>
        <p className="card__note">
          Pro features are declared as honest advertising; their
          implementations live in a future private package and are not
          present in this binary.
        </p>
        <ul className="entitlements entitlements--pro">
          {jsonManifest.entitlements.pro.map((id) => (
            <li key={id}>
              <code>{id}</code>
            </li>
          ))}
        </ul>
      </section>

      <footer className="suite__footer">
        <small>
          No telemetry. No analytics. No remote fetches. See{' '}
          <code>docs/product-doctrine.md</code> for the full rules.
        </small>
      </footer>
    </main>
  );
}
