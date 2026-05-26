import {
  LOG_LEVELS,
  type LevelCounts,
  type LogHistogram,
  type LogSummary,
} from '@nekotools/lens-logs';

interface LogSummaryViewProps {
  readonly summary: LogSummary;
  readonly histogram: LogHistogram;
}

/**
 * Summary view for a `log.summary` + `log.histogram`. Renders the
 * aggregate stats (total, per-level counts, parsed time range,
 * unparseable count, top normalized messages) and a BASIC histogram:
 * one CSS bar per time bucket, each bar split into per-level segments,
 * plus a tally of untimed entries.
 *
 * No charting library — hand-drawn CSS bars sized by share of the
 * busiest bucket. Adaptive bucketing, zoom, and anomaly overlay are
 * Pro (`histogram.advanced`); this is the free fixed-bucket view.
 */

/** Levels rendered in summary/histogram, in canonical severity order + the catch-alls. */
const DISPLAY_LEVELS = [...LOG_LEVELS, 'unknown', 'none'] as const;

function totalOf(counts: LevelCounts): number {
  let sum = 0;
  for (const v of Object.values(counts)) sum += v;
  return sum;
}

function formatTime(ms: number | null): string {
  if (ms === null) return '—';
  return new Date(ms).toISOString();
}

export function LogSummaryView({ summary, histogram }: LogSummaryViewProps): JSX.Element {
  const maxBucketTotal = histogram.buckets.reduce(
    (max, b) => Math.max(max, totalOf(b.counts)),
    0,
  );

  return (
    <div className="log-summary" role="region" aria-label="NekoLogs summary view">
      <dl className="log-summary__stats">
        <div className="log-summary__stat">
          <dt>Total entries</dt>
          <dd data-testid="log-summary-total">{summary.total}</dd>
        </div>
        <div className="log-summary__stat">
          <dt>Unparseable</dt>
          <dd data-testid="log-summary-unparseable">{summary.unparseableCount}</dd>
        </div>
        <div className="log-summary__stat">
          <dt>Time range</dt>
          <dd data-testid="log-summary-timerange">
            {summary.timeRange.startMs === null && summary.timeRange.endMs === null ? (
              'no timestamps'
            ) : (
              <>
                <code>{formatTime(summary.timeRange.startMs)}</code>
                {' → '}
                <code>{formatTime(summary.timeRange.endMs)}</code>
              </>
            )}
          </dd>
        </div>
      </dl>

      <h4 className="log-summary__heading">Counts by level</h4>
      <ul className="log-summary__levels" data-testid="log-summary-levels">
        {DISPLAY_LEVELS.map((level) => {
          const count = summary.byLevel[level] ?? 0;
          return (
            <li
              key={level}
              className={`log-summary__level log-level--${level}`}
              data-level={level}
              data-count={count}
            >
              <span className="log-summary__level-name">{level}</span>
              <span className="log-summary__level-count">{count}</span>
            </li>
          );
        })}
      </ul>

      <h4 className="log-summary__heading">Top messages</h4>
      {summary.topMessages.length === 0 ? (
        <p className="log-summary__empty" data-testid="log-summary-no-messages">
          No messages to rank.
        </p>
      ) : (
        <ol className="log-summary__top" data-testid="log-summary-top-messages">
          {summary.topMessages.map((m, idx) => (
            <li key={`${m.message}__${idx}`} className="log-summary__top-item">
              <span className="log-summary__top-count">{m.count}×</span>
              <code className="log-summary__top-message">{m.message}</code>
            </li>
          ))}
        </ol>
      )}

      <h4 className="log-summary__heading">Histogram (level × time)</h4>
      {histogram.buckets.length === 0 ? (
        <p className="log-summary__empty" data-testid="log-histogram-empty">
          No timestamped entries to bucket.
        </p>
      ) : (
        <div className="log-histogram" data-testid="log-histogram" role="img" aria-label="Level by time histogram">
          {histogram.buckets.map((bucket) => {
            const bucketTotal = totalOf(bucket.counts);
            const heightPct = maxBucketTotal === 0 ? 0 : (bucketTotal / maxBucketTotal) * 100;
            return (
              <div
                key={bucket.index}
                className="log-histogram__bucket"
                data-testid="log-histogram-bucket"
                data-index={bucket.index}
                data-total={bucketTotal}
                title={`bucket ${bucket.index}: ${bucketTotal} entr${bucketTotal === 1 ? 'y' : 'ies'}`}
              >
                <div className="log-histogram__bar" style={{ height: `${heightPct}%` }}>
                  {DISPLAY_LEVELS.map((level) => {
                    const c = bucket.counts[level] ?? 0;
                    if (c === 0) return null;
                    const segPct = bucketTotal === 0 ? 0 : (c / bucketTotal) * 100;
                    return (
                      <div
                        key={level}
                        className={`log-histogram__segment log-level--${level}`}
                        style={{ height: `${segPct}%` }}
                        data-level={level}
                        data-count={c}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="log-histogram__untimed" data-testid="log-histogram-untimed">
        Untimed entries: {totalOf(histogram.untimed)}
      </p>
    </div>
  );
}
