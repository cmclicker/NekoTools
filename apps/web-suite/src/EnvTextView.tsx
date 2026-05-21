import type { Diagnostic } from '@nekotools/contracts';

import { groupSeverityByLine } from './TextView.js';

interface EnvTextViewProps {
  readonly text: string;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Raw-text view for a dotenv document. Renders the input with line
 * numbers + a left-gutter marker per diagnostic-bearing line. Shares
 * the same `groupSeverityByLine` helper as NekoJSON's `TextView` —
 * that helper is generic (works on any `Diagnostic[]`).
 *
 * Phase 2.2 keeps the gutter shape consistent with NekoJSON so a user
 * who knows one knows the other.
 */
export function EnvTextView({ text, diagnostics }: EnvTextViewProps): JSX.Element {
  const severityByLine = groupSeverityByLine(diagnostics);
  const lines = text.length === 0 ? [''] : text.split('\n');

  return (
    <div className="textview" aria-label="NekoEnv text view">
      <ol className="textview__lines">
        {lines.map((line, i) => {
          const lineNumber = i + 1;
          const severity = severityByLine.get(lineNumber);
          return (
            <li
              key={lineNumber}
              className={`textview__line${severity ? ` textview__line--${severity}` : ''}`}
              data-line={lineNumber}
              data-severity={severity ?? ''}
            >
              <span
                className="textview__gutter"
                aria-hidden="true"
                title={severity ? `${severity} on line ${lineNumber}` : undefined}
              >
                {severity ? markerFor(severity) : ' '}
              </span>
              <span className="textview__number">{lineNumber}</span>
              <span className="textview__content">{line}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function markerFor(severity: Diagnostic['severity']): string {
  switch (severity) {
    case 'error':
      return '✖';
    case 'warning':
      return '!';
    case 'info':
      return 'i';
    case 'hint':
      return '·';
  }
}
