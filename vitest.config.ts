import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@rolefox/domain": fromRoot("./packages/domain/src/index.ts"),
      "@rolefox/policy": fromRoot("./packages/policy/src/index.ts"),
      "@rolefox/connector-sdk": fromRoot(
        "./packages/connector-sdk/src/index.ts",
      ),
    },
  },
  test: {
    coverage: {
      reporter: ["text", "html"],
    },
    include: ["packages/**/*.test.ts"],
  },
});
