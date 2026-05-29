import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import {
  DEFAULT_LARGE_DOCUMENT_BYTES,
  PACKAGE_DIAGNOSTIC_CODES,
  makeDiagnostic,
} from './diagnostics.js';
import {
  PACKAGE_DEPENDENCY_SECTIONS,
  PACKAGE_KIND_MANIFEST,
  type PackageArtifact,
  type PackageDependency,
  type PackageDependencyCounts,
  type PackageDependencySection,
  type PackageDuplicateDependency,
  type PackageManifestArtifact,
  type PackageManifestDocument,
  type PackageScript,
  type PackageScriptRiskFlag,
} from './kinds.js';

const TOOL_ID = 'package';
const PARSER_ID = 'package.json';

const LIFECYCLE_SCRIPT_NAMES = new Set([
  'preinstall',
  'install',
  'postinstall',
  'prepare',
  'prepublish',
  'prepublishOnly',
]);

const NETWORK_SHELL_REGEX =
  /\b(?:curl|wget|iwr|invoke-webrequest)\b[\s\S]*\|\s*(?:sh|bash|zsh|pwsh|powershell)\b/i;
const DESTRUCTIVE_SCRIPT_REGEX = /\b(?:rm\s+-rf|rmdir\s+\/s|del\s+\/[sq])\b/i;
const REMOTE_DEPENDENCY_REGEX =
  /^(?:https?:|git\+|git:\/\/|ssh:\/\/|github:|gitlab:|bitbucket:)/i;

export interface PackageJsonParserDeps {
  readonly clock: Clock;
  readonly largeDocumentBytes?: number;
}

export function createPackageJsonParser(deps: PackageJsonParserDeps): Parser<PackageArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['json', 'package.json', 'text'],
    produces: [PACKAGE_KIND_MANIFEST],
    parse(input: ParserInput): ParserResult<PackageArtifact> {
      return parsePackageJson(input, deps);
    },
  };
}

function parsePackageJson(
  input: ParserInput,
  deps: PackageJsonParserDeps,
): ParserResult<PackageArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];

  const bytes = utf8ByteLength(input.raw);
  if (input.raw.trim() === '') {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', PACKAGE_DIAGNOSTIC_CODES.emptyInput, 'input is empty'),
    );
  }

  const threshold = deps.largeDocumentBytes ?? DEFAULT_LARGE_DOCUMENT_BYTES;
  if (bytes > threshold) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'info',
        PACKAGE_DIAGNOSTIC_CODES.largeDocument,
        `package.json is ${bytes} bytes; exceeds soft threshold of ${threshold} bytes`,
      ),
    );
  }

  let parsed: unknown;
  try {
    parsed = input.raw.trim() === '' ? {} : JSON.parse(input.raw);
  } catch (error) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'error',
        PACKAGE_DIAGNOSTIC_CODES.invalidJson,
        error instanceof Error ? error.message : 'package.json is not valid JSON',
      ),
    );
    return artifactResult(input, deps, artIds(), emptyDocument(false), diagnostics);
  }

  if (!isRecord(parsed) || Array.isArray(parsed)) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'error',
        PACKAGE_DIAGNOSTIC_CODES.notObject,
        'package.json root must be a JSON object',
      ),
    );
    return artifactResult(input, deps, artIds(), emptyDocument(false), diagnostics);
  }

  const document = documentFromPackage(parsed, diagnostics, diagIds);

  if (document.name === null) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'warning',
        PACKAGE_DIAGNOSTIC_CODES.missingName,
        'package.json does not declare a package name',
      ),
    );
  }
  if (document.version === null && document.private !== true) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'warning',
        PACKAGE_DIAGNOSTIC_CODES.missingVersion,
        'public package.json does not declare a version',
      ),
    );
  }

  for (const script of document.scripts) {
    if (script.riskFlags.includes('lifecycle')) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'warning',
          PACKAGE_DIAGNOSTIC_CODES.lifecycleScript,
          `script "${script.name}" runs as an npm lifecycle hook`,
        ),
      );
    }
    if (script.riskFlags.includes('network-shell')) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'warning',
          PACKAGE_DIAGNOSTIC_CODES.networkShellScript,
          `script "${script.name}" pipes downloaded content into a shell`,
        ),
      );
    }
    if (script.riskFlags.includes('destructive')) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'warning',
          PACKAGE_DIAGNOSTIC_CODES.destructiveScript,
          `script "${script.name}" contains a destructive file-removal command`,
        ),
      );
    }
  }

  for (const duplicate of document.duplicateDependencies) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'warning',
        PACKAGE_DIAGNOSTIC_CODES.duplicateDependency,
        `dependency "${duplicate.name}" appears in ${duplicate.sections.join(', ')}`,
      ),
    );
  }

  for (const dependency of document.dependencies) {
    if (dependency.remote) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'warning',
          PACKAGE_DIAGNOSTIC_CODES.remoteDependency,
          `dependency "${dependency.name}" uses a remote specifier in ${dependency.section}`,
        ),
      );
    }
    if (dependency.unpinned) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'info',
          PACKAGE_DIAGNOSTIC_CODES.unpinnedDependency,
          `dependency "${dependency.name}" is unpinned in ${dependency.section}`,
        ),
      );
    }
  }

  return artifactResult(input, deps, artIds(), document, diagnostics);
}

