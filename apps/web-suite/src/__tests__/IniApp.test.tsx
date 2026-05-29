import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { IniApp } from '../IniApp.js';

describe('IniApp', () => {
  it('renders sections + entries with counts', () => {
    render(<IniApp initialInput={'[server]\nhost = localhost\nport = 8080'} />);
    expect(screen.getByTestId('ini-stat-sections').textContent).toBe('1');
    expect(screen.getByTestId('ini-stat-keys').textContent).toBe('2');
    const sections = screen.getByTestId('ini-sections');
    expect(within(sections).getByText('server')).toBeInTheDocument();
    expect(within(sections).getByText('host')).toBeInTheDocument();
  });

  it('converts to JSON', () => {
    render(<IniApp initialInput={'[s]\nk = v'} initialUiState={{ viewMode: 'json' }} />);
    expect(JSON.parse(screen.getByTestId('ini-output').textContent ?? '{}')).toEqual({ s: { k: 'v' } });
  });

  it('warns on a duplicate key', () => {
    render(<IniApp initialInput={'[s]\nk = 1\nk = 2'} />);
    expect(screen.getByText(/ini\.duplicate_key/)).toBeInTheDocument();
  });

  it('shows the empty-state for whitespace-only input', () => {
    render(<IniApp initialInput={'   '} />);
    expect(screen.getByTestId('ini-no-document')).toBeInTheDocument();
    expect(screen.getByText(/ini\.empty_input/)).toBeInTheDocument();
  });

  it('switches to the normalized view', () => {
    render(<IniApp initialInput={'[s]\nk = v'} initialUiState={{ viewMode: 'normalized' }} />);
    expect(screen.getByTestId('ini-output').textContent).toContain('[s]');
    expect(screen.getByTestId('ini-output').textContent).toContain('k=v');
  });

  it('copies the JSON view via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <IniApp
        initialInput={'[s]\nk = v'}
        initialUiState={{ viewMode: 'json' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('ini-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(JSON.parse(writes[0] ?? '{}')).toEqual({ s: { k: 'v' } });
  });
});
