import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { YamlApp } from '../YamlApp.js';

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

describe('YamlApp', () => {
  it('parses YAML and shows the JSON projection by default', () => {
    render(<YamlApp initialInput={'name: nekotools\nport: 8080\n'} />);
    const out = screen.getByTestId('yaml-output');
    const parsed = JSON.parse(out.textContent ?? '{}');
    expect(parsed).toEqual({ name: 'nekotools', port: 8080 });
  });

  it('switches to the normalized YAML view', () => {
    render(<YamlApp initialInput={'{a: 1, b: [1, 2]}\n'} initialUiState={{ viewMode: 'yaml' }} />);
    const out = screen.getByTestId('yaml-output').textContent ?? '';
    expect(out).toContain('a: 1');
    expect(out).toContain('b:');
  });

  it('surfaces a line/column diagnostic for tab indentation', () => {
    render(<YamlApp initialInput={'a:\n\tb: 2\n'} />);
    expect(screen.getByText(/yaml\.tab_indentation/)).toBeInTheDocument();
  });

  it('shows the empty-state and an info diagnostic for empty input', () => {
    render(<YamlApp initialInput="" />);
    expect(screen.getByTestId('yaml-no-document')).toBeInTheDocument();
    expect(screen.getByText(/yaml\.empty_input/)).toBeInTheDocument();
  });

  it('copies the current output via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <YamlApp
        initialInput={'k: v\n'}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('yaml-copy-output'));
    await waitFor(() => {
      expect(writes).toHaveLength(1);
    });
    expect(JSON.parse(writes[0]!)).toEqual({ k: 'v' });
  });

  it('locks the structure-report Pro view when free', () => {
    render(
      <YamlApp initialInput={'name: nekotools\n'} initialUiState={{ viewMode: 'schema-report' }} />,
    );
    expect(screen.getByTestId('yaml-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('yaml-output')).not.toBeInTheDocument();
    expect(screen.queryByText(/# NekoYAML structure report/)).not.toBeInTheDocument();
  });

  it('unlocks the structure report via an injected Pro entitlement', () => {
    render(
      <YamlApp
        initialInput={'name: nekotools\n'}
        initialUiState={{ viewMode: 'schema-report' }}
        entitlement={PRO}
      />,
    );
    expect(screen.queryByTestId('yaml-locked')).not.toBeInTheDocument();
    const out = screen.getByTestId('yaml-output').textContent ?? '';
    expect(out).toContain('# NekoYAML structure report');
  });
});
