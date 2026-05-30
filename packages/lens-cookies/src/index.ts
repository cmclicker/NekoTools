import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createCookieTextParser } from './parser-text.js';
import { freeExporters, proExporters } from './exporters.js';
import { cookiesManifest } from './manifest.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './audit.js';
export * from './parser-text.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/** Optional configuration for the NekoCookies registration. */
export interface BuildCookiesRegistrationOptions {
  /** Soft per-cookie byte limit for `cookie.large`. Defaults to 4096. */
  readonly largeCookieBytes?: number;
}

/**
 * Build a NekoCookies registration for the runtime. Free exporters run for
 * everyone; the Pro exporters (security audit report, hardened policy preset)
 * are registered as `proExporters` and gated by `runExporter` behind a valid
 * entitlement (single-build-gated model, same as NekoJWT / NekoCSP).
 */
export function buildCookiesRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
  options: BuildCookiesRegistrationOptions = {},
): ToolRegistration {
  const deps =
    options.largeCookieBytes !== undefined
      ? { clock, largeCookieBytes: options.largeCookieBytes }
      : { clock };
  return {
    manifest: cookiesManifest,
    parsers: [createCookieTextParser(deps)],
    exporters: freeExporters,
    proExporters,
  };
}
