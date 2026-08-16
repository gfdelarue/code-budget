#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { analyzeRepository } from "./check.js";
import {
  findConfig,
  inferConfig,
  initialConfig,
  renderConfig,
} from "./config.js";
import { explainClassification } from "./classify.js";
import { renderExplanation, renderReport, renderScopes } from "./render.js";
import { SCOPE_NAMES, SCOPES } from "./scopes.js";
import type { ScopeName } from "./types.js";

const VERSION = "0.1.1";
type Command = "default" | "check" | "explain" | "init" | "report" | "scopes";

interface CliOptions {
  command: Command;
  configPath?: string;
  cwd: string;
  details: boolean;
  dryRun: boolean;
  force: boolean;
  help: boolean;
  json: boolean;
  noColor: boolean;
  positionals: string[];
  scope?: ScopeName;
  version: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.version) return write(`${VERSION}\n`);
  if (options.help) return write(help(options.command));
  if (!fs.existsSync(options.cwd) || !fs.statSync(options.cwd).isDirectory()) {
    throw new Error(`Repository directory does not exist: ${options.cwd}`);
  }
  if (options.command === "scopes") return runScopes(options);
  if (options.command === "init") return runInit(options);
  if (options.command === "explain") return runExplain(options);
  return runAnalysis(options);
}

async function runAnalysis(options: CliOptions): Promise<void> {
  const loaded = await findConfig(options.cwd, options.configPath);
  if (options.command === "check" && !loaded.config) {
    throw new Error(
      "check requires configuration. Run code-budget init --scope <scope>.",
    );
  }
  const configured = loaded.config !== undefined;
  const config = loaded.config ?? inferConfig();
  const report = await analyzeRepository({
    config,
    configured,
    cwd: options.cwd,
    ...(loaded.path ? { configPath: loaded.path } : {}),
  });
  if (options.json) writeJson({ command: options.command, ...report });
  else
    write(
      `${renderReport(report, { color: useColor(options), details: options.details }).join("\n")}\n`,
    );

  const enforces =
    options.command === "check" ||
    (options.command === "default" && configured);
  if (enforces && !report.ok) process.exitCode = 1;
}

async function runInit(options: CliOptions): Promise<void> {
  if (!options.scope) throw new Error("init requires --scope <scope>");
  const target = path.join(options.cwd, "code-budget.config.mjs");
  if (fs.existsSync(target) && !options.force) {
    throw new Error(
      `Refusing to replace ${target}; pass --force to replace it.`,
    );
  }
  const source = renderConfig(options.scope);
  if (!options.dryRun) fs.writeFileSync(target, source, "utf8");
  const config = initialConfig(options.scope);
  const report = await analyzeRepository({
    config,
    configured: true,
    configPath: target,
    cwd: options.cwd,
  });
  if (options.json) {
    writeJson({
      command: "init",
      config: source,
      dryRun: options.dryRun,
      target,
      ...report,
    });
  } else {
    write(`${options.dryRun ? "Would create" : "Created"}: ${target}\n`);
    if (options.dryRun) write(`\n${source}\n`);
    write(
      `${renderReport(report, { color: useColor(options), details: options.details }).join("\n")}\n`,
    );
  }
  if (!report.ok) process.exitCode = 1;
}

async function runExplain(options: CliOptions): Promise<void> {
  const file = options.positionals[0];
  if (!file) throw new Error("explain requires a path");
  if (options.positionals.length > 1)
    throw new Error("explain accepts exactly one path");
  const loaded = await findConfig(options.cwd, options.configPath);
  const config = loaded.config;
  if (config && "budgets" in config) {
    throw new Error("explain requires the 0.1 areas configuration schema");
  }
  const current = config ?? inferConfig();
  const normalized = path
    .relative(options.cwd, path.resolve(options.cwd, file))
    .split(path.sep)
    .join("/");
  const explanation = explainClassification(normalized, current.areas);
  if (options.json)
    writeJson({ command: "explain", configured: Boolean(config), explanation });
  else write(`${renderExplanation(explanation).join("\n")}\n`);
}

function runScopes(options: CliOptions): void {
  if (options.json) {
    writeJson({
      command: "scopes",
      scopes: SCOPE_NAMES.map((name) => SCOPES[name]),
    });
  } else {
    write(`${renderScopes(options.details).join("\n")}\n`);
  }
}

