import type { Diagnostic } from '@nekotools/contracts';

interface DiagnosticsProps {
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Shared diagnostic-list component. Renders nothing when the list is
 * empty so the panel doesn't show an awkward header for a clean parse.
 *
 * Severity ordering matches `sortDiagnostics` from `@nekotools/tool-runtime`:
 * error > warning > info > hint. The component does not sort — that's
 * the caller's job. The component renders in the order it's given.
 */
export function Diagnostics({ diagnostics }: DiagnosticsProps): JSX.Element | null {
  if (diagnostics.length === 0) return null;
  return (
    <section aria-label="Diagnostics" className="diagnostics">
      <h3 className="diagnostics__heading">Diagnostics</h3>
      <ul className="diagnostics__list">
        {diagnostics.map((d) => (
          <li
            key={d.id}
            className={`diagnostics__item diagnostics__item--${d.severity}`}
            data-severity={d.severity}
            data-code={d.code}
          >
            <span className="diagnostics__severity">{d.severity.toUpperCase()}</span>
            <code className="diagnostics__code">{d.code}</code>
            <span className="diagnostics__message">{d.message}</span>
            {d.span ? (
              <span className="diagnostics__location">
                at line {d.span.startLine ?? '?'}, col {d.span.startColumn ?? '?'}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
