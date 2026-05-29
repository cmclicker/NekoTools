import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { TimeApp } from '../TimeApp.js';

describe('TimeApp', () => {
  it('renders the ISO UTC + Unix conversions for a Unix-seconds input', () => {
    render(<TimeApp initialInput="1700000000" />);
    expect(screen.getByTestId('time-iso').textContent).toBe('2023-11-14T22:13:20.000Z');
    expect(screen.getByTestId('time-epoch-seconds').textContent).toBe('1700000000');
    expect(screen.getByTestId('time-epoch-millis').textContent).toBe('1700000000000');
    expect(screen.getByTestId('time-interpretation').textContent).toBe('unix-seconds');
  });

  it('renders local-time + relative-age fields', () => {
    render(<TimeApp initialInput="2023-11-14T22:13:20.000Z" />);
    expect(screen.getByTestId('time-local').textContent).toMatch(/UTC[+-]\d{2}:\d{2}/);
    expect(screen.getByTestId('time-relative')).toBeInTheDocument();
  });

  it('shows the empty-state and an error diagnostic for invalid input', () => {
    render(<TimeApp initialInput="not a date" />);
    expect(screen.getByTestId('time-no-instant')).toBeInTheDocument();
    expect(screen.getByText(/time\.invalid_input/)).toBeInTheDocument();
  });

  it('surfaces the seconds/ms heuristic diagnostic for a bare number', () => {
    render(<TimeApp initialInput="1700000000" />);
    expect(screen.getByText(/time\.unit_heuristic/)).toBeInTheDocument();
  });

  it('copies the JSON summary via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <TimeApp
        initialInput="1700000000"
        clipboardDeps={{
          apiWrite: async (t) => {
            writes.push(t);
          },
        }}
      />,
    );
    fireEvent.click(screen.getByTestId('time-copy-json'));
    await waitFor(() => {
      expect(writes).toHaveLength(1);
    });
    expect(JSON.parse(writes[0]!).iso).toBe('2023-11-14T22:13:20.000Z');
    expect(screen.getByTestId('time-copy-status')).toHaveAttribute('data-method', 'clipboard-api');
  });

  it('the "Now" button replaces the input with the current Unix milliseconds', () => {
    render(<TimeApp initialInput="1700000000" />);
    const input = screen.getByTestId('time-input') as HTMLInputElement;
    fireEvent.click(screen.getByTestId('time-now'));
    expect(input.value).toMatch(/^\d{13}$/);
    expect(screen.getByTestId('time-interpretation').textContent).toBe('unix-milliseconds');
  });
});
