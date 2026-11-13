import { minimatch } from "minimatch";
import type {
  AreaDefinition,
  AreaKind,
  BudgetDefinition,
  FileClassificationExplanation,
} from "./types.js";

export interface Classification {
  ancillary: string[];
  generatedVendorCandidates: string[];
  groups: Map<string, string[]>;
  metadata: string[];
  overlaps: Record<string, string[]>;
  unmatched: string[];
}

/** Higher values win when a file matches areas of different kinds. */
export const KIND_PRECEDENCE: Readonly<Record<AreaKind, number>> = {
  excluded: 4,
  review: 3,
  verification: 2,
  tooling: 1,
  implementation: 0,
};

const MATCH_OPTIONS = { dot: true, nocase: false } as const;
const GENERATED_VENDOR = [
  "**/generated/**",
  "**/vendor/**",
  "**/vendored/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/*.generated.*",
  "**/*.min.js",
  "**/*.min.css",
];
const METADATA = [
  "**/*.md",
  "**/*.mdx",
  "**/*.rst",
  "**/LICENSE*",
  "**/COPYING*",
  "**/CHANGELOG*",
  "**/package.json",
  "**/package-lock.json",
  "**/npm-shrinkwrap.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/Cargo.lock",
  "**/go.sum",
  "**/.gitignore",
  "**/.npmignore",
  "**/.prettierignore",
  "**/.editorconfig",
];
const SOURCE_EXTENSIONS = new Set([
  ".astro",
  ".bash",
  ".c",
  ".cc",
  ".cjs",
  ".clj",
  ".cpp",
  ".cs",
  ".css",
  ".cts",
  ".dart",
  ".ex",
  ".exs",
  ".fs",
  ".go",
  ".graphql",
  ".h",
  ".hpp",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".less",
  ".lua",
  ".m",
  ".mjs",
  ".mts",
  ".php",
  ".pl",
  ".proto",
  ".ps1",
  ".py",
  ".r",
  ".rb",
  ".rs",
  ".sass",
  ".scala",
  ".scss",
  ".sh",
  ".sql",
  ".svelte",
  ".swift",
  ".toml",
  ".ts",
  ".tsx",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
  ".zig",
]);

/**
 * Resolves the areas that classify a file. The highest-precedence kind wins;
 * within that kind, configured areas win over inferred default areas. Any
 * remaining tie is an overlap.
 */
export function selectAreas<T extends { kind?: AreaKind; name: string }>(
  matched: readonly T[],
  defaultAreas: ReadonlySet<string> = new Set(),
): T[] {
  if (matched.length < 2) return [...matched];
  const rank = (definition: T): number =>
    KIND_PRECEDENCE[definition.kind ?? "implementation"];
  const top = Math.max(...matched.map(rank));
  const strongest = matched.filter((definition) => rank(definition) === top);
  const configured = strongest.filter(
    (definition) => !defaultAreas.has(definition.name),
  );
  return configured.length > 0 ? configured : strongest;
}

export function classifyFiles(
  paths: readonly string[],
  definitions: readonly (AreaDefinition | BudgetDefinition)[],
  ignore: readonly string[] = [],
  defaultAreas: ReadonlySet<string> = new Set(),
): Classification {
  const groups = new Map(
    definitions.map((definition) => [definition.name, [] as string[]]),
  );
  const overlaps: Record<string, string[]> = {};
  const unmatched: string[] = [];
  const metadata: string[] = [];
  const ancillary: string[] = [];
  const generatedVendorCandidates: string[] = [];

  for (const file of paths) {
    if (matchesPatterns(file, ignore)) continue;
    const matched = selectAreas(
      definitions.filter(
        (definition) =>
          matchesPatterns(file, definition.include) &&
          !matchesPatterns(file, definition.exclude ?? []),
      ),
      defaultAreas,
    );
    if (matched.length > 1) {
      overlaps[file] = matched.map((definition) => definition.name);
    }
    if (matched.length > 0) {
      for (const definition of matched) groups.get(definition.name)?.push(file);
      continue;
    }
    if (isGeneratedVendorCandidate(file)) {
      generatedVendorCandidates.push(file);
    } else if (isMetadata(file)) {
      metadata.push(file);
    } else if (isSourceLike(file)) {
      unmatched.push(file);
    } else {
      ancillary.push(file);
    }
  }

  return {
    ancillary,
    generatedVendorCandidates,
    groups,
    metadata,
    overlaps,
    unmatched,
  };
}

export function explainClassification(
  file: string,
  definitions: readonly AreaDefinition[],
  defaultAreas: ReadonlySet<string> = new Set(),
): FileClassificationExplanation {
  const matches = definitions.map((definition) => {
    const includedBy = definition.include.filter((pattern) =>
      matchesPatterns(file, [pattern]),
    );
    const excludedBy = (definition.exclude ?? []).filter((pattern) =>
      matchesPatterns(file, [pattern]),
    );
    return {
      excludedBy,
      includedBy,
      kind: definition.kind,
      matched: includedBy.length > 0 && excludedBy.length === 0,
      name: definition.name,
    };
  });
  const selected = new Set(
    selectAreas(
      matches.filter((area) => area.matched),
      defaultAreas,
    ).map((area) => area.name),
  );
  const areas = matches.map((area) => ({
    ...area,
    selected: selected.has(area.name),
  }));
  const matched = areas.filter((area) => area.selected);
  const category =
    matched.length > 0
      ? "area"
      : isGeneratedVendorCandidate(file)
        ? "generated-vendor-review"
        : isMetadata(file)
          ? "metadata"
          : isSourceLike(file)
            ? "unclassified"
            : "ancillary";
  return {
    affectsEnforcement:
      matched.some((area) =>
        ["implementation", "review"].includes(area.kind),
      ) || ["generated-vendor-review", "unclassified"].includes(category),
    areas,
    category,
    path: file,
  };
}

export function matchesPatterns(
  file: string,
  patterns: readonly string[],
): boolean {
  return patterns.some((pattern) => minimatch(file, pattern, MATCH_OPTIONS));
}

export function isGeneratedVendorCandidate(file: string): boolean {
  return matchesPatterns(file, GENERATED_VENDOR);
}

export function isMetadata(file: string): boolean {
  return matchesPatterns(file, METADATA);
}

export function isSourceLike(file: string): boolean {
  const basename = file.split("/").at(-1) ?? file;
  if (["Dockerfile", "Makefile", "Rakefile", "Justfile"].includes(basename)) {
    return true;
  }
  const dot = basename.lastIndexOf(".");
  return dot >= 0 && SOURCE_EXTENSIONS.has(basename.slice(dot).toLowerCase());
}
