import { minimatch } from "minimatch";
import type {
  AreaDefinition,
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

export function classifyFiles(
  paths: readonly string[],
  definitions: readonly (AreaDefinition | BudgetDefinition)[],
  ignore: readonly string[] = [],
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
    const matched = definitions.filter(
      (definition) =>
        matchesPatterns(file, definition.include) &&
        !matchesPatterns(file, definition.exclude ?? []),
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
): FileClassificationExplanation {
  const areas = definitions.map((definition) => {
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
  const matched = areas.filter((area) => area.matched);
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
