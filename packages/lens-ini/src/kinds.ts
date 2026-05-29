import type { Artifact } from '@nekotools/contracts';

/**
 * NekoINI artifact kinds (namespaced under `ini.*`).
 *
 *   `ini.parsed` — an INI / `.properties` / `.editorconfig` document
 *                  decoded into ordered sections + entries and a nested
 *                  data object (global keys at the top level, sections as
 *                  sub-objects). Values are kept as raw strings — INI has
 *                  no types. Pure string parsing; no network.
 */
export const INI_KIND_PARSED = 'ini.parsed';

export const ALL_INI_KINDS = [INI_KIND_PARSED] as const;

export interface IniEntry {
  readonly key: string;
  readonly value: string;
}

export interface IniSection {
  /** Section name; the empty string `""` is the global (pre-section) section. */
  readonly name: string;
  readonly entries: readonly IniEntry[];
}

/** The parsed body of an `ini.parsed` artifact. */
export interface ParsedIni {
  readonly valid: boolean;
  readonly sections: readonly IniSection[];
  /** Nested object: global keys at the top, named sections as sub-objects. */
  readonly data: Readonly<Record<string, unknown>>;
  readonly sectionCount: number;
  readonly keyCount: number;
}

export type IniParsedArtifact = Artifact<'ini.parsed', ParsedIni>;
export type IniArtifact = IniParsedArtifact;

export const INI_PARSED_EXPORT_KINDS = [INI_KIND_PARSED] as const;

/** The name used for the implicit global (pre-section) section. */
export const GLOBAL_SECTION = '';
