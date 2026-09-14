import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeRepository } from "../src/check.js";

test("analyzes source languages, structured fixtures, plain text, and binaries", async (context) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "code-budget-analysis-"));
  context.after(() => fs.rmSync(cwd, { recursive: true }));
  for (const directory of [
    "src",
    "scripts",
    "tests",
    "tests/fixtures/nested",
  ]) {
    fs.mkdirSync(path.join(cwd, directory), { recursive: true });
  }
  fs.writeFileSync(
    path.join(cwd, "src", "index.ts"),
    "export const value = 1;\n",
  );
  fs.writeFileSync(
    path.join(cwd, "src", "native.c"),
    "int value(void) { return 1; }\n",
  );
  fs.writeFileSync(
    path.join(cwd, "src", "lib.rs"),
    "pub fn value() -> i32 { 1 }\n",
  );
  fs.writeFileSync(
    path.join(cwd, "src", "task.py"),
    "def value():\n    return 1\n",
  );
  fs.writeFileSync(path.join(cwd, "scripts", "release.mjs"), "export {};\n");
  fs.writeFileSync(
    path.join(cwd, "tests", "index.test.ts"),
    "test('value', () => {});\n",
  );
  fs.writeFileSync(
    path.join(cwd, "tests", "fixtures", "data.json"),
    '{"ok":true}\n',
  );
  fs.writeFileSync(
    path.join(cwd, "tests", "fixtures", "nested", "story.txt"),
    "first\n\nsecond\n",
  );
  fs.writeFileSync(
    path.join(cwd, "tests", "fixtures", "opaque.bin"),
    Buffer.from([0, 1, 2, 3]),
  );

  const report = await analyzeRepository({
    cwd,
    configured: true,
    config: {
      scope: "simple-tool",
      files: "all",
      areas: [
        { name: "runtime", kind: "implementation", include: ["src/**"] },
        { name: "tooling", kind: "tooling", include: ["scripts/**"] },
        {
          name: "tests",
          kind: "verification",
          include: ["tests/**"],
          exclude: ["**/fixtures/**"],
        },
        { name: "fixtures", kind: "verification", include: ["**/fixtures/**"] },
      ],
    },
  });
  const languages = new Set(
    report.totals.implementation.languages.map((value) => value.language),
  );
  assert.deepEqual(
    [...languages].sort(),
    ["C", "Python", "Rust", "TypeScript"].sort(),
  );
  assert.deepEqual(report.totals.tooling.languages, [
    { language: "JavaScript", files: 1, lines: 1 },
  ]);
  assert.equal(report.totals.verification.binaryFiles, 1);
  assert.equal(report.totals.verification.textFallbackFiles, 1);
  assert.ok(report.totals.verification.codeLines >= 4);
  assert.equal(report.ok, true);
});

test("analyzeRepository infers a non-enforcing policy when config is omitted", async (context) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "code-budget-analysis-"));
  context.after(() => fs.rmSync(cwd, { recursive: true }));
  fs.mkdirSync(path.join(cwd, "src"));
  fs.writeFileSync(path.join(cwd, "src", "index.ts"), "export {};\n");
  const report = await analyzeRepository({ cwd });
  assert.equal(report.configured, false);
  assert.equal(report.inferred, true);
  assert.equal(report.ok, true);
});
