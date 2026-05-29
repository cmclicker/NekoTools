import type { Diagnostic } from '@nekotools/contracts';

export const CSV_DIAGNOSTIC_CODES = {
  emptyInput: 'csv.empty_input',
  unclosedQuote: 'csv.unclosed_quote',
  inconsistentColumns: 'csv.inconsistent_columns',
  duplicateHeader: 'csv.duplicate_header',
  emptyHeader: 'csv.empty_header',
  largeDocument: 'csv.large_document',
} as const;

export const DEFAULT_LARGE_DOCUMENT_BYTES = 10 * 1024 * 1024;

export function makeDiagnostic(
  id: string,
  severity: Diagnostic['severity'],
  code: string,
  message: string,
  span?: Diagnostic['span'],
): Diagnostic {
  const diagnostic: { -readonly [K in keyof Diagnostic]: Diagnostic[K] } = {
    version: 1,
    id,
    severity,
    code,
    message,
  };
  if (span !== undefined) diagnostic.span = span;
  return diagnostic;
}
