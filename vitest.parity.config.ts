import { defineConfig } from "vitest/config";

// One-off parity gate against the Python `systems` package.
// Not part of `npm test` or the pre-commit hook; run with `npm run parity`.
export default defineConfig({
  test: {
    include: ["test/parity/**/*.parity.test.ts"],
    testTimeout: 30_000,
  },
});
