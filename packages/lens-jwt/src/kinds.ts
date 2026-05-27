import type { Artifact } from '@nekotools/contracts';

/**
 * NekoJWT artifact kinds (all namespaced under `jwt.*`).
 *
 *   `jwt.document` — a parsed JWT: header, payload, and signature (decoded
 *                    but not verified). Always emits a signature_not_verified
 *                    diagnostic for transparency.
 */
export const JWT_KIND_DOCUMENT = 'jwt.document';

export const ALL_JWT_KINDS = [JWT_KIND_DOCUMENT] as const;

/** Header claim names recognized in JWT specification. */
export interface JwtHeader {
  readonly alg: string;
  readonly typ?: string;
  readonly kid?: string;
  readonly [key: string]: unknown;
}

/** Standard claims from RFC 7519, plus any custom claims. */
export interface JwtClaims {
  readonly sub?: string;
  readonly iss?: string;
  readonly aud?: string | string[];
  readonly exp?: number;
  readonly iat?: number;
  readonly nbf?: number;
  readonly jti?: string;
  readonly [key: string]: unknown;
}

/** The parsed body of a `jwt.document` artifact. */
export interface JwtDocument {
  readonly raw: string;
  readonly header: JwtHeader;
  readonly payload: JwtClaims;
  readonly signature: string;
}

export type JwtDocumentArtifact = Artifact<'jwt.document', JwtDocument>;
export type JwtArtifact = JwtDocumentArtifact;

/** Exporters render `jwt.document`. */
export const JWT_DOCUMENT_EXPORT_KINDS = [JWT_KIND_DOCUMENT] as const;
