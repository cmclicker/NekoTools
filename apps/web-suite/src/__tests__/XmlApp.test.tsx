import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { XmlApp } from '../XmlApp.js';

describe('XmlApp', () => {
  it('decodes XML and renders the JSON view + document stats', () => {
    render(<XmlApp initialInput={'<root a="1"><child>hi</child></root>'} />);
    expect(screen.getByTestId('xml-stat-valid').textContent).toBe('yes');
    expect(screen.getByTestId('xml-stat-root').textContent).toBe('root');
    expect(screen.getByTestId('xml-stat-elements').textContent).toBe('2');
    expect(JSON.parse(screen.getByTestId('xml-output').textContent ?? '{}')).toEqual({
      root: { '@a': '1', child: 'hi' },
    });
  });

  it('switches to the pretty-XML view', () => {
    render(
      <XmlApp initialInput={'<r><a>1</a></r>'} initialUiState={{ viewMode: 'pretty' }} />,
    );
    const body = screen.getByTestId('xml-output').textContent ?? '';
    expect(body).toContain('<r>');
    expect(body).toContain('<a>1</a>');
  });

  it('surfaces a mismatched-tag diagnostic with its line number', () => {
    render(<XmlApp initialInput={'<a></b>'} />);
    expect(screen.getByText(/xml\.mismatched_tag/)).toBeInTheDocument();
    expect(screen.getByTestId('xml-stat-valid').textContent).toBe('no');
  });

  it('flags a skipped DOCTYPE as XXE-safe without expanding the entity', () => {
    render(
      <XmlApp
        initialInput={'<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]><a>&xxe;</a>'}
      />,
    );
    expect(screen.getByText(/xml\.external_entity/)).toBeInTheDocument();
    expect(screen.getByTestId('xml-output').textContent ?? '').not.toContain('etc/passwd');
  });

  it('shows the empty-state for whitespace-only input', () => {
    render(<XmlApp initialInput={'   '} />);
    expect(screen.getByTestId('xml-no-document')).toBeInTheDocument();
    expect(screen.getByText(/xml\.empty_input/)).toBeInTheDocument();
  });

  it('copies the current view output via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <XmlApp
        initialInput={'<a>x</a>'}
        initialUiState={{ viewMode: 'pretty' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('xml-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toBe('<a>x</a>');
  });
});
