import { LineCounter, parseAllDocuments, stringify, visit } from 'yaml';

/**
 * The YAML dependency boundary.
 *
 * `yaml` (eemeli/yaml) is imported **only** in this module. Every other
 * file in lens-yaml consumes the plain, JSON-safe shapes defined here, so
 * the engine's artifact model never leaks the library's AST/CST types and
 * the dependency can be swapped without touching the rest of the package.
 * (`conformance.test.ts` asserts this isolation mechanically.)
 *
 * The library is pure-JS and makes no network calls, consistent with the
 * offline doctrine; offline-guard sees no violation.
 */

export interface AdapterPosition {
  /** 0-indexed character offset into the source. */
  readonly offset: number;
  /** 1-indexed line. */
  readonly line: number;
  /** 1-indexed column. */
  readonly column: number;
}

export interface AdapterIssue {
  readonly severity: 'error' | 'warning';
  /** The `yaml` library's own code (e.g. `TAB_AS_INDENT`, `DUPLICATE_KEY`),
   * or a synthetic code for issues raised outside `doc.errors`
   * (`UNRESOLVED_ALIAS`, `TO_JS_ERROR`). Mapped to `yaml.*` diagnostic
   * codes by the parser. */
  readonly code: string;
  readonly message: string;
  readonly position: AdapterPosition;
}

export interface AdapterDocument {
  /** JSON-safe projection of one YAML document (see `toJsonSafe`). */
  readonly data: unknown;
  readonly errors: readonly AdapterIssue[];
  readonly warnings: readonly AdapterIssue[];
  readonly hasAnchors: boolean;
  readonly hasAliases: boolean;
  readonly anchorNames: readonly string[];
}

export interface AdapterParse {
  readonly documents: readonly AdapterDocument[];
}

/**
 * Parse YAML source into plain, JSON-safe per-document data plus issues.
 * Never throws — a `toJS()` failure (unresolved alias, excessive alias
 * expansion) is captured as an `AdapterIssue`.
 */
export function parseYaml(source: string): AdapterParse {
  const lineCounter = new LineCounter();
  const docs = parseAllDocuments(source, { lineCounter, prettyErrors: false });

  const documents: AdapterDocument[] = docs.map((doc) => {
    const errors: AdapterIssue[] = doc.errors.map((e) =>
      toIssue('error', e.code ?? 'UNKNOWN', e.message, e.pos, lineCounter),
    );
    const warnings: AdapterIssue[] = doc.warnings.map((w) =>
      toIssue('warning', w.code ?? 'UNKNOWN', w.message, w.pos, lineCounter),
    );

    let hasAliases = false;
    const anchorNames = new Set<string>();
    visit(doc, {
      Alias() {
        hasAliases = true;
      },
      Node(_key, node) {
        const anchor = (node as { anchor?: string }).anchor;
        if (typeof anchor === 'string' && anchor.length > 0) anchorNames.add(anchor);
      },
    });

    let data: unknown = null;
    try {
      data = toJsonSafe(doc.toJS({ maxAliasCount: 100 }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = /unresolved alias/i.test(message) ? 'UNRESOLVED_ALIAS' : 'TO_JS_ERROR';
      errors.push({
        severity: 'error',
        code,
        message,
        position: { offset: 0, line: 1, column: 1 },
      });
      data = null;
    }

    return {
      data,
      errors,
      warnings,
      hasAnchors: anchorNames.size > 0,
      hasAliases,
      anchorNames: [...anchorNames],
    };
  });

  return { documents };
}

/** Render a JS value as canonical YAML (used for normalize + JSON->YAML). */
export function toYamlString(value: unknown): string {
  return stringify(value);
}

function toIssue(
  severity: 'error' | 'warning',
  code: string,
  message: string,
  pos: readonly [number, number] | undefined,
  lineCounter: LineCounter,
): AdapterIssue {
  const offset = pos ? pos[0] : 0;
  const lc = lineCounter.linePos(offset);
  return { severity, code, message, position: { offset, line: lc.line, column: lc.col } };
}

/**
 * Coerce a parsed YAML value into a JSON-safe structure so the artifact
 * round-trips through the JSON workspace serializer. Handles the value
 * types `yaml.toJS()` can produce that JSON cannot represent: bigint
 * (-> string), non-finite numbers (-> null), Date (-> ISO string),
 * undefined/function/symbol (-> null), and self-referential structures
 * created by recursive aliases (-> "[Circular]").
 */
export function toJsonSafe(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null) return null;
  const t = typeof value;
  if (t === 'bigint') return (value as bigint).toString();
  if (t === 'number') return Number.isFinite(value as number) ? (value as number) : null;
  if (t === 'string' || t === 'boolean') return value;
  if (t === 'undefined' || t === 'function' || t === 'symbol') return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const out = value.map((v) => toJsonSafe(v, seen));
    seen.delete(value);
    return out;
  }
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) return '[Circular]';
    seen.add(obj);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = toJsonSafe(v, seen);
    seen.delete(obj);
    return out;
  }
  return null;
}
