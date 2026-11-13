import assert from "node:assert/strict";
import test from "node:test";
import {
  inferConfig,
  initialConfig,
  resolveAreas,
  validateConfig,
} from "../src/config.js";
import { classifyFiles, explainClassification } from "../src/classify.js";
import type {
  AreaDefinition,
  BudgetDefinition,
  CodeBudgetConfig,
} from "../src/types.js";

function kindsOf(
  files: readonly string[],
  areas: readonly AreaDefinition[],
  defaultAreas?: ReadonlySet<string>,
): Record<string, string> {
  const result = classifyFiles(files, areas, [], defaultAreas);
  assert.deepEqual(result.overlaps, {});
  const kinds: Record<string, string> = {};
  for (const area of areas) {
    for (const file of result.groups.get(area.name) ?? [])
      kinds[file] = area.kind;
  }
  for (const file of result.unmatched) kinds[file] = "unclassified";
  return kinds;
}

const budgets: BudgetDefinition[] = [
  {
    name: "production",
    include: ["src/**/*.ts"],
    exclude: ["src/**/*.test.ts"],
    maxCodeLines: 10_000,
  },
  {
    name: "support",
    include: ["src/**/*.test.ts", "test/**/*.ts"],
    maxCodeLines: 40_000,
  },
];

test("classifies files into exclusive named budgets", () => {
  const result = classifyFiles(
    ["src/index.ts", "src/index.test.ts", "test/system.test.ts", "README.md"],
    budgets,
    ["*.md"],
  );

  assert.deepEqual(result.groups.get("production"), ["src/index.ts"]);
  assert.deepEqual(result.groups.get("support"), [
    "src/index.test.ts",
    "test/system.test.ts",
  ]);
  assert.deepEqual(result.unmatched, []);
  assert.deepEqual(result.overlaps, {});
});

test("reports overlap and unmatched paths", () => {
  const result = classifyFiles(
    ["src/shared.ts", "notes.txt"],
    [
      { name: "one", include: ["src/**"], maxFiles: 1 },
      { name: "two", include: ["**/*.ts"], maxFiles: 1 },
    ],
  );

  assert.deepEqual(result.overlaps, { "src/shared.ts": ["one", "two"] });
  assert.deepEqual(result.unmatched, []);
  assert.deepEqual(result.ancillary, ["notes.txt"]);
});

test("inference and init classify tooling, tests, and runtime exclusively", () => {
  const cases: Record<string, string> = {
    ".github/workflows/ci.yml": "tooling",
    ".github/actions/local/check.test.ts": "tooling",
    ".github/actions/local/fixtures/data.json": "tooling",
    ".github/ISSUE_TEMPLATE/bug.yml": "tooling",
    ".github/PULL_REQUEST_TEMPLATE.md": "tooling",
    ".github/scripts/release.sh": "tooling",
    "src/index.ts": "implementation",
    "packages/a/src/main.ts": "implementation",
    "src/customer.config.ts": "implementation",
    "src/vite.config.ts": "tooling",
    "packages/a/tsconfig.build.json": "tooling",
    "tsconfig.json": "tooling",
    "eslint.config.mjs": "tooling",
    ".prettierrc": "tooling",
    Dockerfile: "tooling",
    "docker-compose.dev.yml": "tooling",
    Makefile: "tooling",
    ".husky/pre-commit": "tooling",
    "test/helper.ts": "verification",
    "src/__tests__/helper.ts": "verification",
    "src/fixtures/input.json": "verification",
    "src/parser_test.go": "verification",
    "src/testdata/input.json": "verification",
    "src/test_parser.py": "verification",
    "src/parser_test.py": "verification",
    "src/conftest.py": "verification",
    "benches/parse.rs": "verification",
  };
  for (const root of ["scripts", "tools", "tooling"]) {
    cases[`${root}/build.ts`] = "tooling";
    cases[`${root}/build.test.ts`] = "verification";
    cases[`${root}/test/helper.ts`] = "verification";
    cases[`${root}/specs/helper.ts`] = "verification";
    cases[`${root}/__tests__/helper.ts`] = "verification";
    cases[`${root}/fixtures/input.json`] = "verification";
    cases[`${root}/test/fixtures/input.json`] = "verification";
  }
  const inferred = inferConfig();
  const initialized = initialConfig("simple-tool");
  assert.deepEqual(inferred, initialized);
  for (const config of [inferred, initialized]) {
    validateConfig(config);
    const result = classifyFiles(Object.keys(cases), config.areas);
    assert.deepEqual(result.overlaps, {});
    assert.deepEqual(result.unmatched, []);
    for (const [file, kind] of Object.entries(cases)) {
      const explanation = explainClassification(file, config.areas);
      assert.deepEqual(
        explanation.areas
          .filter((area) => area.selected)
          .map((area) => area.kind),
        [kind],
        file,
      );
      assert.equal(
        explanation.affectsEnforcement,
        kind === "implementation",
        file,
      );
    }
    assert.deepEqual(
      classifyFiles(["unknown/main.ts", "customer.config.ts"], config.areas)
        .unmatched,
      ["unknown/main.ts", "customer.config.ts"],
    );
  }
});

