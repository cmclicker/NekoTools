import type { ToolManifest } from '@nekotools/contracts';
import { jsonManifest } from '@nekotools/lens-json';
import { envManifest } from '@nekotools/lens-env';
import { logsManifest } from '@nekotools/lens-logs';
import { yamlManifest } from '@nekotools/lens-yaml';
import { jwtManifest } from '@nekotools/lens-jwt';
import { urlManifest } from '@nekotools/lens-url';
import { headersManifest } from '@nekotools/lens-headers';
import { codecManifest } from '@nekotools/lens-codec';
import { hashManifest } from '@nekotools/lens-hash';
import { timeManifest } from '@nekotools/lens-time';
import { regexManifest } from '@nekotools/lens-regex';
import { diffManifest } from '@nekotools/lens-diff';
import { packageManifest } from '@nekotools/lens-package';
import { binaryManifest } from '@nekotools/lens-binary';
import { csvManifest } from '@nekotools/lens-csv';
import { tomlManifest } from '@nekotools/lens-toml';
import { xmlManifest } from '@nekotools/lens-xml';
import { cookiesManifest } from '@nekotools/lens-cookies';
import { secretsManifest } from '@nekotools/lens-secrets';
import { cronManifest } from '@nekotools/lens-cron';
import { uuidManifest } from '@nekotools/lens-uuid';
import { semverManifest } from '@nekotools/lens-semver';
import { ndjsonManifest } from '@nekotools/lens-ndjson';
import { iniManifest } from '@nekotools/lens-ini';
import { passwordManifest } from '@nekotools/lens-password';
import { colorManifest } from '@nekotools/lens-color';
import { gitignoreManifest } from '@nekotools/lens-gitignore';
import { mimeManifest } from '@nekotools/lens-mime';
import { durationManifest } from '@nekotools/lens-duration';
import { caseManifest } from '@nekotools/lens-case';
import { sortManifest } from '@nekotools/lens-sort';
import { unicodeManifest } from '@nekotools/lens-unicode';

/**
 * The unified workbench tool registry.
 *
 * The shell renders the tab strip and the Free / Pro entitlement surface
 * from this list, so adding a tool to those surfaces is a one-line
 * registration here. (Each tool still mounts its own panel in `App.tsx`,
 * because the sub-apps have bespoke props / test seams; new tools add a
 * `TOOLS` entry plus their panel together.)
 */
export type ActiveTool =
  | 'json'
  | 'env'
  | 'logs'
  | 'yaml'
  | 'jwt'
  | 'url'
  | 'headers'
  | 'codec'
  | 'hash'
  | 'time'
  | 'regex'
  | 'diff'
  | 'package'
  | 'binary'
  | 'csv'
  | 'toml'
  | 'xml'
  | 'cookies'
  | 'secrets'
  | 'cron'
  | 'uuid'
  | 'semver'
  | 'ndjson'
  | 'ini'
  | 'password'
  | 'color'
  | 'gitignore'
  | 'mime'
  | 'duration'
  | 'case'
  | 'sort'
  | 'unicode';

export type ToolCategoryId = 'data' | 'web' | 'text' | 'project' | 'utility' | 'security';

export interface ToolCategory {
  readonly id: ToolCategoryId;
  readonly label: string;
}

export interface ToolDescriptor {
  readonly id: ActiveTool;
  readonly label: string;
  readonly category: ToolCategoryId;
  readonly manifest: ToolManifest;
}

export const TOOL_CATEGORIES: readonly ToolCategory[] = [
  { id: 'data', label: 'Data' },
  { id: 'web', label: 'Web' },
  { id: 'text', label: 'Text' },
  { id: 'project', label: 'Project' },
  { id: 'utility', label: 'Utility' },
  { id: 'security', label: 'Security' },
];

export const TOOLS: readonly ToolDescriptor[] = [
  { id: 'json', label: 'NekoJSON', category: 'data', manifest: jsonManifest },
  { id: 'env', label: 'NekoEnv', category: 'data', manifest: envManifest },
  { id: 'logs', label: 'NekoLogs', category: 'data', manifest: logsManifest },
  { id: 'yaml', label: 'NekoYAML', category: 'data', manifest: yamlManifest },
  { id: 'csv', label: 'NekoCSV', category: 'data', manifest: csvManifest },
  { id: 'ndjson', label: 'NekoNDJSON', category: 'data', manifest: ndjsonManifest },
  { id: 'toml', label: 'NekoTOML', category: 'data', manifest: tomlManifest },
  { id: 'xml', label: 'NekoXML', category: 'data', manifest: xmlManifest },
  { id: 'ini', label: 'NekoINI', category: 'data', manifest: iniManifest },
  { id: 'jwt', label: 'NekoJWT', category: 'web', manifest: jwtManifest },
  { id: 'url', label: 'NekoURL', category: 'web', manifest: urlManifest },
  { id: 'headers', label: 'NekoHeaders', category: 'web', manifest: headersManifest },
  { id: 'cookies', label: 'NekoCookies', category: 'web', manifest: cookiesManifest },
  { id: 'mime', label: 'NekoMIME', category: 'web', manifest: mimeManifest },
  { id: 'codec', label: 'NekoCodec', category: 'text', manifest: codecManifest },
  { id: 'regex', label: 'NekoRegex', category: 'text', manifest: regexManifest },
  { id: 'diff', label: 'NekoDiff', category: 'text', manifest: diffManifest },
  { id: 'case', label: 'NekoCase', category: 'text', manifest: caseManifest },
  { id: 'sort', label: 'NekoSort', category: 'text', manifest: sortManifest },
  { id: 'package', label: 'NekoPackage', category: 'project', manifest: packageManifest },
  { id: 'gitignore', label: 'NekoGitignore', category: 'project', manifest: gitignoreManifest },
  { id: 'binary', label: 'NekoBinary', category: 'utility', manifest: binaryManifest },
  { id: 'hash', label: 'NekoHash', category: 'utility', manifest: hashManifest },
  { id: 'time', label: 'NekoTime', category: 'utility', manifest: timeManifest },
  { id: 'cron', label: 'NekoCron', category: 'utility', manifest: cronManifest },
  { id: 'uuid', label: 'NekoUUID', category: 'utility', manifest: uuidManifest },
  { id: 'semver', label: 'NekoSemver', category: 'utility', manifest: semverManifest },
  { id: 'color', label: 'NekoColor', category: 'utility', manifest: colorManifest },
  { id: 'unicode', label: 'NekoUnicode', category: 'utility', manifest: unicodeManifest },
  { id: 'duration', label: 'NekoDuration', category: 'utility', manifest: durationManifest },
  { id: 'secrets', label: 'NekoSecrets', category: 'security', manifest: secretsManifest },
  { id: 'password', label: 'NekoPassword', category: 'security', manifest: passwordManifest },
];

export function toolsByCategory(category: ToolCategoryId): readonly ToolDescriptor[] {
  return TOOLS.filter((tool) => tool.category === category);
}

export function toolById(id: ActiveTool): ToolDescriptor {
  const found = TOOLS.find((tool) => tool.id === id);
  if (found === undefined) {
    throw new Error(`unknown tool id: ${id}`);
  }
  return found;
}
