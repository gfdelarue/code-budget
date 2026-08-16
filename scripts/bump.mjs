#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const dryRun = process.argv.slice(2).includes("--dry-run");
const unexpected = process.argv
  .slice(2)
  .filter((argument) => argument !== "--dry-run");

if (unexpected.length > 0) {
  throw new Error(`Unknown argument: ${unexpected[0]}`);
}

const packagePath = path.join(repositoryRoot, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const current = packageJson.version;
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);

if (!match) throw new Error(`Package version is not exact semver: ${current}`);

const next = `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
const versionedFiles = [
  "README.md",
  "src/cli.ts",
  "src/scopes.ts",
  "test/cli.test.ts",
];
const replacements = versionedFiles.map((relativePath) => {
  const absolutePath = path.join(repositoryRoot, relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  const updated = source.replaceAll(current, next);
  if (updated === source) {
    throw new Error(`${relativePath} does not reference ${current}`);
  }
  return { absolutePath, updated };
});

if (!dryRun) {
  execFileSync(
    "npm",
    ["version", next, "--no-git-tag-version", "--ignore-scripts"],
    { cwd: repositoryRoot, stdio: "ignore" },
  );
  for (const replacement of replacements) {
    fs.writeFileSync(replacement.absolutePath, replacement.updated);
  }
}

process.stdout.write(
  `${dryRun ? "Would bump" : "Bumped"} @gfdelarue/code-budget ${current} -> ${next}\n`,
);
