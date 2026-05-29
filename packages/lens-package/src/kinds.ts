import type { Artifact } from '@nekotools/contracts';

export const PACKAGE_KIND_MANIFEST = 'package.manifest';

export const ALL_PACKAGE_KINDS = [PACKAGE_KIND_MANIFEST] as const;

export type PackageDependencySection =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies';

export const PACKAGE_DEPENDENCY_SECTIONS: readonly PackageDependencySection[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

export interface PackageScript {
  readonly name: string;
  readonly command: string;
  readonly lifecycle: boolean;
  readonly riskFlags: readonly PackageScriptRiskFlag[];
}

export type PackageScriptRiskFlag = 'lifecycle' | 'network-shell' | 'destructive';

export interface PackageDependency {
  readonly name: string;
  readonly range: string;
  readonly section: PackageDependencySection;
  readonly remote: boolean;
  readonly unpinned: boolean;
}

export interface PackageDuplicateDependency {
  readonly name: string;
  readonly sections: readonly PackageDependencySection[];
}

export interface PackageDependencyCounts {
  readonly dependencies: number;
  readonly devDependencies: number;
  readonly peerDependencies: number;
  readonly optionalDependencies: number;
  readonly total: number;
}

export interface PackageManifestDocument {
  readonly valid: boolean;
  readonly name: string | null;
  readonly version: string | null;
  readonly private: boolean | null;
  readonly packageManager: string | null;
  readonly type: string | null;
  readonly license: string | null;
  readonly scripts: readonly PackageScript[];
  readonly dependencies: readonly PackageDependency[];
  readonly dependencyCounts: PackageDependencyCounts;
  readonly duplicateDependencies: readonly PackageDuplicateDependency[];
}

export type PackageManifestArtifact = Artifact<'package.manifest', PackageManifestDocument>;
export type PackageArtifact = PackageManifestArtifact;

export const PACKAGE_MANIFEST_EXPORT_KINDS = [PACKAGE_KIND_MANIFEST] as const;
