import {
  LOG_LEVELS,
  type LevelCounts,
  type LogDocument,
  type LogEntry,
  type LogHistogram,
  type LogHistogramBucket,
  type LogSummary,
} from './kinds.js';

/**
 * Pure aggregation functions over a parsed `log.document`. Both
 * `computeSummary` and `computeHistogram` are deterministic functions
 * of the document, so the derived `log.summary` / `log.histogram`
 * artifacts the `log.text` run emits cannot drift from the document
 * they describe (charter §1).
 */

const DEFAULT_TOP_MESSAGES = 5;
const DEFAULT_BUCKET_COUNT = 10;

function emptyLevelCounts(): Record<string, number> {
  const counts: Record<string, number> = { none: 0, unknown: 0 };
  for (const l of LOG_LEVELS) counts[l] = 0;
  return counts;
}

function levelKey(entry: LogEntry): string {
  return entry.level ?? 'none';
}

export function computeSummary(
  documentArtifactId: string,
  doc: LogDocument,
  topN: number = DEFAULT_TOP_MESSAGES,
): LogSummary {
  const byLevel = emptyLevelCounts();
  let unparseableCount = 0;
  let startMs: number | null = null;
  let endMs: number | null = null;
  const messageCounts = new Map<string, number>();

  for (const e of doc.entries) {
    byLevel[levelKey(e)] = (byLevel[levelKey(e)] ?? 0) + 1;
    if (e.format === 'plain' && e.level === undefined && e.timestamp === undefined) {
      unparseableCount += 1;
    }
    if (typeof e.timestampMs === 'number') {
      startMs = startMs === null ? e.timestampMs : Math.min(startMs, e.timestampMs);
      endMs = endMs === null ? e.timestampMs : Math.max(endMs, e.timestampMs);
    }
    const norm = normalizeMessage(e.message);
    if (norm !== '') messageCounts.set(norm, (messageCounts.get(norm) ?? 0) + 1);
  }

  const topMessages = [...messageCounts.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, topN)
    .map(([message, count]) => ({ message, count }));

  return {
    documentArtifactId,
    total: doc.entries.length,
    byLevel,
    timeRange: { startMs, endMs },
    unparseableCount,
    topMessages,
  };
}

/**
 * Collapse a message to a frequency key: trim, lowercase, and replace
 * long digit runs with `#` so "request 4821 done" and "request 9999
 * done" cluster together. Deliberately simple — advanced templating is
 * the Pro `pattern.cluster` feature.
 */
export function normalizeMessage(message: string): string {
  return message.trim().toLowerCase().replace(/\d+/g, '#');
}

export function computeHistogram(
  documentArtifactId: string,
  doc: LogDocument,
  bucketCount: number = DEFAULT_BUCKET_COUNT,
): LogHistogram {
  const levels = [...LOG_LEVELS, 'unknown', 'none'];
  const untimed = emptyLevelCounts();

  const timed = doc.entries.filter(
    (e): e is LogEntry & { timestampMs: number } => typeof e.timestampMs === 'number',
  );
  for (const e of doc.entries) {
    if (typeof e.timestampMs !== 'number') {
      untimed[levelKey(e)] = (untimed[levelKey(e)] ?? 0) + 1;
    }
  }

  if (timed.length === 0) {
    return {
      documentArtifactId,
      bucketCount: 0,
      bucketWidthMs: null,
      startMs: null,
      levels,
      buckets: [],
      untimed,
    };
  }

  let min = timed[0]!.timestampMs;
  let max = timed[0]!.timestampMs;
  for (const e of timed) {
    if (e.timestampMs < min) min = e.timestampMs;
    if (e.timestampMs > max) max = e.timestampMs;
  }

  const span = max - min;
  // Degenerate span (all timestamps equal): a single bucket.
  const effectiveBuckets = span === 0 ? 1 : bucketCount;
  const width = span === 0 ? 1 : Math.ceil(span / bucketCount);

  const buckets: LogHistogramBucket[] = [];
  const counts: Record<string, number>[] = [];
  for (let i = 0; i < effectiveBuckets; i += 1) {
    counts.push(emptyLevelCounts());
  }

  for (const e of timed) {
    let idx = span === 0 ? 0 : Math.floor((e.timestampMs - min) / width);
    if (idx >= effectiveBuckets) idx = effectiveBuckets - 1; // clamp the max edge
    const bucket = counts[idx]!;
    bucket[levelKey(e)] = (bucket[levelKey(e)] ?? 0) + 1;
  }

  for (let i = 0; i < effectiveBuckets; i += 1) {
    buckets.push({ index: i, startMs: min + i * width, counts: counts[i] as LevelCounts });
  }

  return {
    documentArtifactId,
    bucketCount: effectiveBuckets,
    bucketWidthMs: width,
    startMs: min,
    levels,
    buckets,
    untimed,
  };
}
