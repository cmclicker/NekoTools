import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { DurationApp } from '../DurationApp.js';

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
