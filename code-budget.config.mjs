import { defineConfig } from "./dist/index.js";

export default defineConfig({
  scope: "simple-tool",
  areas: [
    {
      name: "runtime",
      kind: "implementation",
      include: ["src/**"],
    },
    {
      name: "tests",
      kind: "verification",
      include: ["test/**"],
    },
    {
      name: "tooling",
      kind: "tooling",
      include: ["*.config.mjs", "scripts/**", "tsconfig*.json", ".github/**"],
    },
  ],
});
