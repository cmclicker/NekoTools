import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { CronApp } from '../CronApp.js';

describe('CronApp', () => {
  it('describes an expression and lists next runs + fields', () => {
    render(<CronApp initialInput={'*/15 * * * *'} />);
    expect(screen.getByTestId('cron-description').textContent).toContain('every 15 minutes');
    const runs = screen.getByTestId('cron-next-runs');
    expect(within(runs).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(screen.getByTestId('cron-fields')).toBeInTheDocument();
  });

  it('shows the invalid empty-state + diagnostic for a bad expression', () => {
    render(<CronApp initialInput={'* * *'} />);
    expect(screen.getByTestId('cron-no-document')).toBeInTheDocument();
    expect(screen.getByText(/cron\.parse_error/)).toBeInTheDocument();
  });

  it('flags an out-of-range value', () => {
    render(<CronApp initialInput={'99 * * * *'} />);
    expect(screen.getByText(/cron\.out_of_range/)).toBeInTheDocument();
  });

  it('handles @reboot (valid, no scheduled runs)', () => {
    render(<CronApp initialInput={'@reboot'} />);
    expect(screen.getByTestId('cron-no-runs')).toBeInTheDocument();
    expect(screen.getByText(/cron\.reboot/)).toBeInTheDocument();
  });

  it('switches to the JSON view', () => {
    render(<CronApp initialInput={'*/15 * * * *'} initialUiState={{ viewMode: 'json' }} />);
    expect(JSON.parse(screen.getByTestId('cron-output').textContent ?? '{}').expression).toBe(
      '*/15 * * * *',
    );
  });

  it('copies the markdown summary via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <CronApp
        initialInput={'*/15 * * * *'}
        initialUiState={{ viewMode: 'markdown' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('cron-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toContain('# NekoCron export');
  });
});
