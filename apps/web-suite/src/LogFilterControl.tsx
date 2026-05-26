import { type ChangeEvent } from 'react';

import { LOG_LEVELS, type LogFilter, type LogLevel } from '@nekotools/lens-logs';

interface LogFilterControlProps {
  readonly filter: LogFilter;
  readonly onFilterChange: (filter: LogFilter) => void;
}

/**
 * Structured-filter control for NekoLogs. Renders one input per
 * supported `LogFilter` predicate — minLevel (select), messageContains
 * (text), fieldEquals key + value (text), since / until (text) — and
 * builds a plain `LogFilter` object that it hands back via
 * `onFilterChange`. The active filter is owned by `LogsApp`; this is a
 * controlled component (the visible values are derived from the
 * `filter` prop).
 *
 * It is **not** a query DSL. There is no parser here — the object is
 * passed straight through to the engine's `log.filter` parser, which
 * validates it and fails closed on a bad value (an unknown level or an
 * unparseable timestamp surfaces as a `log.filter.invalid` diagnostic,
 * not an exception). Empty inputs are simply omitted from the object,
 * so an all-empty control yields `{}` (match-all). The timestamp boxes
 * pass the raw string through unparsed on purpose: typing a partial
 * timestamp produces an invalid-filter diagnostic the user can see and
 * correct, rather than being silently swallowed.
 */
export function LogFilterControl({
  filter,
  onFilterChange,
}: LogFilterControlProps): JSX.Element {
  // Build the next filter from the current one plus a single changed
  // field. An empty string means "predicate not set" → drop the key so
  // the object stays a clean match-all when every input is blank.
  function patch(next: Partial<Record<keyof LogFilter, unknown>>): void {
    const merged: { -readonly [K in keyof LogFilter]?: LogFilter[K] } = { ...filter };
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) {
        delete merged[key as keyof LogFilter];
      } else {
        // The component only ever sets well-typed values per field;
        // the engine re-validates regardless.
        (merged as Record<string, unknown>)[key] = value;
      }
    }
    onFilterChange(merged as LogFilter);
  }

  function onMinLevel(e: ChangeEvent<HTMLSelectElement>): void {
    const v = e.target.value;
    patch({ minLevel: v === '' ? undefined : (v as LogLevel) });
  }

  function onMessageContains(e: ChangeEvent<HTMLInputElement>): void {
    const v = e.target.value;
    patch({ messageContains: v === '' ? undefined : v });
  }

  function onFieldKey(e: ChangeEvent<HTMLInputElement>): void {
    updateFieldEquals(e.target.value, filter.fieldEquals?.value ?? '');
  }

  function onFieldValue(e: ChangeEvent<HTMLInputElement>): void {
    updateFieldEquals(filter.fieldEquals?.key ?? '', e.target.value);
  }

  function updateFieldEquals(key: string, value: string): void {
    // fieldEquals is only meaningful with a key. With no key, drop it
    // entirely so a stray value cannot produce a half-built predicate.
    if (key === '') {
      patch({ fieldEquals: undefined });
    } else {
      patch({ fieldEquals: { key, value } });
    }
  }

  function onSince(e: ChangeEvent<HTMLInputElement>): void {
    const v = e.target.value;
    patch({ since: v === '' ? undefined : v });
  }

  function onUntil(e: ChangeEvent<HTMLInputElement>): void {
    const v = e.target.value;
    patch({ until: v === '' ? undefined : v });
  }

  return (
    <fieldset className="log-filter" data-testid="log-filter">
      <legend className="log-filter__legend">Structured filter</legend>

      <label className="log-filter__field">
        <span>Min level</span>
        <select
          value={filter.minLevel ?? ''}
          onChange={onMinLevel}
          data-testid="log-filter-minlevel"
        >
          <option value="">(any)</option>
          {LOG_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </label>

      <label className="log-filter__field">
        <span>Message contains</span>
        <input
          type="text"
          value={filter.messageContains ?? ''}
          onChange={onMessageContains}
          placeholder="substring…"
          data-testid="log-filter-message"
        />
      </label>

      <label className="log-filter__field">
        <span>Field key</span>
        <input
          type="text"
          value={filter.fieldEquals?.key ?? ''}
          onChange={onFieldKey}
          placeholder="e.g. svc"
          data-testid="log-filter-field-key"
        />
      </label>

      <label className="log-filter__field">
        <span>Field value</span>
        <input
          type="text"
          value={filter.fieldEquals?.value ?? ''}
          onChange={onFieldValue}
          placeholder="e.g. api"
          data-testid="log-filter-field-value"
        />
      </label>

      <label className="log-filter__field">
        <span>Since</span>
        <input
          type="text"
          value={filter.since ?? ''}
          onChange={onSince}
          placeholder="ISO timestamp"
          data-testid="log-filter-since"
        />
      </label>

      <label className="log-filter__field">
        <span>Until</span>
        <input
          type="text"
          value={filter.until ?? ''}
          onChange={onUntil}
          placeholder="ISO timestamp"
          data-testid="log-filter-until"
        />
      </label>
    </fieldset>
  );
}

/** True when no predicate is set — used by callers to decide whether to run the engine filter at all. */
export function isEmptyFilter(filter: LogFilter): boolean {
  return (
    filter.minLevel === undefined &&
    filter.levelIn === undefined &&
    filter.messageContains === undefined &&
    filter.fieldEquals === undefined &&
    filter.since === undefined &&
    filter.until === undefined
  );
}
