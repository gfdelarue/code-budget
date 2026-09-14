import assert from "node:assert/strict";
import test from "node:test";
import { validateConfig } from "../src/config.js";

test("rejects duplicate budget names", () => {
  assert.throws(
    () =>
      validateConfig({
        budgets: [
          { name: "source", include: ["src/**"], maxFiles: 1 },
          { name: "source", include: ["lib/**"], maxFiles: 1 },
        ],
      }),
    /Duplicate budget name/,
  );
});

test("requires every budget to have an absolute limit", () => {
  assert.throws(
    () =>
      validateConfig({ budgets: [{ name: "source", include: ["src/**"] }] }),
    /at least one limit/,
  );
});

test("validates the 0.1 area schema and excluded reasons", () => {
  assert.throws(
    () =>
      validateConfig({
        scope: "simple-tool",
        areas: [{ name: "vendor", kind: "excluded", include: ["vendor/**"] }],
      }),
    /reason is required/,
  );
  assert.deepEqual(
    validateConfig({
      scope: "simple-tool",
      areas: [{ name: "runtime", kind: "implementation", include: ["src/**"] }],
    }),
    {
      scope: "simple-tool",
      areas: [{ name: "runtime", kind: "implementation", include: ["src/**"] }],
    },
  );
});

test("accepts tooling without reinterpreting existing implementation areas", () => {
  for (const kind of ["tooling", "implementation"] as const) {
    const config = {
      scope: "simple-tool",
      areas: [{ name: "tooling", kind, include: ["scripts/**"] }],
    };
    assert.deepEqual(validateConfig(config), config);
  }
});
