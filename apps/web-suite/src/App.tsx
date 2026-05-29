import { useState, type ChangeEvent } from 'react';

import { EnvApp, type EnvAppProps } from './EnvApp.js';
import { JsonApp, type JsonAppProps } from './JsonApp.js';
import { LogsApp, type LogsAppProps } from './LogsApp.js';
import { YamlApp, type YamlAppProps } from './YamlApp.js';
import { JwtApp, type JwtAppProps } from './JwtApp.js';
import { UrlApp, type UrlAppProps } from './UrlApp.js';
import { HeadersApp, type HeadersAppProps } from './HeadersApp.js';
import { CodecApp, type CodecAppProps } from './CodecApp.js';
import { HashApp, type HashAppProps } from './HashApp.js';
import { TimeApp, type TimeAppProps } from './TimeApp.js';
import { RegexApp, type RegexAppProps } from './RegexApp.js';
import { DiffApp, type DiffAppProps } from './DiffApp.js';
import { PackageApp, type PackageAppProps } from './PackageApp.js';
import { BinaryApp, type BinaryAppProps } from './BinaryApp.js';
import { CsvApp, type CsvAppProps } from './CsvApp.js';
import { TomlApp, type TomlAppProps } from './TomlApp.js';
import { XmlApp, type XmlAppProps } from './XmlApp.js';
import { CookiesApp, type CookiesAppProps } from './CookiesApp.js';
import { SecretsApp, type SecretsAppProps } from './SecretsApp.js';
import { CronApp, type CronAppProps } from './CronApp.js';
import { UuidApp, type UuidAppProps } from './UuidApp.js';
import { SemverApp, type SemverAppProps } from './SemverApp.js';
import { NdjsonApp, type NdjsonAppProps } from './NdjsonApp.js';
import { IniApp, type IniAppProps } from './IniApp.js';
import { PasswordApp, type PasswordAppProps } from './PasswordApp.js';
import { ColorApp, type ColorAppProps } from './ColorApp.js';
import { GitignoreApp, type GitignoreAppProps } from './GitignoreApp.js';
import { MimeApp, type MimeAppProps } from './MimeApp.js';
import { DurationApp, type DurationAppProps } from './DurationApp.js';
import { CaseApp, type CaseAppProps } from './CaseApp.js';
import { SortApp, type SortAppProps } from './SortApp.js';
import { UnicodeApp, type UnicodeAppProps } from './UnicodeApp.js';
import { HexApp, type HexAppProps } from './HexApp.js';
import { CspApp, type CspAppProps } from './CspApp.js';
import { LicenseApp, type LicenseAppProps } from './LicenseApp.js';
import { ProSurface } from './ProSurface.js';
import { LicenseBadge } from './LicenseBadge.js';
import { LicenseProvider, type UseLicenseDeps } from './license-store.js';
import { TOOL_CATEGORIES, toolById, toolsByCategory, type ActiveTool } from './tools.js';

