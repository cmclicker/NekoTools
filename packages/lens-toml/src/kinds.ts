import type { Artifact } from '@nekotools/contracts';

/**
 * NekoTOML artifact kinds (all namespaced under `toml.*`; none reused from
 * other tools).
 *
 *   `toml.parsed` — a TOML document decoded into a plain JSON-compatible
 *                   value tree, plus structural counts. Dates/times are
 *                   preserved as their original strings (NekoTOML does not
 *                   reinterpret them into a host `Date`), so a workspace
 *                   round-trip is byte-stable and never network-dependent.
 */
export const TOML_KIND_PARSED = 'toml.parsed';

export const ALL_TOML_KINDS = [TOML_KIND_PARSED] as const;

/**
 * A decoded TOML value. TOML's scalar set maps onto JSON with one
 * deliberate exception: offset/local date-times are kept as strings (see
 * `kinds.ts` note) rather than `Date`, because a `Date` is not JSON and
 * would not survive the workspace serializer losslessly.
 */
export type TomlValue =
  | string
  | number
  | boolean
  | readonly TomlValue[]
  | { readonly [key: string]: TomlValue };

/** The parsed body of a `toml.parsed` artifact. */
export interface ParsedToml {
  /** True when the input decoded without a fatal error. */
  readonly valid: boolean;
  /** Decoded value tree, or `null` when the input was empty or failed to parse. */
  readonly data: TomlValue | null;
  /** Count of `[table]` headers + `[[array-of-table]]` entries encountered. */
  readonly tableCount: number;
  /** Count of leaf key assignments (`key = value`) encountered. */
  readonly keyCount: number;
}

export type TomlParsedArtifact = Artifact<'toml.parsed', ParsedToml>;
export type TomlArtifact = TomlParsedArtifact;

/** Exporters render `toml.parsed`; the accept list is narrow on purpose
 * (the NekoEnv/NekoYAML/NekoURL lesson — a wide accept list lets the
 * runtime hand the wrong artifact to the wrong exporter). */
export const TOML_PARSED_EXPORT_KINDS = [TOML_KIND_PARSED] as const;
