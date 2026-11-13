import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isGeneratedVendorCandidate, matchesPatterns } from "./classify.js";
import { SCOPE_NAMES } from "./scopes.js";
import type {
  AreaDefinition,
  CodeBudgetConfig,
  LegacyCodeBudgetConfig,
  ScopeName,
} from "./types.js";

export const CONFIG_FILES = [
  "code-budget.config.mjs",
  "code-budget.config.js",
  "code-budget.config.cjs",
] as const;

export interface LoadedConfig {
  config?: CodeBudgetConfig | LegacyCodeBudgetConfig;
  legacy: boolean;
  path?: string;
}

export function defineConfig<T extends CodeBudgetConfig>(config: T): T {
  return config;
}

export async function findConfig(
  cwd: string,
  configPath?: string,
): Promise<LoadedConfig> {
  const resolved = configPath
    ? path.resolve(cwd, configPath)
    : CONFIG_FILES.map((name) => path.join(cwd, name)).find((candidate) =>
        fs.existsSync(candidate),
      );

  if (resolved) {
    if (!fs.existsSync(resolved)) {
      throw new Error(`Configuration does not exist: ${resolved}`);
    }
    const imported = (await import(
      `${pathToFileURL(resolved).href}?t=${Date.now()}`
    )) as {
      default?: unknown;
    };
    const config = validateConfig(imported.default);
    return { config, legacy: isLegacyConfig(config), path: resolved };
  }

  const packagePath = path.join(cwd, "package.json");
  if (fs.existsSync(packagePath)) {
    const parsed = JSON.parse(fs.readFileSync(packagePath, "utf8")) as {
      codeBudget?: unknown;
    };
    if (parsed.codeBudget !== undefined) {
      const config = validateConfig(parsed.codeBudget);
      return {
        config,
        legacy: isLegacyConfig(config),
        path: `${packagePath}#codeBudget`,
      };
    }
  }
  if (configPath) throw new Error(`Configuration does not exist: ${resolved}`);
  return { legacy: false };
}

export async function loadConfig(
  cwd: string,
  configPath?: string,
): Promise<CodeBudgetConfig | LegacyCodeBudgetConfig> {
  const loaded = await findConfig(cwd, configPath);
  if (!loaded.config) {
    throw new Error(
      `No code budget configuration found in ${path.resolve(cwd)}. Run code-budget init --scope <scope>.`,
    );
  }
  return loaded.config;
}

export function validateConfig(
  input: unknown,
): CodeBudgetConfig | LegacyCodeBudgetConfig {
  if (!isRecord(input)) throw new Error("Code budget config must be an object");
  if (Array.isArray(input.areas) || input.defaults !== undefined)
    return validateCurrentConfig(input);
  if (Array.isArray(input.budgets)) return validateLegacyConfig(input);
  throw new Error("Code budget config must contain an areas array");
}

function validateCurrentConfig(
  input: Record<string, unknown>,
): CodeBudgetConfig {
  if (!SCOPE_NAMES.includes(input.scope as ScopeName)) {
    throw new Error(`scope must be one of: ${SCOPE_NAMES.join(", ")}`);
  }
  if (input.defaults !== undefined && typeof input.defaults !== "boolean") {
    throw new Error("defaults must be a boolean");
  }
  if (input.areas !== undefined && !Array.isArray(input.areas)) {
    throw new Error("areas must be an array");
  }
  const areas = (input.areas ?? []) as unknown[];
  if (areas.length === 0 && input.defaults !== true) {
    throw new Error(
      "Code budget config must define at least one area or set defaults: true",
    );
  }
  const names = new Set<string>();
  for (const value of areas) {
    validateArea(value);
    if (names.has(value.name))
      throw new Error(`Duplicate area name: ${value.name}`);
    names.add(value.name);
  }
  validateFileSet(input.files);
  validateStringArray(input.ignore, "ignore");
  return input as unknown as CodeBudgetConfig;
}

