import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { UnicodeApp } from '../UnicodeApp.js';

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

describe('UnicodeApp', () => {
  it('renders a per-codepoint table with counts', () => {
    render(<UnicodeApp initialInput={'AB'} />);
    expect(screen.getByTestId('unicode-stat-cp').textContent).toBe('2');
    expect(screen.getByTestId('unicode-cp-0').textContent).toBe('U+0041');
    expect(screen.getByTestId('unicode-cp-1').textContent).toBe('U+0042');
  });

  it('counts an emoji as 1 code point / 2 UTF-16 units', () => {
    render(<UnicodeApp initialInput={'😀'} />);
    expect(screen.getByTestId('unicode-stat-cp').textContent).toBe('1');
    expect(screen.getByTestId('unicode-stat-units').textContent).toBe('2');
    expect(screen.getByTestId('unicode-cp-0').textContent).toBe('U+1F600');
  });

  it('shows the empty-state for truly empty input', () => {
    render(<UnicodeApp initialInput={''} />);
    expect(screen.getByTestId('unicode-no-document')).toBeInTheDocument();
    expect(screen.getByText(/unicode\.empty_input/)).toBeInTheDocument();
  });

  it('treats whitespace as content (not empty)', () => {
    render(<UnicodeApp initialInput={' '} />);
    expect(screen.getByTestId('unicode-stat-cp').textContent).toBe('1');
  });

  it('converts to a U+ list', () => {
    render(<UnicodeApp initialInput={'AB'} initialUiState={{ viewMode: 'normalized' }} />);
    expect(screen.getByTestId('unicode-output').textContent).toBe('U+0041 U+0042');
  });

  it('copies the markdown summary via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <UnicodeApp
        initialInput={'A'}
        initialUiState={{ viewMode: 'markdown' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('unicode-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toContain('# NekoUnicode export');
  });

  it('locks the names + CSV Pro views when free', () => {
    render(<UnicodeApp initialInput={'A中'} initialUiState={{ viewMode: 'names' }} />);
    expect(screen.getByTestId('unicode-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('unicode-output')).not.toBeInTheDocument();
  });

  it('unlocks the names table via an injected Pro entitlement', () => {
    render(
      <UnicodeApp
        initialInput={'A中'}
        initialUiState={{ viewMode: 'names' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('unicode-output').textContent ?? '';
    expect(out).toContain('# NekoUnicode names');
    expect(out).toContain('U+0041');
    expect(out).toContain('U+4E2D');
  });

  it('renders the CSV grid in the CSV view when Pro', () => {
    render(
      <UnicodeApp
        initialInput={'A中'}
        initialUiState={{ viewMode: 'csv' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('unicode-output').textContent ?? '';
    expect(out.split('\r\n')[0]).toBe(
      'index,codepoint,char,name,decimal,category,utf8,utf16,jsEscape,htmlEntity,urlEncoded',
    );
    expect(out).toContain('0,U+0041,A,');
    expect(out).toContain('U+4E2D');
  });
});