test("kind precedence resolves cross-kind matches without excludes", () => {
  const areas: AreaDefinition[] = [
    { name: "server", kind: "implementation", include: ["server/**"] },
    { name: "tooling", kind: "tooling", include: ["**/build.mjs"] },
    { name: "tests", kind: "verification", include: ["**/*_test.go"] },
    {
      name: "generated",
      kind: "excluded",
      include: ["**/*.pb.go"],
      reason: "Generated by protoc.",
    },
    { name: "unknown", kind: "review", include: ["server/legacy/**"] },
  ];
  assert.deepEqual(
    kindsOf(
      [
        "server/main.go",
        "server/build.mjs",
        "server/main_test.go",
        "server/api.pb.go",
        "server/legacy/old.go",
        "server/legacy/old_test.go",
        "server/legacy/old.pb.go",
      ],
      areas,
    ),
    {
      "server/main.go": "implementation",
      "server/build.mjs": "tooling",
      "server/main_test.go": "verification",
      "server/api.pb.go": "excluded",
      "server/legacy/old.go": "review",
      "server/legacy/old_test.go": "review",
      "server/legacy/old.pb.go": "excluded",
    },
  );
  const explanation = explainClassification("server/main_test.go", areas);
  assert.deepEqual(
    explanation.areas
      .filter((area) => area.matched)
      .map((area) => [area.name, area.selected]),
    [
      ["server", false],
      ["tests", true],
    ],
  );
  assert.equal(explanation.affectsEnforcement, false);
});

test("areas of the same kind still overlap", () => {
  const result = classifyFiles(
    ["web/src/main.ts"],
    [
      { name: "web", kind: "implementation", include: ["web/**"] },
      { name: "ui", kind: "implementation", include: ["**/src/**"] },
    ],
  );
  assert.deepEqual(result.overlaps, { "web/src/main.ts": ["web", "ui"] });
});

test("product scripts can be carved out of tooling by excluding them", () => {
  const config = initialConfig("simple-tool");
  const product = {
    name: "imports",
    kind: "implementation" as const,
    include: ["scripts/import-customers/**"],
  };
  const file = "scripts/import-customers/main.ts";
  const precedence = classifyFiles([file], [...config.areas, product]);
  assert.deepEqual(precedence.overlaps, {});
  assert.deepEqual(precedence.groups.get("tooling"), [file]);
  const areas = [
    ...config.areas.map((area) =>
      area.name === "tooling"
        ? { ...area, exclude: [...area.exclude!, ...product.include] }
        : area,
    ),
    product,
  ];
  const result = classifyFiles([file, "scripts/release.ts"], areas);
  assert.deepEqual(result.overlaps, {});
  assert.deepEqual(result.groups.get("imports"), [file]);
  assert.deepEqual(result.groups.get("tooling"), ["scripts/release.ts"]);
});

test("inference recognizes Go module layouts", () => {
  const files = [
    "go.mod",
    "go.sum",
    "main.go",
    "cmd/server/main.go",
    "cmd/server/main_test.go",
    "internal/sync/sync.go",
    "internal/sync/sync_test.go",
    "internal/sync/testdata/facts.json",
    "pkg/client/client.go",
    "tools/gen/main.go",
  ];
  const config = inferConfig("simple-tool", files);
  validateConfig(config);
  assert.deepEqual(kindsOf(files, config.areas), {
    "main.go": "implementation",
    "cmd/server/main.go": "implementation",
    "cmd/server/main_test.go": "verification",
    "internal/sync/sync.go": "implementation",
    "internal/sync/sync_test.go": "verification",
    "internal/sync/testdata/facts.json": "verification",
    "pkg/client/client.go": "implementation",
    "tools/gen/main.go": "tooling",
  });
  const withoutModule = files.filter((file) => file !== "go.mod");
  assert.deepEqual(
    classifyFiles(
      withoutModule,
      inferConfig("simple-tool", withoutModule).areas,
    ).unmatched,
    [
      "main.go",
      "cmd/server/main.go",
      "internal/sync/sync.go",
      "pkg/client/client.go",
    ],
  );
});

