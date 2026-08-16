import type { ScopeDefinition, ScopeName } from "./types.js";

export const METHODOLOGY_REFERENCE =
  "https://github.com/gfdelarue/code-budget/blob/v0.1.1/METHODOLOGY.md";

export const SCOPES: Readonly<Record<ScopeName, ScopeDefinition>> =
  Object.freeze({
    "atomic-library": scope(
      "atomic-library",
      1_000,
      "One narrowly focused function or library",
      [
        benchmark(
          "yocto-queue",
          "sindresorhus/yocto-queue",
          "ce72d41de87b2a4ec7c50e10480300bee674d845",
          61,
        ),
      ],
    ),
    "simple-tool": scope(
      "simple-tool",
      10_000,
      "A focused tool or substantial single-purpose library",
      [
        benchmark(
          "nanoid",
          "ai/nanoid",
          "5b1220d5c25386558350ab737626819f795f7b30",
          149,
        ),
      ],
    ),
    "standalone-tool": scope(
      "standalone-tool",
      40_000,
      "A serious standalone tool with a bounded purpose",
      [
        benchmark(
          "jq",
          "jqlang/jq",
          "71c2ab509a8628dbbad4bc7b3f98a64aa90d3297",
          35_142,
        ),
      ],
    ),
    platform: scope(
      "platform",
      75_000,
      "An extensible framework or developer platform",
      [
        benchmark(
          "Express runtime",
          "expressjs/express",
          "cd7d4397c398a3f3ecadeaf9ef6ac1377bd414c4",
          1_127,
        ),
      ],
    ),
    infrastructure: scope(
      "infrastructure",
      175_000,
      "An infrastructure engine, server, or large runtime",
      [
        benchmark(
          "Redis server",
          "redis/redis",
          "e91a340e241cf0abe3c6a0c254214fbe4aa1d95f",
          146_650,
        ),
      ],
    ),
    suite: scope(
      "suite",
      350_000,
      "A coordinated suite containing multiple substantial systems",
      [
        benchmark(
          "Grafana server backend",
          "grafana/grafana",
          "4c0e7045f97f356716755b47183b22e7f12bb4bf",
          350_478,
        ),
      ],
    ),
  });

export const SCOPE_NAMES = Object.freeze(Object.keys(SCOPES) as ScopeName[]);

function scope(
  name: ScopeName,
  implementationLoc: number,
  description: string,
  benchmarks: ScopeDefinition["benchmarks"],
): ScopeDefinition {
  return Object.freeze({ benchmarks, description, implementationLoc, name });
}

function benchmark(
  name: string,
  repository: string,
  commit: string,
  implementationLoc: number,
) {
  return Object.freeze({ commit, implementationLoc, name, repository });
}
