import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { LicenseApp } from '../LicenseApp.js';

const MIT = 'MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy...';
const GPL3 = 'GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007';

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

describe('LicenseApp', () => {
  it('detects MIT and shows its category', () => {
    render(<LicenseApp initialInput={MIT} />);
    expect(screen.getByTestId('license-stat-id').textContent).toBe('MIT');
    expect(screen.getByTestId('license-category').textContent).toBe('permissive');
  });

  it('shows the unknown empty-state for unrecognized text', () => {
    render(<LicenseApp initialInput={'just some random words here'} />);
    expect(screen.getByTestId('license-no-document')).toBeInTheDocument();
    expect(screen.getByText(/license\.unknown/)).toBeInTheDocument();
  });

  it('honors an SPDX tag', () => {
    render(<LicenseApp initialInput={'SPDX-License-Identifier: Apache-2.0'} />);
    expect(screen.getByTestId('license-stat-id').textContent).toBe('Apache-2.0');
  });

  it('shows the empty-state for whitespace-only input', () => {
    render(<LicenseApp initialInput={'   '} />);
    expect(screen.getByText(/license\.empty_input/)).toBeInTheDocument();
  });

  it('copies the JSON view via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <LicenseApp
        initialInput={MIT}
        initialUiState={{ viewMode: 'json' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('license-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(JSON.parse(writes[0] ?? '{}').primary).toBe('MIT');
  });

  it('locks the compatibility + NOTICE Pro views when free', () => {
    render(<LicenseApp initialInput={MIT} initialUiState={{ viewMode: 'compatibility' }} />);
    expect(screen.getByTestId('license-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('license-output')).not.toBeInTheDocument();
  });

  it('unlocks the compatibility matrix via an injected Pro entitlement', () => {
    render(
      <LicenseApp initialInput={GPL3} initialUiState={{ viewMode: 'compatibility' }} entitlement={PRO} />,
    );
    const out = screen.getByTestId('license-output').textContent ?? '';
    expect(out).toContain('# NekoLicense compatibility matrix');
    expect(out).toContain('GPL-3.0');
  });

  it('renders the NOTICE entry in the NOTICE view when Pro', () => {
    render(<LicenseApp initialInput={MIT} initialUiState={{ viewMode: 'notice' }} entitlement={PRO} />);
    const out = screen.getByTestId('license-output').textContent ?? '';
    expect(out).toContain('# NOTICE');
    expect(out).toContain('MIT');
  });
});
