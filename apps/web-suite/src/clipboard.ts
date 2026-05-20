/**
 * Phase 1.1h local-clipboard helper.
 *
 * Strict offline behavior: no `fetch`, no network helper, no
 * third-party clipboard library. The helper tries the local
 * Clipboard API first and falls back to a hidden `<textarea>` +
 * `document.execCommand('copy')` if the API is unavailable (older
 * browsers, insecure contexts, Tauri webviews that don't expose
 * `navigator.clipboard`, etc.).
 *
 * The function never throws. It returns a discriminated result so
 * the UI can surface a per-call status. Tests inject `apiWrite` and
 * `fallbackWrite` to exercise both paths without a real browser.
 */

export type CopyMethod = 'clipboard-api' | 'execCommand' | 'none';

export interface CopyResult {
  readonly ok: boolean;
  readonly method: CopyMethod;
  /** Present only when `ok: false`. Human-readable reason for status text. */
  readonly reason?: string;
}

export interface ClipboardDeps {
  /** Override for `navigator.clipboard.writeText`. Defaults to the real one when present. */
  readonly apiWrite?: (text: string) => Promise<void>;
  /** Override for the DOM fallback. Returns true on success. */
  readonly fallbackWrite?: (text: string) => boolean;
}

export async function copyToClipboard(
  text: string,
  deps: ClipboardDeps = {},
): Promise<CopyResult> {
  const apiWrite = deps.apiWrite ?? defaultApiWrite();
  if (apiWrite) {
    try {
      await apiWrite(text);
      return { ok: true, method: 'clipboard-api' };
    } catch (err) {
      // Fall through to the DOM fallback below. We do not surface
      // the API error here — the user typically just wants the text
      // copied; if the fallback also fails, that's the message they
      // see.
      void err;
    }
  }

  const fallbackWrite = deps.fallbackWrite ?? defaultFallbackWrite;
  try {
    const ok = fallbackWrite(text);
    if (ok) return { ok: true, method: 'execCommand' };
    return { ok: false, method: 'none', reason: 'fallback copy failed' };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, method: 'none', reason };
  }
}

function defaultApiWrite(): ((text: string) => Promise<void>) | undefined {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    return (text: string) => navigator.clipboard.writeText(text);
  }
  return undefined;
}

function defaultFallbackWrite(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  // Off-screen but still focusable — required for execCommand('copy').
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    // `document.execCommand('copy')` is the documented fallback for
    // browsers without `navigator.clipboard`. It's deprecated in
    // modern specs but still widely supported; we use it only when
    // the primary API is unavailable.
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  } finally {
    document.body.removeChild(textarea);
  }
  return ok;
}
