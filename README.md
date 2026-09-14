# @gfdelarue/code-budget

An explicit implementation-LOC ceiling with unlimited tooling and verification.

```sh
npm install --save-dev @gfdelarue/code-budget@0.1.2
npx code-budget                 # infer and explain when unconfigured
npx code-budget init --scope simple-tool
npx code-budget                 # enforce the committed configuration
```

For a patch release, `npm run bump` increments `x.x.N` to `x.x.(N + 1)` and
updates the lockfile and versioned source/documentation references. Preview it with
`npm run bump -- --dry-run`.

Implementation measures product code. Tooling measures development, build,
release, lint, and operational support separately, without a ceiling. Tests,
test-only helpers, and fixtures are also measured but never limited. Documentation, lockfiles, licenses, and package metadata are
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
      kind: "tooling",
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

### Tooling defaults

Inference and `init` use the same classifications:

| Paths                                                                                                       | Classification                                                   |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Everything under `.github/**`, including tests and templates                                                | `tooling`                                                        |
| Root `scripts/**`, `tools/**`, and `tooling/**`                                                             | `tooling`, except recognized tests and fixtures                  |
| Root `.husky/**`                                                                                            | `tooling`, except recognized tests and fixtures                  |
| `src/**`, `lib/**`, `app/**`, `packages/**`, and `bin/**`                                                   | `implementation`, except recognized tooling, tests, and fixtures |
| Directories named `test`, `tests`, `spec`, `specs`, or `__tests__`; files matching `*.test.*` or `*.spec.*` | `verification`, outside `.github/**`                             |
| Directories named `fixture`, `fixtures`, or `__fixtures__`                                                  | `verification`, outside `.github/**`                             |

Tool configuration patterns match at any depth. Supported `NAME.config.EXT`
files use these names: `code-budget`, `vite`, `vitest`, `webpack`, `rollup`,
`esbuild`, `tsup`, `babel`, `eslint`, `prettier`, `jest`, `playwright`, `cypress`,
`next`, `nuxt`, `svelte`, `astro`, `postcss`, and `tailwind`. Supported extensions
are `js`, `cjs`, `mjs`, `ts`, `cts`, `mts`, and `json`.

Other tooling patterns cover `tsconfig*.json`; `.eslintrc`, `.prettierrc`, and
`.babelrc`, either extensionless or with `js`, `cjs`, `mjs`, `json`, `yaml`, or
`yml`; `Makefile`, `GNUmakefile`, `Justfile`, `justfile`, `Rakefile`, `Dockerfile`,
and `Dockerfile.*`; and Compose YAML files named `compose`, `compose.*`,
`docker-compose`, or `docker-compose.*`. Recognized tests and fixtures take
precedence over these patterns outside `.github/**`.

These defaults cannot determine a script's purpose. Add explicit areas for
other tool configurations, deployment manifests, or tooling directories. Unknown
source-like paths still fail configured checks. Application-specific names such
as `src/customer.config.ts` stay in implementation.

### Move an existing configuration to tooling

Upgrading does not rewrite committed configurations or infer a kind from an
area's name. Change an existing tooling area's `kind` from `implementation` to
`tooling`. Give `.github/**` its own tooling area, and exclude `.github/**` from
any other matching areas. Use `code-budget init --scope <scope> --dry-run` to
inspect the complete defaults without replacing your policy.

For product logic under a tooling directory, add an implementation area such as
`include: ["scripts/import-customers/**"]`. Add that same pattern to the tooling
area's `exclude` list. Retain separate verification rules for any tests and
fixtures in the product directory. Overlapping areas still fail checks.

Reports include `TOOLING (UNLIMITED)` and JSON `totals.tooling`, including file,
LOC, and language counts. Tooling contributes to the combined language report,
but not the implementation ceiling or verification-to-implementation ratio.
The JSON envelope remains version `1.0` with the additive tooling total and kind.
Consumers that exhaustively handle area kinds must accept `tooling`.

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
