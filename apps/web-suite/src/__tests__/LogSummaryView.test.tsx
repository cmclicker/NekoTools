import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { LogHistogram, LogSummary } from '@nekotools/lens-logs';

import { LogSummaryView } from '../LogSummaryView.js';

const startMs = Date.parse('2026-05-21T10:00:00.000Z');
const endMs = Date.parse('2026-05-21T11:00:00.000Z');

const summary: LogSummary = {
  documentArtifactId: 'art_doc',
  total: 5,
  byLevel: { none: 1, unknown: 0, trace: 0, debug: 0, info: 2, warn: 1, error: 1, fatal: 0 },
  timeRange: { startMs, endMs },
  unparseableCount: 1,
  topMessages: [
    { message: 'request completed', count: 3 },
    { message: 'cache miss for user #', count: 2 },
  ],
};

const histogram: LogHistogram = {
  documentArtifactId: 'art_doc',
  bucketCount: 2,
  bucketWidthMs: 1_800_000,
  startMs,
  levels: ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'unknown', 'none'],
  buckets: [
    {
      index: 0,
      startMs,
      counts: { none: 0, unknown: 0, trace: 0, debug: 0, info: 2, warn: 1, error: 0, fatal: 0 },
    },
    {
      index: 1,
      startMs: startMs + 1_800_000,
      counts: { none: 0, unknown: 0, trace: 0, debug: 0, info: 0, warn: 0, error: 1, fatal: 0 },
    },
  ],
  untimed: { none: 1, unknown: 0, trace: 0, debug: 0, info: 0, warn: 0, error: 0, fatal: 0 },
};

describe('LogSummaryView', () => {
  it('renders the total, unparseable count, and time range', () => {
    render(<LogSummaryView summary={summary} histogram={histogram} />);
    expect(screen.getByTestId('log-summary-total').textContent).toBe('5');
    expect(screen.getByTestId('log-summary-unparseable').textContent).toBe('1');
    const range = screen.getByTestId('log-summary-timerange').textContent ?? '';
    expect(range).toContain('2026-05-21T10:00:00.000Z');
    expect(range).toContain('2026-05-21T11:00:00.000Z');
  });

  it('renders per-level counts including info=2, warn=1, error=1', () => {
    render(<LogSummaryView summary={summary} histogram={histogram} />);
    const levels = screen.getByTestId('log-summary-levels');
    const infoItem = within(levels).getByText('info').closest('li')!;
    expect(infoItem).toHaveAttribute('data-count', '2');
    const warnItem = within(levels).getByText('warn').closest('li')!;
    expect(warnItem).toHaveAttribute('data-count', '1');
    const errorItem = within(levels).getByText('error').closest('li')!;
    expect(errorItem).toHaveAttribute('data-count', '1');
  });

  it('renders the top messages with their counts', () => {
    render(<LogSummaryView summary={summary} histogram={histogram} />);
    const top = screen.getByTestId('log-summary-top-messages');
    expect(top.textContent).toContain('request completed');
    expect(top.textContent).toContain('3×');
    expect(top.textContent).toContain('cache miss for user #');
  });

  it('renders one histogram bucket bar per bucket with level segments', () => {
    render(<LogSummaryView summary={summary} histogram={histogram} />);
    const buckets = screen.getAllByTestId('log-histogram-bucket');
    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toHaveAttribute('data-total', '3');
    expect(buckets[1]).toHaveAttribute('data-total', '1');
    // The busiest bucket must carry both info and warn segments.
    expect(buckets[0]!.querySelector('.log-level--info')).not.toBeNull();
    expect(buckets[0]!.querySelector('.log-level--warn')).not.toBeNull();
  });

  it('reports the untimed tally', () => {
    render(<LogSummaryView summary={summary} histogram={histogram} />);
    expect(screen.getByTestId('log-histogram-untimed').textContent).toContain('1');
  });

  it('shows the empty histogram hint when no buckets exist', () => {
    const emptyHist: LogHistogram = {
      documentArtifactId: 'art_doc',
      bucketCount: 0,
      bucketWidthMs: null,
      startMs: null,
      levels: histogram.levels,
      buckets: [],
      untimed: { none: 2, unknown: 0, trace: 0, debug: 0, info: 0, warn: 0, error: 0, fatal: 0 },
    };
    render(<LogSummaryView summary={summary} histogram={emptyHist} />);
    expect(screen.getByTestId('log-histogram-empty')).toBeInTheDocument();
    expect(screen.getByTestId('log-histogram-untimed').textContent).toContain('2');
  });
});
