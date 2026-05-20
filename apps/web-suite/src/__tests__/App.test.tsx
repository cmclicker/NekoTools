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

  it('PR #9 audit blocker 1: invalid JSON does NOT render a null tree document', () => {
    // The original fallback used `?? null`, which made invalid input
    // appear as a legitimate JSON `null` tree root. The fix shows an
    // empty-state UI in the tree view instead.
    render(<App initialInput='{"oops":' />);
    expect(screen.getByTestId('no-document')).toBeInTheDocument();
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
    // The diagnostic is still surfaced.
    expect(screen.getByText(/json\.syntax_error/)).toBeInTheDocument();
  });

  it('valid literal `null` DOES render as a null leaf in the tree (regression guard)', () => {
    // null is a valid JSON root. The fix must not over-trigger the
    // empty-state branch and suppress real null roots.
    render(<App initialInput="null" />);
    expect(screen.queryByTestId('no-document')).not.toBeInTheDocument();
    expect(screen.getByRole('tree')).toBeInTheDocument();
    // (root): null
    const tree = screen.getByRole('tree');
    expect(tree.textContent).toContain('null');
  });

  it('invalid JSON in text view still renders raw input + diagnostics', () => {
    render(<App initialInput='{"oops":' />);
    fireEvent.click(screen.getByLabelText(/Text/));
    expect(screen.getByLabelText(/JSON text view/i)).toBeInTheDocument();
    expect(screen.getByText(/json\.syntax_error/)).toBeInTheDocument();
  });
});
