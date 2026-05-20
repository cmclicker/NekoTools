import { describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from '../clipboard.js';

describe('copyToClipboard', () => {
  it('uses the clipboard-api path when apiWrite resolves', async () => {
    const apiWrite = vi.fn(async () => undefined);
    const fallbackWrite = vi.fn(() => true);
    const result = await copyToClipboard('hello', { apiWrite, fallbackWrite });
    expect(result).toEqual({ ok: true, method: 'clipboard-api' });
    expect(apiWrite).toHaveBeenCalledWith('hello');
    expect(fallbackWrite).not.toHaveBeenCalled();
  });

  it('falls back to execCommand when apiWrite rejects', async () => {
    const apiWrite = vi.fn(async () => {
      throw new Error('permission denied');
    });
    const fallbackWrite = vi.fn(() => true);
    const result = await copyToClipboard('hello', { apiWrite, fallbackWrite });
    expect(result).toEqual({ ok: true, method: 'execCommand' });
    expect(fallbackWrite).toHaveBeenCalledWith('hello');
  });

  it('skips the api when apiWrite is not provided and goes straight to fallback', async () => {
    const fallbackWrite = vi.fn(() => true);
    const result = await copyToClipboard('hello', { fallbackWrite });
    expect(result.ok).toBe(true);
    expect(result.method).toBe('execCommand');
  });

  it('returns ok=false with a reason when both paths fail', async () => {
    const apiWrite = vi.fn(async () => {
      throw new Error('nope');
    });
    const fallbackWrite = vi.fn(() => false);
    const result = await copyToClipboard('hello', { apiWrite, fallbackWrite });
    expect(result.ok).toBe(false);
    expect(result.method).toBe('none');
    expect(result.reason).toBeDefined();
  });

  it('treats a fallback throw as a non-throwing failure', async () => {
    const apiWrite = vi.fn(async () => {
      throw new Error('nope');
    });
    const fallbackWrite = vi.fn(() => {
      throw new Error('dom blew up');
    });
    const result = await copyToClipboard('hello', { apiWrite, fallbackWrite });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/dom blew up/);
  });

  it('never throws when no deps are supplied (auto-detects browser paths)', async () => {
    // Under jsdom, navigator.clipboard is undefined, so the default
    // api detector returns undefined; the default fallback uses
    // document.createElement + execCommand. jsdom's execCommand
    // isn't really implemented, so this exercises both branches and
    // expects the function to return a result (never throw).
    const result = await copyToClipboard('x');
    expect(result.method === 'execCommand' || result.method === 'none').toBe(true);
  });
});
