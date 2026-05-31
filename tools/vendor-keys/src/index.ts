/**
 * `@nekotools/vendor-keys` — OWNER-ONLY license tooling.
 *
 * This package is NOT shipped and NOT bundled into the app. It lives under
 * `tools/` (not `packages/`) precisely so the private-key-using signing code
 * is walled off from the source-available, shippable `packages/*`. The client
 * only ever verifies licenses (`@nekotools/tool-runtime`'s `verifyLicense`);
 * this package is the other half of the pair — minting them.
 */
export * from './license-mint.js';
