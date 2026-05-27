import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { jsonManifest } from '@nekotools/lens-json';

import { ProSurface } from '../ProSurface.js';

describe('ProSurface', () => {
  it('lists every free entitlement of the tool', () => {
    render(<ProSurface manifest={jsonManifest} />);
    const freeList = screen.getByTestId(`free-list-${jsonManifest.id}`);
    expect(jsonManifest.entitlements.free.length).toBeGreaterThan(0);
    for (const id of jsonManifest.entitlements.free) {
      expect(within(freeList).getByText(id)).toBeInTheDocument();
    }
  });

  it('lists every Pro entitlement with a visible locked "Pro" tag', () => {
    render(<ProSurface manifest={jsonManifest} />);
    const proList = screen.getByTestId(`pro-list-${jsonManifest.id}`);
    expect(jsonManifest.entitlements.pro.length).toBeGreaterThan(0);
    for (const id of jsonManifest.entitlements.pro) {
      expect(within(proList).getByText(id)).toBeInTheDocument();
    }
    // Each Pro row carries a "Pro" tag — count matches the Pro set.
    expect(within(proList).getAllByText('Pro')).toHaveLength(
      jsonManifest.entitlements.pro.length,
    );
  });

  it('states that Pro is not bundled in the local build', () => {
    render(<ProSurface manifest={jsonManifest} />);
    expect(
      screen.getByTestId(`pro-surface-${jsonManifest.id}`).textContent,
    ).toMatch(/not bundled in this local build/i);
  });
});