test("inference applies root conventions to nested app roots", () => {
  const files = [
    "go.mod",
    "cmd/server/main.go",
    "web/package.json",
    "web/tsconfig.json",
    "web/src/main.tsx",
    "web/src/main.test.tsx",
    "web/scripts/serve.mjs",
    "web/vite.config.ts",
    "site/package.json",
    "site/src/index.ts",
    "services/api/go.mod",
    "services/api/main.go",
    "services/api/internal/db/db.go",
    "services/api/internal/db/db_test.go",
    "packages/ui/package.json",
    "packages/ui/src/button.tsx",
    "test/fixtures/app/package.json",
    "test/fixtures/app/src/index.ts",
    "vendor/lib/package.json",
    "vendor/lib/src/index.js",
    "examples/demo/index.ts",
  ];
  const config = inferConfig("simple-tool", files);
  validateConfig(config);
  const runtime = config.areas.find((area) => area.name === "runtime")!;
  assert.equal(
    runtime.include.some((pattern) => pattern.startsWith("packages/ui/")),
    false,
  );
  const kinds = kindsOf(files, config.areas);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(kinds).filter(([file]) => !file.endsWith(".json")),
    ),
    {
      "cmd/server/main.go": "implementation",
      "web/src/main.tsx": "implementation",
      "web/src/main.test.tsx": "verification",
      "web/scripts/serve.mjs": "tooling",
      "web/vite.config.ts": "tooling",
      "site/src/index.ts": "implementation",
      "services/api/main.go": "implementation",
      "services/api/internal/db/db.go": "implementation",
      "services/api/internal/db/db_test.go": "verification",
      "packages/ui/src/button.tsx": "implementation",
      "test/fixtures/app/src/index.ts": "verification",
      "examples/demo/index.ts": "unclassified",
    },
  );
  assert.equal(kinds["web/tsconfig.json"], "tooling");
  assert.equal(kinds["vendor/lib/src/index.js"], undefined);
});

test("defaults: true composes project areas with the defaults", () => {
  const config: CodeBudgetConfig = {
    scope: "standalone-tool",
    defaults: true,
    areas: [
      { name: "server", kind: "implementation", include: ["server/**"] },
      { name: "dashboard", kind: "implementation", include: ["web/**"] },
    ],
  };
  validateConfig(config);
  const files = [
    "server/main.go",
    "server/main_test.go",
    "server/testdata/case.json",
    "web/package.json",
    "web/src/main.tsx",
    "web/src/main.test.tsx",
    "web/vitest.config.ts",
    ".github/workflows/ci.yml",
    "Makefile",
    "scripts/testkit/run.mjs",
  ];
  const resolved = resolveAreas(config, files);
  assert.deepEqual(
    [...resolved.defaultAreas],
    ["runtime", "github", "tooling", "tests", "fixtures"],
  );
  const result = classifyFiles(
    files,
    resolved.areas,
    [],
    resolved.defaultAreas,
  );
  assert.deepEqual(result.overlaps, {});
  assert.deepEqual(result.unmatched, []);
  assert.deepEqual(result.groups.get("server"), ["server/main.go"]);
  assert.deepEqual(result.groups.get("dashboard"), [
    "web/package.json",
    "web/src/main.tsx",
  ]);
  assert.deepEqual(result.groups.get("runtime"), []);
  assert.deepEqual(result.groups.get("tests"), [
    "server/main_test.go",
    "web/src/main.test.tsx",
  ]);
  assert.deepEqual(result.groups.get("fixtures"), [
    "server/testdata/case.json",
  ]);
  assert.deepEqual(result.groups.get("tooling"), [
    "web/vitest.config.ts",
    "Makefile",
    "scripts/testkit/run.mjs",
  ]);
  assert.deepEqual(result.groups.get("github"), [".github/workflows/ci.yml"]);

  const replaced = resolveAreas(
    {
      scope: "simple-tool",
      defaults: true,
      areas: [{ name: "tooling", kind: "tooling", include: ["Makefile"] }],
    },
    files,
  );
  assert.equal(replaced.defaultAreas.has("tooling"), false);
  assert.deepEqual(
    replaced.areas.find((area) => area.name === "tooling")!.include,
    ["Makefile"],
  );
  assert.deepEqual(
    resolveAreas({ scope: "simple-tool", areas: config.areas! }).areas,
    config.areas,
  );
});
