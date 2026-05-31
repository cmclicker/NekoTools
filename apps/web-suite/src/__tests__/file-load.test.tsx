import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { readLocalTextFile } from '../file-load.js';
import { FileLoadControl } from '../FileLoadControl.js';

describe('readLocalTextFile', () => {
  it('returns the text + name on a successful local read', async () => {
    const file = new File(['hello world'], 'note.txt', { type: 'text/plain' });
    const r = await readLocalTextFile(file, { readText: async () => 'hello world' });
    expect(r).toEqual({ ok: true, text: 'hello world', name: 'note.txt' });
  });

  it('reads a real File via the default reader (Blob.text)', async () => {
    const file = new File(['{"a":1}'], 'data.json', { type: 'application/json' });
    const r = await readLocalTextFile(file);
    expect(r.ok).toBe(true);
    expect(r.text).toBe('{"a":1}');
    expect(r.name).toBe('data.json');
  });

  it('never throws — a failing read becomes a discriminated error result', async () => {
    const file = new File(['x'], 'bad.bin');
    const r = await readLocalTextFile(file, {
      readText: async () => {
        throw new Error('boom');
      },
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('boom');
    expect(r.text).toBeUndefined();
  });
});

describe('FileLoadControl', () => {
  it('renders a labeled file input with the given test id + aria-label', () => {
    render(<FileLoadControl onText={() => {}} testId="x-file" label="Load a file" />);
    const input = screen.getByTestId('x-file');
    expect(input).toBeInTheDocument();
    expect(input.getAttribute('aria-label')).toBe('Load a file');
    expect(screen.getByTestId('x-file-label')).toBeInTheDocument();
  });

  it('reads a selected file locally and hands the text to onText', async () => {
    const onText = vi.fn();
    render(<FileLoadControl onText={onText} testId="x-file" />);
    const file = new File(['line one\nline two'], 'doc.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByTestId('x-file'), { target: { files: [file] } });
    await waitFor(() => expect(onText).toHaveBeenCalledWith('line one\nline two', 'doc.txt'));
  });

  it('surfaces a read failure via onError without throwing', async () => {
    const onText = vi.fn();
    const onError = vi.fn();
    render(
      <FileLoadControl
        onText={onText}
        onError={onError}
        testId="x-file"
        deps={{
          readText: async () => {
            throw new Error('read failed');
          },
        }}
      />,
    );
    const file = new File(['x'], 'bad.bin');
    fireEvent.change(screen.getByTestId('x-file'), { target: { files: [file] } });
    await waitFor(() => expect(onError).toHaveBeenCalledWith('read failed'));
    expect(onText).not.toHaveBeenCalled();
  });

  it('clears the input value so the same file can be re-selected', async () => {
    const onText = vi.fn();
    render(<FileLoadControl onText={onText} testId="x-file" />);
    const input = screen.getByTestId('x-file') as HTMLInputElement;
    const file = new File(['data'], 'a.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onText).toHaveBeenCalled());
    expect(input.value).toBe('');
  });
});
