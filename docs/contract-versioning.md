# Contract Versioning

Every contract — and every JSON Schema — ships with a `version` field
from day one. Phase 0 pins every contract at `version: 1`.

## Why versioning exists from the start

Schema drift is silent until it isn't. The cheapest time to add a version
field is before any tool depends on the shape. Once five tools serialize
artifacts to disk, changing the artifact contract without a version is a
breaking change you cannot detect at the seam.

The runtime treats `version` as a required, exact-match field. A
workspace file written at `version: 1` cannot be loaded by a runtime
that only knows `version: 2`. The migration must be explicit.

## Change classes

### Patch — backwards-compatible

- Add an optional field.
- Add a new diagnostic code.
- Add a new export target enum value (provided every consumer can ignore
  unknown values gracefully).

Does **not** bump the contract version. Schema is updated in place.

### Minor — backwards-compatible additive

- Add a new artifact kind.
- Add a new parser id.
- Add a new manifest capability flag.

Bumps an additive minor in the package version, not the contract version.
A workspace saved by an older build can still be loaded.

### Major — breaking

- Change a required field's type.
- Remove or rename a required field.
- Change validation semantics.
- Change `version` constant.

A major change requires:

1. Bumping the `version` constant in the contract file.
2. Bumping the `version: { const: N }` in the matching JSON Schema.
3. Shipping a documented migration from `N-1` → `N`.
4. The workspace serializer refusing to load `N-1` files without an
   explicit user-initiated migration step.

## Why the schema uses `const`, not `minimum`

`{ "const": 1 }` rejects an old workspace file at the seam instead of
silently accepting it and producing wrong behavior downstream.

## Phase 0 status

Every contract: `version: 1`.
Every schema: `version: { const: 1 }`.
No migrations yet.
