import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { jsonManifest } from '@nekotools/lens-json';
import { diffManifest } from '@nekotools/lens-diff';

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

  it('renders NekoDiff Pro-locked diff features as visible-but-locked (not implemented here)', () => {
    render(<ProSurface manifest={diffManifest} />);
    const proList = screen.getByTestId(`pro-list-${diffManifest.id}`);
    expect(diffManifest.entitlements.pro.length).toBeGreaterThan(0);
    for (const id of diffManifest.entitlements.pro) {
      expect(within(proList).getByText(id)).toBeInTheDocument();
    }
    // Each Pro diff feature carries a locked "Pro" tag.
    expect(within(proList).getAllByText('Pro')).toHaveLength(
      diffManifest.entitlements.pro.length,
    );
    // The implemented free diff modes are listed separately.
    const freeList = screen.getByTestId(`free-list-${diffManifest.id}`);
    expect(within(freeList).getByText('diff.text')).toBeInTheDocument();
    expect(within(freeList).getByText('diff.yaml')).toBeInTheDocument();
  });
});
