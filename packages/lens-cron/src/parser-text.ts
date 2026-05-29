import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { CRON_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import {
  CRON_KIND_PARSED,
  type CronArtifact,
  type CronField,
  type CronKindTag,
  type CronParsedArtifact,
  type ParsedCron,
} from './kinds.js';

const TOOL_ID = 'cron';
const PARSER_ID = 'cron.text';

export interface CronTextParserDeps {
  readonly clock: Clock;
  /** How many upcoming run times to compute. Defaults to 5. */
  readonly nextRunCount?: number;
}

const DEFAULT_NEXT_RUNS = 5;
const MAX_SEARCH_MINUTES = 1_000_000; // ~1.9 years horizon for next-run search

class CronError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

interface FieldSpec {
  readonly name: string;
  readonly min: number;
  readonly max: number;
  readonly names?: Readonly<Record<string, number>>;
  /** day-of-week only: 7 is an alias for 0 (Sunday). */
  readonly wrapSeven?: boolean;
}

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};
const DAYS: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MINUTE: FieldSpec = { name: 'minute', min: 0, max: 59 };
const HOUR: FieldSpec = { name: 'hour', min: 0, max: 23 };
const DOM: FieldSpec = { name: 'day-of-month', min: 1, max: 31 };
const MONTH: FieldSpec = { name: 'month', min: 1, max: 12, names: MONTHS };
const DOW: FieldSpec = { name: 'day-of-week', min: 0, max: 6, names: DAYS, wrapSeven: true };
const SECOND: FieldSpec = { name: 'second', min: 0, max: 59 };

const STANDARD_SPECS = [MINUTE, HOUR, DOM, MONTH, DOW] as const;
const SECONDS_SPECS = [SECOND, MINUTE, HOUR, DOM, MONTH, DOW] as const;

const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

/**
 * The `cron.text` parser. Decodes a single cron expression (5-field
 * standard, 6-field with leading seconds, or an `@macro`) into expanded
 * fields, a human description, and the next run times (UTC). Never throws;
 * malformed input yields diagnostics + a best-effort artifact.
 */
export function createCronTextParser(deps: CronTextParserDeps): Parser<CronArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text'],
    produces: [CRON_KIND_PARSED],
    parse(input: ParserInput): ParserResult<CronArtifact> {
      return parseCron(input, deps);
    },
  };
}

function parseCron(input: ParserInput, deps: CronTextParserDeps): ParserResult<CronArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const producedAt = deps.clock.now();
  const diagnostics: Diagnostic[] = [];
  const count = deps.nextRunCount ?? DEFAULT_NEXT_RUNS;

  const trimmed = input.raw.trim();
  if (trimmed === '') {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', CRON_DIAGNOSTIC_CODES.emptyInput, 'input is empty'),
    );
    return { artifacts: [makeArtifact(artIds(), producedAt, input, invalid(''))], diagnostics };
  }

  const lower = trimmed.toLowerCase();
  if (lower === '@reboot') {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'info',
        CRON_DIAGNOSTIC_CODES.reboot,
        '@reboot runs at startup and has no scheduled clock time',
      ),
    );
    return {
      artifacts: [
        makeArtifact(artIds(), producedAt, input, {
          valid: true,
          expression: '@reboot',
          kind: 'special',
          fields: null,
          description: 'At system startup (reboot)',
          nextRuns: [],
        }),
      ],
      diagnostics,
    };
  }

  const expanded = MACROS[lower] ?? trimmed;
  const tokens = expanded.split(/\s+/);
  const isSeconds = tokens.length === 6;
  const specs = isSeconds ? SECONDS_SPECS : STANDARD_SPECS;
  const kind: CronKindTag = lower in MACROS ? 'standard' : isSeconds ? 'seconds' : 'standard';

  if (tokens.length !== 5 && tokens.length !== 6) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'error',
        CRON_DIAGNOSTIC_CODES.parseError,
        `expected 5 (or 6 with seconds) fields, got ${tokens.length}`,
      ),
    );
    return { artifacts: [makeArtifact(artIds(), producedAt, input, invalid(expanded))], diagnostics };
  }

  const fields: CronField[] = [];
  try {
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i]!;
      const raw = tokens[i]!;
      fields.push({ name: spec.name, raw, values: parseField(raw, spec), min: spec.min, max: spec.max });
    }
  } catch (err) {
    if (err instanceof CronError) {
      diagnostics.push(makeDiagnostic(diagIds(), 'error', err.code, err.message));
    } else {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'error',
          CRON_DIAGNOSTIC_CODES.parseError,
          err instanceof Error ? err.message : String(err),
        ),
      );
    }
    return { artifacts: [makeArtifact(artIds(), producedAt, input, invalid(expanded))], diagnostics };
  }

  const description = describe(fields, isSeconds);
  const nextRuns = computeNextRuns(fields, isSeconds, Date.parse(producedAt), count);

  const value: ParsedCron = {
    valid: true,
    expression: tokens.join(' '),
    kind,
    fields,
    description,
    nextRuns,
  };
  return { artifacts: [makeArtifact(artIds(), producedAt, input, value)], diagnostics };
}

// --- field expansion -------------------------------------------------------

