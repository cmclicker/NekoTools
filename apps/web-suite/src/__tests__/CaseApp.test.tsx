import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CaseApp } from '../CaseApp.js';

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

describe('CaseApp', () => {
  it('renders all case forms for the first line', () => {
    render(<CaseApp initialInput={'helloWorld example'} />);
    expect(screen.getByTestId('case-form-camel').textContent).toBe('helloWorldExample');
    expect(screen.getByTestId('case-form-snake').textContent).toBe('hello_world_example');
    expect(screen.getByTestId('case-form-kebab').textContent).toBe('hello-world-example');
    expect(screen.getByTestId('case-form-constant').textContent).toBe('HELLO_WORLD_EXAMPLE');
  });

  it('updates forms as the input changes', () => {
    render(<CaseApp initialInput={'foo'} />);
    expect(screen.getByTestId('case-form-pascal').textContent).toBe('Foo');
    fireEvent.change(screen.getByTestId('case-input'), { target: { value: 'foo bar' } });
    expect(screen.getByTestId('case-form-pascal').textContent).toBe('FooBar');
  });

  it('converts to a slug list', () => {
    render(<CaseApp initialInput={'Hello World\nfooBar'} initialUiState={{ viewMode: 'normalized' }} />);
    expect(screen.getByTestId('case-output').textContent).toBe('hello-world\nfoo-bar');
  });

  it('shows the empty-state for whitespace-only input', () => {
    render(<CaseApp initialInput={'   '} />);
    expect(screen.getByTestId('case-no-document')).toBeInTheDocument();
    expect(screen.getByText(/case\.empty_input/)).toBeInTheDocument();
  });

  it('emits a no_words diagnostic for punctuation-only input', () => {
    render(<CaseApp initialInput={'!!! ???'} />);
    expect(screen.getByText(/case\.no_words/)).toBeInTheDocument();
  });

  it('copies the markdown summary via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <CaseApp
        initialInput={'fooBar'}
        initialUiState={{ viewMode: 'markdown' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('case-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toContain('# NekoCase export');
  });

  it('locks the CSV + single-form Pro views when free', () => {
    render(<CaseApp initialInput={'Hello World'} initialUiState={{ viewMode: 'csv' }} />);
    expect(screen.getByTestId('case-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('case-output')).not.toBeInTheDocument();
  });

  it('unlocks the CSV grid via an injected Pro entitlement', () => {
    render(
      <CaseApp
        initialInput={'Hello World'}
        initialUiState={{ viewMode: 'csv' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('case-output').textContent ?? '';
    expect(out.split('\n')[0]).toContain('input,');
    expect(out).toContain('Hello World,');
  });

  it('renders the single form (camelCase) when Pro', () => {
    render(
      <CaseApp
        initialInput={'Hello World'}
        initialUiState={{ viewMode: 'single-form' }}
        entitlement={PRO}
      />,
    );
    expect(screen.getByTestId('case-output').textContent ?? '').toBe('helloWorld');
  });
});
