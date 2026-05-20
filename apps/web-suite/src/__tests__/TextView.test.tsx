import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Diagnostic } from '@nekotools/contracts';
import { TextView, groupSeverityByLine } from '../TextView.js';

const diagOn = (line: number, severity: Diagnostic['severity']): Diagnostic => ({
  version: 1,
  id: `d_${line}_${severity}`,
  severity,
  code: 'json.test',
  message: `${severity} on line ${line}`,
  span: { startOffset: 0, endOffset: 1, startLine: line, startColumn: 1, endLine: line, endColumn: 2 },
});

describe('groupSeverityByLine', () => {
  it('returns an empty map for no diagnostics', () => {
    expect(groupSeverityByLine([])).toEqual(new Map());
  });

  it('picks the highest severity per line', () => {
    const m = groupSeverityByLine([
      diagOn(1, 'info'),
      diagOn(1, 'warning'),
      diagOn(2, 'hint'),
    ]);
    expect(m.get(1)).toBe('warning');
    expect(m.get(2)).toBe('hint');
  });

  it('skips diagnostics that carry no span', () => {
    const noSpan: Diagnostic = {
      version: 1,
      id: 'd_x',
      severity: 'error',
      code: 'json.test',
      message: 'no span',
    };
    expect(groupSeverityByLine([noSpan])).toEqual(new Map());
  });
});

describe('TextView', () => {
  it('renders each input line with a 1-indexed gutter number', () => {
    render(<TextView text={'{\n  "a": 1\n}'} diagnostics={[]} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('paints the gutter for a line that carries a diagnostic', () => {
    render(
      <TextView
        text={'{\n  "a": 1\n}'}
        diagnostics={[diagOn(2, 'warning')]}
      />,
    );
    // The line element data-attributes encode severity for CSS;
    // we assert via that contract.
    const items = document.querySelectorAll('[data-line]');
    const line2 = Array.from(items).find((el) => el.getAttribute('data-line') === '2');
    expect(line2).toBeTruthy();
    expect(line2!.getAttribute('data-severity')).toBe('warning');
  });

  it('handles empty input by rendering one blank line', () => {
    render(<TextView text="" diagnostics={[]} />);
    expect(document.querySelectorAll('[data-line]').length).toBe(1);
  });
});
