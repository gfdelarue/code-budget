# @moontern-labs/code-budget

An explicit implementation-LOC ceiling with unlimited tooling and verification.

```sh
npm install --save-dev @moontern-labs/code-budget@0.1.3
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
reported separately. Moving source into an unmatched directory or into two
areas of the same kind fails a configured check.

## Configuration

```js
import { defineConfig } from "@moontern-labs/code-budget";

export default defineConfig({
  scope: "platform",
  areas: [
    {
      name: "runtime",
      kind: "implementation",
      include: ["src/**", "bin/**"],
    },
    {
      name: "tooling",
      kind: "tooling",
      include: ["scripts/**"],
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

### Precedence

When a file matches areas of different kinds, the strongest kind classifies it:
`excluded`, then `review`, then `verification`, then `tooling`, then
`implementation`. Tests inside `src/**` therefore count as verification without
an `exclude` in the implementation area. A file that matches two areas of the
same kind fails the check as an overlap, because it would be counted twice.
`code-budget explain <path>` shows every matching area and which one won.

### Defaults plus project areas

Set `defaults: true` to keep the inferred default areas and add only what is
specific to the project:

```js
export default defineConfig({
  scope: "platform",
  defaults: true,
  areas: [
    { name: "server", kind: "implementation", include: ["server/**"] },
    {
      name: "testkit",
      kind: "verification",
      include: ["**/__testkit__/**"],
    },
  ],
});
```

Configured areas win over default areas of the same kind, so `server/**` does
not overlap the default `runtime` area. Precedence still applies across kinds,
so tests, fixtures, and tool configuration under `server/**` keep their default
classification. To change a default area, define an area with the same name
(`runtime`, `github`, `tooling`, `tests`, or `fixtures`). It replaces the
default area. Defaults are inferred again on every run, so new app roots and
conventions are picked up automatically.

### Tooling defaults

Inference, `init`, and `defaults: true` use the same classifications:

| Paths                                                                                          | Classification                    |
| ---------------------------------------------------------------------------------------------- | --------------------------------- |
| Everything under `.github/**`, including tests and templates                                   | `tooling`                         |
| Root `scripts/**`, `tools/**`, and `tooling/**`                                                | `tooling`                         |
| Root `.husky/**`                                                                               | `tooling`                         |
| `src/**`, `lib/**`, `app/**`, `packages/**`, and `bin/**`                                      | `implementation`                  |
| With a `go.mod`: `cmd/**`, `internal/**`, `pkg/**`, and `*.go` beside the `go.mod`             | `implementation`                  |
| Directories named `test`, `tests`, `spec`, `specs`, `__tests__`, or `benches`                  | `verification`, outside `.github` |
| Files matching `*.test.*`, `*.spec.*`, `*_test.go`, `test_*.py`, `*_test.py`, or `conftest.py` | `verification`, outside `.github` |
| Directories named `fixture`, `fixtures`, `__fixtures__`, or `testdata`                         | `verification`, outside `.github` |

Precedence resolves the overlaps between these rows. Recognized tests and
fixtures win over tooling and implementation, and tooling wins over
implementation.

#### Nested app roots

A directory with a `package.json`, `tsconfig.json`, `go.mod`, `pyproject.toml`,
or `Cargo.toml` is an app root. The root conventions apply relative to it. With
`web/package.json`, `web/src/**` is implementation and `web/scripts/**` is
tooling. With `services/api/go.mod`, `services/api/internal/**` is
implementation. App roots are skipped when they are already covered (such as
`packages/ui`), or when they sit inside tests, fixtures, tooling, `.github`, or
generated and vendor directories. Loose files directly inside an app root, such
as `web/build.mjs`, stay unclassified because their purpose can't be inferred.

Tool configuration patterns match at any depth. Supported `NAME.config.EXT`
files use these names: `code-budget`, `vite`, `vitest`, `webpack`, `rollup`,
`esbuild`, `tsup`, `babel`, `eslint`, `prettier`, `jest`, `playwright`, `cypress`,
`next`, `nuxt`, `svelte`, `astro`, `postcss`, and `tailwind`. Supported extensions
are `js`, `cjs`, `mjs`, `ts`, `cts`, `mts`, and `json`.

Other tooling patterns cover `tsconfig*.json`; `.eslintrc`, `.prettierrc`, and
`.babelrc`, either extensionless or with `js`, `cjs`, `mjs`, `json`, `yaml`, or
`yml`; `Makefile`, `GNUmakefile`, `Justfile`, `justfile`, `Rakefile`, `Dockerfile`,
and `Dockerfile.*`; and Compose YAML files named `compose`, `compose.*`,
`docker-compose`, or `docker-compose.*`.

These defaults cannot determine a script's purpose. Add explicit areas for
other tool configurations, deployment manifests, or tooling directories. Unknown
source-like paths still fail configured checks. Application-specific names such
as `src/customer.config.ts` stay in implementation.

### Move an existing configuration to tooling

Upgrading does not rewrite committed configurations or infer a kind from an
area's name. Change an existing tooling area's `kind` from `implementation` to
`tooling`. Give `.github/**` its own tooling area, and exclude `.github/**` from your
verification and other tooling areas. Use `code-budget init --scope <scope> --dry-run` to
inspect the complete defaults for your repository without replacing your policy.

For product logic under a tooling directory, add an implementation area such as
`include: ["scripts/import-customers/**"]`. Because tooling takes precedence over
implementation, also add that pattern to the tooling area's `exclude` list. With
`defaults: true`, do this by defining your own `tooling` area. Tests and fixtures
in the product directory keep their verification classification.

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
