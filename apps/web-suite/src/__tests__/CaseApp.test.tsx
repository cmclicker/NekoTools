import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CaseApp } from '../CaseApp.js';

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
});
