# @gfdelarue/code-budget

An explicit implementation-LOC ceiling with unlimited verification.

```sh
npm install --save-dev @gfdelarue/code-budget@0.1.1
npx code-budget                 # infer and explain when unconfigured
npx code-budget init --scope simple-tool
npx code-budget                 # enforce the committed configuration
```

For a patch release, `npm run bump` increments `x.x.N` to `x.x.(N + 1)` and
updates the lockfile and versioned source/documentation references. Preview it with
`npm run bump -- --dry-run`.

Implementation includes runtime code and non-test build, release, lint, and
operational tooling. Tests, test-only helpers, and fixtures are measured but
never limited. Documentation, lockfiles, licenses, and package metadata are
reported separately. Moving source into an unmatched directory or overlapping
areas fails a configured check.

## Configuration

```js
import { defineConfig } from "@gfdelarue/code-budget";

export default defineConfig({
  scope: "platform",
  areas: [
    {
      name: "runtime",
      kind: "implementation",
      include: ["src/**", "bin/**"],
      exclude: ["**/*.test.*", "**/__tests__/**"],
    },
    {
      name: "tooling",
      kind: "implementation",
      include: ["scripts/**"],
      exclude: ["scripts/test/**", "**/*.test.*"],
    },
    {
      name: "tests",
      kind: "verification",
      include: ["test/**", "tests/**", "**/*.test.*", "**/__tests__/**"],
      exclude: ["**/fixtures/**"],
    },
    {
      name: "fixtures",
      kind: "verification",
      include: ["**/fixtures/**"],
    },
    {
      name: "generated-engine",
      kind: "excluded",
      include: ["engine/generated/**"],
      reason: "Reproduced from the checksum-pinned upstream source archive.",
    },
  ],
});
```

The standalone config names are `code-budget.config.mjs`, `.js`, and `.cjs`.
The `0.0.1` `budgets` schema remains readable and emits migration diagnostics;
its `maxFiles` and `maxBytes` limits are legacy-only.

## Commands

- `code-budget`: inferred non-failing analysis without config; `check` with it.
- `code-budget report`: report configured or inferred measurements, exit 0 for
  policy excess.
- `code-budget check`: require config; exit 1 for violations and 2 for errors.
- `code-budget init --scope <scope>`: create config and immediately check it;
  supports `--dry-run` and `--force`.
- `code-budget scopes [--details]`: show every ceiling and bundled benchmark.
- `code-budget explain <path>`: show matching patterns and enforcement effect.

All commands accept `--cwd`, `--config`, `--json`, `--details`, `--no-color`,
`--version`, and contextual `--help`. JSON writes only a versioned envelope to
stdout, including for usage and configuration errors.

## Named ceilings

| Scope             | Implementation LOC |
| ----------------- | -----------------: |
| `atomic-library`  |              1,000 |
| `simple-tool`     |             10,000 |
| `standalone-tool` |             40,000 |
| `platform`        |             75,000 |
| `infrastructure`  |            175,000 |
| `suite`           |            350,000 |

See [METHODOLOGY.md](./METHODOLOGY.md), or run `code-budget scopes --details`,
for the bundled fixed-reference benchmark dataset and counting boundary.

## Library API

The package exports `analyzeRepository`, `checkBudgets`, `defineConfig`, config
loading and classification helpers, rendering helpers, and `SCOPES` /
`SCOPE_NAMES` metadata with TypeScript declarations.
