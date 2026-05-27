# Tool Ideals — Candidate Surface & Market Thesis

> **Status: ideation only. Not a roadmap. Not an authorization.**
>
> This document preserves the *expanded* product vision — the full
> candidate surface and the market thesis behind it — so the suite is
> never mistaken for "three tools and three documented follow-ups."
>
> It is **subordinate** to [`docs/roadmap.md`](../roadmap.md). The roadmap
> is the single source of truth for what is **committed, queued, or
> shipped**. This file is the *pool of possibilities* and the reasoning
> for choosing among them. Nothing here is automatically authorized
> implementation scope (see [§7](#7-source-of-truth-rule)). Every tool
> that actually ships must still pass the charter
> ([`docs/tool-charter.md`](../tool-charter.md)) and enter through the
> roadmap + PR review flow in [`docs/governance.md`](../governance.md).

---

## 1. Current shipped tools

The platform proof. Three tools, each with engine + free-tier UI, live in
the suite today:

- **NekoJSON** — JSON workbench (Phase 1, complete).
- **NekoEnv** — `.env` workbench (Phase 2, complete).
- **NekoLogs** — log workbench (Phase 2, complete).

They establish the repeatable pattern every future tool inherits:

```text
local-first              offline-safe              zero-telemetry posture
engine + UI              free entitlement boundary  structured diagnostics
export / copy workflows  workspace save / load (free)
```

The architecture is proven. The open product risk is **under-breadth**,
not the spine — the platform exists so the Nth tool is days of work, not
months ([`docs/roadmap.md`](../roadmap.md), "the rule that holds across
phases").

## 2. Documented future candidates

Already named in the canonical roadmap. Listed here for completeness; the
roadmap owns their phase/queue placement:

| Tool | Roadmap home | Product role |
| --- | --- | --- |
| **NekoCron** | Phase 2 | Cron expression parsing, explanation, next-run preview, timezone sanity. |
| **NekoIgnore** | Phase 2 | `.gitignore` / `.dockerignore` / `.npmignore` glob & pattern testing. |
| **NekoPackage** | Phase 2 | Package/manifest inspection: metadata, scripts, dependency risk. |

> The roadmap **also** already documents, at later phases:
> **Phase 4** — NekoYAML, NekoAPI Lens, NekoHeaders, NekoTypes, NekoRBAC;
> **Phase 5** — expansion packs (GameTools, NetTools, MathTools, CSLab).
> Several "proposed" candidates below therefore overlap existing roadmap
> entries — that overlap is intentional and called out, not a conflict.

## 3. Proposed high-fit candidate pool

Candidates that fit the product thesis better than arbitrary utilities.
**Not canonical** until promoted into the roadmap. The "on roadmap?"
column makes the SoT relationship explicit:

| Tool | On roadmap? | Why it fits |
| --- | --- | --- |
| **NekoYAML** | Yes — Phase 4 | YAML is common, fragile, config-heavy, often sensitive. Natural sibling to JSON/env. |
| **NekoHeaders** | Yes — Phase 4 | HTTP/security header inspection: practical, explainable, web/devops-facing. |
| **NekoDiff** | No (new) | Cross-tool comparison layer (JSON/env/log/text diff). High glue value. |
| **NekoJWT** | No (new) | Local token decode/inspect. Sensitive — **decode/inspect only**, no unsafe secret handling. |
| **NekoRegex** | No (new) | Common utility, strong UX opportunity, but crowded. |
| **NekoSecrets** | No (new) | Secret-pattern inspection / redaction helper. High privacy alignment; avoid risky claims. |
| **NekoSchema** | No (new) | Schema inference / validation / codegen from JSON/YAML. Strong Pro potential. |
| **NekoAPI** | Yes — Phase 4 (API Lens) | Request/response artifact inspector — *not* a full Postman clone. High future value. |
| **NekoMarkdown** | No (new) | Markdown / table / frontmatter utility. Useful; likely lower monetization. |
| **NekoBase64** | No (new) | Encode/decode. Easy breadth filler, low differentiation. |
| **NekoHash** | No (new) | Hash / checksum. Easy, useful, low differentiation. |
| **NekoTimestamp** | No (new) | Epoch / timezone / date. Useful, commodity. |
| **NekoColor** | No (new) | Color conversion / accessibility checks. Useful, less core to artifact inspection. |
| **NekoUUID** | No (new) | UUID generate / inspect. Commodity breadth. |
| **NekoURL** | No (new) | URL parse / encode / query inspection. Commodity breadth. |

## 4. Classification by product thesis

Grouping the shipped, documented, and proposed tools by where they sit in
the product story.

### Sensitive artifact inspectors — *strongest fit*

Artifacts developers hesitate to paste into a random online site. This is
the differentiated core of the offline / zero-telemetry positioning.

```text
NekoJSON   NekoYAML   NekoEnv    NekoLogs
NekoJWT    NekoHeaders NekoPackage NekoSecrets   NekoAPI
```

### Pattern / validation tools

Daily-use, easy to understand, fast to ship.

```text
NekoIgnore   NekoRegex   NekoCron   NekoSchema
```

### Comparison / workflow tools

Less standalone, more product glue — they make the other tools more
powerful and lean heavily on Pro leverage (see [§6](#6-pro-workflow-leverage-priorities)).

```text
NekoDiff
(workspace / redaction / bundle behaviors surface as Pro leverage,
 not as separate free tools)
```

### Commodity breadth tools

Make the suite feel broad. Useful, but not the differentiator — they
should never be mistaken for the core thesis.

```text
NekoBase64   NekoHash   NekoTimestamp   NekoColor   NekoUUID   NekoURL   NekoMarkdown
```

## 5. Free-tier breadth priorities

A **proposed** ordering for the next breadth phase — prioritized by market
value, not original roadmap order. This is a *recommendation to the owner*,
not a queue change; the actual queue lives in
[`docs/roadmap.md`](../roadmap.md) ("Active Next Queue") and only changes
via an explicit roadmap PR.

Proposed "Phase 2B — Tool Breadth" sequence (3 → 9 meaningful tools):

| Rank | Tool | Reason |
| ---: | --- | --- |
| 1 | **NekoYAML** | Most natural sibling to JSON/env; high config pain. |
| 2 | **NekoIgnore** | Fast, practical, already a documented candidate. |
| 3 | **NekoHeaders** | Easy to demo; useful for web/security posture. |
| 4 | **NekoDiff** | Multiplies the value of the tools already shipped. |
| 5 | **NekoJWT** | Strong sensitive-artifact use case; needs careful safety framing. |
| 6 | **NekoPackage** | Larger, but the most commercially serious wedge. |

> Note the SoT tension to resolve deliberately, not silently: the roadmap
> currently places NekoIgnore/NekoPackage in **Phase 2** and
> NekoYAML/NekoHeaders in **Phase 4**. Adopting this market-value order
> means *promoting* the Phase 4 items — an owner decision (see
> [§8](#8-next-owner-decision-queue)), executed as a roadmap PR.

## 6. Pro workflow leverage priorities

Pro is **leverage, not access** — and not "more formatters." It aligns
with [`docs/monetization-model.md`](../monetization-model.md) (advanced
workspace leverage; basic local save/load stays free).

Cross-tool Pro leverage, in rough priority:

```text
named workspaces      snapshots            saved recipes
batch processing      redaction presets    shareable local bundles
workspace packs       policy packs         CLI / CI guard export
```

Tool-specific Pro directions (illustrative, not committed):

| Tool | Pro direction |
| --- | --- |
| NekoJSON | schema inference, schema diff, jq/JSONPath chains, Zod/TS generation |
| NekoEnv | env comparison, sanitized `.env.example`, secret-risk classification |
| NekoLogs | saved filters, anomaly clustering, incident report export |
| NekoYAML | schema validation, Kubernetes / GitHub Actions awareness, YAML↔JSON roundtrip diff |
| NekoPackage | dependency risk, script audit, package health, lockfile inspection |
| NekoDiff | saved comparisons, redacted exports, batch diff reports |
| NekoJWT | token safety report, claim comparison, expiry / session analysis |

## 7. Source-of-truth rule

This section is binding for how the two documents relate:

1. **[`docs/roadmap.md`](../roadmap.md) remains canonical** for
   committed / queued / shipped work. If this file and the roadmap ever
   disagree about status or order, the roadmap wins.
2. **This file is ideation / candidate pool only.** It records vision,
   classification, and market reasoning — not commitments.
3. **Nothing here is automatically authorized implementation scope.**
   Listing a tool does not queue it, fund it, or approve a branch.
4. Promotion path: a candidate becomes real only by passing the charter
   ([`docs/tool-charter.md`](../tool-charter.md)) **and** being added to
   the roadmap's Active Next Queue via the normal PR review flow
   ([`docs/governance.md`](../governance.md)).

## 8. Next owner decision queue

Open product decisions this document surfaces (for deliberate owner
resolution, each via a roadmap PR — not auto-applied):

- [ ] Preserve the **current roadmap order** (Cron/Ignore/Package in
      Phase 2; YAML/Headers/API in Phase 4), or adopt the market-value
      "Phase 2B" order from [§5](#5-free-tier-breadth-priorities)?
- [ ] **Promote NekoYAML** from Phase 4 into the near-term breadth queue?
- [ ] **Prioritize NekoIgnore** as the fastest practical quick-win?
- [ ] **Move NekoPackage earlier** as the strongest commercial wedge?

Resolving any of these is a separate, explicitly authorized roadmap
change. Until then, the roadmap stands as written.
