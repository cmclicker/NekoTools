import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { LicenseApp } from '../LicenseApp.js';

const MIT = 'MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy...';

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
});
