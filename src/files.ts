import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { FileSet } from "./types.js";

const ALWAYS_EXCLUDED_DIRECTORIES = new Set([".git", "node_modules"]);

export function listFiles(cwd: string, fileSet: FileSet): string[] {
  if (fileSet !== "all") {
    const gitFiles = listGitFiles(cwd, fileSet);
    if (gitFiles) return gitFiles;
  }
  return walk(cwd);
}

function listGitFiles(
  cwd: string,
  fileSet: Exclude<FileSet, "all">,
): string[] | null {
  try {
    const args =
      fileSet === "tracked"
        ? ["ls-files", "-z", "--cached"]
        : ["ls-files", "-z", "--cached", "--others", "--exclude-standard"];
    const stdout = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return stdout
      .split("\0")
      .filter(Boolean)
      .filter((relativePath) =>
        fs.statSync(path.join(cwd, relativePath)).isFile(),
      )
      .map(normalizePath)
      .sort();
  } catch {
    return null;
  }
}

function walk(cwd: string): string[] {
  const paths: string[] = [];
  visit(cwd);
  return paths.sort();

  function visit(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!ALWAYS_EXCLUDED_DIRECTORIES.has(entry.name)) {
          visit(path.join(directory, entry.name));
        }
        continue;
      }
      if (entry.isFile()) {
        paths.push(
          normalizePath(path.relative(cwd, path.join(directory, entry.name))),
        );
      }
    }
  }
}

export function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}
