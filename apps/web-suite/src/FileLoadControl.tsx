import { useCallback, type ChangeEvent } from 'react';

import { readLocalTextFile, type FileLoadDeps } from './file-load.js';

/**
 * Shared "Load a local file" control — the file-input analog of the suite's
 * copy buttons. Renders a labeled `<input type="file">` and, on selection,
 * reads the file's text locally (never uploaded) via `readLocalTextFile`,
 * handing the content to `onText`. Tools drop this next to their textarea to
 * satisfy the tool-standard §4 "Input: paste OR local file" convention without
 * re-implementing FileReader wiring.
 */

export interface FileLoadControlProps {
  /** Called with the file's text + name when a local file loads successfully. */
  readonly onText: (text: string, fileName: string) => void;
  /** Called with a reason when the local read fails. Optional. */
  readonly onError?: (reason: string) => void;
  /** Visible label text. Defaults to "Load a local file". */
  readonly label?: string;
  /** `accept` attribute for the file input (e.g. ".json,.txt"). Optional. */
  readonly accept?: string;
  /** Stable test id for the `<input>`; the wrapping `<label>` gets `${testId}-label`. */
  readonly testId?: string;
  /** `aria-label` for the `<input>`. Defaults to the label text. */
  readonly ariaLabel?: string;
  /** className on the wrapping `<label>`. Defaults to `file-load`. */
  readonly className?: string;
  /** Injectable read deps for tests. */
  readonly deps?: FileLoadDeps;
}

export function FileLoadControl({
  onText,
  onError,
  label = 'Load a local file',
  accept,
  testId,
  ariaLabel,
  className,
  deps,
}: FileLoadControlProps): JSX.Element {
  const handleChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ''; // allow re-selecting the same file
      if (file === undefined) return;
      const result = await readLocalTextFile(file, deps);
      if (result.ok && result.text !== undefined) {
        onText(result.text, result.name ?? file.name);
      } else if (onError) {
        onError(result.reason ?? 'file read failed');
      }
    },
    [onText, onError, deps],
  );

  return (
    <label
      className={className ?? 'file-load'}
      {...(testId !== undefined ? { 'data-testid': `${testId}-label` } : {})}
    >
      <span>{label}</span>
      <input
        type="file"
        onChange={handleChange}
        aria-label={ariaLabel ?? label}
        {...(accept !== undefined ? { accept } : {})}
        {...(testId !== undefined ? { 'data-testid': testId } : {})}
      />
    </label>
  );
}
