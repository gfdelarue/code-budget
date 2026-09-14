import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

function fixture(context: { after(callback: () => void): void }): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "code-budget-cli-"));
  context.after(() => fs.rmSync(cwd, { recursive: true }));
  return cwd;
}

function cli(arguments_: string[]) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", ...arguments_],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
    },
  );
}

test("bare unconfigured analysis succeeds and gives setup commands", (context) => {
  const cwd = fixture(context);
  fs.mkdirSync(path.join(cwd, "src"));
  fs.writeFileSync(
    path.join(cwd, "src", "index.ts"),
    "export const value = 1;\n",
  );
  const result = cli(["--cwd", cwd]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /INFERRED - no policy is configured/);
  assert.match(result.stdout, /code-budget init --scope <scope>/);
  assert.equal(result.stderr, "");
});

test("JSON errors stay pure on stdout and use exit 2", (context) => {
  const cwd = fixture(context);
  const result = cli(["check", "--cwd", cwd, "--json"]);
  assert.equal(result.status, 2);
  assert.equal(result.stderr, "");
  const envelope = JSON.parse(result.stdout) as any;
  assert.equal(envelope.schemaVersion, "1.0");
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, "USAGE_OR_CONFIG");
});

test("init requires a named scope, supports dry run, and refuses replacement", (context) => {
  const cwd = fixture(context);
  assert.equal(cli(["init", "--cwd", cwd]).status, 2);
  const dry = cli([
    "init",
    "--scope",
    "atomic-library",
    "--dry-run",
    "--cwd",
    cwd,
  ]);
  assert.equal(dry.status, 0);
  assert.equal(fs.existsSync(path.join(cwd, "code-budget.config.mjs")), false);
  const scopeDirectory = path.join(cwd, "node_modules", "@gfdelarue");
  fs.mkdirSync(scopeDirectory, { recursive: true });
  fs.symlinkSync(root, path.join(scopeDirectory, "code-budget"), "junction");
  const create = cli(["init", "--scope", "atomic-library", "--cwd", cwd]);
  assert.equal(create.status, 0);
  assert.equal(cli(["--cwd", cwd]).status, 0);
  const refusal = cli(["init", "--scope", "atomic-library", "--cwd", cwd]);
  assert.equal(refusal.status, 2);
  assert.match(refusal.stderr, /Refusing to replace/);
});

test("all named scopes are accepted by init dry-run", (context) => {
  const cwd = fixture(context);
  for (const scope of [
    "atomic-library",
    "simple-tool",
    "standalone-tool",
    "platform",
    "infrastructure",
    "suite",
  ]) {
    assert.equal(
      cli(["init", "--scope", scope, "--dry-run", "--cwd", cwd]).status,
      0,
      scope,
    );
  }
});

test("report does not fail an exceeded policy while check and bare config do", (context) => {
  const cwd = fixture(context);
  fs.mkdirSync(path.join(cwd, "src"));
  fs.writeFileSync(
    path.join(cwd, "src", "large.ts"),
    `${"const value = 1;\n".repeat(1_010)}`,
  );
  fs.writeFileSync(
    path.join(cwd, "code-budget.config.mjs"),
    `export default { scope: "atomic-library", areas: [{ name: "runtime", kind: "implementation", include: ["src/**"] }] };\n`,
  );
  assert.equal(cli(["report", "--cwd", cwd]).status, 0);
  assert.equal(cli(["check", "--cwd", cwd]).status, 1);
  assert.equal(cli(["--cwd", cwd]).status, 1);
});

test("contextual help, version, scopes, explain, and unknown arguments", (context) => {
  const cwd = fixture(context);
  assert.match(cli(["check", "--help"]).stdout, /Requires configuration/);
  assert.equal(cli(["--version"]).stdout, "0.1.2\n");
  assert.match(cli(["scopes", "--details"]).stdout, /Methodology:/);
  assert.match(
    cli(["explain", "src\/index.ts", "--cwd", cwd]).stdout,
    /Affects enforcement: yes/,
  );
  assert.equal(cli(["wat"]).status, 2);
  assert.equal(cli(["--unknown"]).status, 2);
});

test("tooling is measured without consuming the ceiling or verification ratio", (context) => {
  const cwd = fixture(context);
  for (const directory of ["src", "test", "scripts", ".github/workflows"]) {
    fs.mkdirSync(path.join(cwd, directory), { recursive: true });
  }
  fs.writeFileSync(path.join(cwd, "src/main.ts"), "export const value = 1;\n");
  fs.writeFileSync(
    path.join(cwd, "test/main.test.ts"),
    "const x = 1;\nconst y = 2;\n",
  );
  fs.writeFileSync(
    path.join(cwd, "scripts/release.py"),
    "print('release')\n".repeat(1_010),
  );
  fs.writeFileSync(path.join(cwd, ".github/workflows/ci.yml"), "name: CI\n");
  const initial = cli([
    "init",
    "--scope",
    "atomic-library",
    "--dry-run",
    "--cwd",
    cwd,
    "--json",
  ]);
  assert.equal(initial.status, 0, initial.stderr);
  const report = JSON.parse(initial.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.totals.implementation.codeLines, 1);
  assert.equal(report.totals.verification.codeLines, 2);
  assert.equal(report.totals.tooling.codeLines, 1_011);
  assert.equal(report.totals.tooling.files, 2);
  assert.deepEqual(report.violations, []);
  assert.deepEqual(report.diagnostics.overlaps, {});
  assert.deepEqual(report.diagnostics.unclassified, []);
  const rendered = cli(["--cwd", cwd]);
  assert.equal(rendered.status, 0, rendered.stderr);
  assert.match(
    rendered.stdout,
    /TOOLING \(UNLIMITED\)\n  1,011 LOC in 2 files/,
  );
  assert.match(rendered.stdout, /Python: 1,010 LOC/);
  assert.match(rendered.stdout, /Verification-to-implementation ratio: 2.00:1/);
  const explanation = cli([
    "explain",
    ".github/workflows/ci.yml",
    "--cwd",
    cwd,
    "--json",
  ]);
  assert.equal(explanation.status, 0, explanation.stderr);
  assert.equal(
    JSON.parse(explanation.stdout).explanation.affectsEnforcement,
    false,
  );
});
