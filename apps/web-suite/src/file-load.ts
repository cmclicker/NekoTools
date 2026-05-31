/**
 * Shared local-file **text** loader — the file-input analog of clipboard.ts.
 *
 * Strict offline behavior: the file is read locally (via `Blob.text()`, or a
 * `FileReader` fallback for older webviews, or an injected reader in tests) and
 * is NEVER uploaded. The helper never throws; it returns a discriminated result
 * so the UI can surface a per-load status.
 *
 * This backs the tool-standard §4 "Input: paste OR local file" convention, so
 * every tool gets the same proven read-locally-only behavior NekoSecrets
 * established inline — without each tab duplicating FileReader wiring.
 *
 * Note: this is the **text** path (load file content into a paste area).
 * Tools that need a file's raw *bytes* (e.g. NekoHash hashing a binary file)
 * read `File.arrayBuffer()` directly — that is a different concern and is not
 * served by this helper.
 */

export interface FileLoadResult {
  readonly ok: boolean;
  /** The file's text content. Present only when `ok`. */
  readonly text?: string;
  /** The selected file's name. Present only when `ok`. */
  readonly name?: string;
  /** Human-readable failure reason. Present only when `!ok`. */
  readonly reason?: string;
}

export interface FileLoadDeps {
  /**
   * Override the local text read. Defaults to a `Blob.text()` / `FileReader`
   * wrapper. Tests inject this to exercise success/failure deterministically
   * without a real browser File.
   */
  readonly readText?: (file: File) => Promise<string>;
}

/** Read `file` as text locally. Never throws; returns a discriminated result. */
export async function readLocalTextFile(
  file: File,
  deps: FileLoadDeps = {},
): Promise<FileLoadResult> {
  const readText = deps.readText ?? defaultReadText;
  try {
    const text = await readText(file);
    return { ok: true, text, name: file.name };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, reason };
  }
}

function defaultReadText(file: File): Promise<string> {
  // Prefer the modern, Promise-based `Blob.text()` (jsdom + modern browsers).
  if (typeof file.text === 'function') {
    return file.text();
  }
  // Fallback for older webviews (some Tauri contexts) without `Blob.text()`.
  return new Promise<string>((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new Error('no local file reader available'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('file did not read as text'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('file read failed'));
    reader.readAsText(file); // local read only — never uploaded
  });
}
