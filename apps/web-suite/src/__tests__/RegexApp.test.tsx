import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { App } from '../App.js';
import { RegexApp } from '../RegexApp.js';

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

describe('RegexApp', () => {
  it('renders every global match with its offsets', () => {
    render(<RegexApp initialPattern="a" initialFlags="g" initialSample="banana" />);
    expect(screen.getByTestId('regex-match-count')).toHaveAttribute('data-count', '3');
    expect(screen.getAllByTestId('regex-match')).toHaveLength(3);
  });

  it('renders numbered capture groups', () => {
    render(<RegexApp initialPattern={'(\\d{4})-(\\d{2})'} initialFlags="" initialSample="2026-05" />);
    const groups = screen.getAllByTestId('regex-group');
    expect(groups).toHaveLength(2);
    expect(groups[0]!.textContent).toContain('2026');
    expect(groups[1]!.textContent).toContain('05');
  });

  it('renders named capture groups', () => {
    render(<RegexApp initialPattern={'(?<year>\\d{4})'} initialFlags="" initialSample="2026" />);
    const named = screen.getAllByTestId('regex-named-group');
    expect(named).toHaveLength(1);
    expect(named[0]!.textContent).toContain('year');
    expect(named[0]!.textContent).toContain('2026');
  });

  it('surfaces a diagnostic and the empty-state for an invalid pattern', () => {
    render(<RegexApp initialPattern="(" initialFlags="" initialSample="abc" />);
    expect(screen.getByText(/regex\.invalid_pattern/)).toBeInTheDocument();
    expect(screen.getByTestId('regex-no-matches')).toBeInTheDocument();
  });

  it('surfaces a diagnostic for an unsupported flag', () => {
    render(<RegexApp initialPattern="a" initialFlags="z" initialSample="banana" />);
    expect(screen.getByText(/regex\.unsupported_flag/)).toBeInTheDocument();
  });

  it('warns about a nested-quantifier (expensive) pattern', () => {
    render(<RegexApp initialPattern={'(a+)+'} initialFlags="" initialSample="aaaa" />);
    expect(screen.getByText(/regex\.expensive_pattern/)).toBeInTheDocument();
  });

  it('copies the matches JSON via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <RegexApp
        initialPattern="a"
        initialFlags="g"
        initialSample="banana"
        clipboardDeps={{
          apiWrite: async (t) => {
            writes.push(t);
          },
        }}
      />,
    );
    fireEvent.click(screen.getByTestId('regex-copy-json'));
    await waitFor(() => {
      expect(writes).toHaveLength(1);
    });
    expect(JSON.parse(writes[0]!).matchCount).toBe(3);
  });

  it('locks the explain + redaction Pro views when free', () => {
    render(
      <RegexApp
        initialPattern={'(?<year>\\d{4})'}
        initialFlags="g"
        initialSample="2026 and 1999"
        initialUiState={{ viewMode: 'explain' }}
      />,
    );
    expect(screen.getByTestId('regex-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('regex-output')).not.toBeInTheDocument();
    // The free matches list is hidden while a Pro view is selected.
    expect(screen.queryByTestId('regex-matches')).not.toBeInTheDocument();
  });

  it('unlocks the structural explanation via an injected Pro entitlement', () => {
    render(
      <RegexApp
        initialPattern={'(?<year>\\d{4})'}
        initialFlags="g"
        initialSample="2026 and 1999"
        initialUiState={{ viewMode: 'explain' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('regex-output').textContent ?? '';
    expect(out).toContain('# NekoRegex pattern explanation');
    expect(out).toContain('named capture group "year"');
  });

  it('renders the JSON redaction recipe in the redaction view when Pro', () => {
    render(
      <RegexApp
        initialPattern={'(?<year>\\d{4})'}
        initialFlags="g"
        initialSample="2026 and 1999"
        initialUiState={{ viewMode: 'redaction' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('regex-output').textContent ?? '';
    expect(out).toContain('"tool": "regex"');
    expect(out).toContain('[REDACTED]');
  });
});

describe('RegexApp in the shell', () => {
  it('exposes the NekoRegex tab and mounts its panel via initialTool', () => {
    render(<App initialTool="regex" />);
    expect(screen.getByTestId('tool-tab-regex')).toBeInTheDocument();
    expect(screen.getByTestId('tool-panel-regex')).toBeVisible();
    const phase = document.querySelector('.suite__phase');
    expect(phase?.textContent).toMatch(/Now viewing\s+NekoRegex/);
  });

  it('keeps every pre-existing tool tab rendered alongside NekoRegex', () => {
    render(<App initialTool="regex" />);
    for (const id of ['json', 'env', 'logs', 'yaml', 'regex']) {
      expect(screen.getByTestId(`tool-tab-${id}`)).toBeInTheDocument();
    }
  });

  it('renders the shared Pro surface with NekoRegex Pro features shown locked', () => {
    render(<App initialTool="regex" />);
    const proList = screen.getByTestId('features-list-regex');
    expect(within(proList).getByText('explain.mode')).toBeInTheDocument();
    expect(within(proList).getByText('redaction.recipes')).toBeInTheDocument();
    expect(within(proList).getByText('suites.saved')).toBeInTheDocument();
    // Each Pro feature carries a color-coded "Pro" tag.
    expect(within(proList).getAllByText('Pro')).toHaveLength(6);
  });
});
