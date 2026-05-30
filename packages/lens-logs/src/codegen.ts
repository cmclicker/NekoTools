import {
  LOG_LEVELS,
  type LogEntry,
  type LogHistogram,
  type LogSummary,
} from './kinds.js';

/**
 * NekoLogs Pro generators. Back the three declared Pro exporters
 * `log.export.report.incident` (pro `report.incident`),
 * `log.export.histogram.svg` (pro `histogram.advanced`), and
 * `log.export.patterns.clusters` (pro `pattern.cluster`).
 *
 * All three are pure, deterministic functions of artifacts the FREE
 * `log.text` run already produces (`log.summary`, `log.histogram`, and the
 * entry list on `log.document` / `log.filter-result`) — no network, no clock,
 * no premium analytics engine. They are honest structural derivations:
 *   - the incident report summarizes existing counts + error/fatal entries
 *     (it does NOT do statistical anomaly detection — that stays Pro/future);
 *   - the histogram SVG renders the existing (level × time-bucket) matrix;
 *   - the clusterer groups messages by a normalized template (digits / hex /
 *     uuids / quoted runs collapsed to placeholders) — deterministic
 *     templating, not ML clustering.
 */

// --- report.incident -------------------------------------------------------

function isoOrNull(ms: number | null): string {
  return ms === null ? '—' : new Date(ms).toISOString();
}

/**
 * `log.export.report.incident` — a markdown incident report built from the
 * summary plus the error/fatal entries. Severity counts, time span,
 * unparseable count, the most severe entries, and the top recurring
 * messages. Structural — not anomaly detection.
 */
export function toIncidentReport(summary: LogSummary, entries: readonly LogEntry[]): string {
  const errorCount = (summary.byLevel['error'] ?? 0) + (summary.byLevel['fatal'] ?? 0);
  const warnCount = summary.byLevel['warn'] ?? 0;
  const severity = (summary.byLevel['fatal'] ?? 0) > 0
    ? 'CRITICAL'
    : (summary.byLevel['error'] ?? 0) > 0
      ? 'HIGH'
      : warnCount > 0
        ? 'ELEVATED'
        : 'NOMINAL';

  const out: string[] = ['# NekoLogs incident report', ''];
  out.push(
    `- severity: ${severity}`,
    `- total entries: ${summary.total}`,
    `- errors + fatals: ${errorCount}`,
    `- warnings: ${warnCount}`,
    `- time span: ${isoOrNull(summary.timeRange.startMs)} → ${isoOrNull(summary.timeRange.endMs)}`,
  );
  if (summary.unparseableCount > 0) out.push(`- unparseable lines: ${summary.unparseableCount}`);
  out.push('');

  out.push('## Counts by level', '');
  for (const level of LOG_LEVELS) {
    const n = summary.byLevel[level] ?? 0;
    if (n > 0) out.push(`- ${level}: ${n}`);
  }
  out.push('');

  // Most severe entries (fatal then error), in document order, capped.
  const severe = entries
    .filter((e) => e.level === 'error' || e.level === 'fatal')
    .slice(0, 20);
  if (severe.length > 0) {
    out.push('## Error & fatal entries', '');
    for (const e of severe) {
      const ts = e.timestamp ? `${e.timestamp} ` : '';
      out.push(`- \`${(e.level ?? '').toUpperCase()}\` ${ts}— ${e.message}`);
    }
    out.push('');
  }

  if (summary.topMessages.length > 0) {
    out.push('## Top recurring messages', '');
    for (const m of summary.topMessages) out.push(`- ${m.count}× ${m.message}`);
    out.push('');
  }

  return out.join('\n');
}

// --- histogram.svg ---------------------------------------------------------

/** Per-level bar colors (severity-themed). */
const LEVEL_COLOR: Record<string, string> = {
  trace: '#9ca3af',
  debug: '#60a5fa',
  info: '#34d399',
  warn: '#fbbf24',
  error: '#f87171',
  fatal: '#dc2626',
  unknown: '#d1d5db',
  none: '#e5e7eb',
};

function svgEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * `log.export.histogram.svg` — a stacked-bar SVG of the (level × time-bucket)
 * histogram the free run already computed. Pure markup: deterministic
 * geometry, no fonts beyond the generic family, no network. One stacked bar
 * per time bucket; a trailing bar for untimed entries when present.
 */
