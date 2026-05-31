import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { LogsApp } from '../LogsApp.js';

// Mixed-format sample: JSON-per-line (info), plaintext bracket level
// (warn), logfmt (error), plaintext bracket level (info). Deterministic
// timestamps so the summary/histogram are stable.
const SAMPLE = [
  '{"time":"2026-05-21T10:00:00Z","level":"info","msg":"service started","svc":"api"}',
  '2026-05-21 10:00:05 [WARN] cache miss',
  'level=error msg="upstream timeout" svc=db',
  '2026-05-21 10:00:30 [INFO] request completed',
].join('\n');

// A Pro entitlement: tier !== 'free' is all the UI gate checks; the
// engine itself verifies signatures elsewhere.
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

// Two "db timeout id=NN" lines collapse to one `db timeout id=<num>`
// template in the clusters export — mirrors the engine conformance input.
const CLUSTER_SAMPLE = [
  '2026-05-21T00:00:00Z error db timeout id=42',
  '2026-05-21T00:00:01Z error db timeout id=99',
  '2026-05-21T00:00:02Z info ok',
].join('\n');

describe('LogsApp integration', () => {
  it('parses the initial input and shows the table view by default', () => {
    render(<LogsApp initialInput={SAMPLE} />);
    const region = screen.getByRole('region', { name: /NekoLogs table view/i });
    expect(region).toBeInTheDocument();
    const rows = within(region).getAllByTestId('log-row');
    expect(rows).toHaveLength(4);
    expect(region.textContent).toContain('service started');
    expect(region.textContent).toContain('upstream timeout');
  });

  it('switches to the text view', () => {
    render(<LogsApp initialInput={SAMPLE} />);
    fireEvent.click(screen.getByLabelText(/^Text$/));
    expect(screen.getByLabelText(/NekoLogs text view/i)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /NekoLogs table view/i })).not.toBeInTheDocument();
  });

  it('switches to the summary view and renders counts + histogram', () => {
    render(<LogsApp initialInput={SAMPLE} />);
    fireEvent.click(screen.getByLabelText(/^Summary$/));
    expect(screen.getByRole('region', { name: /NekoLogs summary view/i })).toBeInTheDocument();
    expect(screen.getByTestId('log-summary-total').textContent).toBe('4');
    // info appears twice (JSON + bracket INFO).
    const levels = screen.getByTestId('log-summary-levels');
    expect(within(levels).getByText('info').closest('li')).toHaveAttribute('data-count', '2');
    expect(screen.getByTestId('log-histogram')).toBeInTheDocument();
  });

  it('free-text search narrows the table rows', () => {
    render(<LogsApp initialInput={SAMPLE} />);
    fireEvent.change(screen.getByTestId('logs-search-input'), { target: { value: 'upstream' } });
    const rows = screen.getAllByTestId('log-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('upstream timeout');
  });

  it('the structured filter narrows entries and reports a matched count', () => {
    render(<LogsApp initialInput={SAMPLE} />);
    // minLevel = warn keeps the warn + error entries (2 of 4).
    fireEvent.change(screen.getByTestId('log-filter-minlevel'), { target: { value: 'warn' } });
    const rows = screen.getAllByTestId('log-row');
    expect(rows).toHaveLength(2);
    const count = screen.getByTestId('logs-matched-count');
    expect(count.textContent).toMatch(/matched\s*2\s*of\s*4/i);
  });

  it('a structured field filter (fieldEquals) narrows to matching entries', () => {
    render(<LogsApp initialInput={SAMPLE} />);
    fireEvent.change(screen.getByTestId('log-filter-field-key'), { target: { value: 'svc' } });
    fireEvent.change(screen.getByTestId('log-filter-field-value'), { target: { value: 'db' } });
    const rows = screen.getAllByTestId('log-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('upstream timeout');
  });

  it('an invalid filter surfaces a log.filter.invalid diagnostic and falls back to the document', () => {
    render(<LogsApp initialInput={SAMPLE} />);
    // A since value that is not a parseable timestamp fails closed.
    fireEvent.change(screen.getByTestId('log-filter-since'), { target: { value: 'not-a-date' } });
    expect(screen.getByText(/log\.filter\.invalid/)).toBeInTheDocument();
    // The table still renders all entries (no result artifact produced).
    expect(screen.getAllByTestId('log-row')).toHaveLength(4);
  });

  it('copy line and copy message are disabled until a row is selected', () => {
    render(<LogsApp initialInput={SAMPLE} />);
    expect(screen.getByTestId('logs-copy-line')).toBeDisabled();
    expect(screen.getByTestId('logs-copy-message')).toBeDisabled();
  });

  it('selecting a row enables copy and sets the active line', () => {
    render(<LogsApp initialInput={SAMPLE} />);
    fireEvent.click(screen.getByText('upstream timeout').closest('tr')!);
    expect(screen.getByTestId('logs-copy-line')).not.toBeDisabled();
    expect(screen.getByTestId('logs-copy-message')).not.toBeDisabled();
    expect(screen.getByTestId('logs-active-line').textContent).toContain('3');
  });

  it('copy line writes the raw entry text via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <LogsApp
        initialInput={SAMPLE}
        initialUiState={{ activeLine: 3 }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('logs-copy-line'));
    await waitFor(() => expect(writes).toEqual(['level=error msg="upstream timeout" svc=db']));
    const status = await screen.findByTestId('logs-copy-status');
    expect(status).toHaveAttribute('data-kind', 'line');
  });

  it('copy message writes only the parsed message via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <LogsApp
        initialInput={SAMPLE}
        initialUiState={{ activeLine: 3 }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('logs-copy-message'));
    await waitFor(() => expect(writes).toEqual(['upstream timeout']));
    const status = await screen.findByTestId('logs-copy-status');
    expect(status).toHaveAttribute('data-kind', 'message');
  });

  it('copy falls back to execCommand when the clipboard API rejects', async () => {
    const apiWrite = vi.fn(async () => {
      throw new Error('permission denied');
    });
    const fallbackWrite = vi.fn(() => true);
    render(
      <LogsApp
        initialInput={SAMPLE}
        initialUiState={{ activeLine: 1 }}
        clipboardDeps={{ apiWrite, fallbackWrite }}
      />,
    );
    fireEvent.click(screen.getByTestId('logs-copy-message'));
    const status = await screen.findByTestId('logs-copy-status');
    expect(status).toHaveAttribute('data-method', 'execCommand');
    expect(fallbackWrite).toHaveBeenCalledWith('service started');
  });

  it('honors initialUiState.viewMode "summary" on first render', () => {
    render(<LogsApp initialInput={SAMPLE} initialUiState={{ viewMode: 'summary' }} />);
    expect(screen.getByRole('region', { name: /NekoLogs summary view/i })).toBeInTheDocument();
  });

  it('surfaces parser diagnostics (mixed formats) in the diagnostics panel', () => {
    render(<LogsApp initialInput={SAMPLE} />);
    expect(screen.getByText(/log\.mixed_formats/)).toBeInTheDocument();
  });

  it('a levelIn filter narrows entries to the selected level through the engine', () => {
    render(<LogsApp initialInput={SAMPLE} />);
    fireEvent.click(screen.getByTestId('log-filter-levelin-error'));
    const rows = screen.getAllByTestId('log-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('upstream timeout');
    expect(screen.getByTestId('logs-matched-count').textContent).toMatch(/matched\s*1\s*of\s*4/i);
  });

  it('a multi-level levelIn filter keeps every selected level (warn + error)', () => {
    render(<LogsApp initialInput={SAMPLE} />);
    fireEvent.click(screen.getByTestId('log-filter-levelin-warn'));
    fireEvent.click(screen.getByTestId('log-filter-levelin-error'));
    const rows = screen.getAllByTestId('log-row');
    expect(rows).toHaveLength(2);
    expect(screen.getByTestId('logs-matched-count').textContent).toMatch(/matched\s*2\s*of\s*4/i);
  });

  it('locks the incident Pro view when free (no Pro output rendered)', () => {
    render(<LogsApp initialInput={SAMPLE} initialUiState={{ viewMode: 'incident' }} />);
    expect(screen.getByTestId('logs-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('logs-pro-output')).not.toBeInTheDocument();
  });

  it('locks the histogram and clusters Pro views when free', () => {
    const { rerender } = render(
      <LogsApp initialInput={SAMPLE} initialUiState={{ viewMode: 'histogram' }} />,
    );
    expect(screen.getByTestId('logs-locked')).toBeInTheDocument();
    rerender(<LogsApp initialInput={SAMPLE} initialUiState={{ viewMode: 'clusters' }} />);
    expect(screen.getByTestId('logs-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('logs-pro-output')).not.toBeInTheDocument();
  });

  it('unlocks the incident report under a Pro entitlement', () => {
    render(
      <LogsApp initialInput={SAMPLE} initialUiState={{ viewMode: 'incident' }} entitlement={PRO} />,
    );
    expect(screen.queryByTestId('logs-locked')).not.toBeInTheDocument();
    const out = screen.getByTestId('logs-pro-output').textContent ?? '';
    expect(out).toContain('# NekoLogs incident report');
    expect(out).toContain('severity:');
  });

  it('unlocks the histogram SVG under a Pro entitlement', () => {
    render(
      <LogsApp initialInput={SAMPLE} initialUiState={{ viewMode: 'histogram' }} entitlement={PRO} />,
    );
    const out = screen.getByTestId('logs-pro-output').textContent ?? '';
    expect(out).toContain('<svg');
    expect(out).toContain('</svg>');
  });

  it('unlocks message clusters and collapses repeated lines to a template under Pro', () => {
    render(
      <LogsApp
        initialInput={CLUSTER_SAMPLE}
        initialUiState={{ viewMode: 'clusters' }}
        entitlement={PRO}
      />,
    );
    const out = screen.getByTestId('logs-pro-output').textContent ?? '';
    expect(out).toContain('# NekoLogs message clusters');
    expect(out).toContain('db timeout id=<num>');
  });
});
