import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../App.js';

describe('App integration', () => {
  it('renders the manifest summary on first load (defaults to the NekoJSON tab)', () => {
    render(<App initialInput="{}" />);
    expect(screen.getByRole('heading', { level: 1, name: /NekoTools/ })).toBeInTheDocument();
    const phase = document.querySelector('.suite__phase');
    expect(phase?.textContent).toMatch(/Phase 2\.2/);
    expect(phase?.textContent).toMatch(/Hosting/);
    // The active tool tab is JSON by default — the JSON paste textarea
    // is in the DOM, the env one isn't.
    expect(screen.getByLabelText(/Paste JSON here/i)).toBeInTheDocument();
    expect(screen.queryByTestId('env-input')).not.toBeInTheDocument();
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

  it('Phase 1.1g: switches to the table view when the user picks "Table"', () => {
    render(<App initialInput='[{"a":1},{"a":2}]' />);
    fireEvent.click(screen.getByLabelText(/Table/));
    expect(screen.getByRole('region', { name: /JSON table view/i })).toBeInTheDocument();
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
  });

  it('Phase 1.1g: table view shows the not-applicable hint for non-array roots', () => {
    render(<App initialInput='{"a":1}' />);
    fireEvent.click(screen.getByLabelText(/Table/));
    expect(screen.getByTestId('table-not-applicable')).toBeInTheDocument();
  });

  it('Phase 1.1g: search input filters tree rows', () => {
    render(
      <App initialInput='{"outer":{"needle":1,"other":2}}' />,
    );
    const search = screen.getByTestId('search-input');
    fireEvent.change(search, { target: { value: 'needle' } });
    const tree = screen.getByRole('tree');
    // "needle" + ancestors visible; "other" filtered out.
    expect(tree.textContent).toContain('needle');
    expect(tree.textContent).toContain('outer');
    expect(tree.textContent).not.toContain('other');
  });

  it('Phase 1.1g: search input filters table rows', () => {
    render(<App initialInput='[{"name":"alice"},{"name":"bob"}]' />);
    fireEvent.click(screen.getByLabelText(/Table/));
    const search = screen.getByTestId('search-input');
    fireEvent.change(search, { target: { value: 'alice' } });
    expect(screen.getByText('"alice"')).toBeInTheDocument();
    expect(screen.queryByText('"bob"')).not.toBeInTheDocument();
  });

  it('Phase 1.1g: tree shows the no-matches hint when search excludes everything', () => {
    render(<App initialInput='{"a":1}' />);
    const search = screen.getByTestId('search-input');
    fireEvent.change(search, { target: { value: 'zzz-nothing-matches' } });
    expect(screen.getByTestId('tree-no-matches')).toBeInTheDocument();
  });

  it('Phase 1.1g: honors initialUiState.searchQuery + viewMode "table"', () => {
    render(
      <App
        initialInput='[{"name":"alice"},{"name":"bob"}]'
        initialUiState={{ viewMode: 'table', searchQuery: 'alice' }}
      />,
    );
    expect(screen.getByRole('region', { name: /JSON table view/i })).toBeInTheDocument();
    expect(screen.getByText('"alice"')).toBeInTheDocument();
    expect(screen.queryByText('"bob"')).not.toBeInTheDocument();
  });

  it('Phase 1.1h: Copy path and Copy value are disabled until a tree node is selected', () => {
    render(<App initialInput='{"a":1}' />);
    expect(screen.getByTestId('copy-path')).toBeDisabled();
    expect(screen.getByTestId('copy-value')).toBeDisabled();
  });

  it('Phase 1.1h: Copy path writes the active JSON Pointer via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <App
        initialInput='{"a":{"b":1}}'
        initialUiState={{ activePath: '/a/b' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    const btn = screen.getByTestId('copy-path');
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    await waitFor(() => {
      expect(writes).toEqual(['/a/b']);
    });
    const status = await screen.findByTestId('copy-status');
    expect(status).toHaveAttribute('data-kind', 'path');
    expect(status).toHaveAttribute('data-method', 'clipboard-api');
    expect(status.textContent).toMatch(/Copied path/);
  });

  it('Phase 1.1h: Copy value writes the JSON value at the active path', async () => {
    const writes: string[] = [];
    render(
      <App
        initialInput='{"a":{"b":1}}'
        initialUiState={{ activePath: '/a' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('copy-value'));
    await waitFor(() => {
      expect(writes).toHaveLength(1);
    });
    expect(JSON.parse(writes[0]!)).toEqual({ b: 1 });
    expect(await screen.findByTestId('copy-status')).toHaveAttribute('data-kind', 'value');
  });

  it('Phase 1.1h: Copy value surfaces a failure when the pointer is unresolved', async () => {
    const writes: string[] = [];
    render(
      <App
        initialInput='{"a":1}'
        initialUiState={{ activePath: '/missing' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('copy-value'));
    const status = await screen.findByTestId('copy-status');
    expect(status).toHaveAttribute('data-kind', 'value');
    expect(status.textContent).toMatch(/Copy value failed/);
    expect(writes).toHaveLength(0);
  });

  it('Phase 1.1h: Copy path falls back to execCommand when the api rejects', async () => {
    const apiWrite = vi.fn(async () => {
      throw new Error('permission denied');
    });
    const fallbackWrite = vi.fn(() => true);
    render(
      <App
        initialInput='{"a":1}'
        initialUiState={{ activePath: '/a' }}
        clipboardDeps={{ apiWrite, fallbackWrite }}
      />,
    );
    fireEvent.click(screen.getByTestId('copy-path'));
    const status = await screen.findByTestId('copy-status');
    expect(status).toHaveAttribute('data-method', 'execCommand');
    expect(fallbackWrite).toHaveBeenCalledWith('/a');
  });

  it('PR #11 audit blocker 1: initial state has no path; copy buttons disabled, status reads "No path selected"', () => {
    render(<App initialInput='{"a":1}' />);
    expect(screen.getByTestId('copy-path')).toBeDisabled();
    expect(screen.getByTestId('copy-value')).toBeDisabled();
    expect(screen.getByTestId('active-path').textContent).toMatch(/No path selected/);
  });

  it('PR #11 audit blocker 1: selecting the root row enables Copy buttons and reads "(root)"', () => {
    render(<App initialInput='{"a":1}' />);
    // Click the "(root)" tree row — its pointer is the empty string.
    fireEvent.click(screen.getByText('(root)'));
    expect(screen.getByTestId('copy-path')).not.toBeDisabled();
    expect(screen.getByTestId('copy-value')).not.toBeDisabled();
    expect(screen.getByTestId('active-path').textContent).toMatch(/\(root\)/);
  });

  it('PR #11 audit blocker 1: Copy path on the root writes the empty string (RFC 6901 root pointer)', async () => {
    const writes: string[] = [];
    render(
      <App
        initialInput='{"a":1}'
        initialUiState={{ activePath: '' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('copy-path'));
    await waitFor(() => {
      expect(writes).toEqual(['']);
    });
  });

  it('PR #11 audit blocker 1: Copy value on the root writes the full JSON document', async () => {
    const writes: string[] = [];
    const doc = { a: 1, b: [2, 3] };
    render(
      <App
        initialInput={JSON.stringify(doc)}
        initialUiState={{ activePath: '' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('copy-value'));
    await waitFor(() => {
      expect(writes).toHaveLength(1);
    });
    expect(JSON.parse(writes[0]!)).toEqual(doc);
  });

  it('Phase 2.2: tool tabs switch between NekoJSON and NekoEnv', () => {
    render(<App initialInput='{"a":1}' />);
    // JSON is default.
    expect(screen.getByTestId('tool-tab-json')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('tool-tab-env')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText(/Paste JSON here/i)).toBeInTheDocument();

    // Switch to env.
    fireEvent.click(screen.getByTestId('tool-tab-env'));
    expect(screen.getByTestId('tool-tab-env')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('env-input')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Paste JSON here/i)).not.toBeInTheDocument();
    // "Hosting <strong>NekoEnv</strong>" — text spans two nodes, so we
    // assert via the suite__phase element's full textContent.
    const phase = document.querySelector('.suite__phase');
    expect(phase?.textContent).toMatch(/Hosting\s+NekoEnv/);
  });

  it('Phase 2.2: initialTool="env" mounts the NekoEnv UI on first render', () => {
    render(<App initialTool="env" />);
    expect(screen.getByTestId('env-input')).toBeInTheDocument();
    const phase = document.querySelector('.suite__phase');
    expect(phase?.textContent).toMatch(/Hosting\s+NekoEnv/);
  });
});
