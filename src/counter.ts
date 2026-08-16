import fs from "node:fs";
import path from "node:path";
import { tokei } from "@kitschpatrol/tokei";
import type {
  AreaKind,
  AreaUsage,
  CodeCounter,
  LanguageMeasurement,
} from "./types.js";

export const tokeiCounter: CodeCounter = {
  async count(absolutePaths) {
    if (absolutePaths.length === 0) return 0;
    const languages = await tokei({
      hidden: true,
      include: [...absolutePaths],
      noIgnore: true,
    });
    return languages.reduce((total, language) => total + language.code, 0);
  },
};

export async function measureFiles(
  cwd: string,
  relativePaths: readonly string[],
  kind: AreaKind,
  counter?: CodeCounter,
): Promise<AreaUsage> {
  if (relativePaths.length === 0) return emptyUsage();
  const absolutePaths = relativePaths.map((file) => path.join(cwd, file));
  if (counter) {
    const codeLines = await counter.count(absolutePaths);
    return {
      ...emptyUsage(),
      codeLines,
      files: relativePaths.length,
      languages: [
        { files: relativePaths.length, language: "Measured", lines: codeLines },
      ],
    };
  }

  const results = await tokei({
    files: true,
    hidden: true,
    include: absolutePaths,
    noIgnore: true,
  });
  const countedResults = results.filter(
    (result) =>
      kind !== "verification" ||
      !["Markdown", "Plain Text"].includes(result.language),
  );
  const languages: LanguageMeasurement[] = countedResults
    .filter((result) => result.code > 0 || result.files > 0)
    .map((result) => ({
      files: result.files,
      language: result.language,
      lines: result.code,
    }))
    .sort(
      (left, right) =>
        right.lines - left.lines || left.language.localeCompare(right.language),
    );
  let codeLines = languages.reduce(
    (total, language) => total + language.lines,
    0,
  );
  const recognized = new Set<string>();
  for (const language of countedResults) {
    for (const report of language.reports ?? []) {
      const absolute = path.resolve(report.name);
      recognized.add(normalize(path.relative(cwd, absolute)));
      recognized.add(normalize(report.name));
    }
  }

  let binaryFiles = 0;
  let textFallbackFiles = 0;
  let fallbackLines = 0;
  if (kind === "verification") {
    for (const [index, relative] of relativePaths.entries()) {
      if (recognized.has(relative) || recognized.has(absolutePaths[index]!))
        continue;
      const buffer = fs.readFileSync(absolutePaths[index]!);
      if (buffer.includes(0)) {
        binaryFiles += 1;
        continue;
      }
      textFallbackFiles += 1;
      fallbackLines += buffer
        .toString("utf8")
        .split(/\r?\n/u)
        .filter((line) => line.trim().length > 0).length;
    }
  }
  if (fallbackLines > 0) {
    languages.push({
      files: textFallbackFiles,
      language: "Text fixtures",
      lines: fallbackLines,
    });
    codeLines += fallbackLines;
  }
  return {
    binaryFiles,
    codeLines,
    files: relativePaths.length,
    languages,
    textFallbackFiles,
  };
}

export function emptyUsage(): AreaUsage {
  return {
    binaryFiles: 0,
    codeLines: 0,
    files: 0,
    languages: [],
    textFallbackFiles: 0,
  };
}

function normalize(value: string): string {
  return value.split(path.sep).join("/");
}
