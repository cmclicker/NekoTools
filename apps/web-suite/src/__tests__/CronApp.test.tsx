import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { CronApp } from '../CronApp.js';

const PRO = {
  version: 1 as const,
  licenseId: 'X',
  licensee: 'Buyer',
  tier: 'pro' as const,
  features: ['*'],
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
  signature: 's',
};

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

  it('locks the iCal + timezone-report Pro views when free', () => {
    render(<CronApp initialInput={'*/15 * * * *'} initialUiState={{ viewMode: 'ical' }} />);
    expect(screen.getByTestId('cron-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('cron-output')).not.toBeInTheDocument();
  });

  it('unlocks the iCalendar export via an injected Pro entitlement', () => {
    render(
      <CronApp
        initialInput={'*/15 * * * *'}
        initialUiState={{ viewMode: 'ical' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('cron-output').textContent ?? '';
    expect(out).toContain('BEGIN:VCALENDAR');
    expect(out).toContain('BEGIN:VEVENT');
    expect(out).toContain('DTSTART:');
  });

  it('renders the timezone report when Pro (ICU-stable structure only)', () => {
    render(
      <CronApp
        initialInput={'*/15 * * * *'}
        initialUiState={{ viewMode: 'timezone-report' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('cron-output').textContent ?? '';
    expect(out).toContain('# NekoCron timezone report');
    expect(out).toContain('UTC');
    expect(out).toContain('Asia/Tokyo');
  });
});
