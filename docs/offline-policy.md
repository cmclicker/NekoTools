# Offline Policy

Every tool declares its relationship with the network. The runtime and
CI enforce that declaration.

## The three values

- **`network-forbidden`** — the tool must not touch the network in any
  form. This is the default and applies to every Phase 0 / Phase 1 tool.
- **`explicit-import-only`** — reserved for future network-adjacent tools
  (NekoHeaders, NekoDNS, NekoTLS, NekoCORS). The tool analyzes data the
  user pasted or imported. It does not fetch.
- **`optional-user-initiated-network`** — reserved for a hypothetical
  future tier. **Phase 0 forbids this value in the manifest schema.**

## Enforcement

The offline-guard package is the CI gate.

It fails the build if it finds:

- a banned dependency (Sentry, Segment, Amplitude, Mixpanel, Datadog,
  PostHog, FullStory, LogRocket, LaunchDarkly, Statsig, Firebase,
  Google Analytics, and similar — see `denylist.ts` for the full list)
- a literal external URL inside a `fetch(...)` call
- a CDN reference (`cdn.jsdelivr.net`, `unpkg.com`, `fonts.googleapis.com`,
  `fonts.gstatic.com`)

It scans test files too. "It's only in a test" is not an exemption.

The only escape hatch is the literal comment marker `offline-guard:allow`
inside a file. Used for the scanner's own data files and for tests that
must contain forbidden patterns as fixtures.

**Marker review rule** (enforced by code review, not the scanner):

1. Every `offline-guard:allow` occurrence MUST be accompanied by an
   inline comment explaining *why* the file legitimately contains the
   banned pattern (data file, test fixture, etc.).
2. PRs that add a new marker MUST be approved by a maintainer who has
   explicitly justified the exemption in the PR description.
3. A marker without a written reason is a CI bypass and is treated as
   a doctrine violation in review.

There are currently two markers in the repo:

| File                                                    | Reason |
| ------------------------------------------------------- | ------ |
| `packages/offline-guard/src/denylist.ts`                | Source of truth for the scanner; patterns appear as data. |
| `packages/offline-guard/src/__tests__/scanner.test.ts`  | Fixtures must contain banned patterns so the scanner has something to catch. |

Any third marker requires explicit review.

## Data collection

Every manifest declares `dataCollection: "none"`. There is no other
allowed value. There is no "anonymous", no "aggregate", no "crash
reporting." If a future tool needs to log to disk for the user's own
debugging, it logs to the user's disk, not anywhere else.

## Accounts

Every manifest declares `requiresAccount: false`. There is no other
allowed value. There is no "optional sign-in," no "cloud sync if you
want." The Pro tier is unlocked by an offline-signed license file.

## "Works in a bunker" test

Before any feature ships, it must pass this manual check:

1. Install on a clean machine.
2. Disconnect Wi-Fi. Disconnect ethernet. Disable cellular.
3. Disable DNS resolution (e.g. flush + block).
4. Launch the app.
5. Use the feature end-to-end.
6. Save a workspace. Reopen it. Export it.

If any step requires a network round trip, the feature has violated the
doctrine and does not ship.
