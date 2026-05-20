# The Artifact Model

The Artifact is the keystone contract. Every other contract — parser,
diagnostic, export, graph, workspace — references it. If the artifact
model is wrong, nothing built on top can be right.

## What an artifact is

An Artifact is the local, in-memory representation of a piece of
technical content a user handed to a tool:

- a parsed integer
- an env file
- a YAML manifest
- a response header set
- a JSON document
- a PEM-encoded certificate

It is **not** the raw input. The raw input is preserved separately
(via `source`). The artifact is the parsed, validated, structured form
the rest of the tool operates on.

## The shape

```ts
interface Artifact<TKind, TValue> {
  readonly version: 1;
  readonly kind: string;       // e.g. "binary.number"
  readonly id: string;         // unique within a workspace
  readonly producedBy: ProducerRef;
  readonly producedAt: string; // ISO timestamp
  readonly source: ArtifactSource;
  readonly value: TValue;
  readonly meta?: Record<string, unknown>;
}
```

## Fields, and why each exists

- **`version`** — guards against silent drift across releases.
- **`kind`** — string discriminator. Tools route diagnostics, exporters,
  and graph projectors by kind. Kinds are namespaced by tool id
  (`binary.number`, `json.document`, `env.file`).
- **`id`** — content-addressed identity within a workspace. Lets
  diagnostics, graph nodes, and exports reference an artifact by id
  without serializing the full value.
- **`producedBy`** — records which tool + parser produced this. Useful
  for diagnostics ("the JSON parser flagged this") and for the
  workspace replay log.
- **`producedAt`** — for reproducibility. Tools must use the runtime's
  clock, not `new Date()` at module scope, so exports are reproducible.
- **`source`** — where the raw input came from. NekoTools never
  auto-fetches; the source records that fact. The four kinds (`paste`,
  `file`, `import`, `derived`) are exhaustive.
- **`value`** — the parsed payload. Type-narrowed by `kind`.
- **`meta`** — escape hatch for tool-specific annotations that do not
  belong in `value`.

## What an artifact is *not*

- Not a file path. Artifacts are in-memory.
- Not network-fetched. The `source` enum has no `url` variant.
- Not implicitly mutable. Artifacts are `readonly`; tools produce new
  ones via parser passes instead of mutating in place.

## Why kinds, not classes

Discriminated unions over a string `kind` field generalize across the
runtime, the schema, and the workspace serializer. A class-based
hierarchy would couple the runtime to the implementation.
