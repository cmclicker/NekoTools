import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { XmlApp } from '../XmlApp.js';

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

const NESTED_XML =
  '<catalog><item id="1"><name>A</name></item><item id="2"><name>B</name></item></catalog>';

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

  it('locks the XPath + XSD Pro views when free', () => {
    render(<XmlApp initialInput={NESTED_XML} initialUiState={{ viewMode: 'xpath' }} />);
    expect(screen.getByTestId('xml-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('xml-output')).not.toBeInTheDocument();
  });

  it('unlocks the XPath path inventory via an injected Pro entitlement', () => {
    render(
      <XmlApp initialInput={NESTED_XML} initialUiState={{ viewMode: 'xpath' }} entitlement={PRO} />,
    );
    expect(screen.queryByTestId('xml-locked')).not.toBeInTheDocument();
    const out = screen.getByTestId('xml-output').textContent ?? '';
    expect(out).toContain('# NekoXML path inventory');
    expect(out).toContain('/catalog/item');
  });

  it('unlocks the inferred XSD via an injected Pro entitlement', () => {
    render(
      <XmlApp initialInput={NESTED_XML} initialUiState={{ viewMode: 'xsd' }} entitlement={PRO} />,
    );
    const out = screen.getByTestId('xml-output').textContent ?? '';
    expect(out).toContain('<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">');
    expect(out).toContain('<xs:element name=');
  });

  it('loads a local file into the input (read locally, never uploaded)', async () => {
    render(<XmlApp initialInput={'<a>x</a>'} />);
    const file = new File(['<r loaded="true"/>'], 'sample.xml', { type: 'text/plain' });
    fireEvent.change(screen.getByTestId('xml-file'), { target: { files: [file] } });
    await waitFor(() =>
      expect((screen.getByTestId('xml-input') as HTMLTextAreaElement).value).toContain(
        'loaded="true"',
      ),
    );
  });
});
