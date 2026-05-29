import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { GitignoreApp } from '../GitignoreApp.js';

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
});
