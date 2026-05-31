import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { EnvApp } from '../EnvApp.js';

const SIMPLE_INPUT = 'A=1\nB=two\nDEBUG=true\n';

// Real newlines (single-quoted, not a JSX attribute literal) so the parser
// sees two entries — mirrors the engine conformance test's input shape.
const PRO_INPUT = 'PORT=8080\nDEBUG=true\n';

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

describe('EnvApp integration', () => {
  it('parses the initial input and shows the table view by default', () => {
    render(<EnvApp initialInput={SIMPLE_INPUT} />);
    const region = screen.getByRole('region', { name: /NekoEnv table view/i });
    expect(region).toBeInTheDocument();
    expect(within(region).getByText('A')).toBeInTheDocument();
    expect(within(region).getByText('B')).toBeInTheDocument();
    expect(within(region).getByText('DEBUG')).toBeInTheDocument();
  });

  it('shows env diagnostics surfaced by the parser', () => {
    render(<EnvApp initialInput={'A=1\nA=2\n'} />);
    expect(screen.getByText(/env\.duplicate_key/)).toBeInTheDocument();
  });

  it('switches to the text view', () => {
    render(<EnvApp initialInput={SIMPLE_INPUT} />);
    fireEvent.click(screen.getByLabelText(/^Text$/));
    expect(screen.getByLabelText(/NekoEnv text view/i)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /NekoEnv table view/i })).not.toBeInTheDocument();
  });

  it('switches to the diff view and reveals the compare-against textarea', () => {
    render(<EnvApp initialInput={SIMPLE_INPUT} initialCompareInput="A=1\nB=other\n" />);
    expect(screen.queryByTestId('env-compare-input')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/^Diff$/));
    expect(screen.getByTestId('env-compare-input')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /NekoEnv diff view/i })).toBeInTheDocument();
  });

  it('diff view renders add/remove hunks when the two docs differ', () => {
    render(
      <EnvApp
        initialInput="A=1\nB=two\n"
        initialCompareInput="A=2\nB=two\n"
        initialUiState={{ viewMode: 'diff' }}
      />,
    );
    const hunks = screen.getAllByTestId('env-diff-hunk');
    expect(hunks.some((h) => h.getAttribute('data-kind') === 'add')).toBe(true);
    expect(hunks.some((h) => h.getAttribute('data-kind') === 'remove')).toBe(true);
  });

  it('search filters table rows by key/value substring', () => {
    render(<EnvApp initialInput={SIMPLE_INPUT} />);
    fireEvent.change(screen.getByTestId('env-search-input'), { target: { value: 'DEBUG' } });
    const rows = screen.getAllByTestId('env-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('DEBUG');
  });

  it('clicking a table row sets the active key + enables copy buttons', () => {
    render(<EnvApp initialInput={SIMPLE_INPUT} />);
    expect(screen.getByTestId('env-copy-key')).toBeDisabled();
    expect(screen.getByTestId('env-copy-value')).toBeDisabled();
    fireEvent.click(screen.getByText('DEBUG').closest('tr')!);
    expect(screen.getByTestId('env-copy-key')).not.toBeDisabled();
    expect(screen.getByTestId('env-copy-value')).not.toBeDisabled();
    expect(screen.getByTestId('env-active-key').textContent).toContain('DEBUG');
  });

  it('copy key writes the active key via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <EnvApp
        initialInput={SIMPLE_INPUT}
        initialUiState={{ activeKey: 'DEBUG' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('env-copy-key'));
    await waitFor(() => expect(writes).toEqual(['DEBUG']));
    const status = await screen.findByTestId('env-copy-status');
    expect(status).toHaveAttribute('data-kind', 'key');
  });

  it('copy value writes the entry value via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <EnvApp
        initialInput={SIMPLE_INPUT}
        initialUiState={{ activeKey: 'B' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('env-copy-value'));
    await waitFor(() => expect(writes).toEqual(['two']));
  });

  it('copy value uses last-occurrence-wins when the active key is duplicated', async () => {
    const writes: string[] = [];
    render(
      <EnvApp
        initialInput={'A=first\nA=last\n'}
        initialUiState={{ activeKey: 'A' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('env-copy-value'));
    await waitFor(() => expect(writes).toEqual(['last']));
  });

  it('copy value falls back to execCommand when the clipboard API rejects', async () => {
    const apiWrite = vi.fn(async () => {
      throw new Error('permission denied');
    });
    const fallbackWrite = vi.fn(() => true);
    render(
      <EnvApp
        initialInput={SIMPLE_INPUT}
        initialUiState={{ activeKey: 'DEBUG' }}
        clipboardDeps={{ apiWrite, fallbackWrite }}
      />,
    );
    fireEvent.click(screen.getByTestId('env-copy-value'));
    const status = await screen.findByTestId('env-copy-status');
    expect(status).toHaveAttribute('data-method', 'execCommand');
    expect(fallbackWrite).toHaveBeenCalledWith('true');
  });

  it('mask toggle hides values in the table but does NOT change what copy.value writes', async () => {
    // Critical safety property: masking is a *view* preference. If we
    // ever let it leak into the copy path, the user would unknowingly
    // paste the dot string instead of their secret.
    const writes: string[] = [];
    render(
      <EnvApp
        initialInput={SIMPLE_INPUT}
        initialUiState={{ activeKey: 'DEBUG', maskValues: true }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    // Visually masked — scope to the table region so we don't match
    // the active-key display, which also renders "DEBUG".
    const table = screen.getByRole('region', { name: /NekoEnv table view/i });
    const debugRow = within(table).getByText('DEBUG').closest('tr')!;
    const cell = within(debugRow).getByTestId('env-row-value');
    expect(cell.textContent).toBe('••••••••');
    // But the copy writes the real value.
    fireEvent.click(screen.getByTestId('env-copy-value'));
    await waitFor(() => expect(writes).toEqual(['true']));
  });

  it('honors initialUiState.viewMode "diff" on first render', () => {
    render(
      <EnvApp
        initialInput={SIMPLE_INPUT}
        initialCompareInput="A=1\n"
        initialUiState={{ viewMode: 'diff' }}
      />,
    );
    expect(screen.getByRole('region', { name: /NekoEnv diff view/i })).toBeInTheDocument();
    expect(screen.getByTestId('env-compare-input')).toBeInTheDocument();
  });

  it('locks the Pro codegen views when free', () => {
    render(
      <EnvApp initialInput={SIMPLE_INPUT} initialUiState={{ viewMode: 'types-ts' }} />,
    );
    expect(screen.getByTestId('env-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('env-output')).not.toBeInTheDocument();
  });

  it('unlocks the TypeScript ProcessEnv view via an injected Pro entitlement', () => {
    render(
      <EnvApp
        initialInput={PRO_INPUT}
        initialUiState={{ viewMode: 'types-ts' }}
        entitlement={PRO}
      />,
    );
    expect(screen.queryByTestId('env-locked')).not.toBeInTheDocument();
    const out = screen.getByTestId('env-output').textContent ?? '';
    expect(out).toContain('namespace NodeJS');
    expect(out).toContain('interface ProcessEnv');
  });

  it('unlocks the Zod schema view via an injected Pro entitlement', () => {
    render(
      <EnvApp
        initialInput={PRO_INPUT}
        initialUiState={{ viewMode: 'types-zod' }}
        entitlement={PRO}
      />,
    );
    expect(screen.getByTestId('env-output').textContent ?? '').toContain(
      "import { z } from 'zod';",
    );
  });

  it('unlocks the data-dictionary view via an injected Pro entitlement', () => {
    render(
      <EnvApp
        initialInput={PRO_INPUT}
        initialUiState={{ viewMode: 'data-dictionary' }}
        entitlement={PRO}
      />,
    );
    expect(screen.getByTestId('env-output').textContent ?? '').toContain(
      '# NekoEnv data dictionary',
    );
  });

  it('unlocks the Compose / ConfigMap view via an injected Pro entitlement', () => {
    render(
      <EnvApp
        initialInput={PRO_INPUT}
        initialUiState={{ viewMode: 'compose' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('env-output').textContent ?? '';
    expect(out).toContain('services:');
    expect(out).toContain('kind: ConfigMap');
  });

  it('loads a local file into the main input (read locally, never uploaded)', async () => {
    render(<EnvApp initialInput={'A=1\n'} />);
    const file = new File(['LOADED=true\n'], 'sample.env', { type: 'text/plain' });
    fireEvent.change(screen.getByTestId('env-file'), { target: { files: [file] } });
    await waitFor(() =>
      expect((screen.getByTestId('env-input') as HTMLTextAreaElement).value).toContain('LOADED=true'),
    );
  });

  it('loads a local file into the diff compare-against input', async () => {
    render(<EnvApp initialInput={SIMPLE_INPUT} initialUiState={{ viewMode: 'diff' }} />);
    const file = new File(['COMPARE=loaded\n'], 'compare.env', { type: 'text/plain' });
    fireEvent.change(screen.getByTestId('env-file-2'), { target: { files: [file] } });
    await waitFor(() =>
      expect((screen.getByTestId('env-compare-input') as HTMLTextAreaElement).value).toContain(
        'COMPARE=loaded',
      ),
    );
  });
});