export type { NekoJsonUiState, ViewMode } from './JsonApp.js';
export type { EnvViewMode, NekoEnvUiState } from './EnvApp.js';
export type { LogViewMode, NekoLogsUiState } from './LogsApp.js';
export type { YamlViewMode, NekoYamlUiState } from './YamlApp.js';
export type { JwtViewMode, NekoJwtUiState } from './JwtApp.js';
export type { UrlViewMode, NekoUrlUiState } from './UrlApp.js';
export type { HeadersViewMode, NekoHeadersUiState } from './HeadersApp.js';
export type { NekoCodecUiState } from './CodecApp.js';
export type { HashSourceMode, NekoHashUiState } from './HashApp.js';
export type { DiffMode, NekoDiffUiState } from './DiffApp.js';
export type { NekoPackageUiState } from './PackageApp.js';
export type { NekoBinaryUiState } from './BinaryApp.js';
export type { NekoCsvUiState } from './CsvApp.js';
export type { TomlViewMode, NekoTomlUiState } from './TomlApp.js';
export type { XmlViewMode, NekoXmlUiState } from './XmlApp.js';
export type { CookiesViewMode, NekoCookiesUiState } from './CookiesApp.js';
export type { SecretsViewMode, NekoSecretsUiState } from './SecretsApp.js';
export type { CronViewMode, NekoCronUiState } from './CronApp.js';
export type { UuidViewMode, NekoUuidUiState } from './UuidApp.js';
export type { SemverViewMode, NekoSemverUiState } from './SemverApp.js';
export type { NdjsonViewMode, NekoNdjsonUiState } from './NdjsonApp.js';
export type { IniViewMode, NekoIniUiState } from './IniApp.js';
export type { PasswordViewMode, NekoPasswordUiState } from './PasswordApp.js';
export type { ColorViewMode, NekoColorUiState } from './ColorApp.js';
export type { GitignoreViewMode, NekoGitignoreUiState } from './GitignoreApp.js';
export type { MimeViewMode, NekoMimeUiState } from './MimeApp.js';
export type { DurationViewMode, NekoDurationUiState } from './DurationApp.js';
export type { CaseViewMode, NekoCaseUiState } from './CaseApp.js';
export type { SortViewMode, NekoSortUiState } from './SortApp.js';
export type { UnicodeViewMode, NekoUnicodeUiState } from './UnicodeApp.js';
export type { HexViewMode, NekoHexUiState } from './HexApp.js';
export type { CspViewMode, NekoCspUiState } from './CspApp.js';
export type { LicenseViewMode, NekoLicenseUiState } from './LicenseApp.js';
export type { ActiveTool } from './tools.js';

export interface AppProps extends JsonAppProps {
  /**
   * Which tool tab is mounted on first render. Defaults to `'json'` so
   * every Phase 1 App test continues to render the NekoJSON UI through
   * `<App>` unchanged.
   */
  readonly initialTool?: ActiveTool;
  /** Phase 2.2 — props forwarded to the NekoEnv sub-app. */
  readonly envApp?: EnvAppProps;
  /** Phase 2.x.2 — props forwarded to the NekoLogs sub-app. */
  readonly logsApp?: LogsAppProps;
  /** Wave 2 PR 2 — props forwarded to the NekoYAML sub-app. */
  readonly yamlApp?: YamlAppProps;
  /** Wave 3 PR 2 — props forwarded to the NekoJWT sub-app. */
  readonly jwtApp?: JwtAppProps;
  /** NekoURL slice — props forwarded to the NekoURL sub-app. */
  readonly urlApp?: UrlAppProps;
  /** NekoHeaders slice props forwarded to the NekoHeaders sub-app. */
  readonly headersApp?: HeadersAppProps;
  /** NekoCodec slice props forwarded to the NekoCodec sub-app. */
  readonly codecApp?: CodecAppProps;
  /** NekoHash slice props forwarded to the NekoHash sub-app. */
  readonly hashApp?: HashAppProps;
  /** NekoTime slice props forwarded to the NekoTime sub-app. */
  readonly timeApp?: TimeAppProps;
  /** NekoRegex slice props forwarded to the NekoRegex sub-app. */
  readonly regexApp?: RegexAppProps;
  /** NekoDiff slice props forwarded to the NekoDiff sub-app. */
  readonly diffApp?: DiffAppProps;
  /** NekoPackage slice props forwarded to the NekoPackage sub-app. */
  readonly packageApp?: PackageAppProps;
  /** NekoBinary slice props forwarded to the NekoBinary sub-app. */
  readonly binaryApp?: BinaryAppProps;
  /** NekoCSV slice props forwarded to the NekoCSV sub-app. */
  readonly csvApp?: CsvAppProps;
  /** NekoTOML slice props forwarded to the NekoTOML sub-app. */
  readonly tomlApp?: TomlAppProps;
  /** NekoXML slice props forwarded to the NekoXML sub-app. */
  readonly xmlApp?: XmlAppProps;
  /** NekoCookies slice props forwarded to the NekoCookies sub-app. */
  readonly cookiesApp?: CookiesAppProps;
  /** NekoSecrets slice props forwarded to the NekoSecrets sub-app. */
  readonly secretsApp?: SecretsAppProps;
  /** NekoCron slice props forwarded to the NekoCron sub-app. */
  readonly cronApp?: CronAppProps;
  /** NekoUUID slice props forwarded to the NekoUUID sub-app. */
  readonly uuidApp?: UuidAppProps;
  /** NekoSemver slice props forwarded to the NekoSemver sub-app. */
  readonly semverApp?: SemverAppProps;
  /** NekoNDJSON slice props forwarded to the NekoNDJSON sub-app. */
  readonly ndjsonApp?: NdjsonAppProps;
  /** NekoINI slice props forwarded to the NekoINI sub-app. */
  readonly iniApp?: IniAppProps;
  /** NekoPassword slice props forwarded to the NekoPassword sub-app. */
  readonly passwordApp?: PasswordAppProps;
  /** NekoColor slice props forwarded to the NekoColor sub-app. */
  readonly colorApp?: ColorAppProps;
  /** NekoGitignore slice props forwarded to the NekoGitignore sub-app. */
  readonly gitignoreApp?: GitignoreAppProps;
  /** NekoMIME slice props forwarded to the NekoMIME sub-app. */
  readonly mimeApp?: MimeAppProps;
  /** NekoDuration slice props forwarded to the NekoDuration sub-app. */
  readonly durationApp?: DurationAppProps;
  /** NekoCase slice props forwarded to the NekoCase sub-app. */
  readonly caseApp?: CaseAppProps;
  /** NekoSort slice props forwarded to the NekoSort sub-app. */
  readonly sortApp?: SortAppProps;
  /** NekoUnicode slice props forwarded to the NekoUnicode sub-app. */
  readonly unicodeApp?: UnicodeAppProps;
  /** NekoHex slice props forwarded to the NekoHex sub-app. */
  readonly hexApp?: HexAppProps;
  /** NekoCSP slice props forwarded to the NekoCSP sub-app. */
  readonly cspApp?: CspAppProps;
  /** NekoLicense slice props forwarded to the NekoLicense sub-app. */
  readonly licenseApp?: LicenseAppProps;
  /** Injected suite-license deps (storage / public key / verify) for tests. */
  readonly licenseDeps?: UseLicenseDeps;
}

