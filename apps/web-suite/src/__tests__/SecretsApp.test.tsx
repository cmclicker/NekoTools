import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { SecretsApp } from '../SecretsApp.js';

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

describe('SecretsApp', () => {
  it('scans input and renders the masked findings table', () => {
    render(<SecretsApp initialInput={'aws=AKIAIOSFODNN7EXAMPLE'} />);
    expect(screen.getByTestId('secrets-stat-count').textContent).toBe('1');
    const table = screen.getByTestId('secrets-table');
    expect(within(table).getByText('aws.access-key')).toBeInTheDocument();
    // The raw key never appears; the preview is masked.
    expect(screen.getByTestId('secrets-preview-0').textContent).toContain('•');
    expect(table.textContent).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('emits security diagnostics for findings', () => {
    render(<SecretsApp initialInput={'token=ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'} />);
    expect(screen.getByText(/secret\.finding/)).toBeInTheDocument();
  });

  it('shows the clean empty-state when nothing is flagged', () => {
    render(<SecretsApp initialInput={'the quick brown fox jumps over the lazy dog'} />);
    expect(screen.getByTestId('secrets-clean')).toBeInTheDocument();
    expect(screen.getByText(/secret\.clean/)).toBeInTheDocument();
  });

  it('switches to the CSV view', () => {
    render(
      <SecretsApp initialInput={'aws=AKIAIOSFODNN7EXAMPLE'} initialUiState={{ viewMode: 'csv' }} />,
    );
    expect(screen.getByTestId('secrets-output').textContent).toContain(
      'ruleId,severity,line,column,length,preview,entropy',
    );
  });

  it('copies the markdown summary via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <SecretsApp
        initialInput={'aws=AKIAIOSFODNN7EXAMPLE'}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('secrets-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toContain('# NekoSecrets export');
  });

  it('locks the SARIF Pro view when free', () => {
    render(<SecretsApp initialInput={'aws=AKIAIOSFODNN7EXAMPLE'} initialUiState={{ viewMode: 'sarif' }} />);
    expect(screen.getByTestId('secrets-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('secrets-output')).not.toBeInTheDocument();
  });

  it('unlocks SARIF + redacted via the dev Pro toggle', () => {
    render(<SecretsApp initialInput={'aws=AKIAIOSFODNN7EXAMPLE'} initialUiState={{ viewMode: 'sarif' }} />);
    fireEvent.click(screen.getByTestId('secrets-pro-toggle'));
    const out = screen.getByTestId('secrets-output').textContent ?? '';
    expect(JSON.parse(out).version).toBe('2.1.0');
  });

  it('unlocks via an injected Pro entitlement (no dev toggle shown)', () => {
    render(
      <SecretsApp
        initialInput={'aws=AKIAIOSFODNN7EXAMPLE'}
        initialUiState={{ viewMode: 'redacted' }}
        entitlement={{
          version: 1,
          licenseId: 'X',
          licensee: 'Buyer',
          tier: 'pro',
          features: ['*'],
          issuedAt: '2026-01-01T00:00:00.000Z',
          expiresAt: null,
          signature: 's',
        }}
      />,
    );
    expect(screen.queryByTestId('secrets-pro-toggle')).not.toBeInTheDocument();
    expect(screen.getByTestId('secrets-output').textContent).toContain('[REDACTED:aws.access-key]');
  });

  const MIXED = [
    'aws=AKIAIOSFODNN7EXAMPLE',
    'password = "hunter2hunter2"',
    'blob = Zk7Q9pX2vL4mN8rT1yB6cF3hJ0dK5sW7aE2gU9iO',
  ].join('\n');

  it('breaks findings down by severity in the stats', () => {
    render(<SecretsApp initialInput={MIXED} />);
    expect(screen.getByTestId('secrets-stat-high').textContent).toBe('1');
    expect(screen.getByTestId('secrets-stat-medium').textContent).toBe('1');
    expect(screen.getByTestId('secrets-stat-low').textContent).toBe('1');
  });

  it('filters the findings table by severity', () => {
    render(<SecretsApp initialInput={MIXED} />);
    const table = screen.getByTestId('secrets-table');
    expect(table.textContent).toContain('entropy.high');
    fireEvent.click(screen.getByTestId('secrets-filter-low'));
    expect(screen.getByTestId('secrets-table').textContent).not.toContain('entropy.high');
    expect(screen.getByTestId('secrets-table').textContent).toContain('aws.access-key');
  });

  it('shows the no-match state when every severity is filtered out', () => {
    render(<SecretsApp initialInput={MIXED} />);
    fireEvent.click(screen.getByTestId('secrets-filter-high'));
    fireEvent.click(screen.getByTestId('secrets-filter-medium'));
    fireEvent.click(screen.getByTestId('secrets-filter-low'));
    expect(screen.getByTestId('secrets-no-match')).toBeInTheDocument();
    expect(screen.queryByTestId('secrets-table')).not.toBeInTheDocument();
  });

  it('loads a local file into the input (read locally, never uploaded)', async () => {
    render(<SecretsApp initialInput={'the quick brown fox'} />);
    expect(screen.getByTestId('secrets-stat-count').textContent).toBe('0');
    const file = new File(['leaked=AKIAIOSFODNN7EXAMPLE'], 'config.env', { type: 'text/plain' });
    fireEvent.change(screen.getByTestId('secrets-file'), { target: { files: [file] } });
    await waitFor(() =>
      expect((screen.getByTestId('secrets-input') as HTMLTextAreaElement).value).toContain(
        'AKIAIOSFODNN7EXAMPLE',
      ),
    );
    expect(screen.getByTestId('secrets-stat-count').textContent).toBe('1');
  });

  it('renders the Pro HTML report when entitled', () => {
    render(
      <SecretsApp initialInput={'aws=AKIAIOSFODNN7EXAMPLE'} initialUiState={{ viewMode: 'html' }} entitlement={PRO} />,
    );
    expect(screen.getByTestId('secrets-output').textContent).toContain('<!doctype html>');
  });

  it('renders the Pro CI baseline when entitled', () => {
    render(
      <SecretsApp
        initialInput={'aws=AKIAIOSFODNN7EXAMPLE'}
        initialUiState={{ viewMode: 'baseline' }}
        entitlement={PRO}
      />,
    );
    const out = JSON.parse(screen.getByTestId('secrets-output').textContent ?? '{}');
    expect(out.tool).toBe('NekoSecrets');
    expect(out.fingerprints.length).toBe(1);
  });

  it('locks the HTML + baseline Pro views when free', () => {
    render(<SecretsApp initialInput={'aws=AKIAIOSFODNN7EXAMPLE'} initialUiState={{ viewMode: 'html' }} />);
    expect(screen.getByTestId('secrets-locked')).toBeInTheDocument();
  });

  it('plays the local chime on new findings when sound is on', async () => {
    const chime = vi.fn();
    render(<SecretsApp initialInput={'all clear here'} playChime={chime} initialUiState={{ soundOn: true }} />);
    fireEvent.change(screen.getByTestId('secrets-input'), {
      target: { value: 'k=AKIAIOSFODNN7EXAMPLE' },
    });
    await waitFor(() => expect(chime).toHaveBeenCalledTimes(1));
  });

  it('stays silent on new findings when sound is off (default)', () => {
    const chime = vi.fn();
    render(<SecretsApp initialInput={'all clear here'} playChime={chime} />);
    fireEvent.change(screen.getByTestId('secrets-input'), {
      target: { value: 'k=AKIAIOSFODNN7EXAMPLE' },
    });
    expect(chime).not.toHaveBeenCalled();
  });
});
