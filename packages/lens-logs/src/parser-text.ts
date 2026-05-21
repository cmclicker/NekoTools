import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { computeHistogram, computeSummary } from './aggregate.js';
import {
  DEFAULT_LARGE_DOCUMENT_BYTES,
  LOG_DIAGNOSTIC_CODES,
  makeDiagnostic,
} from './diagnostics.js';
import {
  LOG_KIND_DOCUMENT,
  LOG_KIND_HISTOGRAM,
  LOG_KIND_SUMMARY,
  type LogArtifact,
  type LogDocument,
  type LogDocumentArtifact,
  type LogEntry,
  type LogHistogramArtifact,
  type LogLineFormat,
  type LogSummaryArtifact,
} from './kinds.js';
import { parseLine } from './line-parse.js';

const TOOL_ID = 'logs';
const PARSER_ID = 'log.text';

interface ParserDeps {
  readonly clock: Clock;
  readonly largeDocumentBytes?: number;
}

/**
 * The Phase 2.x.1 `log.text` parser.
 *
 * A single run emits **three artifacts** — the primary `log.document`
 * plus a derived `log.summary` and a basic `log.histogram`, both
 * computed as pure functions of the document in the same pass (see
 * docs/tools/nekologs.md §1). No separate aggregator stage or
 * contract: the derived artifacts ride out of the existing
 * `ParserResult.artifacts` array. The parser never throws — an
 * undetectable line becomes a plaintext entry.
 *
 * Offsets/bytes use UTF-8 byte length via `TextEncoder` so the
 * large-document threshold is honest for non-ASCII payloads.
 */
export function createLogTextParser(deps: ParserDeps): Parser<LogArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text', 'log', 'logs'],
    produces: [LOG_KIND_DOCUMENT, LOG_KIND_SUMMARY, LOG_KIND_HISTOGRAM],
    parse(input: ParserInput): ParserResult<LogArtifact> {
      const artIds = makeIdFactory('art');
      const diagIds = makeIdFactory('diag');
      const diagnostics: Diagnostic[] = [];

      const raw = input.raw;
      const sourceLines = raw.split('\n');

      const entries: LogEntry[] = [];
      const seenFormats: LogLineFormat[] = [];
      let unparseableCount = 0;
      let timestampUnparsedCount = 0;

      for (let i = 0; i < sourceLines.length; i += 1) {
        const lineRaw = sourceLines[i]!.replace(/\r$/, '');
        if (lineRaw.trim() === '') continue; // skip blank lines — not entries
        const parsed = parseLine(lineRaw);
        if (!seenFormats.includes(parsed.format)) seenFormats.push(parsed.format);
        if (parsed.unparseable) unparseableCount += 1;
        if (parsed.timestampLookedButFailed) timestampUnparsedCount += 1;

        const entry: LogEntry = {
          lineNumber: i + 1,
          raw: lineRaw,
          format: parsed.format,
          message: parsed.message,
          fields: parsed.fields,
          ...(parsed.level !== undefined && { level: parsed.level }),
          ...(parsed.timestamp !== undefined && { timestamp: parsed.timestamp }),
          ...(parsed.timestampMs !== undefined && { timestampMs: parsed.timestampMs }),
        };
        entries.push(entry);
      }

      const document: LogDocument = { entries, detectedFormats: seenFormats };

      if (entries.length === 0) {
        diagnostics.push(
          makeDiagnostic(
            diagIds(),
            'info',
            LOG_DIAGNOSTIC_CODES.emptyInput,
            raw.trim() === ''
              ? 'input is empty'
              : 'input contains no parseable log lines (only blank lines)',
          ),
        );
      }

      if (unparseableCount > 0) {
        diagnostics.push(
          makeDiagnostic(
            diagIds(),
            'info',
            LOG_DIAGNOSTIC_CODES.unparseableLine,
            `${unparseableCount} line${unparseableCount === 1 ? '' : 's'} had no recognizable timestamp, level, or structured fields and ${unparseableCount === 1 ? 'was' : 'were'} kept as plaintext`,
          ),
        );
      }

      if (timestampUnparsedCount > 0) {
        diagnostics.push(
          makeDiagnostic(
            diagIds(),
            'info',
            LOG_DIAGNOSTIC_CODES.timestampUnparsed,
            `${timestampUnparsedCount} entr${timestampUnparsedCount === 1 ? 'y' : 'ies'} had a timestamp-shaped token that did not parse`,
          ),
        );
      }

      if (seenFormats.length > 1) {
        diagnostics.push(
          makeDiagnostic(
            diagIds(),
            'info',
            LOG_DIAGNOSTIC_CODES.mixedFormats,
            `document mixes line formats: ${seenFormats.join(', ')}`,
          ),
        );
      }

      const threshold = deps.largeDocumentBytes ?? DEFAULT_LARGE_DOCUMENT_BYTES;
      const actualBytes = utf8ByteLength(raw);
      if (actualBytes > threshold) {
        diagnostics.push(
          makeDiagnostic(
            diagIds(),
            'info',
            LOG_DIAGNOSTIC_CODES.largeDocument,
            `document is ${actualBytes} bytes; exceeds soft threshold of ${threshold} bytes — some heavy operations may be gated`,
          ),
        );
      }

      const producedBy = { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 };
      const documentArtifact: LogDocumentArtifact = {
        version: 1,
        kind: LOG_KIND_DOCUMENT,
        id: artIds(),
        producedBy,
        producedAt: deps.clock.now(),
        source: input.source,
        value: document,
      };

      const summaryArtifact: LogSummaryArtifact = {
        version: 1,
        kind: LOG_KIND_SUMMARY,
        id: artIds(),
        producedBy,
        producedAt: deps.clock.now(),
        source: { kind: 'derived', from: [documentArtifact.id] },
        value: computeSummary(documentArtifact.id, document),
      };

      const histogramArtifact: LogHistogramArtifact = {
        version: 1,
        kind: LOG_KIND_HISTOGRAM,
        id: artIds(),
        producedBy,
        producedAt: deps.clock.now(),
        source: { kind: 'derived', from: [documentArtifact.id] },
        value: computeHistogram(documentArtifact.id, document),
      };

      return {
        artifacts: [documentArtifact, summaryArtifact, histogramArtifact],
        diagnostics,
      };
    },
  };
}

const SHARED_UTF8_ENCODER = new TextEncoder();
function utf8ByteLength(s: string): number {
  return SHARED_UTF8_ENCODER.encode(s).byteLength;
}
