import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import {
  DEFAULT_LARGE_DOCUMENT_BYTES,
  JWT_DIAGNOSTIC_CODES,
  makeDiagnostic,
} from './diagnostics.js';
import {
  JWT_KIND_DOCUMENT,
  type JwtArtifact,
  type JwtClaims,
  type JwtDocument,
  type JwtDocumentArtifact,
  type JwtHeader,
} from './kinds.js';

const TOOL_ID = 'jwt';
const PARSER_ID = 'jwt.text';

export interface JwtTextParserDeps {
  readonly clock: Clock;
  readonly largeDocumentBytes?: number;
}

/**
 * The `jwt.text` parser. Accepts raw JWT strings and emits a `jwt.document`
 * artifact with the decoded header, payload, and signature. The signature
 * is decoded but NOT verified. Never throws — every malformed input
 * produces structured diagnostics.
 */
export function createJwtTextParser(deps: JwtTextParserDeps): Parser<JwtArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text', 'jwt'],
    produces: [JWT_KIND_DOCUMENT],
    parse(input: ParserInput): ParserResult<JwtArtifact> {
      return parseJwtText(input, deps);
    },
  };
}

function parseJwtText(input: ParserInput, deps: JwtTextParserDeps): ParserResult<JwtArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];
  const raw = input.raw.trim();

  if (raw === '') {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', JWT_DIAGNOSTIC_CODES.emptyInput, 'input is empty'),
    );
    return { artifacts: [], diagnostics };
  }

  const threshold = deps.largeDocumentBytes ?? DEFAULT_LARGE_DOCUMENT_BYTES;
  const actualBytes = utf8ByteLength(raw);
  if (actualBytes > threshold) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'info',
        JWT_DIAGNOSTIC_CODES.largeDocument,
        `document is ${actualBytes} bytes; exceeds soft threshold of ${threshold} bytes`,
      ),
    );
  }

  const segments = raw.split('.');
  if (segments.length !== 3) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'error',
        JWT_DIAGNOSTIC_CODES.invalidSegmentCount,
        `JWT must have 3 segments (header.payload.signature), found ${segments.length}`,
      ),
    );
    return { artifacts: [], diagnostics };
  }

  const [headerSeg, payloadSeg, signatureSeg] = segments;

  if (headerSeg === undefined || payloadSeg === undefined || signatureSeg === undefined) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'error',
        JWT_DIAGNOSTIC_CODES.malformedStructure,
        `JWT segments are malformed`,
      ),
    );
    return { artifacts: [], diagnostics };
  }

  let header: JwtHeader;
  try {
    const headerJson = base64urlDecode(headerSeg);
    header = JSON.parse(headerJson) as JwtHeader;
  } catch (e) {
    if (e instanceof SyntaxError) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'error',
          JWT_DIAGNOSTIC_CODES.invalidHeaderJson,
          `header segment is not valid JSON: ${(e as Error).message}`,
        ),
      );
    } else {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'error',
          JWT_DIAGNOSTIC_CODES.invalidBase64urlHeader,
          `header segment is not valid Base64URL`,
        ),
      );
    }
    return { artifacts: [], diagnostics };
  }

  let payload: JwtClaims;
  try {
    const payloadJson = base64urlDecode(payloadSeg);
    payload = JSON.parse(payloadJson) as JwtClaims;
  } catch (e) {
    if (e instanceof SyntaxError) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'error',
          JWT_DIAGNOSTIC_CODES.invalidPayloadJson,
          `payload segment is not valid JSON: ${(e as Error).message}`,
        ),
      );
    } else {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'error',
          JWT_DIAGNOSTIC_CODES.invalidBase64urlPayload,
          `payload segment is not valid Base64URL`,
        ),
      );
    }
    return { artifacts: [], diagnostics };
  }

  let signature: string;
  try {
    signature = base64urlDecode(signatureSeg);
  } catch {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'error',
        JWT_DIAGNOSTIC_CODES.invalidBase64urlSignature,
        `signature segment is not valid Base64URL`,
      ),
    );
    return { artifacts: [], diagnostics };
  }

  if (header.alg === 'none') {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'error',
        JWT_DIAGNOSTIC_CODES.algNone,
        `alg = "none" is a security risk`,
      ),
    );
  }

  const now = Math.floor(new Date(deps.clock.now()).getTime() / 1000);

  if (typeof payload.exp === 'number') {
    if (payload.exp < now) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'warning',
          JWT_DIAGNOSTIC_CODES.tokenExpired,
          `token expired at ${new Date(payload.exp * 1000).toISOString()}`,
        ),
      );
    }
  } else {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'warning',
        JWT_DIAGNOSTIC_CODES.missingExpiration,
        `no exp claim present`,
      ),
    );
  }

  if (typeof payload.nbf === 'number') {
    if (payload.nbf > now) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'warning',
          JWT_DIAGNOSTIC_CODES.tokenNotYetValid,
          `token not valid until ${new Date(payload.nbf * 1000).toISOString()}`,
        ),
      );
    }
  }

  diagnostics.push(
    makeDiagnostic(
      diagIds(),
      'info',
      JWT_DIAGNOSTIC_CODES.signatureNotVerified,
      `signature is decoded but not verified`,
    ),
  );

  const document: JwtDocument = {
    raw,
    header,
    payload,
    signature,
  };

  const artifact: JwtDocumentArtifact = {
    version: 1,
    kind: JWT_KIND_DOCUMENT,
    id: artIds(),
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt: deps.clock.now(),
    source: input.source,
    value: document,
  };

  return { artifacts: [artifact], diagnostics };
}

/** Decode a Base64URL string to UTF-8 string. */
function base64urlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binaryString = atob(padded);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

const SHARED_UTF8_ENCODER = new TextEncoder();
function utf8ByteLength(s: string): number {
  return SHARED_UTF8_ENCODER.encode(s).byteLength;
}
