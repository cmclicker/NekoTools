import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { SemverApp } from '../SemverApp.js';

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

describe('SemverApp', () => {
  it('renders a versions table and marks satisfies against the range', () => {
    render(
      <SemverApp initialInput={'1.2.0\n2.0.0'} initialUiState={{ range: '^1.0.0' }} />,
    );
    expect(screen.getByTestId('semver-stat-count').textContent).toBe('2');
    expect(screen.getByTestId('semver-satisfies-0').textContent).toBe('yes');
    expect(screen.getByTestId('semver-satisfies-1').textContent).toBe('no');
  });

  it('switches to the sorted view (ascending precedence)', () => {
    render(
      <SemverApp
        initialInput={'2.0.0\n1.0.0\n1.0.0-rc.1'}
        initialUiState={{ range: '', viewMode: 'sorted' }}
      />,
    );
    expect(screen.getByTestId('semver-output').textContent).toBe('1.0.0-rc.1\n1.0.0\n2.0.0');
  });

  it('updates satisfies when the range field changes', () => {
    render(<SemverApp initialInput={'2.5.0'} initialUiState={{ range: '^1.0.0' }} />);
    expect(screen.getByTestId('semver-satisfies-0').textContent).toBe('no');
    fireEvent.change(screen.getByTestId('semver-range'), { target: { value: '^2.0.0' } });
    expect(screen.getByTestId('semver-satisfies-0').textContent).toBe('yes');
  });

  it('shows a parse_error diagnostic for an invalid version', () => {
    render(<SemverApp initialInput={'1.2'} initialUiState={{ range: '' }} />);
    expect(screen.getByText(/semver\.parse_error/)).toBeInTheDocument();
  });

  it('shows the empty-state for whitespace-only input', () => {
    render(<SemverApp initialInput={'   '} initialUiState={{ range: '' }} />);
    expect(screen.getByTestId('semver-no-document')).toBeInTheDocument();
    expect(screen.getByText(/semver\.empty_input/)).toBeInTheDocument();
  });

  it('copies the JSON view via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <SemverApp
        initialInput={'1.2.3'}
        initialUiState={{ range: '', viewMode: 'json' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('semver-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(JSON.parse(writes[0] ?? '{}').versions[0].version).toBe('1.2.3');
  });

  it('renders without a range column when no range is set', () => {
    render(<SemverApp initialInput={'1.2.3'} initialUiState={{ range: '' }} />);
    const table = screen.getByTestId('semver-table');
    expect(within(table).queryByText('satisfies')).not.toBeInTheDocument();
  });

  it('locks the range-report + bump-plan Pro views when free', () => {
    render(
      <SemverApp
        initialInput={'1.2.0\n2.0.0'}
        initialUiState={{ range: '^1.0.0', viewMode: 'range-report' }}
      />,
    );
    expect(screen.getByTestId('semver-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('semver-output')).not.toBeInTheDocument();
  });

  it('unlocks the range report via an injected Pro entitlement', () => {
    render(
      <SemverApp
        initialInput={'1.2.0\n2.0.0'}
        initialUiState={{ range: '^1.0.0', viewMode: 'range-report' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('semver-output').textContent ?? '';
    expect(out).toContain('# NekoSemver range report');
    expect(out).toContain('range: `^1.0.0`');
  });

  it('renders the bump plan in the bump-plan view when Pro', () => {
    render(
      <SemverApp
        initialInput={'1.2.0\n2.0.0'}
        initialUiState={{ range: '^1.0.0', viewMode: 'bump-plan' }}
        entitlement={PRO}
      />,
    );
    expect(screen.getByTestId('semver-output').textContent ?? '').toContain('# NekoSemver bump plan');
  });
});
