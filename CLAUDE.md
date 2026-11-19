# CLAUDE.md

TypeScript port of [lethain/systems](https://github.com/lethain/systems), a Python library and DSL for describing and running stocks-and-flows models. It ports upstream master `80411c8`, which matches PyPI `systems==0.1.0`. The language is specified in `docs/spec.md`.

## Commands

The project requires Node >= 26.

```bash
npm run build       # tsup -> dist/ (ESM + CJS + .d.ts, plus the CLI bins in dist/cli/)
npm test            # vitest (test/*.test.ts); excludes the parity gate
npm run lint        # eslint (typescript-eslint, type-checked)
npm run typecheck   # tsc --noEmit
npm run parity      # build, then compare against Python `systems` (see below)
```

Husky's pre-commit hook (`.husky/pre-commit`) runs lint, typecheck and test.

The CLIs read the model from stdin:

```bash
node dist/cli/run.js -r 10 [--csv] < examples/hiring.txt
```

`systems-viz`, `systems-fmt` and `systems-lex` work the same way.

## Layout

| Upstream Python | Port | Notes |
|---|---|---|
| `systems/lexer.py` | `src/lexer.ts` | |
| `systems/models.py` | `src/models.ts` | |
| `systems/parse.py` | `src/parse.ts` | |
| `systems/errors.py` | `src/errors.ts` | |
| `systems/algos.py` | `src/algos.ts` | |
| `systems/viz.py` | `src/viz.ts` | Emits DOT text directly instead of depending on the graphviz package |
| `systems/format.py` | `src/cli/fmt.ts` | |
| (none) | `src/py.ts` | Python-compatibility layer |
| `tests/test_parse.py`, `tests/test_systems.py` | `test/parse.test.ts`, `test/systems.test.ts` | One-for-one ports, keeping the Python test names |
| (none) | `test/py.test.ts` | Tests for the Python-compatibility helpers |

Names are camelCased (`lex_formula` becomes `lexFormula`, `initial_path` becomes `initialPath`).

Two fields are renamed because they would clash with `Error.name`:
- `IllegalStockName.name` is now `stockName`.
- `ConflictingValues.name` is now `stockName`.

## Fidelity rules (read before changing behaviour)

This port is deliberately **bug-for-bug compatible** with the Python version. The parity gate checks it byte for byte against the CLIs. Don't "fix" any of the following unless you mean to diverge from upstream:

- **Numbers are `PyNum`** (`{ value, isFloat }`, in `src/py.ts`). They track Python's int/float distinction, because rendered output depends on it (`5` vs `5.0`). Rules:
  - `/` always yields a float and raises `ZeroDivisionError` on zero.
  - `floor` yields an int and raises on inf or nan.
  - `min` and `max` return the first argument on a tie.
  - Floats print as Python's `repr` does: `inf`, `1e-05`, `1e+16`.
- **Formulas evaluate strictly left to right**, with no operator precedence. A result of `0` falls back to the formula's default. Only top-level references, not ones inside parentheses, are validated or used for cycle detection.
- **The lexer drops all spaces outside comments** before sub-lexing a stock or flow, so `A 3` becomes `A3`.
  - A `#` only starts a comment when nothing else has been lexed on the line yet.
  - `a > b` with no `@` creates stocks but no flow.
- **Flows run in reverse declaration order.** Each round, removals from sources apply immediately; additions to destinations are deferred to the end of the round.
- **Upstream quirks kept as-is:**
  - `Conversion` subtracts `dest` twice when working out capacity.
  - Repeating `[X]` creates duplicate infinite stocks.
  - `readable()` (`systems-fmt`) drops parentheses.
  - Respecifying the same non-default stock value raises `ConflictingValues`.
- **Tokens are arrays shaped like the Python tuples.** Arrays that are tuples in Python are created with `tuple()`, so that `pyRepr()` prints them faithfully. `ParseError` messages embed that repr.
- **Errors** keep the Python class names and message formats.
  - Python built-in errors (`KeyError`, `TypeError`, `AttributeError`, ...) are emulated where upstream would raise them.
  - Uncaught errors in the CLIs print the last line of a Python traceback to stderr (e.g. `systems.errors.InvalidFormula: ...`) and exit with code 1.

### Known, intentional differences
- Python's `parse()` prints a traceback to stdout before re-raising. This port never prints. The `tracebacks` parameter is still accepted but ignored.
- `systems-lex` prints the token tree as JSON instead of Python `pprint` output, so the parity gate skips it.
- Ints are JS numbers, so they are exact only up to 2^53. Python ints are unbounded.

## Parity gate

`test/parity/examples.parity.test.ts` runs every `examples/*.txt`, plus some extra inline specs, through the Python CLIs and the built TS CLIs, and compares:
- stdout, after stripping Python's stdout tracebacks;
- the exception line from stderr;
- the exit code.

```bash
scripts/setup-parity-env.sh   # creates .parity-venv/ and pip-installs `systems` (needs python3-venv)
npm run parity
```

Notes:
- `SYSTEMS_PY_BIN` points the gate at Python CLIs in another directory.
- `SYSTEMS_PIP_SPEC` changes what the setup script installs.
- The gate skips itself when the Python CLIs or `dist/` are missing.

When you change behaviour, add a spec to `EXTRA_SPECS` in the parity test and rerun the gate.
