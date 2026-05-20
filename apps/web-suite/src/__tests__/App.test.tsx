import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../App.js';

describe('App integration', () => {
  it('renders the manifest summary on first load', () => {
    render(<App initialInput="{}" />);
    expect(screen.getByRole('heading', { level: 1, name: /NekoTools/ })).toBeInTheDocument();
    expect(screen.getByText(/Phase 1.1f/)).toBeInTheDocument();
  });

  it('parses the initial input and shows the tree by default', () => {
    render(<App initialInput='{"hello":1}' />);
    const tree = screen.getByRole('tree');
    expect(tree).toBeInTheDocument();
  });

  it('switches to the text view when the user picks "Text"', () => {
    render(<App initialInput='{"hello":1}' />);
    fireEvent.click(screen.getByLabelText(/Text/));
    expect(screen.getByLabelText(/JSON text view/i)).toBeInTheDocument();
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
  });

  it('updates the active path when a tree node is clicked', () => {
    render(<App initialInput='{"hello":1}' />);
    fireEvent.click(screen.getByText('hello'));
    expect(screen.getByTestId('active-path').textContent).toContain('/hello');
  });

  it('shows the duplicate_key warning from the walker', () => {
    render(<App initialInput='{"a":1,"a":2}' />);
    expect(screen.getByText(/json\.duplicate_key/)).toBeInTheDocument();
  });

  it('shows the syntax_error diagnostic on invalid JSON', () => {
    render(<App initialInput='{"oops":' />);
    expect(screen.getByText(/json\.syntax_error/)).toBeInTheDocument();
  });

  it('honors initialUiState (viewMode and activePath round-trip)', () => {
    render(
      <App
        initialInput='{"a":{"b":1}}'
        initialUiState={{ viewMode: 'text', activePath: '/a/b' }}
      />,
    );
    expect(screen.getByLabelText(/JSON text view/i)).toBeInTheDocument();
    expect(screen.getByTestId('active-path').textContent).toContain('/a/b');
  });
});
