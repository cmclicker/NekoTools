import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import {
  LOG_KIND_DOCUMENT,
  LOG_KIND_FILTER_RESULT,
  LOG_KIND_HISTOGRAM,
  LOG_KIND_SUMMARY,
} from './kinds.js';

/**
 * The NekoLogs manifest.
 *
 * Reading model (same as NekoJSON / NekoEnv):
 *   - `entitlements.free` is current-build truth. As of Phase 2.x.2
 *     the NekoLogs free tier is closed: the engine entitlements
 *     (Phase 2.x.1) and the UI entitlements (view.table, view.text,
 *     view.summary, search, filter.ui, copy.line, copy.message —
 *     Phase 2.x.2, implemented in `apps/web-suite`) are all present
 *     and implementation-backed.
 *   - `entitlements.pro` is honest advertising; no Pro implementation
 *     is linked in the free build.
 *   - `capabilities.*` is current-build truth. `canDiff` is false —
 *     semantic log diff is Pro and there is no free diff in this tool.
 *     `canProjectGraph` is false — the trace projector is Pro.
 *   - `parsers` / `exporters` / `graphProjectors` may list Pro intent
 *     ids; the runtime only validates that every *registered*
 *     implementation is declared, not the reverse.
 *
 * The two parsers are `log.text` (which emits log.document +
 * log.summary + log.histogram in one run) and `log.filter` (which
 * emits log.filter-result). There is no separate aggregator stage.
 */
export const logsManifest: ToolManifest = {
  version: 1,
  id: 'logs',
  name: 'NekoLogs',
  toolVersion: 1,
  summary:
    'Parse, filter, summarize, and export local log snapshots. Phase 2 reuse-gate tool.',
  artifactKinds: [
    LOG_KIND_DOCUMENT,
    LOG_KIND_FILTER_RESULT,
    LOG_KIND_SUMMARY,
    LOG_KIND_HISTOGRAM,
  ],
  parsers: ['log.text', 'log.filter'],
  exporters: [
    'log.export.text.plain',
    'log.export.plaintext.messages',
    'log.export.json.entries',
    'log.export.csv.entries',
    'log.export.markdown.summary',
    'log.export.report.incident',
    'log.export.histogram.svg',
    'log.export.patterns.clusters',
  ],
  graphProjectors: ['log.graph.trace'],
  offlinePolicy: DEFAULT_OFFLINE_POLICY,
  capabilities: {
    canSaveWorkspace: true,
    canExport: true,
    canDiff: false,
    canProjectGraph: false,
  },
  entitlements: {
    // NekoLogs free tier — closed at Phase 2.x.2. Engine entitlements
    // (Phase 2.x.1) plus the UI entitlements (Phase 2.x.2, backed by
    // `apps/web-suite`), per the open-core governance rule.
    free: [
      'parse',
      'validate',
      'filter',
      'summary.basic',
      'histogram.basic',
      'export.text.plain',
      'export.plaintext.messages',
      'export.json.entries',
      'export.csv.entries',
      'export.markdown.summary',
      'workspace.save',
      // Phase 2.x.2 UI — implemented in apps/web-suite (LogsApp +
      // LogTableView / LogTextView / LogSummaryView / LogFilterControl).
      'view.table',
      'view.text',
      'view.summary',
      'search',
      'filter.ui',
      'copy.line',
      'copy.message',
    ],
    pro: [
      'anomaly.detect',
      'pattern.cluster',
      'histogram.advanced',
      'graph.trace',
      'report.incident',
      'diff.semantic',
      'query.saved',
    ],
  },
  outOfScope: [
    'live tailing or following a file/directory',
    'remote log ingestion or shipping (syslog, HTTP collector, agents)',
    'executing a programmable query language (Lucene, LogQL, SQL, KQL)',
    'acting as a durable log storage backend',
    'fetching anything referenced inside a log line',
    'streaming gigantic logs beyond the local soft threshold',
  ],
};
