import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { LogFilter } from '@nekotools/lens-logs';

import { LogFilterControl, isEmptyFilter } from '../LogFilterControl.js';

describe('LogFilterControl', () => {
  it('builds a minLevel predicate from the level select', () => {
    const onFilterChange = vi.fn();
    render(<LogFilterControl filter={{}} onFilterChange={onFilterChange} />);
    fireEvent.change(screen.getByTestId('log-filter-minlevel'), { target: { value: 'warn' } });
    expect(onFilterChange).toHaveBeenCalledWith({ minLevel: 'warn' });
  });

  it('selecting "(any)" clears the minLevel predicate', () => {
    const onFilterChange = vi.fn();
    render(<LogFilterControl filter={{ minLevel: 'error' }} onFilterChange={onFilterChange} />);
    fireEvent.change(screen.getByTestId('log-filter-minlevel'), { target: { value: '' } });
    expect(onFilterChange).toHaveBeenCalledWith({});
  });

  it('builds a messageContains predicate from the text box', () => {
    const onFilterChange = vi.fn();
    render(<LogFilterControl filter={{}} onFilterChange={onFilterChange} />);
    fireEvent.change(screen.getByTestId('log-filter-message'), { target: { value: 'timeout' } });
    expect(onFilterChange).toHaveBeenCalledWith({ messageContains: 'timeout' });
  });

  it('builds a fieldEquals predicate from key + value, keyed off the key', () => {
    const onFilterChange = vi.fn();
    // Start with a key already present so changing the value yields the full pair.
    render(
      <LogFilterControl
        filter={{ fieldEquals: { key: 'svc', value: '' } }}
        onFilterChange={onFilterChange}
      />,
    );
    fireEvent.change(screen.getByTestId('log-filter-field-value'), { target: { value: 'api' } });
    expect(onFilterChange).toHaveBeenCalledWith({ fieldEquals: { key: 'svc', value: 'api' } });
  });

  it('clearing the field key drops the fieldEquals predicate entirely', () => {
    const onFilterChange = vi.fn();
    render(
      <LogFilterControl
        filter={{ fieldEquals: { key: 'svc', value: 'api' } }}
        onFilterChange={onFilterChange}
      />,
    );
    fireEvent.change(screen.getByTestId('log-filter-field-key'), { target: { value: '' } });
    expect(onFilterChange).toHaveBeenCalledWith({});
  });

  it('builds since / until predicates from the timestamp boxes', () => {
    const onFilterChange = vi.fn();
    render(<LogFilterControl filter={{}} onFilterChange={onFilterChange} />);
    fireEvent.change(screen.getByTestId('log-filter-since'), {
      target: { value: '2026-05-21T10:00:00Z' },
    });
    expect(onFilterChange).toHaveBeenCalledWith({ since: '2026-05-21T10:00:00Z' });
  });

  it('preserves other predicates when one field changes', () => {
    const onFilterChange = vi.fn();
    render(
      <LogFilterControl
        filter={{ minLevel: 'warn', messageContains: 'boom' }}
        onFilterChange={onFilterChange}
      />,
    );
    fireEvent.change(screen.getByTestId('log-filter-message'), { target: { value: 'crash' } });
    expect(onFilterChange).toHaveBeenCalledWith({ minLevel: 'warn', messageContains: 'crash' });
  });

  it('renders the current filter values into the controls (controlled component)', () => {
    render(
      <LogFilterControl
        filter={{ minLevel: 'error', messageContains: 'boom', since: '2026-05-21T10:00:00Z' }}
        onFilterChange={() => {}}
      />,
    );
    expect((screen.getByTestId('log-filter-minlevel') as HTMLSelectElement).value).toBe('error');
    expect((screen.getByTestId('log-filter-message') as HTMLInputElement).value).toBe('boom');
    expect((screen.getByTestId('log-filter-since') as HTMLInputElement).value).toBe(
      '2026-05-21T10:00:00Z',
    );
  });

  it('builds a levelIn predicate from the level checkboxes', () => {
    const onFilterChange = vi.fn();
    render(<LogFilterControl filter={{}} onFilterChange={onFilterChange} />);
    fireEvent.click(screen.getByTestId('log-filter-levelin-error'));
    expect(onFilterChange).toHaveBeenCalledWith({ levelIn: ['error'] });
  });

  it('adds a second selected level in canonical LOG_LEVELS order', () => {
    const onFilterChange = vi.fn();
    render(<LogFilterControl filter={{ levelIn: ['warn'] }} onFilterChange={onFilterChange} />);
    fireEvent.click(screen.getByTestId('log-filter-levelin-error'));
    expect(onFilterChange).toHaveBeenCalledWith({ levelIn: ['warn', 'error'] });
  });

  it('unchecking the last selected level drops the levelIn predicate', () => {
    const onFilterChange = vi.fn();
    render(<LogFilterControl filter={{ levelIn: ['error'] }} onFilterChange={onFilterChange} />);
    fireEvent.click(screen.getByTestId('log-filter-levelin-error'));
    expect(onFilterChange).toHaveBeenCalledWith({});
  });

  it('keeps minLevel and levelIn as independent AND-combined predicates', () => {
    const onFilterChange = vi.fn();
    render(<LogFilterControl filter={{ minLevel: 'warn' }} onFilterChange={onFilterChange} />);
    fireEvent.click(screen.getByTestId('log-filter-levelin-error'));
    expect(onFilterChange).toHaveBeenCalledWith({ minLevel: 'warn', levelIn: ['error'] });
  });

  it('reflects the current levelIn selection into the checkboxes (controlled)', () => {
    render(<LogFilterControl filter={{ levelIn: ['error', 'fatal'] }} onFilterChange={() => {}} />);
    expect((screen.getByTestId('log-filter-levelin-error') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('log-filter-levelin-fatal') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('log-filter-levelin-info') as HTMLInputElement).checked).toBe(false);
  });
});

describe('isEmptyFilter', () => {
  it('is true for an empty object', () => {
    expect(isEmptyFilter({})).toBe(true);
  });

  it('is false when any predicate is set', () => {
    const cases: LogFilter[] = [
      { minLevel: 'info' },
      { messageContains: 'x' },
      { fieldEquals: { key: 'a', value: 'b' } },
      { since: '2026-05-21T10:00:00Z' },
      { until: '2026-05-21T10:00:00Z' },
      { levelIn: ['error'] },
    ];
    for (const c of cases) expect(isEmptyFilter(c)).toBe(false);
  });
});