function validateArea(input: unknown): asserts input is AreaDefinition {
  if (!isRecord(input) || typeof input.name !== "string" || !input.name) {
    throw new Error("Every area requires a non-empty name");
  }
  if (
    ![
      "implementation",
      "tooling",
      "verification",
      "excluded",
      "review",
    ].includes(String(input.kind))
  ) {
    throw new Error(`${input.name}.kind is invalid`);
  }
  validateStringArray(input.include, `${input.name}.include`, true);
  validateStringArray(input.exclude, `${input.name}.exclude`);
  if (
    input.kind === "excluded" &&
    (typeof input.reason !== "string" || input.reason.trim().length === 0)
  ) {
    throw new Error(`${input.name}.reason is required for an excluded area`);
  }
}

function validateLegacyConfig(
  input: Record<string, unknown>,
): LegacyCodeBudgetConfig {
  const budgets = input.budgets as unknown[];
  if (budgets.length === 0) {
    throw new Error("Code budget config must define at least one budget");
  }
  const names = new Set<string>();
  for (const value of budgets) {
    if (!isRecord(value) || typeof value.name !== "string" || !value.name) {
      throw new Error("Every budget requires a non-empty name");
    }
    validateStringArray(value.include, `${value.name}.include`, true);
    validateStringArray(value.exclude, `${value.name}.exclude`);
    if (names.has(value.name))
      throw new Error(`Duplicate budget name: ${value.name}`);
    names.add(value.name);
    const limits = [value.maxCodeLines, value.maxFiles, value.maxBytes];
    if (limits.every((limit) => limit === undefined)) {
      throw new Error(`Budget ${value.name} must define at least one limit`);
    }
    for (const [key, limit] of [
      ["maxCodeLines", value.maxCodeLines],
      ["maxFiles", value.maxFiles],
      ["maxBytes", value.maxBytes],
    ] as const) {
      if (
        limit !== undefined &&
        (typeof limit !== "number" || !Number.isInteger(limit) || limit < 0)
      ) {
        throw new Error(`${value.name}.${key} must be a non-negative integer`);
      }
    }
  }
  validateFileSet(input.files);
  validateStringArray(input.ignore, "ignore");
  for (const name of ["overlap", "unmatched"] as const) {
    if (
      input[name] !== undefined &&
      input[name] !== "allow" &&
      input[name] !== "error"
    ) {
      throw new Error(`${name} must be "allow" or "error"`);
    }
  }
  return input as unknown as LegacyCodeBudgetConfig;
}

export function isLegacyConfig(
  config: CodeBudgetConfig | LegacyCodeBudgetConfig,
): config is LegacyCodeBudgetConfig {
  return "budgets" in config;
}

const GITHUB = [".github/**"];
const VERIFICATION = [
  "**/{test,tests,spec,specs,__tests__,benches}/**",
  "**/*.test.*",
  "**/*.spec.*",
  "**/*_test.go",
  "**/test_*.py",
  "**/*_test.py",
  "**/conftest.py",
];
const FIXTURES = ["**/{fixture,fixtures,__fixtures__,testdata}/**"];
const TOOL_CONFIG = [
  "**/{code-budget,vite,vitest,webpack,rollup,esbuild,tsup,babel,eslint,prettier,jest,playwright,cypress,next,nuxt,svelte,astro,postcss,tailwind}.config.{js,cjs,mjs,ts,cts,mts,json}",
  "**/tsconfig*.json",
  "**/{.eslintrc,.prettierrc,.babelrc}",
  "**/{.eslintrc,.prettierrc,.babelrc}.{js,cjs,mjs,json,yaml,yml}",
  "**/{Makefile,GNUmakefile,Justfile,justfile,Rakefile,Dockerfile,Dockerfile.*}",
  "**/{compose,compose.*,docker-compose,docker-compose.*}.{yml,yaml}",
  ".husky/**",
];
const IMPLEMENTATION_DIRECTORIES = ["src", "lib", "app", "packages", "bin"];
const GO_IMPLEMENTATION_DIRECTORIES = ["cmd", "internal", "pkg"];
const TOOLING_DIRECTORIES = ["scripts", "tools", "tooling"];
const APP_ROOT_MARKERS = new Set([
  "Cargo.toml",
  "go.mod",
  "package.json",
  "pyproject.toml",
  "tsconfig.json",
]);

export interface ResolvedAreas {
  areas: AreaDefinition[];
  /** Names of inferred default areas, which yield to configured areas. */
  defaultAreas: Set<string>;
}

export function inferConfig(
  scope: ScopeName = "simple-tool",
  files: readonly string[] = [],
): CodeBudgetConfig & { areas: AreaDefinition[] } {
  return initialConfig(scope, files);
}

