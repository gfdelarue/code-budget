import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkBudgets } from "../src/check.js";
import type { CodeCounter } from "../src/types.js";

const tenLinesPerFile: CodeCounter = {
  async count(paths) {
    return paths.length * 10;
  },
};

test("fails an exceeded absolute budget", async (context) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "code-budget-test-"));
  context.after(() => fs.rmSync(cwd, { recursive: true }));
  fs.mkdirSync(path.join(cwd, "src"));
  fs.writeFileSync(path.join(cwd, "src", "one.ts"), "export {};\n");
  fs.writeFileSync(path.join(cwd, "src", "two.ts"), "export {};\n");

  const report = await checkBudgets(
    {
      budgets: [
        {
          name: "production",
          include: ["src/**/*.ts"],
          maxCodeLines: 15,
        },
      ],
      files: "all",
    },
    { counter: tenLinesPerFile, cwd },
  );

  assert.equal(report.ok, false);
  assert.deepEqual(report.violations, [
    {
      actual: 20,
      budget: "production",
      kind: "legacy-budget",
      limit: 15,
      message: "production exceeds legacy codeLines limit by 5.",
      metric: "codeLines",
    },
  ]);
});

test("fails unclassified files by default", async (context) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "code-budget-test-"));
  context.after(() => fs.rmSync(cwd, { recursive: true }));
  fs.writeFileSync(path.join(cwd, "unexpected.ts"), "export {};\n");

  const report = await checkBudgets(
    {
      budgets: [{ name: "production", include: ["src/**"], maxFiles: 1 }],
      files: "all",
    },
    { counter: tenLinesPerFile, cwd },
  );

  assert.equal(report.ok, false);
  assert.deepEqual(report.unmatched, ["unexpected.ts"]);
});

test("verification never creates an implementation violation", async (context) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "code-budget-test-"));
  context.after(() => fs.rmSync(cwd, { recursive: true }));
  fs.mkdirSync(path.join(cwd, "src"));
  fs.mkdirSync(path.join(cwd, "test"));
  fs.writeFileSync(path.join(cwd, "src", "one.ts"), "export {};\n");
  for (let index = 0; index < 50; index += 1) {
    fs.writeFileSync(
      path.join(cwd, "test", `${index}.test.ts`),
      "test('x', () => {});\n",
    );
  }
  const report = await checkBudgets(
    {
      scope: "atomic-library",
      files: "all",
      areas: [
        { name: "runtime", kind: "implementation", include: ["src/**"] },
        { name: "tests", kind: "verification", include: ["test/**"] },
      ],
    },
    { counter: tenLinesPerFile, cwd },
  );
  assert.equal(report.ok, true);
  assert.equal(report.totals.implementation.codeLines, 10);
  assert.equal(report.totals.verification.codeLines, 500);
});

test("moving implementation to an unknown source root fails classification", async (context) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "code-budget-test-"));
  context.after(() => fs.rmSync(cwd, { recursive: true }));
  fs.mkdirSync(path.join(cwd, "hidden"));
  fs.writeFileSync(
    path.join(cwd, "hidden", "implementation.ts"),
    "export {};\n",
  );
  const report = await checkBudgets(
    {
      scope: "simple-tool",
      files: "all",
      areas: [{ name: "runtime", kind: "implementation", include: ["src/**"] }],
    },
    { counter: tenLinesPerFile, cwd },
  );
  assert.equal(report.ok, false);
  assert.equal(report.violations[0]?.kind, "unclassified");
});
