import assert from "node:assert/strict";
import test from "node:test";
import { inferConfig, initialConfig, validateConfig } from "../src/config.js";
import { classifyFiles, explainClassification } from "../src/classify.js";
import type { BudgetDefinition } from "../src/types.js";

const budgets: BudgetDefinition[] = [
  {
    name: "production",
    include: ["src/**/*.ts"],
    exclude: ["src/**/*.test.ts"],
    maxCodeLines: 10_000,
  },
  {
    name: "support",
    include: ["src/**/*.test.ts", "test/**/*.ts"],
    maxCodeLines: 40_000,
  },
];

test("classifies files into exclusive named budgets", () => {
  const result = classifyFiles(
    ["src/index.ts", "src/index.test.ts", "test/system.test.ts", "README.md"],
    budgets,
    ["*.md"],
  );

  assert.deepEqual(result.groups.get("production"), ["src/index.ts"]);
  assert.deepEqual(result.groups.get("support"), [
    "src/index.test.ts",
    "test/system.test.ts",
  ]);
  assert.deepEqual(result.unmatched, []);
  assert.deepEqual(result.overlaps, {});
});

test("reports overlap and unmatched paths", () => {
  const result = classifyFiles(
    ["src/shared.ts", "notes.txt"],
    [
      { name: "one", include: ["src/**"], maxFiles: 1 },
      { name: "two", include: ["**/*.ts"], maxFiles: 1 },
    ],
  );

  assert.deepEqual(result.overlaps, { "src/shared.ts": ["one", "two"] });
  assert.deepEqual(result.unmatched, []);
  assert.deepEqual(result.ancillary, ["notes.txt"]);
});

test("inference and init classify tooling, tests, and runtime exclusively", () => {
  const cases: Record<string, string> = {
    ".github/workflows/ci.yml": "tooling",
    ".github/actions/local/check.test.ts": "tooling",
    ".github/actions/local/fixtures/data.json": "tooling",
    ".github/ISSUE_TEMPLATE/bug.yml": "tooling",
    ".github/PULL_REQUEST_TEMPLATE.md": "tooling",
    ".github/scripts/release.sh": "tooling",
    "src/index.ts": "implementation",
    "packages/a/src/main.ts": "implementation",
    "src/customer.config.ts": "implementation",
    "src/vite.config.ts": "tooling",
    "packages/a/tsconfig.build.json": "tooling",
    "tsconfig.json": "tooling",
    "eslint.config.mjs": "tooling",
    ".prettierrc": "tooling",
    Dockerfile: "tooling",
    "docker-compose.dev.yml": "tooling",
    Makefile: "tooling",
    ".husky/pre-commit": "tooling",
    "test/helper.ts": "verification",
    "src/__tests__/helper.ts": "verification",
    "src/fixtures/input.json": "verification",
  };
  for (const root of ["scripts", "tools", "tooling"]) {
    cases[`${root}/build.ts`] = "tooling";
    cases[`${root}/build.test.ts`] = "verification";
    cases[`${root}/test/helper.ts`] = "verification";
    cases[`${root}/specs/helper.ts`] = "verification";
    cases[`${root}/__tests__/helper.ts`] = "verification";
    cases[`${root}/fixtures/input.json`] = "verification";
    cases[`${root}/test/fixtures/input.json`] = "verification";
  }
  const inferred = inferConfig();
  const initialized = initialConfig("simple-tool");
  assert.deepEqual(inferred, initialized);
  for (const config of [inferred, initialized]) {
    validateConfig(config);
    const result = classifyFiles(Object.keys(cases), config.areas);
    assert.deepEqual(result.overlaps, {});
    assert.deepEqual(result.unmatched, []);
    for (const [file, kind] of Object.entries(cases)) {
      const explanation = explainClassification(file, config.areas);
      assert.deepEqual(
        explanation.areas
          .filter((area) => area.matched)
          .map((area) => area.kind),
        [kind],
        file,
      );
      assert.equal(
        explanation.affectsEnforcement,
        kind === "implementation",
        file,
      );
    }
    assert.deepEqual(
      classifyFiles(["unknown/main.ts", "customer.config.ts"], config.areas)
        .unmatched,
      ["unknown/main.ts", "customer.config.ts"],
    );
  }
});

test("product scripts can be carved out of tooling and overlaps still fail", () => {
  const config = initialConfig("simple-tool");
  const product = {
    name: "imports",
    kind: "implementation" as const,
    include: ["scripts/import-customers/**"],
  };
  const file = "scripts/import-customers/main.ts";
  const overlapping = [...config.areas, product];
  assert.deepEqual(classifyFiles([file], overlapping).overlaps, {
    [file]: ["tooling", "imports"],
  });
  const areas = [
    ...config.areas.map((area) =>
      area.name === "tooling"
        ? { ...area, exclude: [...area.exclude!, ...product.include] }
        : area,
    ),
    product,
  ];
  const result = classifyFiles([file, "scripts/release.ts"], areas);
  assert.deepEqual(result.overlaps, {});
  assert.deepEqual(result.groups.get("imports"), [file]);
  assert.deepEqual(result.groups.get("tooling"), ["scripts/release.ts"]);
});
