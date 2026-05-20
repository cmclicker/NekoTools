import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TreeView } from '../TreeView.js';

describe('TreeView', () => {
  it('renders the root and immediate children', () => {
    render(
      <TreeView
        value={{ a: 1, b: 'two' }}
        activePath={null}
        onSelectPath={() => {}}
      />,
    );
    const tree = screen.getByRole('tree');
    expect(within(tree).getByText('(root)')).toBeInTheDocument();
    expect(within(tree).getByText('a')).toBeInTheDocument();
    expect(within(tree).getByText('b')).toBeInTheDocument();
  });

  it('hides nested children until the user expands the parent', () => {
    render(
      <TreeView
        value={{ outer: { inner: 1 } }}
        activePath={null}
        onSelectPath={() => {}}
      />,
    );
    // `inner` should not appear initially.
    expect(screen.queryByText('inner')).not.toBeInTheDocument();
    // Click the chevron next to `outer`.
    const outerRow = screen.getByText('outer').closest('li');
    expect(outerRow).not.toBeNull();
    const chevron = within(outerRow!).getByRole('button', { name: /Expand/i });
    fireEvent.click(chevron);
    expect(screen.getByText('inner')).toBeInTheDocument();
  });

  it('emits onSelectPath with the clicked pointer (RFC 6901)', () => {
    const onSelectPath = vi.fn();
    render(
      <TreeView
        value={{ a: 1 }}
        activePath={null}
        onSelectPath={onSelectPath}
      />,
    );
    fireEvent.click(screen.getByText('a'));
    expect(onSelectPath).toHaveBeenCalledWith('/a');
  });

  it('marks the active row when activePath matches', () => {
    render(
      <TreeView
        value={{ a: 1 }}
        activePath="/a"
        onSelectPath={() => {}}
      />,
    );
    const aRow = screen.getByText('a').closest('li');
    expect(aRow).toHaveAttribute('aria-selected', 'true');
  });

  it('Phase 1.1g: searchQuery filters nodes to matches + ancestors', () => {
    render(
      <TreeView
        value={{ outer: { needle: 1, other: 2 } }}
        activePath={null}
        onSelectPath={() => {}}
        searchQuery="needle"
      />,
    );
    const tree = screen.getByRole('tree');
    expect(within(tree).getByText('outer')).toBeInTheDocument();
    expect(within(tree).getByText('needle')).toBeInTheDocument();
    expect(within(tree).queryByText('other')).not.toBeInTheDocument();
  });

  it('Phase 1.1g: shows the no-matches hint when nothing matches', () => {
    render(
      <TreeView
        value={{ a: 1 }}
        activePath={null}
        onSelectPath={() => {}}
        searchQuery="zzz-no-such-key"
      />,
    );
    expect(screen.getByTestId('tree-no-matches')).toBeInTheDocument();
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
  });

  it('PR #11 audit blocker 1: activePath=null does not falsely mark the root row as selected', () => {
    render(
      <TreeView value={{ a: 1 }} activePath={null} onSelectPath={() => {}} />,
    );
    const rootRow = screen.getByText('(root)').closest('li');
    expect(rootRow).toHaveAttribute('aria-selected', 'false');
  });

  it('PR #11 audit blocker 1: activePath="" marks the root row as selected (RFC 6901 root pointer)', () => {
    render(
      <TreeView value={{ a: 1 }} activePath="" onSelectPath={() => {}} />,
    );
    const rootRow = screen.getByText('(root)').closest('li');
    expect(rootRow).toHaveAttribute('aria-selected', 'true');
  });
});
