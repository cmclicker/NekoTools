# Product Doctrine

NekoTools is a **local-only, air-gapped-capable, zero-telemetry** suite
of visual developer workbenches for inspecting, validating, explaining,
comparing, transforming, and exporting technical artifacts without
sending user data anywhere.

## Non-negotiable rules

1. **No feature may require an internet connection to perform its primary function.**
2. **No telemetry. No analytics. No remote config. No hidden network calls.**
3. **No mandatory account.** Pro is unlocked by a local, cryptographically
   signed license file — never by a server check during use.
4. **No cloud sync in the core product.** Sharing happens by user-exported
   artifacts (workspaces, reports, screenshots, gists) — not by NekoTools
   uploading anything.
5. **No CDN assets at runtime.** Fonts, icons, libraries are bundled.
6. **No feature degradation without internet.** If a feature is in the
   product, it works in airplane mode.
7. **Open-core, not open-everything.** Free/core lives in the public repo;
   Pro modules live in a separate private package set and are linked into
   paid builds at build time. The free build does not contain Pro code.

## Three product modes — and which one this is

| Mode               | Description                                                 | Used here? |
| ------------------ | ----------------------------------------------------------- | ---------- |
| Local-only         | Everything happens on the device. No network calls.         | **Yes.**   |
| Local-first        | Works locally by default. May optionally sync or fetch.     | No.        |
| Cloud-assisted     | Some features require a backend.                            | No.        |

## Network-adjacent tools

Some future tools (NekoHeaders, NekoDNS, NekoTLS, NekoCORS) analyze data
that *originated* on a network. The product rule for these:

- The user brings the data (paste, file, import, HAR, PEM, dig output).
- The app does **not** fetch it.
- Their offline policy is declared as `explicit-import-only`.

## What this buys us

A tool a user can trust with:

- secrets in configs
- private logs
- proprietary schemas
- regulated payloads
- air-gapped or restricted environments
- offline travel, bunkers, planes, islands, woods

That trust is the differentiator, not a feature checklist.