function artifactResult(
  input: ParserInput,
  deps: PackageJsonParserDeps,
  id: string,
  document: PackageManifestDocument,
  diagnostics: readonly Diagnostic[],
): ParserResult<PackageArtifact> {
  const artifact: PackageManifestArtifact = {
    version: 1,
    kind: PACKAGE_KIND_MANIFEST,
    id,
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt: deps.clock.now(),
    source: input.source,
    value: document,
  };
  return { artifacts: [artifact], diagnostics };
}

function documentFromPackage(
  packageJson: Readonly<Record<string, unknown>>,
  diagnostics: Diagnostic[],
  diagIds: () => string,
): PackageManifestDocument {
  const scripts = collectScripts(packageJson['scripts']);
  const dependencies = collectDependencies(packageJson, diagnostics, diagIds);
  const duplicateDependencies = findDuplicateDependencies(dependencies);
  const dependencyCounts = countDependencies(dependencies);

  return {
    valid: true,
    name: readString(packageJson, 'name'),
    version: readString(packageJson, 'version'),
    private: readBoolean(packageJson, 'private'),
    packageManager: readString(packageJson, 'packageManager'),
    type: readString(packageJson, 'type'),
    license: readString(packageJson, 'license'),
    scripts,
    dependencies,
    dependencyCounts,
    duplicateDependencies,
  };
}

function collectScripts(value: unknown): readonly PackageScript[] {
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([name, command]) => {
      const riskFlags: PackageScriptRiskFlag[] = [];
      if (LIFECYCLE_SCRIPT_NAMES.has(name)) riskFlags.push('lifecycle');
      if (NETWORK_SHELL_REGEX.test(command)) riskFlags.push('network-shell');
      if (DESTRUCTIVE_SCRIPT_REGEX.test(command)) riskFlags.push('destructive');
      return { name, command, lifecycle: LIFECYCLE_SCRIPT_NAMES.has(name), riskFlags };
    });
}

function collectDependencies(
  packageJson: Readonly<Record<string, unknown>>,
  diagnostics: Diagnostic[],
  diagIds: () => string,
): readonly PackageDependency[] {
  const dependencies: PackageDependency[] = [];
  for (const section of PACKAGE_DEPENDENCY_SECTIONS) {
    const value = packageJson[section];
    if (value === undefined) continue;
    if (!isRecord(value) || Array.isArray(value)) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'warning',
          PACKAGE_DIAGNOSTIC_CODES.invalidSection,
          `${section} must be an object of dependency name to version range`,
        ),
      );
      continue;
    }
    for (const [name, range] of Object.entries(value)) {
      if (typeof range !== 'string') continue;
      dependencies.push({
        name,
        range,
        section,
        remote: REMOTE_DEPENDENCY_REGEX.test(range),
        unpinned: isUnpinned(range),
      });
    }
  }
  return dependencies;
}

function findDuplicateDependencies(
  dependencies: readonly PackageDependency[],
): readonly PackageDuplicateDependency[] {
  const byName = new Map<string, Set<PackageDependencySection>>();
  for (const dep of dependencies) {
    const sections = byName.get(dep.name) ?? new Set<PackageDependencySection>();
    sections.add(dep.section);
    byName.set(dep.name, sections);
  }

  return [...byName.entries()]
    .filter(([, sections]) => sections.size > 1)
    .map(([name, sections]) => ({ name, sections: [...sections] }));
}

function countDependencies(dependencies: readonly PackageDependency[]): PackageDependencyCounts {
  const counts = {
    dependencies: 0,
    devDependencies: 0,
    peerDependencies: 0,
    optionalDependencies: 0,
  };
  for (const dep of dependencies) counts[dep.section] += 1;
  return { ...counts, total: dependencies.length };
}

function isUnpinned(range: string): boolean {
  const trimmed = range.trim().toLowerCase();
  return trimmed === '' || trimmed === '*' || trimmed === 'latest' || trimmed === 'next';
}

function readString(record: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function readBoolean(record: Readonly<Record<string, unknown>>, key: string): boolean | null {
  const value = record[key];
  return typeof value === 'boolean' ? value : null;
}

function emptyDocument(valid: boolean): PackageManifestDocument {
  return {
    valid,
    name: null,
    version: null,
    private: null,
    packageManager: null,
    type: null,
    license: null,
    scripts: [],
    dependencies: [],
    dependencyCounts: {
      dependencies: 0,
      devDependencies: 0,
      peerDependencies: 0,
      optionalDependencies: 0,
      total: 0,
    },
    duplicateDependencies: [],
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const SHARED_UTF8_ENCODER = new TextEncoder();
function utf8ByteLength(value: string): number {
  return SHARED_UTF8_ENCODER.encode(value).byteLength;
}
