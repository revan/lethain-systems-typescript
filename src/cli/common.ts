import { readFileSync } from "node:fs";
import { SystemsException } from "../errors.js";

export function readStdin(): string {
  return readFileSync(0, "utf8");
}

/** Python `print()`. */
export function print(s: string): void {
  process.stdout.write(s + "\n");
}

/**
 * Format an uncaught error the way the last line of a Python traceback does,
 * e.g. `systems.errors.InvalidFormula: illegal formula ...`.
 */
export function pythonErrorLine(err: unknown): string {
  if (err instanceof SystemsException) {
    return `systems.errors.${err.constructor.name}: ${err.str()}`;
  }
  if (err instanceof Error) {
    return err.message ? `${err.name}: ${err.message}` : err.name;
  }
  return String(err);
}

/** Run a CLI entry point, reporting uncaught errors like Python (exit code 1). */
export function runMain(main: () => void): void {
  try {
    main();
  } catch (err) {
    process.stderr.write(pythonErrorLine(err) + "\n");
    if (process.env.SYSTEMS_DEBUG && err instanceof Error && err.stack) {
      process.stderr.write(err.stack + "\n");
    }
    process.exitCode = 1;
  }
}
