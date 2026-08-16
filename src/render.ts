import { METHODOLOGY_REFERENCE, SCOPE_NAMES, SCOPES } from "./scopes.js";
import type {
  CodeBudgetReport,
  FileClassificationExplanation,
  ScopeDefinition,
} from "./types.js";

export interface RenderOptions {
  color?: boolean;
  details?: boolean;
}

export function renderReport(
  report: CodeBudgetReport,
  options: RenderOptions = {},
): string[] {
  const paint = colors(options.color ?? false);
  const limit = report.scope.implementationLoc;
  const actual = report.totals.implementation.codeLines;
  const delta = limit - actual;
  const ratio =
    actual === 0 ? null : report.totals.verification.codeLines / actual;
  const status = report.inferred
    ? paint.yellow("INFERRED - no policy is configured")
    : report.ok
      ? paint.green("PASS - configured policy satisfied")
      : paint.red("FAIL - configured policy violated");
  const lines = [
    `Repository: ${report.cwd}`,
    `Policy: ${status}`,
    `Scope: ${report.scope.name} (${format(limit)} implementation LOC)${report.inferred ? " [suggested]" : ""}`,
    "",
    "IMPLEMENTATION (LIMITED)",
    `  ${format(actual)} / ${format(limit)} LOC (${percent(actual, limit)}) - ${delta >= 0 ? `${format(delta)} headroom` : `${format(-delta)} excess`}`,
  ];
  for (const area of report.areas.filter(
    (area) => area.definition.kind === "implementation",
  )) {
    lines.push(
      `  ${area.definition.name}: ${format(area.usage.codeLines)} LOC in ${format(area.usage.files)} files`,
    );
  }
  lines.push("", "VERIFICATION (UNLIMITED)");
  lines.push(
    `  ${format(report.totals.verification.codeLines)} LOC in ${format(report.totals.verification.files)} files`,
  );
  for (const area of report.areas.filter(
    (area) => area.definition.kind === "verification",
  )) {
    lines.push(
      `  ${area.definition.name}: ${format(area.usage.codeLines)} LOC in ${format(area.usage.files)} files`,
    );
  }
  lines.push(
    `  Verification-to-implementation ratio: ${ratio === null ? "n/a" : `${ratio.toFixed(2)}:1`} (informational)`,
  );
  if (report.totals.verification.binaryFiles > 0) {
    lines.push(
      `  Opaque binary fixtures: ${format(report.totals.verification.binaryFiles)} files (LOC not counted)`,
    );
  }

  lines.push("", "LANGUAGES");
  const combined = combineLanguages(report);
  if (combined.length === 0) lines.push("  None detected");
  for (const language of combined) {
    lines.push(
      `  ${language.language}: ${format(language.lines)} LOC, ${format(language.files)} files`,
    );
  }

  const excluded = report.areas.filter(
    (area) => area.definition.kind === "excluded",
  );
  if (excluded.length > 0) {
    lines.push("", "EXPLICIT EXCLUSIONS");
    for (const area of excluded) {
      lines.push(
        `  ${area.definition.name}: ${format(area.usage.files)} files - ${area.definition.reason}`,
      );
    }
  }
  diagnostics(lines, report, options.details ?? false);
  if (report.inferred) {
    lines.push(
      "",
      "No enforcement was performed. Choose a policy explicitly:",
      "  code-budget scopes",
      "  code-budget init --scope <scope>",
    );
  } else if (!report.ok) {
    lines.push("", "Remediation:");
    if (
      report.diagnostics.unclassified.length > 0 ||
      report.diagnostics.generatedVendorCandidates.length > 0
    ) {
      lines.push(
        "  code-budget explain <path>",
        "  Edit code-budget.config.mjs to classify every reported path.",
      );
    }
    if (actual > limit)
      lines.push(
        "  Reduce maintained implementation LOC or select the truthful named scope.",
      );
    lines.push("  code-budget report --details");
  }
  return lines;
}

