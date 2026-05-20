/**
 * Dependency denylist.
 *
 * Any package whose name matches one of these patterns is forbidden in
 * NekoTools core packages. The CI scanner fails if it finds one declared
 * as a dependency or imported in source.
 *
 * The list errs on the side of catching well-known offenders. False
 * positives are easier to resolve (rename, exempt) than missed analytics
 * SDKs sneaking into a build.
 *
 * offline-guard:allow — this file contains the banned patterns as data,
 * not as runtime calls. It is the source of truth for the scanner.
 */
export const DEPENDENCY_DENYLIST: readonly string[] = [
  '@sentry/',
  '@segment/',
  '@amplitude/',
  '@mixpanel/',
  '@datadog/',
  '@newrelic/',
  '@rollbar/',
  '@bugsnag/',
  '@posthog/',
  '@fullstory/',
  '@logrocket/',
  '@launchdarkly/',
  '@statsig/',
  'analytics',
  'analytics-node',
  'segment',
  'mixpanel',
  'mixpanel-browser',
  'amplitude-js',
  'rollbar',
  'bugsnag-js',
  'sentry',
  'posthog-js',
  'posthog-node',
  'fullstory',
  'logrocket',
  'launchdarkly-js-client-sdk',
  'launchdarkly-node-server-sdk',
  'statsig-js',
  'statsig-node',
  'google-analytics',
  'react-ga',
  'firebase',
  'firebase-admin',
  'unleash-client',
  'split.io',
  'optimizely',
];

/**
 * Forbidden import substrings to scan source code for. The dependency
 * denylist catches declared deps; this catches direct imports of remote
 * resources, well-known telemetry SDKs by bare import string, and CDN
 * patterns.
 */
export const IMPORT_DENYLIST: readonly string[] = [
  'cdn.jsdelivr.net',
  'unpkg.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'www.google-analytics.com',
  'googletagmanager.com',
  'plausible.io/api',
];

/**
 * Suspicious URL patterns in source files. Not all URLs are forbidden —
 * docs may link to `https://github.com/...` — but production code should
 * never contain a literal external URL that the runtime reaches out to.
 * This pattern catches the obvious `fetch('https://...')` mistake.
 */
export const SOURCE_URL_PATTERN = /\bfetch\s*\(\s*['"`]https?:\/\//gi;
