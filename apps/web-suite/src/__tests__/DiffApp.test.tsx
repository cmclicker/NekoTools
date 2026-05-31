import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { DiffApp } from '../DiffApp.js';

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

describe('DiffApp', () => {
  it('renders Left and Right input panes', () => {
    render(<DiffApp initialLeft="a" initialRight="b" />);
    expect(screen.getByTestId('diff-input-left')).toBeInTheDocument();
    expect(screen.getByTestId('diff-input-right')).toBeInTheDocument();
  });

  it('renders a unified hunk list and a changed-count summary for differing text', () => {
    render(<DiffApp initialLeft={'a\nb\nc'} initialRight={'a\nx\nc'} />);
    const output = screen.getByTestId('diff-output');
    const hunks = within(output).getAllByTestId('diff-hunk');
    expect(hunks.some((h) => h.getAttribute('data-kind') === 'add')).toBe(true);
    expect(hunks.some((h) => h.getAttribute('data-kind') === 'remove')).toBe(true);
    expect(screen.getByTestId('diff-summary').textContent).toMatch(/1 added, 1 removed/);
  });

  it('updates the diff when the Right pane is edited', () => {
    render(<DiffApp initialLeft={'a\nb'} initialRight={'a\nb'} />);
    // Identical to start — the identical empty-state is shown, no hunk list.
    expect(screen.getByTestId('diff-no-output').textContent).toMatch(/identical/i);
    fireEvent.change(screen.getByTestId('diff-input-right'), { target: { value: 'a\nZ' } });
    expect(screen.getByTestId('diff-output')).toBeInTheDocument();
  });

  it('treats reordered JSON keys as identical in JSON mode', () => {
    render(
      <DiffApp
        initialLeft={'{"b":2,"a":1}'}
        initialRight={'{"a":1,"b":2}'}
        initialUiState={{ mode: 'json' }}
      />,
    );
    expect(screen.getByTestId('diff-summary').textContent).toMatch(/No differences/i);
    expect(screen.getByTestId('diff-no-output')).toBeInTheDocument();
  });

  it('surfaces a parse_error diagnostic for invalid JSON in JSON mode', () => {
    render(
      <DiffApp initialLeft={'{"a":1}'} initialRight={'nope'} initialUiState={{ mode: 'json' }} />,
    );
    expect(screen.getByText(/diff\.parse_error/)).toBeInTheDocument();
    expect(screen.getByTestId('diff-summary').textContent).toMatch(/Not comparable/i);
  });

  it('shows the empty-side diagnostic when a pane is blank', () => {
    render(<DiffApp initialLeft={'a\nb'} initialRight="" />);
    expect(screen.getByText(/diff\.empty_input/)).toBeInTheDocument();
  });

  it('switches compare mode via the Text / JSON / YAML selector', () => {
    render(
      <DiffApp initialLeft={'{a: 1}'} initialRight={'a: 1'} initialUiState={{ mode: 'text' }} />,
    );
    // Text mode: "{a: 1}" and "a: 1" are different lines.
    expect(screen.getByTestId('diff-output')).toBeInTheDocument();
    // YAML mode: both normalize to the same document, so they are identical.
    fireEvent.click(screen.getByLabelText('YAML'));
    expect(screen.getByTestId('diff-summary').textContent).toMatch(/No differences/i);
  });

  it('copies the unified diff via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <DiffApp
        initialLeft={'a\nb\nc'}
        initialRight={'a\nx\nc'}
        clipboardDeps={{
          apiWrite: async (t) => {
            writes.push(t);
          },
        }}
      />,
    );
    fireEvent.click(screen.getByTestId('diff-copy'));
    await waitFor(() => {
      expect(writes).toHaveLength(1);
    });
    expect(writes[0]).toContain('--- Left');
    expect(writes[0]).toContain('+++ Right');
    expect(writes[0]).toContain('+ x');
    expect(writes[0]).toContain('- b');
  });

  it('still renders the free unified hunk view by default for a free caller', () => {
    render(<DiffApp initialLeft={'a\nb\nc'} initialRight={'a\nx\nc'} />);
    expect(screen.getByTestId('diff-output')).toBeInTheDocument();
    expect(within(screen.getByTestId('diff-output')).getAllByTestId('diff-hunk').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('diff-locked')).not.toBeInTheDocument();
  });

  it('locks the semantic + signed-bundle Pro views when free', () => {
    render(
      <DiffApp
        initialLeft={'a\nb\nc'}
        initialRight={'a\nx\nc'}
        initialUiState={{ viewMode: 'semantic' }}
      />,
    );
    expect(screen.getByTestId('diff-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('diff-output')).not.toBeInTheDocument();
    // No Pro semantic content leaks while locked.
    expect(screen.queryByText(/# NekoDiff semantic diff/)).not.toBeInTheDocument();
    // Switching to the other Pro view stays locked.
    fireEvent.click(screen.getByTestId('diff-view-signed-bundle'));
    expect(screen.getByTestId('diff-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('diff-output')).not.toBeInTheDocument();
  });

  it('unlocks the semantic diff via an injected Pro entitlement', () => {
    render(
      <DiffApp
        initialLeft={'a\nb\nc'}
        initialRight={'a\nx\nc'}
        initialUiState={{ viewMode: 'semantic' }}
        entitlement={PRO}
      />,
    );
    expect(screen.queryByTestId('diff-locked')).not.toBeInTheDocument();
    const out = screen.getByTestId('diff-output').textContent ?? '';
    // Fixed engine header (mode-suffixed) + the fixed section heading.
    expect(out).toContain('# NekoDiff semantic diff (text)');
    expect(out).toContain('## Token-level changes');
  });

  it('unlocks the signed bundle via an injected Pro entitlement (unsigned, stable structure)', () => {
    render(
      <DiffApp
        initialLeft={'a\nb\nc'}
        initialRight={'a\nx\nc'}
        initialUiState={{ viewMode: 'signed-bundle' }}
        entitlement={PRO}
      />,
    );
    expect(screen.queryByTestId('diff-locked')).not.toBeInTheDocument();
    const out = screen.getByTestId('diff-output').textContent ?? '';
    // Stable structural keys of the canonical bundle. The UI never signs, so
    // the bundle is the UNSIGNED signable form: assert the fixed field names
    // and the null signature — never a signature value.
    expect(out).toContain('"tool": "diff"');
    expect(out).toContain('"contentDigest"');
    expect(out).toContain('"signature": null');
  });
});
