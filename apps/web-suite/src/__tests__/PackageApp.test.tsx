import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { PackageApp } from '../PackageApp.js';

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
});