function parseField(raw: string, spec: FieldSpec): readonly number[] {
  if (/[LW#?]/i.test(raw)) {
    throw new CronError(
      `${spec.name}: "${raw}" uses an unsupported extension (L/W/#/?)`,
      CRON_DIAGNOSTIC_CODES.unsupported,
    );
  }
  const out = new Set<number>();
  for (const piece of raw.split(',')) {
    const [rangePart, stepPart] = piece.split('/');
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step <= 0) {
      throw new CronError(`${spec.name}: invalid step in "${piece}"`, CRON_DIAGNOSTIC_CODES.parseError);
    }

    let lo: number;
    let hi: number;
    if (rangePart === '*' || rangePart === undefined || rangePart === '') {
      lo = spec.min;
      hi = spec.max;
    } else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-');
      lo = resolveValue(a ?? '', spec);
      hi = resolveValue(b ?? '', spec);
    } else {
      lo = resolveValue(rangePart, spec);
      hi = stepPart === undefined ? lo : spec.max;
    }

    if (lo < spec.min || hi > spec.max || lo > hi) {
      throw new CronError(
        `${spec.name}: "${piece}" is out of range ${spec.min}-${spec.max}`,
        CRON_DIAGNOSTIC_CODES.outOfRange,
      );
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return [...out].sort((a, b) => a - b);
}

function resolveValue(token: string, spec: FieldSpec): number {
  const t = token.trim();
  if (t === '') throw new CronError(`${spec.name}: empty value`, CRON_DIAGNOSTIC_CODES.parseError);
  if (spec.names && /[A-Za-z]/.test(t)) {
    const mapped = spec.names[t.toUpperCase()];
    if (mapped === undefined) {
      throw new CronError(`${spec.name}: unknown name "${t}"`, CRON_DIAGNOSTIC_CODES.parseError);
    }
    return mapped;
  }
  const n = Number(t);
  if (!Number.isInteger(n)) {
    throw new CronError(`${spec.name}: "${t}" is not an integer`, CRON_DIAGNOSTIC_CODES.parseError);
  }
  if (spec.wrapSeven && n === 7) return 0;
  return n;
}

// --- description -----------------------------------------------------------

function describe(fields: readonly CronField[], isSeconds: boolean): string {
  const off = isSeconds ? 1 : 0;
  const minute = fields[off]!;
  const hour = fields[off + 1]!;
  const dom = fields[off + 2]!;
  const month = fields[off + 3]!;
  const dow = fields[off + 4]!;

  const stepMatch = /^\*\/(\d+)$/.exec(minute.raw);
  const all = (f: CronField): boolean => f.raw === '*';
  const single = (f: CronField): boolean => f.values.length === 1;
  const pad = (n: number): string => String(n).padStart(2, '0');

  let timePhrase: string;
  if (single(minute) && single(hour)) {
    timePhrase = `at ${pad(hour.values[0]!)}:${pad(minute.values[0]!)}`;
  } else if (stepMatch && all(hour)) {
    timePhrase = `every ${stepMatch[1]} minutes`;
  } else if (all(minute) && all(hour)) {
    timePhrase = 'every minute';
  } else if (single(minute) && all(hour)) {
    timePhrase = `at minute ${minute.values[0]} of every hour`;
  } else {
    timePhrase = `at minutes [${minute.values.join(',')}] of hours [${hour.values.join(',')}]`;
  }

  const parts = [timePhrase];
  if (!all(dom)) parts.push(`on day-of-month ${dom.values.join(',')}`);
  if (!all(dow)) parts.push(`on ${dow.values.map((d) => DAY_NAMES[d]).join(',')}`);
  if (!all(month)) parts.push(`in ${month.values.map((m) => MONTH_NAMES[m]).join(',')}`);
  return parts.join(', ');
}

// --- next-run computation (UTC) -------------------------------------------

function computeNextRuns(
  fields: readonly CronField[],
  isSeconds: boolean,
  fromMs: number,
  count: number,
): string[] {
  if (Number.isNaN(fromMs)) return [];
  const off = isSeconds ? 1 : 0;
  const sets = {
    second: isSeconds ? new Set(fields[0]!.values) : null,
    minute: new Set(fields[off]!.values),
    hour: new Set(fields[off + 1]!.values),
    dom: fields[off + 2]!,
    month: new Set(fields[off + 3]!.values),
    dow: fields[off + 4]!,
  };
  const domRestricted = sets.dom.raw !== '*';
  const dowRestricted = sets.dow.raw !== '*';
  const domSet = new Set(sets.dom.values);
  const dowSet = new Set(sets.dow.values);

  const stepMs = isSeconds ? 1000 : 60_000;
  // Start at the next boundary strictly after `from`.
  let t = Math.floor(fromMs / stepMs) * stepMs + stepMs;

  const results: string[] = [];
  for (let i = 0; i < MAX_SEARCH_MINUTES && results.length < count; i++, t += stepMs) {
    const d = new Date(t);
    if (isSeconds && !sets.second!.has(d.getUTCSeconds())) continue;
    if (!sets.minute.has(d.getUTCMinutes())) continue;
    if (!sets.hour.has(d.getUTCHours())) continue;
    if (!sets.month.has(d.getUTCMonth() + 1)) continue;

    const domMatch = domSet.has(d.getUTCDate());
    const dowMatch = dowSet.has(d.getUTCDay());
    const dayOk =
      domRestricted && dowRestricted
        ? domMatch || dowMatch
        : domRestricted
          ? domMatch
          : dowRestricted
            ? dowMatch
            : true;
    if (!dayOk) continue;

    results.push(d.toISOString());
  }
  return results;
}

function invalid(expression: string): ParsedCron {
  return { valid: false, expression, kind: 'standard', fields: null, description: '', nextRuns: [] };
}

function makeArtifact(
  id: string,
  producedAt: string,
  input: ParserInput,
  value: ParsedCron,
): CronParsedArtifact {
  return {
    version: 1,
    kind: CRON_KIND_PARSED,
    id,
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt,
    source: input.source,
    value,
  };
}
