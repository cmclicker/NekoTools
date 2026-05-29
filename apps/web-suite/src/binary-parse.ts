import type { Diagnostic } from '@nekotools/contracts';
import {
  buildBinaryRegistration,
  type BinaryArtifact,
  type BinaryBytesArtifact,
  type BinaryNumberArtifact,
  type BinaryTextArtifact,
} from '@nekotools/lens-binary';
import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';

export type BinaryInputMode = 'decimal' | 'binary' | 'hex' | 'base64' | 'utf8';

const PARSER_BY_MODE: Readonly<Record<BinaryInputMode, string>> = {
  decimal: 'binary.decimal',
  binary: 'binary.binary',
  hex: 'binary.hex',
  base64: 'binary.base64',
  utf8: 'binary.utf8',
};

const SHARED_UTF8_ENCODER = new TextEncoder();
const SHARED_UTF8_DECODER = new TextDecoder('utf-8', { fatal: false });

export function utf8ByteLength(value: string): number {
  return SHARED_UTF8_ENCODER.encode(value).byteLength;
}

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildBinaryRegistration());
  return r;
})();

export interface BinaryNumberSummary {
  readonly kind: 'number';
  readonly decimal: string;
  readonly hex: string;
  readonly binary: string;
}

export interface BinaryBytesSummary {
  readonly kind: 'bytes';
  readonly hex: string;
  readonly byteCount: number;
  readonly utf8Preview: string;
}

export interface BinaryTextSummary {
  readonly kind: 'text';
  readonly text: string;
  readonly byteCount: number;
  readonly hex: string;
}

export type BinarySummary = BinaryNumberSummary | BinaryBytesSummary | BinaryTextSummary;

export interface BinaryRun {
  readonly artifact: BinaryArtifact | null;
  readonly summary: BinarySummary | null;
  readonly jsonExport: string;
  readonly markdownExport: string;
  readonly plaintextExport: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly inputBytes: number;
}

export function runBinary(raw: string, mode: BinaryInputMode): BinaryRun {
  const bytes = utf8ByteLength(raw);
  const result = runParser(registry, 'binary', PARSER_BY_MODE[mode], {
    raw,
    source: { kind: 'paste', bytes },
  });

  const artifact = result.artifacts[0] as BinaryArtifact | undefined;
  const exportInput = {
    artifacts: result.artifacts,
    diagnostics: result.diagnostics,
  };

  return {
    artifact: artifact ?? null,
    summary: artifact === undefined ? null : summarizeArtifact(artifact),
    jsonExport: String(runExporter(registry, 'binary', 'binary.export.json', exportInput).body),
    markdownExport: String(
      runExporter(registry, 'binary', 'binary.export.markdown', exportInput).body,
    ),
    plaintextExport: String(
      runExporter(registry, 'binary', 'binary.export.plaintext', exportInput).body,
    ),
    diagnostics: result.diagnostics,
    inputBytes: bytes,
  };
}

function summarizeArtifact(artifact: BinaryArtifact): BinarySummary {
  if (artifact.kind === 'binary.number') {
    return summarizeNumber(artifact);
  }
  if (artifact.kind === 'binary.bytes') {
    return summarizeBytes(artifact);
  }
  return summarizeText(artifact);
}

function summarizeNumber(artifact: BinaryNumberArtifact): BinaryNumberSummary {
  return {
    kind: 'number',
    decimal: String(artifact.value),
    hex: `0x${artifact.value.toString(16)}`,
    binary: `0b${artifact.value.toString(2)}`,
  };
}

function summarizeBytes(artifact: BinaryBytesArtifact): BinaryBytesSummary {
  const bytes = hexToBytes(artifact.value);
  return {
    kind: 'bytes',
    hex: artifact.value,
    byteCount: bytes.byteLength,
    utf8Preview: SHARED_UTF8_DECODER.decode(bytes),
  };
}

function summarizeText(artifact: BinaryTextArtifact): BinaryTextSummary {
  const bytes = SHARED_UTF8_ENCODER.encode(artifact.value);
  return {
    kind: 'text',
    text: artifact.value,
    byteCount: bytes.byteLength,
    hex: bytesToHex(bytes),
  };
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
