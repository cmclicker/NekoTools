import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { SecretsApp } from '../SecretsApp.js';

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
});
