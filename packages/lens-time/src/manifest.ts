import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { TIME_KIND_INSTANT } from './kinds.js';

/**
 * The NekoTime manifest.
 *
 * Reading model (same as the other lenses):
 *   - `entitlements.free` lists features THIS build ships with a working
 *     implementation. Because NekoTime lands as a single vertical slice
 *     (engine + web-suite UI in the same PR), the UI entitlements
 *     (`view.summary`, `copy.value`) are included here — they are
 *     implementation-backed in `apps/web-suite` in the same commit, per
 *     the open-core rule that a free entitlement must ship with its
 *     implementation.
 *   - `entitlements.pro` lists the gated capabilities. The two declared
 *     Pro exporters (`batch.convert` -> `time.export.batch.csv`,
 *     `timezone.board` -> `time.export.timezone.board`) ARE bundled in this
 *     build and registered as `proExporters`; `runExporter` enforces the
 *     entitlement at call time (single-build-gated model). The remaining Pro
 *     entitlements stay advertising-only -- they depend on future engines.
 *   - `exporters` lists every exporter id, free and Pro alike (the registry
 *     validates only the forward direction: every registered impl must be
 *     declared).
 *
 * NekoTime is dependency-free: it uses only the built-in `Date` and `Intl`
 * APIs, so there is no date/time library in `package.json`.
 */
export const timeManifest: ToolManifest = {
  version: 1,
  id: 'time',
  name: 'NekoTime',
  toolVersion: 1,
  summary:
    'Convert and inspect timestamps locally — Unix seconds/ms, ISO-8601, and dates to ISO UTC, local time, relative age, and timezone offset. Dependency-free (built-in Date + Intl).',
  artifactKinds: [TIME_KIND_INSTANT],
  parsers: ['time.parse'],
  exporters: [
    'time.export.json',
    'time.export.iso',
    'time.export.markdown.summary',
    // Pro — declared as advertising, NOT registered in the free build.
    'time.export.batch.csv',
    'time.export.timezone.board',
  ],
  graphProjectors: [],
  offlinePolicy: DEFAULT_OFFLINE_POLICY,
  capabilities: {
    canSaveWorkspace: true,
    canExport: true,
    canDiff: false,
    canProjectGraph: false,
  },
  entitlements: {
    free: [
      // Engine MVP.
      'parse',
      'convert.units',
      'inspect.offset',
      'relative.age',
      'export.json',
      'export.markdown.summary',
      'workspace.save',
      // UI (shipped in apps/web-suite as TimeApp in this same PR).
      'view.summary',
      'copy.value',
    ],
    pro: [
      'batch.convert',
      'recipe.saved',
      'timezone.board',
      'release.planner',
      'schedule.analyzer',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'business-day, working-hours, or holiday calendars',
    'recurring-event (RRULE / iCal) expansion',
    'full cron-expression parsing or evaluation',
    'timezone data beyond what the host Intl runtime provides',
    'durable storage, scheduling, reminders, or alerts',
  ],
};
