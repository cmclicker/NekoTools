import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { JsonApp } from '../JsonApp.js';

// The exact Pro entitlement literal used across the suite's tab tests
// (HexApp.test.tsx). `features: ['*']` unlocks every Pro exporter.
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

const DOC = '{"a":1}';

describe('JsonApp — Pro code-gen views', () => {
  it('locks the TypeScript / Zod / data-dictionary views when free', () => {
    render(<JsonApp initialInput={DOC} initialUiState={{ viewMode: 'typescript' }} />);
    expect(screen.getByTestId('json-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('json-pro-output')).not.toBeInTheDocument();
    // The generated type must NOT leak in the locked state.
    expect(screen.queryByText(/export type Root/)).not.toBeInTheDocument();
  });

  it('generates a TypeScript type under an injected Pro entitlement', () => {
    render(
      <JsonApp
        initialInput={DOC}
        initialUiState={{ viewMode: 'typescript' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('json-pro-output').textContent ?? '';
    expect(out).toContain('export type Root =');
    expect(out).toContain('a: number;');
    expect(screen.queryByTestId('json-locked')).not.toBeInTheDocument();
  });

  it('generates a Zod schema in the Zod view when Pro', () => {
    render(
      <JsonApp initialInput={DOC} initialUiState={{ viewMode: 'zod' }} entitlement={PRO} />,
    );
    expect(screen.getByTestId('json-pro-output').textContent ?? '').toContain(
      'export const rootSchema = z.object(',
    );
  });

  it('generates a data dictionary in the data-dictionary view when Pro', () => {
    render(
      <JsonApp
        initialInput={DOC}
        initialUiState={{ viewMode: 'data-dictionary' }}
        entitlement={PRO}
      />,
    );
    expect(screen.getByTestId('json-pro-output').textContent ?? '').toContain(
      '| path | type | sample |',
    );
  });

  it('switches to a Pro view via the radio and stays locked when free', () => {
    render(<JsonApp initialInput={DOC} />);
    // Default tree view: no lock yet.
    expect(screen.queryByTestId('json-locked')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('json-view-zod'));
    expect(screen.getByTestId('json-locked')).toBeInTheDocument();
  });
});
