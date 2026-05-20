import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import artifactSchema from '../schemas/artifact.schema.json' with { type: 'json' };
import parserSchema from '../schemas/parser.schema.json' with { type: 'json' };
import diagnosticSchema from '../schemas/diagnostic.schema.json' with { type: 'json' };
import exportSchema from '../schemas/export.schema.json' with { type: 'json' };
import workspaceSchema from '../schemas/workspace.schema.json' with { type: 'json' };
import graphSchema from '../schemas/graph.schema.json' with { type: 'json' };
import toolManifestSchema from '../schemas/tool-manifest.schema.json' with { type: 'json' };
import entitlementSchema from '../schemas/entitlement.schema.json' with { type: 'json' };
import offlinePolicySchema from '../schemas/offline-policy.schema.json' with { type: 'json' };

export const schemas = {
  artifact: artifactSchema,
  parser: parserSchema,
  diagnostic: diagnosticSchema,
  export: exportSchema,
  workspace: workspaceSchema,
  graph: graphSchema,
  toolManifest: toolManifestSchema,
  entitlement: entitlementSchema,
  offlinePolicy: offlinePolicySchema,
} as const;

export type SchemaName = keyof typeof schemas;

/**
 * Creates an Ajv instance pre-loaded with every NekoTools schema. The
 * schemas reference each other by $id, so they must all be added before
 * the first compile.
 */
export function createValidator(): Ajv2020 {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  for (const schema of Object.values(schemas)) {
    ajv.addSchema(schema as object);
  }
  return ajv;
}

export function validate(name: SchemaName, value: unknown): ValidationResult {
  const ajv = createValidator();
  const validator = ajv.getSchema(
    (schemas[name] as { $id: string }).$id,
  );
  if (!validator) {
    throw new Error(`schema not registered: ${name}`);
  }
  const ok = validator(value) as boolean;
  return {
    ok,
    errors: ok ? [] : (validator.errors ?? []).map((e) => `${e.instancePath} ${e.message ?? ''}`),
  };
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}