/**
 * Unified web-suite shell.
 *
 * The tab strip and the Free / Pro entitlement surface (`ProSurface`) are
 * rendered from the `TOOLS` registry (`tools.ts`), so adding a tool to
 * those surfaces is a one-line registration. Each tool still mounts its
 * own panel below; switching tabs toggles which panel is visible but
 * **does not unmount the others** (`hidden`-toggled wrappers), so pasted
 * text, view mode, selection, search, and filter survive tab switches
 * (PR #14 audit blocker 1). New tools add a `TOOLS` entry plus a panel
 * here.
 *
 * The props shape stays backward-compatible with the Phase 1.1h `<App>`:
 * `initialInput`, `initialUiState`, and `clipboardDeps` are forwarded to
 * `JsonApp`, and the default `initialTool` is `'json'`.
 */
export function App({
  initialTool,
  envApp,
  logsApp,
  yamlApp,
  jwtApp,
  urlApp,
  headersApp,
  codecApp,
  hashApp,
  timeApp,
  regexApp,
  diffApp,
  packageApp,
  binaryApp,
  csvApp,
  tomlApp,
  xmlApp,
  cookiesApp,
  secretsApp,
  cronApp,
  uuidApp,
  semverApp,
  ndjsonApp,
  iniApp,
  passwordApp,
  colorApp,
  gitignoreApp,
  mimeApp,
  durationApp,
  caseApp,
  sortApp,
  unicodeApp,
  hexApp,
  cspApp,
  licenseApp,
  licenseDeps,
  ...jsonAppProps
}: AppProps = {}): JSX.Element {
  const [activeTool, setActiveTool] = useState<ActiveTool>(initialTool ?? 'json');

  const activeManifest = toolById(activeTool).manifest;

  const handleToolSelect = (event: ChangeEvent<HTMLSelectElement>): void => {
    setActiveTool(event.currentTarget.value as ActiveTool);
  };

  return (
    <LicenseProvider deps={licenseDeps}>
    <main className="suite">
      <header className="suite__header">
        <div className="suite__titlebar">
          <div className="suite__brand">
            <h1>NekoTools</h1>
            <p className="suite__tagline">
              Local-only, air-gapped-capable, zero-telemetry developer workbenches.
            </p>
          </div>
          <LicenseBadge />
        </div>
        {/* Redundant with the highlighted tab visually; kept as a polite
            live region so screen readers still announce the active tool. */}
        <p className="suite__phase visually-hidden" aria-live="polite">
          Now viewing <strong>{activeManifest.name}</strong>.
        </p>
        <div className="suite__mobileTools">
          <label htmlFor="tool-select" className="suite__mobileToolsLabel">
            Tool
          </label>
          <select
            id="tool-select"
            className="suite__toolSelect"
            value={activeTool}
            onChange={handleToolSelect}
            data-testid="tool-select"
          >
            {TOOL_CATEGORIES.map((category) => (
              <optgroup key={category.id} label={category.label}>
                {toolsByCategory(category.id).map((tool) => (
                  <option key={tool.id} value={tool.id}>
                    {tool.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <nav className="suite__tools" aria-label="Tool selector">
          {TOOL_CATEGORIES.map((category) => (
            <section
              key={category.id}
              className="suite__toolGroup"
              aria-label={`${category.label} tools`}
              data-testid={`tool-group-${category.id}`}
            >
              <h2 className="suite__toolGroupLabel">{category.label}</h2>
              <div className="suite__toolButtons">
                {toolsByCategory(category.id).map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    className={`suite__tool${activeTool === tool.id ? ' suite__tool--active' : ''}`}
                    onClick={() => setActiveTool(tool.id)}
                    aria-pressed={activeTool === tool.id}
                    data-testid={`tool-tab-${tool.id}`}
                  >
                    {tool.label}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </nav>
      </header>

      {/*
        All sub-apps stay mounted. The inactive ones are `hidden` so
        screen readers + visual users see exactly one tool at a time,
        but React state — including the textarea contents — is preserved
        across tab toggles. PR #14 audit blocker 1. The panels area
        grows to fill the viewport so the sticky bottom bar anchors to
        the screen bottom even when a tool's content is short.
      */}
      <div className="suite__panels">
      <div hidden={activeTool !== 'json'} data-testid="tool-panel-json">
        <JsonApp {...jsonAppProps} />
      </div>
      <div hidden={activeTool !== 'env'} data-testid="tool-panel-env">
        <EnvApp {...envApp} />
      </div>
      <div hidden={activeTool !== 'logs'} data-testid="tool-panel-logs">
        <LogsApp {...logsApp} />
      </div>
      <div hidden={activeTool !== 'yaml'} data-testid="tool-panel-yaml">
        <YamlApp {...yamlApp} />
      </div>
      <div hidden={activeTool !== 'jwt'} data-testid="tool-panel-jwt">
        <JwtApp {...jwtApp} />
      </div>
      <div hidden={activeTool !== 'url'} data-testid="tool-panel-url">
        <UrlApp {...urlApp} />
      </div>
      <div hidden={activeTool !== 'headers'} data-testid="tool-panel-headers">
        <HeadersApp {...headersApp} />
      </div>
      <div hidden={activeTool !== 'codec'} data-testid="tool-panel-codec">
        <CodecApp {...codecApp} />
      </div>
      <div hidden={activeTool !== 'hash'} data-testid="tool-panel-hash">
        <HashApp {...hashApp} />
      </div>
      <div hidden={activeTool !== 'time'} data-testid="tool-panel-time">
        <TimeApp {...timeApp} />
      </div>
      <div hidden={activeTool !== 'regex'} data-testid="tool-panel-regex">
        <RegexApp {...regexApp} />
      </div>
      <div hidden={activeTool !== 'diff'} data-testid="tool-panel-diff">
        <DiffApp {...diffApp} />
      </div>
      <div hidden={activeTool !== 'package'} data-testid="tool-panel-package">
        <PackageApp {...packageApp} />
      </div>
      <div hidden={activeTool !== 'binary'} data-testid="tool-panel-binary">
        <BinaryApp {...binaryApp} />
      </div>
      <div hidden={activeTool !== 'csv'} data-testid="tool-panel-csv">
        <CsvApp {...csvApp} />
      </div>
      <div hidden={activeTool !== 'toml'} data-testid="tool-panel-toml">
        <TomlApp {...tomlApp} />
      </div>
      <div hidden={activeTool !== 'xml'} data-testid="tool-panel-xml">
        <XmlApp {...xmlApp} />
      </div>
      <div hidden={activeTool !== 'cookies'} data-testid="tool-panel-cookies">
        <CookiesApp {...cookiesApp} />
      </div>
      <div hidden={activeTool !== 'secrets'} data-testid="tool-panel-secrets">
        <SecretsApp {...secretsApp} />
      </div>
      <div hidden={activeTool !== 'cron'} data-testid="tool-panel-cron">
        <CronApp {...cronApp} />
      </div>
      <div hidden={activeTool !== 'uuid'} data-testid="tool-panel-uuid">
        <UuidApp {...uuidApp} />
      </div>
      <div hidden={activeTool !== 'semver'} data-testid="tool-panel-semver">
        <SemverApp {...semverApp} />
      </div>
      <div hidden={activeTool !== 'ndjson'} data-testid="tool-panel-ndjson">
        <NdjsonApp {...ndjsonApp} />
      </div>
      <div hidden={activeTool !== 'ini'} data-testid="tool-panel-ini">
        <IniApp {...iniApp} />
      </div>
      <div hidden={activeTool !== 'password'} data-testid="tool-panel-password">
        <PasswordApp {...passwordApp} />
      </div>
      <div hidden={activeTool !== 'color'} data-testid="tool-panel-color">
        <ColorApp {...colorApp} />
      </div>
      <div hidden={activeTool !== 'gitignore'} data-testid="tool-panel-gitignore">
        <GitignoreApp {...gitignoreApp} />
      </div>
      <div hidden={activeTool !== 'mime'} data-testid="tool-panel-mime">
        <MimeApp {...mimeApp} />
      </div>
      <div hidden={activeTool !== 'duration'} data-testid="tool-panel-duration">
        <DurationApp {...durationApp} />
      </div>
      <div hidden={activeTool !== 'case'} data-testid="tool-panel-case">
        <CaseApp {...caseApp} />
      </div>
      <div hidden={activeTool !== 'sort'} data-testid="tool-panel-sort">
        <SortApp {...sortApp} />
      </div>
      <div hidden={activeTool !== 'unicode'} data-testid="tool-panel-unicode">
        <UnicodeApp {...unicodeApp} />
      </div>
      <div hidden={activeTool !== 'hex'} data-testid="tool-panel-hex">
        <HexApp {...hexApp} />
      </div>
      <div hidden={activeTool !== 'csp'} data-testid="tool-panel-csp">
        <CspApp {...cspApp} />
      </div>
      <div hidden={activeTool !== 'license'} data-testid="tool-panel-license">
        <LicenseApp {...licenseApp} />
      </div>

      </div>

      {/* Sticky bottom bar: the Free / Pro entitlement surface (collapsed
          by default) sits above the doctrine footer and stays pinned to the
          bottom of the viewport. */}
      <div className="suite__bottombar">
        <ProSurface manifest={activeManifest} />
        <footer className="suite__footer">
          <small>
            No telemetry. No analytics. No remote fetches. See{' '}
            <code>docs/product-doctrine.md</code> for the full rules.
          </small>
        </footer>
      </div>
    </main>
    </LicenseProvider>
  );
}
