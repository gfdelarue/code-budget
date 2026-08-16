import assert from "node:assert/strict";
import test from "node:test";
import { classifyFiles } from "../src/classify.js";
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
