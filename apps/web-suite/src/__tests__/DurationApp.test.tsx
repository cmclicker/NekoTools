import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { DurationApp } from '../DurationApp.js';

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

describe('DurationApp', () => {
  it('renders the per-entry table with seconds + ISO', () => {
    render(<DurationApp initialInput={'PT1H30M'} />);
    expect(screen.getByTestId('duration-stat-count').textContent).toBe('1');
    expect(screen.getByTestId('duration-seconds-0').textContent).toBe('5400');
    expect(screen.getByTestId('duration-iso-0').textContent).toBe('PT1H30M');
  });

  it('normalizes humanized + seconds inputs', () => {
    render(<DurationApp initialInput={'90 min\n3600'} />);
    expect(screen.getByTestId('duration-iso-0').textContent).toBe('PT1H30M');
    expect(screen.getByTestId('duration-iso-1').textContent).toBe('PT1H');
  });

  it('marks an invalid duration + emits a diagnostic', () => {
    render(<DurationApp initialInput={'hello world'} />);
    expect(screen.getByTestId('duration-iso-0').textContent).toBe('(invalid)');
    expect(screen.getByText(/duration\.parse_error/)).toBeInTheDocument();
  });

  it('flags years/months as approximate', () => {
    render(<DurationApp initialInput={'P1Y'} />);
    expect(screen.getByText(/duration\.approximate/)).toBeInTheDocument();
  });

  it('shows the empty-state for whitespace-only input', () => {
    render(<DurationApp initialInput={'   '} />);
    expect(screen.getByTestId('duration-no-document')).toBeInTheDocument();
    expect(screen.getByText(/duration\.empty_input/)).toBeInTheDocument();
  });

  it('converts to an ISO list', () => {
    render(<DurationApp initialInput={'90m\n3600'} initialUiState={{ viewMode: 'normalized' }} />);
    expect(screen.getByTestId('duration-output').textContent).toBe('PT1H30M\nPT1H');
  });

  it('locks the breakdown CSV Pro view when free', () => {
    render(<DurationApp initialInput={'PT1H30M'} initialUiState={{ viewMode: 'breakdown' }} />);
    expect(screen.getByTestId('duration-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('duration-output')).not.toBeInTheDocument();
  });

  it('unlocks the breakdown CSV via an injected Pro entitlement', () => {
    render(
      <DurationApp
        initialInput={'PT1H30M'}
        initialUiState={{ viewMode: 'breakdown' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('duration-output').textContent ?? '';
    expect(out.split('\n')[0]).toBe('input,totalSeconds,days,hours,minutes,seconds,iso,approximate');
    expect(out).toContain('PT1H30M,5400,0,1,30,0,');
  });

  it('copies the JSON view via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <DurationApp
        initialInput={'PT1H'}
        initialUiState={{ viewMode: 'json' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('duration-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(JSON.parse(writes[0] ?? '{}').entries[0].value.totalSeconds).toBe(3600);
  });
});
