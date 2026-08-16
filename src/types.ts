export type FileSet = "all" | "git-visible" | "tracked";
export type ClassificationPolicy = "allow" | "error";

export type ScopeName =
  | "atomic-library"
  | "simple-tool"
  | "standalone-tool"
  | "platform"
  | "infrastructure"
  | "suite";

export type AreaKind =
  | "implementation"
  | "verification"
  | "excluded"
  | "review";

export interface AreaDefinition {
  exclude?: readonly string[];
  include: readonly string[];
  kind: AreaKind;
  name: string;
  /** Required for deliberately excluded generated or vendored inputs. */
  reason?: string;
}

export interface CodeBudgetConfig {
  areas: readonly AreaDefinition[];
  files?: FileSet;
  ignore?: readonly string[];
  scope: ScopeName;
}

/** @deprecated The 0.0.1 schema is accepted only for migration. */
export interface BudgetDefinition {
  exclude?: readonly string[];
  include: readonly string[];
  maxBytes?: number;
  maxCodeLines?: number;
  maxFiles?: number;
  name: string;
}

/** @deprecated The 0.0.1 schema is accepted only for migration. */
export interface LegacyCodeBudgetConfig {
  budgets: readonly BudgetDefinition[];
  files?: FileSet;
  ignore?: readonly string[];
  overlap?: ClassificationPolicy;
  unmatched?: ClassificationPolicy;
}

export interface ScopeBenchmark {
  commit: string;
  implementationLoc: number;
  name: string;
  repository: string;
}

export interface ScopeDefinition {
  benchmarks: readonly ScopeBenchmark[];
  description: string;
  implementationLoc: number;
  name: ScopeName;
}

export interface LanguageMeasurement {
  files: number;
  language: string;
  lines: number;
}

export interface AreaUsage {
  binaryFiles: number;
  codeLines: number;
  files: number;
  languages: LanguageMeasurement[];
  textFallbackFiles: number;
}

export interface AreaResult {
  definition: AreaDefinition;
  paths: string[];
  usage: AreaUsage;
}

export type ViolationKind =
  | "implementation-loc"
  | "legacy-budget"
  | "overlap"
  | "review"
  | "unclassified";

export interface BudgetViolation {
  actual?: number;
  area?: string;
  budget?: string;
  kind: ViolationKind;
  limit?: number;
  message: string;
  metric?: BudgetMetric;
  path?: string;
}

export interface AnalysisDiagnostics {
  ancillary: string[];
  deprecations: string[];
  generatedVendorCandidates: string[];
  metadata: string[];
  overlaps: Record<string, string[]>;
  unclassified: string[];
}

export interface AnalysisTotals {
  implementation: AreaUsage;
  verification: AreaUsage;
}

export interface CodeBudgetReport {
  areas: AreaResult[];
  configured: boolean;
  configPath?: string;
  cwd: string;
  diagnostics: AnalysisDiagnostics;
  inferred: boolean;
  ok: boolean;
  schemaVersion: "1.0";
  scope: ScopeDefinition;
  totals: AnalysisTotals;
  violations: BudgetViolation[];
  /** Compatibility aliases for 0.0.1 API consumers. */
  budgets: LegacyBudgetResult[];
  overlaps: Record<string, string[]>;
  unmatched: string[];
}

export interface AnalyzeRepositoryOptions {
  config?: CodeBudgetConfig | LegacyCodeBudgetConfig;
  configPath?: string;
  configured?: boolean;
  counter?: CodeCounter;
  cwd?: string;
}

export interface FileClassificationExplanation {
  affectsEnforcement: boolean;
  areas: Array<{
    excludedBy: string[];
    includedBy: string[];
    kind: AreaKind;
    matched: boolean;
    name: string;
  }>;
  category:
    | "ancillary"
    | "area"
    | "generated-vendor-review"
    | "metadata"
    | "unclassified";
  path: string;
}

export interface CodeCounter {
  count(absolutePaths: readonly string[]): Promise<number>;
}

export interface LegacyBudgetUsage {
  bytes: number;
  codeLines: number;
  files: number;
}
export type BudgetMetric = keyof LegacyBudgetUsage;
export interface LegacyBudgetResult {
  definition: BudgetDefinition;
  paths: string[];
  usage: LegacyBudgetUsage;
  violations: BudgetViolation[];
}
/** @deprecated Use AreaUsage. */
export type BudgetUsage = LegacyBudgetUsage;
/** @deprecated Use AreaResult. */
export type BudgetResult = LegacyBudgetResult;
