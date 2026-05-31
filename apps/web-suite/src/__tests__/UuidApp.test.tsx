import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { UuidApp } from '../UuidApp.js';

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

  it('locks the namespace-report + bulk-csv Pro views when free', () => {
    render(
      <UuidApp
        initialInput={'017F22E2-79B0-7CC3-98C4-DC0C0C07398F'}
        initialUiState={{ viewMode: 'namespace-report' }}
      />,
    );
    expect(screen.getByTestId('uuid-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('uuid-output')).not.toBeInTheDocument();
  });

  it('unlocks the namespace report via an injected Pro entitlement', () => {
    render(
      <UuidApp
        initialInput={'017F22E2-79B0-7CC3-98C4-DC0C0C07398F'}
        initialUiState={{ viewMode: 'namespace-report' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('uuid-output').textContent ?? '';
    expect(out).toContain('# NekoUUID namespace report');
    expect(out).toContain('2022-02-22T19:22:22.000Z');
  });

  it('renders the bulk CSV grid in the bulk-csv view when Pro', () => {
    render(
      <UuidApp
        initialInput={'017F22E2-79B0-7CC3-98C4-DC0C0C07398F'}
        initialUiState={{ viewMode: 'bulk-csv' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('uuid-output').textContent ?? '';
    expect(out).toContain('input,valid,version,variant,normalized,timestamp,isNil,isMax');
    expect(out).toContain('017f22e2-79b0-7cc3-98c4-dc0c0c07398f');
  });
});