export function renderScopes(details = false): string[] {
  const lines = [
    "Named implementation scopes",
    "",
    "Scope             Ceiling    Description",
  ];
  for (const name of SCOPE_NAMES) {
    const scope = SCOPES[name];
    lines.push(
      `${name.padEnd(18)}${format(scope.implementationLoc).padStart(8)}    ${scope.description}`,
    );
    if (details) {
      for (const benchmark of scope.benchmarks) {
        lines.push(
          `  benchmark: ${benchmark.name} ${format(benchmark.implementationLoc)} LOC (${benchmark.repository}@${benchmark.commit})`,
        );
      }
    }
  }
  lines.push("", `Methodology: ${METHODOLOGY_REFERENCE}`);
  lines.push("Verification code and fixtures are always unlimited.");
  return lines;
}

export function renderExplanation(
  explanation: FileClassificationExplanation,
): string[] {
  const lines = [
    `Path: ${explanation.path}`,
    `Classification: ${explanation.category}`,
    `Affects enforcement: ${explanation.affectsEnforcement ? "yes" : "no"}`,
    "",
    "Area pattern matches:",
  ];
  for (const area of explanation.areas) {
    lines.push(
      `  ${area.name} [${area.kind}]: ${area.matched ? "MATCH" : "no match"}`,
    );
    lines.push(
      `    include: ${area.includedBy.length > 0 ? area.includedBy.join(", ") : "none"}`,
    );
    lines.push(
      `    exclude: ${area.excludedBy.length > 0 ? area.excludedBy.join(", ") : "none"}`,
    );
  }
  return lines;
}

function diagnostics(
  lines: string[],
  report: CodeBudgetReport,
  details: boolean,
): void {
  const groups: Array<[string, string[]]> = [
    [
      "Generated/vendor candidates requiring review",
      report.diagnostics.generatedVendorCandidates,
    ],
    ["Unclassified source-like files", report.diagnostics.unclassified],
    ["Metadata/documentation", report.diagnostics.metadata],
    ["Ancillary files", report.diagnostics.ancillary],
  ];
  const overlaps = Object.entries(report.diagnostics.overlaps).map(
    ([file, areas]) => `${file} -> ${areas.join(", ")}`,
  );
  groups.splice(2, 0, ["Overlaps", overlaps]);
  for (const [title, paths] of groups) {
    if (paths.length === 0) continue;
    lines.push("", `${title} (${format(paths.length)}):`);
    const visible = details ? paths : paths.slice(0, 10);
    lines.push(...visible.map((file) => `  ${file}`));
    if (visible.length < paths.length)
      lines.push(
        `  ... ${format(paths.length - visible.length)} more; use --details`,
      );
  }
  if (report.diagnostics.deprecations.length > 0) {
    lines.push(
      "",
      "Deprecations:",
      ...report.diagnostics.deprecations.map((value) => `  ${value}`),
    );
  }
}

function combineLanguages(report: CodeBudgetReport) {
  const values = new Map<string, { files: number; lines: number }>();
  for (const total of [
    report.totals.implementation,
    report.totals.verification,
  ]) {
    for (const language of total.languages) {
      const value = values.get(language.language) ?? { files: 0, lines: 0 };
      value.files += language.files;
      value.lines += language.lines;
      values.set(language.language, value);
    }
  }
  return [...values]
    .map(([language, usage]) => ({ language, ...usage }))
    .sort((a, b) => b.lines - a.lines);
}

function colors(enabled: boolean) {
  return {
    green: (value: string) =>
      enabled ? `\u001B[32m${value}\u001B[39m` : value,
    red: (value: string) => (enabled ? `\u001B[31m${value}\u001B[39m` : value),
    yellow: (value: string) =>
      enabled ? `\u001B[33m${value}\u001B[39m` : value,
  };
}

function format(value: number): string {
  return value.toLocaleString("en-US");
}

function percent(actual: number, limit: number): string {
  return `${((actual / limit) * 100).toFixed(1)}%`;
}
