import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    target: "node26",
  },
  {
    entry: {
      "cli/run": "src/cli/run.ts",
      "cli/viz": "src/cli/viz.ts",
      "cli/fmt": "src/cli/fmt.ts",
      "cli/lex": "src/cli/lex.ts",
    },
    format: ["esm"],
    target: "node26",
    splitting: false,
    banner: { js: "#!/usr/bin/env node" },
  },
]);
