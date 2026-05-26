import type { Diagnostic } from '@nekotools/contracts';

import { groupSeverityByLine } from './TextView.js';

interface LogTextViewProps {
  readonly text: string;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Raw-text view for a log snapshot. Renders the input with line
 * numbers + a left-gutter marker per diagnostic-bearing line. Shares
 * the same generic `groupSeverityByLine` helper as NekoJSON's
 * `TextView` and NekoEnv's `EnvTextView` (it works on any
 * `Diagnostic[]`), so a user who knows one text view knows them all.
 *
 * NekoLogs' free diagnostics are line-spanning info/error markers
 * (mixed formats, unparseable lines, an invalid filter); most do not
 * carry a `span`, so the gutter stays empty for them — exactly the
 * shape `groupSeverityByLine` already handles for the other tools.
 */
export function LogTextView({ text, diagnostics }: LogTextViewProps): JSX.Element {
  const severityByLine = groupSeverityByLine(diagnostics);
  const lines = text.length === 0 ? [''] : text.split('\n');

  return (
    <div className="textview" aria-label="NekoLogs text view">
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