export function initialConfig(
  scope: ScopeName,
  files: readonly string[] = [],
): CodeBudgetConfig & { areas: AreaDefinition[] } {
  return { scope, areas: defaultAreas(files) };
}

/**
 * Builds the default areas. Without repository paths only root conventions
 * apply; with them, a root go.mod adds Go package directories and nested app
 * roots (directories with a package.json, tsconfig.json, go.mod,
 * pyproject.toml, or Cargo.toml) get the root conventions relative to them.
 */
export function defaultAreas(files: readonly string[] = []): AreaDefinition[] {
  const implementation = under("", IMPLEMENTATION_DIRECTORIES);
  const tooling = under("", TOOLING_DIRECTORIES);
  for (const [root, markers] of appRoots(files)) {
    if (root !== "") {
      const probe = `${root}/.code-budget-app-root`;
      const claimed = [
        ...GITHUB,
        ...VERIFICATION,
        ...FIXTURES,
        ...tooling,
        ...TOOL_CONFIG,
        ...implementation,
      ];
      if (isGeneratedVendorCandidate(probe) || matchesPatterns(probe, claimed))
        continue;
      implementation.push(...under(root, IMPLEMENTATION_DIRECTORIES));
      tooling.push(...under(root, TOOLING_DIRECTORIES));
    }
    if (markers.has("go.mod")) {
      implementation.push(
        ...under(root, GO_IMPLEMENTATION_DIRECTORIES),
        root ? `${root}/*.go` : "*.go",
      );
    }
  }
  return [
    { name: "runtime", kind: "implementation", include: implementation },
    { name: "github", kind: "tooling", include: GITHUB },
    {
      name: "tooling",
      kind: "tooling",
      include: [...tooling, ...TOOL_CONFIG],
      exclude: GITHUB,
    },
    {
      name: "tests",
      kind: "verification",
      include: VERIFICATION,
      exclude: [...GITHUB, ...FIXTURES],
    },
    {
      name: "fixtures",
      kind: "verification",
      include: FIXTURES,
      exclude: GITHUB,
    },
  ];
}

/** Combines configured areas with the default areas when `defaults` is set. */
export function resolveAreas(
  config: CodeBudgetConfig,
  files: readonly string[] = [],
): ResolvedAreas {
  const configured = config.areas ?? [];
  if (!config.defaults) {
    return { areas: [...configured], defaultAreas: new Set() };
  }
  const names = new Set(configured.map((area) => area.name));
  const defaults = defaultAreas(files).filter((area) => !names.has(area.name));
  return {
    areas: [...defaults, ...configured],
    defaultAreas: new Set(defaults.map((area) => area.name)),
  };
}

export function renderConfig(
  scope: ScopeName,
  files: readonly string[] = [],
): string {
  return `import { defineConfig } from "@moontern-labs/code-budget";\n\nexport default defineConfig(${JSON.stringify(initialConfig(scope, files), null, 2)});\n`;
}

function appRoots(files: readonly string[]): Array<[string, Set<string>]> {
  const roots = new Map<string, Set<string>>();
  for (const file of files) {
    const slash = file.lastIndexOf("/");
    if (!APP_ROOT_MARKERS.has(file.slice(slash + 1))) continue;
    const root = slash < 0 ? "" : file.slice(0, slash);
    roots.set(root, (roots.get(root) ?? new Set()).add(file.slice(slash + 1)));
  }
  const depth = (root: string): number =>
    root === "" ? 0 : root.split("/").length;
  return [...roots].sort(
    ([a], [b]) => depth(a) - depth(b) || a.localeCompare(b),
  );
}

function under(root: string, directories: readonly string[]): string[] {
  return directories.map((directory) =>
    root ? `${root}/${directory}/**` : `${directory}/**`,
  );
}

function validateFileSet(value: unknown): void {
  if (
    value !== undefined &&
    !["all", "git-visible", "tracked"].includes(String(value))
  ) {
    throw new Error(`Unknown file set: ${String(value)}`);
  }
}

function validateStringArray(
  value: unknown,
  name: string,
  required = false,
): void {
  if (value === undefined && !required) return;
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((entry) => typeof entry !== "string" || entry.length === 0)
  ) {
    throw new Error(`${name} must be a non-empty string array`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
