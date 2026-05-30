import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { GitignoreApp } from '../GitignoreApp.js';

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

describe('GitignoreApp', () => {
  it('renders the rules table with classification', () => {
    render(<GitignoreApp initialInput={'node_modules/\n!keep.log'} initialUiState={{ paths: '' }} />);
    expect(screen.getByTestId('gitignore-stat-patterns').textContent).toBe('2');
    const rules = screen.getByTestId('gitignore-rules');
    expect(within(rules).getByText('node_modules')).toBeInTheDocument();
  });

  it('tests paths and shows ignored / tracked verdicts', () => {
    render(
      <GitignoreApp
        initialInput={'*.log\n!keep.log'}
        initialUiState={{ paths: 'debug.log\nkeep.log', viewMode: 'paths' }}
      />,
    );
    expect(screen.getByTestId('gitignore-ignored-0').textContent).toBe('ignored');
    expect(screen.getByTestId('gitignore-ignored-1').textContent).toBe('tracked');
  });

  it('updates verdicts when the paths field changes', () => {
    render(
      <GitignoreApp initialInput={'dist/'} initialUiState={{ paths: 'dist/app.js', viewMode: 'paths' }} />,
    );
    expect(screen.getByTestId('gitignore-ignored-0').textContent).toBe('ignored');
    fireEvent.change(screen.getByTestId('gitignore-paths'), { target: { value: 'src/app.js' } });
    expect(screen.getByTestId('gitignore-ignored-0').textContent).toBe('tracked');
  });

  it('emits a duplicate diagnostic', () => {
    render(<GitignoreApp initialInput={'foo\nfoo'} initialUiState={{ paths: '' }} />);
    expect(screen.getByText(/gitignore\.duplicate/)).toBeInTheDocument();
  });

  it('shows the empty-state for whitespace-only input', () => {
    render(<GitignoreApp initialInput={'   '} initialUiState={{ paths: '' }} />);
    expect(screen.getByTestId('gitignore-no-document')).toBeInTheDocument();
    expect(screen.getByText(/gitignore\.empty_input/)).toBeInTheDocument();
  });

  it('copies the normalized view via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <GitignoreApp
        initialInput={'# c\nfoo\nbar/'}
        initialUiState={{ paths: '', viewMode: 'normalized' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('gitignore-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toBe('foo\nbar/');
  });

  it('locks the audit + SARIF Pro views when free', () => {
    render(<GitignoreApp initialInput={'node_modules/'} initialUiState={{ paths: '', viewMode: 'audit' }} />);
    expect(screen.getByTestId('gitignore-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('gitignore-output')).not.toBeInTheDocument();
  });

  it('unlocks the secret-coverage audit via an injected Pro entitlement', () => {
    render(
      <GitignoreApp
        initialInput={'node_modules/'}
        initialUiState={{ paths: '', viewMode: 'audit' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('gitignore-output').textContent ?? '';
    expect(out).toContain('# NekoGitignore secret-coverage audit');
    expect(out).toContain('gitignore.uncovered_secret');
  });

  it('renders SARIF 2.1.0 in the SARIF view when Pro', () => {
    render(
      <GitignoreApp
        initialInput={'node_modules/'}
        initialUiState={{ paths: '', viewMode: 'sarif' }}
        entitlement={PRO}
      />,
    );
    expect(JSON.parse(screen.getByTestId('gitignore-output').textContent ?? '{}').version).toBe(
      '2.1.0',
    );
  });
});
