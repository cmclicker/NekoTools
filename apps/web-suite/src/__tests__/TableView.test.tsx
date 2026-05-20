import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TableView } from '../TableView.js';

describe('TableView', () => {
  it('renders a not-applicable hint when the root is not an array', () => {
    render(<TableView value={{ a: 1 }} />);
    expect(screen.getByTestId('table-not-applicable')).toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('renders a not-applicable hint when the array has no object elements', () => {
    render(<TableView value={[1, 2, 3]} />);
    expect(screen.getByTestId('table-not-applicable')).toBeInTheDocument();
  });

  it('renders rows + columns for an array of objects', () => {
    render(<TableView value={[{ a: 1, b: 'x' }, { a: 2, b: 'y' }]} />);
    expect(screen.getByRole('region')).toBeInTheDocument();
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByText('"x"')).toBeInTheDocument();
    expect(screen.getByText('"y"')).toBeInTheDocument();
  });

  it('filters rows by search query', () => {
    render(<TableView value={[{ name: 'alice' }, { name: 'bob' }]} searchQuery="alice" />);
    expect(screen.getByText('"alice"')).toBeInTheDocument();
    expect(screen.queryByText('"bob"')).not.toBeInTheDocument();
  });

  it('shows a no-matches row when search filters out everything', () => {
    render(<TableView value={[{ a: 1 }]} searchQuery="zzz" />);
    expect(screen.getByTestId('table-no-matches')).toBeInTheDocument();
  });

  it('renders an empty-cell marker for missing keys', () => {
    // The "—" marker is aria-hidden so it does not pollute the
    // accessibility tree, but it should be in the rendered DOM for
    // sighted users.
    render(<TableView value={[{ a: 1, b: 2 }, { a: 10 }]} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
