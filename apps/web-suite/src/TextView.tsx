import type { Diagnostic } from '@nekotools/contracts';

interface TextViewProps {
  /** Raw JSON the user pasted (or the canonical pretty-print). */
  readonly text: string;
  /** Diagnostics produced by the parser; rendered with gutter markers. */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Phase 1.1f text view. Renders the raw input with line numbers and a
 * left-gutter marker for any line that carries a diagnostic. The
 * gutter marker color follows the highest-severity diagnostic on that
 * line.
 *
 * No CodeMirror, no Monaco — those are deferred to a later PR if the
 * gutter ergonomics need to grow. For Phase 1.1f, a `<pre>` with line
 * numbers and a side gutter is enough to surface the tokenizer-backed
 * spans the user already gets through the diagnostic list.
 */
export function TextView({ text, diagnostics }: TextViewProps): JSX.Element {
  const severityByLine = groupSeverityByLine(diagnostics);
  const lines = text.length === 0 ? [''] : text.split('\n');

  return (
    <div className="textview" aria-label="JSON text view">
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

type Severity = Diagnostic['severity'];

const SEVERITY_RANK: Record<Severity, number> = {
  error: 3,
  warning: 2,
  info: 1,
  hint: 0,
};

/**
 * Collapse a diagnostic list to "the highest-severity severity per
 * 1-indexed line." Used by the gutter marker to color the line with
 * the most severe diagnostic it carries. A line with only an `info`
 * gets info color; a line with a warning AND an info gets warning.
 */
export function groupSeverityByLine(
  diagnostics: readonly Diagnostic[],
): ReadonlyMap<number, Severity> {
  const out = new Map<number, Severity>();
  for (const d of diagnostics) {
    const line = d.span?.startLine;
    if (typeof line !== 'number') continue;
    const existing = out.get(line);
    if (existing === undefined || SEVERITY_RANK[d.severity] > SEVERITY_RANK[existing]) {
      out.set(line, d.severity);
    }
  }
  return out;
}

function markerFor(severity: Severity): string {
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
