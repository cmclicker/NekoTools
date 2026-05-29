import type { Diagnostic } from '@nekotools/contracts';

export function makeDiagnostic(
  id: string,
  severity: Diagnostic['severity'],
  code: string,
  message: string,
  span?: Diagnostic['span'],
  hint?: string,
): Diagnostic {
  const diagnostic: { -readonly [K in keyof Diagnostic]: Diagnostic[K] } = {
    version: 1,
    id,
    severity,
    code,
    message,
  };
  if (span !== undefined) diagnostic.span = span;
  if (hint !== undefined) diagnostic.hint = hint;
  return diagnostic;
}

export const PACKAGE_DIAGNOSTIC_CODES = {
  emptyInput: 'package.empty_input',
  invalidJson: 'package.invalid_json',
  notObject: 'package.not_object',
  missingName: 'package.missing_name',
  missingVersion: 'package.missing_version',
  invalidSection: 'package.invalid_section',
  duplicateDependency: 'package.duplicate_dependency',
  lifecycleScript: 'package.lifecycle_script',
  networkShellScript: 'package.network_shell_script',
  destructiveScript: 'package.destructive_script',
  remoteDependency: 'package.remote_dependency',
  unpinnedDependency: 'package.unpinned_dependency',
  largeDocument: 'package.large_document',
} as const;

export const DEFAULT_LARGE_DOCUMENT_BYTES = 10 * 1024 * 1024;
