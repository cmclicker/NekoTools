import type { CodecTransform } from './kinds.js';

/**
 * NekoCodec Pro code generation. Backs the declared Pro exporters
 * `codec.export.batch.report` (pro entitlement `batch.transform`) and
 * `codec.export.recipe.bundle` (pro entitlements `recipes.saved` /
 * `chain.transforms`).
 *
 * Both are pure, deterministic functions of the already-parsed
 * `codec.transform` artifact(s) — no network, no clock, no premium-engine
 * dependency, no signing/compression/hashing (those are explicitly out of
 * scope). They only read the real fields a transform carries: `operation`,
 * `codec`, `input`, `output`, `ok`, `inputBytes`, `outputBytes`,
 * `looksBinary`.
 *
 * "Batch" means both generators handle ALL parsed transforms in the input
 * (today the slice produces one per run, but the report/recipe iterate the
 * full list so a future multi-transform input needs no change). An empty
 * list yields a stable, header-only result rather than throwing.
 */

// --- Batch report (markdown) -----------------------------------------------

/**
 * A Markdown report over the parsed codec transform(s): one row per transform
 * showing operation, codec, byte sizes, ok, and binary-looking, plus a roll-up
 * of how many succeeded / failed / looked binary and the total bytes moved.
 * Pure: it reports the transforms exactly as parsed and applies nothing new.
 */
export function toBatchReport(transforms: readonly CodecTransform[]): string {
  const lines: string[] = ['# NekoCodec batch report', ''];

  if (transforms.length === 0) {
    lines.push('- transforms: 0', '', '(no transforms)', '');
    return lines.join('\n');
  }

  const total = transforms.length;
  const okCount = transforms.filter((t) => t.ok).length;
  const failedCount = total - okCount;
  const binaryCount = transforms.filter((t) => t.looksBinary).length;
  const inputBytesTotal = transforms.reduce((sum, t) => sum + t.inputBytes, 0);
  const outputBytesTotal = transforms.reduce((sum, t) => sum + t.outputBytes, 0);

  lines.push(
    '## Summary',
    '',
    `- transforms: ${total}`,
    `- succeeded: ${okCount}`,
    `- failed: ${failedCount}`,
    `- binary-looking: ${binaryCount}`,
    `- input bytes (total): ${inputBytesTotal}`,
    `- output bytes (total): ${outputBytesTotal}`,
    '',
    '## Transforms',
    '',
    '| # | operation | codec | input bytes | output bytes | status | binary-looking |',
    '| - | --------- | ----- | ----------- | ------------ | ------ | -------------- |',
  );

  transforms.forEach((t, index) => {
    lines.push(
      `| ${index + 1} | ${t.operation} | ${t.codec} | ${t.inputBytes} | ${t.outputBytes} | ${
        t.ok ? 'ok' : 'failed'
      } | ${t.looksBinary ? 'yes' : 'no'} |`,
    );
  });

  lines.push('');
  return lines.join('\n');
}

// --- Recipe bundle (json) --------------------------------------------------

/** One declarative transform step in a recipe. */
export interface RecipeStep {
  readonly operation: CodecTransform['operation'];
  readonly codec: CodecTransform['codec'];
}

/**
 * A declarative, reusable transform recipe. It DESCRIBES the parsed
 * operation(s)+codec(s) as a saved spec that could be re-applied later; it
 * does not transform anything itself and carries no signature (this is NOT
 * `bundle.signed`).
 */
export interface CodecRecipe {
  readonly tool: 'codec';
  readonly version: 1;
  readonly steps: readonly RecipeStep[];
}

/**
 * Build a declarative recipe from the parsed transform(s): each transform
 * contributes one `{ operation, codec }` step, in parse order. Pure and
 * deterministic — no input/output payload is embedded, only the reusable
 * transform spec. An empty list yields a recipe with no steps.
 */
export function toRecipeBundle(transforms: readonly CodecTransform[]): CodecRecipe {
  return {
    tool: 'codec',
    version: 1,
    steps: transforms.map((t) => ({ operation: t.operation, codec: t.codec })),
  };
}
