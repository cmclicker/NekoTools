import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { UuidApp } from '../UuidApp.js';

describe('UuidApp', () => {
  it('renders a per-id table with kind / version / timestamp', () => {
    render(<UuidApp initialInput={'017F22E2-79B0-7CC3-98C4-DC0C0C07398F'} />);
    expect(screen.getByTestId('uuid-stat-count').textContent).toBe('1');
    expect(screen.getByTestId('uuid-kind-0').textContent).toBe('uuid');
    expect(screen.getByTestId('uuid-version-0').textContent).toBe('v7');
    expect(screen.getByTestId('uuid-ts-0').textContent).toBe('2022-02-22T19:22:22.000Z');
  });

  it('labels the nil UUID and a ULID', () => {
    render(<UuidApp initialInput={'00000000-0000-0000-0000-000000000000\n01ARZ3NDEKTSV4RRFFQ69G5FAV'} />);
    expect(screen.getByTestId('uuid-version-0').textContent).toBe('nil');
    expect(screen.getByTestId('uuid-kind-1').textContent).toBe('ulid');
  });

  it('shows a parse_error diagnostic for an invalid line', () => {
    render(<UuidApp initialInput={'not-a-uuid'} />);
    expect(screen.getByText(/uuid\.parse_error/)).toBeInTheDocument();
  });

  it('shows the empty-state for whitespace-only input', () => {
    render(<UuidApp initialInput={'   '} />);
    expect(screen.getByTestId('uuid-no-document')).toBeInTheDocument();
    expect(screen.getByText(/uuid\.empty_input/)).toBeInTheDocument();
  });

  it('switches to the normalized view', () => {
    render(
      <UuidApp
        initialInput={'550E8400-E29B-41D4-A716-446655440000'}
        initialUiState={{ viewMode: 'normalized' }}
      />,
    );
    expect(screen.getByTestId('uuid-output').textContent).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('copies the JSON view via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <UuidApp
        initialInput={'017F22E2-79B0-7CC3-98C4-DC0C0C07398F'}
        initialUiState={{ viewMode: 'json' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('uuid-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(JSON.parse(writes[0] ?? '{}').ids[0].version).toBe(7);
  });
});
