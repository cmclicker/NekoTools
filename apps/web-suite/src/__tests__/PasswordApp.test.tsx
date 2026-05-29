import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { PasswordApp } from '../PasswordApp.js';

describe('PasswordApp', () => {
  it('shows the empty-state with no input', () => {
    render(<PasswordApp />);
    expect(screen.getByTestId('password-empty')).toBeInTheDocument();
  });

  it('rates a weak password low and surfaces a warning', () => {
    render(<PasswordApp initialInput="password" />);
    expect(screen.getByTestId('password-meter').getAttribute('data-score')).toBe('0');
    expect(screen.getByText(/password\.pattern/)).toBeInTheDocument();
  });

  it('rates a long passphrase highly', () => {
    render(<PasswordApp initialInput="correct horse battery staple xyzzy" />);
    expect(screen.getByTestId('password-meter').getAttribute('data-score')).toBe('4');
    expect(screen.getByTestId('password-label').textContent).toMatch(/Very strong/);
  });

  it('renders crack-time scenarios', () => {
    render(<PasswordApp initialInput="Tr0ub4dour&3xyz" />);
    expect(screen.getByTestId('password-crack-times').textContent).toMatch(/Offline, fast hash/);
  });

  it('masks input by default and reveals on toggle', () => {
    render(<PasswordApp initialInput="secret" />);
    expect(screen.getByTestId('password-input')).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByTestId('password-reveal'));
    expect(screen.getByTestId('password-input')).toHaveAttribute('type', 'text');
  });

  it('never renders the raw password in the JSON view', () => {
    render(<PasswordApp initialInput="MyS3cr3t!pass" initialUiState={{ viewMode: 'json' }} />);
    expect(screen.getByTestId('password-output').textContent).not.toContain('MyS3cr3t!pass');
  });

  it('copies the markdown summary via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <PasswordApp
        initialInput="Abcd1234!xyz"
        initialUiState={{ viewMode: 'markdown' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('password-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toContain('# NekoPassword export');
  });
});