export function toHistogramSvg(hist: LogHistogram): string {
  const width = 720;
  const height = 240;
  const padLeft = 40;
  const padBottom = 24;
  const padTop = 16;
  const plotH = height - padBottom - padTop;
  const levels = LOG_LEVELS.filter((l) => hist.levels.includes(l));
  const drawLevels = levels.length > 0 ? levels : [...hist.levels];

  // Build the bar set: each timed bucket, then an untimed bucket if non-empty.
  const untimedTotal = Object.values(hist.untimed).reduce((a, b) => a + b, 0);
  const bars = hist.buckets.map((b) => ({ counts: b.counts, label: String(b.index) }));
  if (untimedTotal > 0) bars.push({ counts: hist.untimed, label: 'untimed' });

  const totalOf = (counts: Record<string, number>): number =>
    Object.values(counts).reduce((a, b) => a + b, 0);
  const maxTotal = Math.max(1, ...bars.map((b) => totalOf(b.counts)));
  const barCount = Math.max(1, bars.length);
  const slot = (width - padLeft) / barCount;
  const barW = Math.max(1, slot * 0.8);

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif" font-size="10">`,
    `<!-- NekoLogs histogram: ${bars.length} bucket(s), levels ${drawLevels.join('/')} -->`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`,
    `<line x1="${padLeft}" y1="${height - padBottom}" x2="${width}" y2="${height - padBottom}" stroke="#9ca3af"/>`,
    `<text x="4" y="${padTop + 8}">${maxTotal}</text>`,
  ];

  bars.forEach((bar, i) => {
    const x = padLeft + i * slot + (slot - barW) / 2;
    let yTop = height - padBottom;
    for (const level of drawLevels) {
      const c = bar.counts[level] ?? 0;
      if (c === 0) continue;
      const h = (c / maxTotal) * plotH;
      yTop -= h;
      const color = LEVEL_COLOR[level] ?? '#9ca3af';
      parts.push(
        `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}"><title>${svgEscape(level)}: ${c}</title></rect>`,
      );
    }
  });

  // Legend.
  let lx = padLeft;
  const ly = height - 6;
  for (const level of drawLevels) {
    const color = LEVEL_COLOR[level] ?? '#9ca3af';
    parts.push(`<rect x="${lx}" y="${ly - 8}" width="8" height="8" fill="${color}"/>`);
    parts.push(`<text x="${lx + 11}" y="${ly}">${svgEscape(level)}</text>`);
    lx += 22 + level.length * 6;
  }

  parts.push('</svg>');
  return parts.join('\n');
}

// --- patterns.clusters -----------------------------------------------------

export interface MessageCluster {
  readonly template: string;
  readonly count: number;
  readonly example: string;
}

/**
 * Normalize a log message to a template by collapsing variable runs to
 * placeholders: UUIDs, hex blobs, numbers, quoted strings, and bracketed
 * runs. Deterministic — the basis for grouping near-identical messages.
 */
export function templatize(message: string): string {
  return message
    .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, '<uuid>')
    .replace(/0x[0-9a-fA-F]+/g, '<hex>')
    .replace(/\b[0-9a-fA-F]{16,}\b/g, '<hex>')
    .replace(/"[^"]*"/g, '"<str>"')
    .replace(/'[^']*'/g, "'<str>'")
    .replace(/\b\d+(?:\.\d+)?\b/g, '<num>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * `log.export.patterns.clusters` — group the entries' messages by normalized
 * template and rank by frequency. Deterministic templating (digits / hex /
 * uuids / quoted runs → placeholders), not ML clustering. Returns markdown.
 */
export function toPatternClusters(entries: readonly LogEntry[]): string {
  const byTemplate = new Map<string, { count: number; example: string }>();
  const order: string[] = [];
  for (const e of entries) {
    const t = templatize(e.message);
    let bucket = byTemplate.get(t);
    if (bucket === undefined) {
      bucket = { count: 0, example: e.message };
      byTemplate.set(t, bucket);
      order.push(t);
    }
    bucket.count += 1;
  }

  const clusters: MessageCluster[] = order.map((t) => ({
    template: t,
    count: byTemplate.get(t)!.count,
    example: byTemplate.get(t)!.example,
  }));
  // Rank by count desc, stable on first-seen order for ties.
  clusters.sort((a, b) => b.count - a.count);

  const out: string[] = ['# NekoLogs message clusters', ''];
  out.push(`- entries: ${entries.length}`, `- distinct patterns: ${clusters.length}`, '');
  if (clusters.length === 0) {
    out.push('(no messages)');
    return out.join('\n');
  }
  out.push('| count | template | example |', '| --- | --- | --- |');
  for (const c of clusters) {
    const esc = (s: string): string => s.replace(/\|/g, '\\|');
    out.push(`| ${c.count} | \`${esc(c.template)}\` | ${esc(c.example)} |`);
  }
  out.push('');
  return out.join('\n');
}
