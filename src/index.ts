export {
  analyzeRepository,
  checkBudgets,
  type CheckBudgetOptions,
} from "./check.js";
export {
  CONFIG_FILES,
  defineConfig,
  findConfig,
  inferConfig,
  initialConfig,
  isLegacyConfig,
  loadConfig,
  renderConfig,
  validateConfig,
  type LoadedConfig,
} from "./config.js";
export {
  classifyFiles,
  explainClassification,
  isGeneratedVendorCandidate,
  isMetadata,
  isSourceLike,
  matchesPatterns,
  type Classification,
} from "./classify.js";
export { renderExplanation, renderReport, renderScopes } from "./render.js";
export { METHODOLOGY_REFERENCE, SCOPES, SCOPE_NAMES } from "./scopes.js";
export type {
  AnalysisDiagnostics,
  AnalysisTotals,
  AnalyzeRepositoryOptions,
  AreaDefinition,
  AreaKind,
  AreaResult,
  AreaUsage,
  BudgetDefinition,
  BudgetMetric,
  BudgetResult,
  BudgetUsage,
  BudgetViolation,
  ClassificationPolicy,
  CodeBudgetConfig,
  CodeBudgetReport,
  CodeCounter,
  FileClassificationExplanation,
  FileSet,
  LanguageMeasurement,
  LegacyCodeBudgetConfig,
  ScopeBenchmark,
  ScopeDefinition,
  ScopeName,
} from "./types.js";
