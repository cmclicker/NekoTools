import { describe, expect, it } from 'vitest';
import { schemas, validate, type SchemaName } from '../index.js';
import { fixtures } from './fixtures.js';

const names = Object.keys(schemas) as SchemaName[];

describe('schemas: every contract has a schema', () => {
  it('exposes nine schemas', () => {
    expect(names.length).toBe(9);
  });

  for (const name of names) {
    it(`schema "${name}" declares version: const 1`, () => {
      const schema = schemas[name] as { properties: { version: { const: number } } };
      expect(schema.properties.version.const).toBe(1);
    });
  }
});

describe('schemas: fixture validation', () => {
  for (const name of names) {
    const set = fixtures[name];

    it(`"${name}" has at least one valid and one invalid fixture`, () => {
      expect(set.valid.length).toBeGreaterThan(0);
      expect(set.invalid.length).toBeGreaterThan(0);
    });

    for (const [i, sample] of set.valid.entries()) {
      it(`"${name}" valid[${i}] passes`, () => {
        const result = validate(name, sample);
        expect(result.ok, result.errors.join('; ')).toBe(true);
      });
    }

    for (const [i, sample] of set.invalid.entries()) {
      it(`"${name}" invalid[${i}] fails`, () => {
        const result = validate(name, sample);
        expect(result.ok).toBe(false);
      });
    }
  }
});
