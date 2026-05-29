import type { Artifact } from '@nekotools/contracts';

/**
 * NekoCookies artifact kinds (namespaced under `cookie.*`).
 *
 *   `cookie.parsed` — one or more cookies decoded from a `Set-Cookie`
 *                     response header (with attributes) or a `Cookie`
 *                     request header (name/value pairs only), plus the
 *                     parse mode. Cookie values are stored verbatim
 *                     because the tool's job is to inspect them — but the
 *                     UI masks them by default and the markdown summary
 *                     reports value *length*, never the secret, so a
 *                     pasted session token is not casually leaked.
 */
export const COOKIE_KIND_PARSED = 'cookie.parsed';

export const ALL_COOKIE_KINDS = [COOKIE_KIND_PARSED] as const;

export type CookieMode = 'set-cookie' | 'cookie';

/** RFC 6265 cookie attributes (plus the modern `SameSite` / `Partitioned`). */
export interface CookieAttributes {
  readonly domain: string | null;
  readonly path: string | null;
  /** Raw `Expires` string, verbatim. `null` when absent. */
  readonly expires: string | null;
  /** `Max-Age` in seconds, or `null` when absent / non-numeric. */
  readonly maxAge: number | null;
  /** Raw `SameSite` token (`Strict` / `Lax` / `None`), or `null`. */
  readonly sameSite: string | null;
  readonly secure: boolean;
  readonly httpOnly: boolean;
  readonly partitioned: boolean;
  /** Any attributes not in the standard set, preserved in source order. */
  readonly extras: Readonly<Record<string, string>>;
}

export interface ParsedCookie {
  readonly name: string;
  readonly value: string;
  readonly attributes: CookieAttributes;
}

/** The parsed body of a `cookie.parsed` artifact. */
export interface CookieSet {
  readonly valid: boolean;
  readonly mode: CookieMode;
  readonly cookies: readonly ParsedCookie[];
}

export type CookieParsedArtifact = Artifact<'cookie.parsed', CookieSet>;
export type CookieArtifact = CookieParsedArtifact;

export const COOKIE_PARSED_EXPORT_KINDS = [COOKIE_KIND_PARSED] as const;

/** An attributes object with all defaults (no flags, nothing set). */
export function emptyAttributes(): CookieAttributes {
  return {
    domain: null,
    path: null,
    expires: null,
    maxAge: null,
    sameSite: null,
    secure: false,
    httpOnly: false,
    partitioned: false,
    extras: {},
  };
}