export function parseArgs(args: string[]): CliOptions {
  let command: Command = "default";
  let cwd = process.cwd();
  let configPath: string | undefined;
  let scope: ScopeName | undefined;
  let details = false;
  let dryRun = false;
  let force = false;
  let helpRequested = false;
  let json = false;
  let noColor = false;
  let version = false;
  const positionals: string[] = [];
  const commands = new Set<Command>([
    "check",
    "explain",
    "init",
    "report",
    "scopes",
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--help" || argument === "-h") {
      helpRequested = true;
      continue;
    }
    if (argument === "--version" || argument === "-v") {
      version = true;
      continue;
    }
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--details") {
      details = true;
      continue;
    }
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--force") {
      force = true;
      continue;
    }
    if (argument === "--no-color") {
      noColor = true;
      continue;
    }
    if (["--cwd", "--config", "--scope"].includes(argument)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--"))
        throw new Error(`${argument} requires a value`);
      if (argument === "--cwd") cwd = path.resolve(value);
      else if (argument === "--config") configPath = value;
      else {
        if (!SCOPE_NAMES.includes(value as ScopeName))
          throw new Error(`Unknown scope: ${value}`);
        scope = value as ScopeName;
      }
      index += 1;
      continue;
    }
    if (argument.startsWith("-"))
      throw new Error(`Unknown argument: ${argument}`);
    if (command === "default" && commands.has(argument as Command))
      command = argument as Command;
    else if (command === "default" && positionals.length === 0)
      throw new Error(`Unknown command: ${argument}`);
    else positionals.push(argument);
  }
  if (command !== "init" && (dryRun || force || scope))
    throw new Error("--scope, --dry-run, and --force are only valid with init");
  if (command !== "explain" && positionals.length > 0)
    throw new Error(`Unexpected argument: ${positionals[0]}`);
  return {
    command,
    cwd,
    details,
    dryRun,
    force,
    help: helpRequested,
    json,
    noColor,
    positionals,
    version,
    ...(configPath ? { configPath } : {}),
    ...(scope ? { scope } : {}),
  };
}

function help(command: Command): string {
  const common = [
    "Global options:",
    "  --cwd <path>       Repository directory",
    "  --config <path>    Configuration path",
    "  --json             Emit a versioned JSON envelope",
    "  --details          Show every diagnostic path and benchmark",
    "  --no-color         Disable terminal colors",
    "  --version          Show the version",
    "  -h, --help         Show contextual help",
    "",
  ];
  if (command === "init")
    return [
      "Usage: code-budget init --scope <scope> [--dry-run] [--force] [options]",
      "",
      ...common,
    ].join("\n");
  if (command === "explain")
    return ["Usage: code-budget explain <path> [options]", "", ...common].join(
      "\n",
    );
  if (command === "scopes")
    return [
      "Usage: code-budget scopes [--details] [options]",
      "",
      ...common,
    ].join("\n");
  if (command === "check")
    return [
      "Usage: code-budget check [options]",
      "Requires configuration and enforces it.",
      "",
      ...common,
    ].join("\n");
  if (command === "report")
    return [
      "Usage: code-budget report [options]",
      "Reports measurements without failing for excess LOC.",
      "",
      ...common,
    ].join("\n");
  return [
    "Usage: code-budget [command] [options]",
    "",
    "Commands:",
    "  report                  Measure without failing for excess LOC",
    "  check                   Enforce a configured policy",
    "  init --scope <scope>    Create a policy and run its check",
    "  scopes                  List named ceilings and benchmarks",
    "  explain <path>          Explain file classification",
    "",
    ...common,
  ].join("\n");
}

function useColor(options: CliOptions): boolean {
  return Boolean(
    process.stdout.isTTY && !options.noColor && !("NO_COLOR" in process.env),
  );
}

function writeJson(value: unknown): void {
  write(
    `${JSON.stringify({ schemaVersion: "1.0", ...(value as object) }, null, 2)}\n`,
  );
}

function write(value: string): void {
  process.stdout.write(value);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.slice(2).includes("--json")) {
    process.stdout.write(
      `${JSON.stringify({ schemaVersion: "1.0", ok: false, error: { code: "USAGE_OR_CONFIG", message } }, null, 2)}\n`,
    );
  } else {
    process.stderr.write(`code-budget: ${message}\n`);
  }
  process.exitCode = 2;
});
