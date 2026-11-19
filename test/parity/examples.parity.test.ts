/**
 * Parity gate: compare the TypeScript CLIs against the Python `systems`
 * package on every file in `examples/` (plus a few extra specs).
 *
 * Not part of `npm test`. Run with:
 *   scripts/setup-parity-env.sh   # once: installs Python `systems` into .parity-venv/
 *   npm run parity                # builds dist/ and runs this file
 *
 * Set SYSTEMS_PY_BIN to use Python CLIs from another directory.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const PY_BIN = process.env.SYSTEMS_PY_BIN ?? join(ROOT, ".parity-venv/bin");
const TS_BIN = join(ROOT, "dist/cli");
const EXAMPLES = join(ROOT, "examples");

const havePython = existsSync(join(PY_BIN, "systems-run"));
const haveDist = existsSync(join(TS_BIN, "run.js"));

type Cli = "run" | "viz" | "fmt";

const INVOCATIONS: [Cli, string[]][] = [
  ["run", []],
  ["run", ["-r", "10"]],
  ["run", ["-r", "25", "--csv"]],
  ["viz", []],
  ["fmt", []],
];

/** Extra specs exercising error messages and numeric formatting. */
const EXTRA_SPECS: Record<string, string> = {
  conflicting_values: "a(10) > b @ 1\nb > a(5) @ 2\n",
  circular_references: "A(D)\nB(A)\nC(B*3)\nD(C*B)\n",
  too_many_flow_params: "a > b @ Rate(1, 2)\n",
  float_division: "A(5)\nB(10)\nC((A+B)/2)\nD(B/3)\n[x] > A @ 1\nA > B @ 0.3\nB > D @ Leak(0.15)\n",
  invalid_parameters: "a(1 > b @ 1\n",
  illegal_source: "[a] > b @ 0.5\n",
  inline_comment: "a(5) > b @ 1 # trailing\n",
  zero_division: "a(10) > b @ a / 0\n",
  no_destination: "a(5) @ 2\n",
  duplicate_infinite: "[a] > b @ 1\n[a] > c @ 2\nb > [a] @ 1\n",
};

interface Result {
  status: number | null;
  stdout: string;
  stderr: string;
}

function exec(cmd: string, args: string[], input: string): Result {
  const r = spawnSync(cmd, args, { input, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const isIndented = (line: string) => /^\s/.test(line);

/**
 * Python's `parse()` prints a traceback to stdout before re-raising; drop
 * those blocks (header, indented frames, and the final exception line).
 */
function stripStdoutTracebacks(stdout: string): string {
  const out: string[] = [];
  const lines = stdout.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "Traceback (most recent call last):") {
      i++;
      while (i < lines.length && isIndented(lines[i] ?? "")) i++;
      continue; // skips the exception line too
    }
    out.push(lines[i] ?? "");
  }
  return out.join("\n");
}

/** The exception line(s) of an uncaught Python traceback on stderr. */
function stderrException(stderr: string): string {
  const lines = stderr.replace(/\n$/, "").split("\n");
  let last = -1;
  lines.forEach((l, i) => {
    if (isIndented(l)) last = i;
  });
  return lines.slice(last + 1).join("\n");
}

function compare(cli: Cli, args: string[], input: string): void {
  const py = exec(join(PY_BIN, `systems-${cli}`), args, input);
  const ts = exec(process.execPath, [join(TS_BIN, `${cli}.js`), ...args], input);

  expect(ts.stdout).toBe(stripStdoutTracebacks(py.stdout));
  expect(ts.stderr.replace(/\n$/, "")).toBe(stderrException(py.stderr));
  expect(ts.status).toBe(py.status);
}

const cases: [string, string][] = [
  ...readdirSync(EXAMPLES)
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .map((f): [string, string] => [`examples/${f}`, readFileSync(join(EXAMPLES, f), "utf8")]),
  ...Object.entries(EXTRA_SPECS).map(([k, v]): [string, string] => [`extra/${k}`, v]),
];

if (!havePython || !haveDist) {
  console.warn(
    `Skipping parity gate: ${!havePython ? `no Python systems CLIs in ${PY_BIN} (run scripts/setup-parity-env.sh)` : ""}` +
      `${!haveDist ? " no dist/ build (run npm run build)" : ""}`,
  );
}

describe.skipIf(!havePython || !haveDist)("parity with Python systems", () => {
  for (const [name, input] of cases) {
    describe(name, () => {
      for (const [cli, args] of INVOCATIONS) {
        it(`systems-${cli} ${args.join(" ")}`.trim(), () => {
          compare(cli, args, input);
        });
      }
    });
  }
});
