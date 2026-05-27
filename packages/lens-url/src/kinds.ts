import type { Artifact } from '@nekotools/contracts';

/**
 * NekoURL artifact kinds (all namespaced under `url.*`; none reused from
 * other tools).
 *
 *   `url.parsed` — an absolute URL broken into its components, plus the
 *                  ordered query parameters. The artifact deliberately
 *                  records credential *presence* (`hasUsername` /
 *                  `hasPassword`) rather than the secret values, and the
 *                  stored `sanitizedHref` has any userinfo stripped, so a
 *                  workspace round-trip never persists a password that was
 *                  embedded in the input.
 */
export const URL_KIND_PARSED = 'url.parsed';

export const ALL_URL_KINDS = [URL_KIND_PARSED] as const;

/** One query parameter, preserving original order and allowing duplicate keys. */
export interface UrlQueryParam {
  readonly key: string;
  readonly value: string;
}

/**
 * The structural breakdown of a parsed absolute URL. Field names mirror
 * the WHATWG `URL` interface so the mapping is obvious. Credentials are
 * represented by presence flags only — the raw username/password are
 * never stored on the artifact (see `url.credentials_present`).
 */
export interface UrlComponents {
  /** e.g. `"https:"` (includes the trailing colon, like `URL.protocol`). */
  readonly protocol: string;
  /** `protocol` without the trailing colon, e.g. `"https"`. Convenience field. */
  readonly scheme: string;
  readonly hasUsername: boolean;
  readonly hasPassword: boolean;
  /** Host with port if present, e.g. `"example.com:8080"`. */
  readonly host: string;
  /** Host without port, e.g. `"example.com"`. */
  readonly hostname: string;
  /** Port string, or `""` when the URL uses the scheme's default port. */
  readonly port: string;
  readonly pathname: string;
  /** Raw search string including the leading `?`, or `""`. Credential-free. */
  readonly search: string;
  /** Raw fragment including the leading `#`, or `""`. */
  readonly hash: string;
  /** Origin, e.g. `"https://example.com:8080"`, or `"null"` for opaque origins. */
  readonly origin: string;
  readonly queryParams: readonly UrlQueryParam[];
}

/** The parsed body of a `url.parsed` artifact. */
export interface ParsedUrl {
  /** True when the input parsed as an absolute URL. */
  readonly valid: boolean;
  /**
   * Credential-free serialization of the input URL (username/password
   * stripped). `null` when the input was empty or did not parse. This is
   * the canonical source for the normalized-URL exporter, so exports can
   * never re-emit an embedded secret.
   */
  readonly sanitizedHref: string | null;
  /** Component breakdown, or `null` when the input did not parse. */
  readonly components: UrlComponents | null;
}

export type UrlParsedArtifact = Artifact<'url.parsed', ParsedUrl>;
export type UrlArtifact = UrlParsedArtifact;

/** Exporters render `url.parsed`; the accept list is narrow on purpose
 * (the NekoEnv/NekoYAML lesson — a wide accept list lets the runtime hand
 * the wrong artifact to the wrong exporter). */
export const URL_PARSED_EXPORT_KINDS = [URL_KIND_PARSED] as const;
