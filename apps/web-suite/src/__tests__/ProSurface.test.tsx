import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { jsonManifest } from '@nekotools/lens-json';

import { ProSurface } from '../ProSurface.js';

describe('ProSurface', () => {
  it('lists every feature (free + Pro) in one merged list', () => {
    render(<ProSurface manifest={jsonManifest} />);
    const list = screen.getByTestId(`features-list-${jsonManifest.id}`);
    expect(jsonManifest.entitlements.free.length).toBeGreaterThan(0);
    for (const id of [...jsonManifest.entitlements.free, ...jsonManifest.entitlements.pro]) {
      expect(within(list).getByText(id)).toBeInTheDocument();
    }
  });

  it('color-codes Pro features with a "Pro" tag — one per Pro entitlement', () => {
    render(<ProSurface manifest={jsonManifest} />);
    const list = screen.getByTestId(`features-list-${jsonManifest.id}`);
    expect(jsonManifest.entitlements.pro.length).toBeGreaterThan(0);
    expect(within(list).getAllByText('Pro')).toHaveLength(jsonManifest.entitlements.pro.length);
  });

  it('shows Pro as locked and explains local-only unlock when free', () => {
    render(<ProSurface manifest={jsonManifest} />);
    const surface = screen.getByTestId(`pro-surface-${jsonManifest.id}`);
    expect(within(surface).getByTestId(`pro-status-${jsonManifest.id}`).textContent).toMatch(
      /Pro locked/i,
    );
    expect(surface.textContent).toMatch(/verified locally/i);
    expect(surface.textContent).toMatch(/no telemetry/i);
  });
});
