/**
 * Python compatibility helpers.
 *
 * The upstream library is written in Python and its observable output (the
 * tables printed by `systems-run`, error messages, ...) depends on Python's
 * numeric tower and `str`/`repr` formatting. To be byte-for-byte compatible
 * we track whether a value is a Python `int` or `float` and mirror Python's
 * arithmetic and formatting rules.
 */

/** Raised where Python would raise a `ZeroDivisionError`. */
export class ZeroDivisionError extends Error {
  override name = "ZeroDivisionError";
}

/** Raised where Python would raise an `OverflowError`. */
export class OverflowError extends Error {
  override name = "OverflowError";
}

/** Raised where Python would raise a `ValueError`. */
export class ValueError extends Error {
  override name = "ValueError";
}

/** Raised where Python would raise a `KeyError`. */
export class KeyError extends Error {
  override name = "KeyError";
  constructor(readonly key: string) {
    super(pyRepr(key));
  }
}

/** Raised where Python would raise a `TypeError`. */
export class TypeError extends Error {
  override name = "TypeError";
}

/** A number carrying Python's int/float distinction. */
export class PyNum {
  readonly value: number;
  readonly isFloat: boolean;

  constructor(value: number, isFloat: boolean) {
    // Python ints have no negative zero.
    this.value = !isFloat && Object.is(value, -0) ? 0 : value;
    this.isFloat = isFloat;
  }

  valueOf(): number {
    return this.value;
  }

  /** Python's `str()` of this number. */
  toString(): string {
    return this.isFloat ? formatFloat(this.value) : formatInt(this.value);
  }
}

/** Python `int` value. */
export function int(value: number): PyNum {
  return new PyNum(value, false);
}

/** Python `float` value. */
export function float(value: number): PyNum {
  return new PyNum(value, true);
}

export const INF = float(Infinity);
export const ZERO = int(0);

/** Python `int(txt)` for a string matching `-?[0-9]+`. */
export function parseInt10(txt: string): PyNum {
  return int(Number.parseInt(txt, 10));
}

/** Python `float(txt)` for a decimal string or `inf`. */
export function parseFloat10(txt: string): PyNum {
  return float(Number.parseFloat(txt));
}

function either(a: PyNum, b: PyNum): boolean {
  return a.isFloat || b.isFloat;
}

export function add(a: PyNum, b: PyNum): PyNum {
  return new PyNum(a.value + b.value, either(a, b));
}

export function sub(a: PyNum, b: PyNum): PyNum {
  return new PyNum(a.value - b.value, either(a, b));
}

export function mul(a: PyNum, b: PyNum): PyNum {
  return new PyNum(a.value * b.value, either(a, b));
}

/** Python true division (`/`): always a float, raises on zero. */
export function truediv(a: PyNum, b: PyNum): PyNum {
  if (b.value === 0) {
    throw new ZeroDivisionError("division by zero");
  }
  return float(a.value / b.value);
}

/** Python `math.floor`: returns an int, raises on inf/nan. */
export function floor(a: PyNum): PyNum {
  if (!a.isFloat) {
    return a;
  }
  if (Number.isNaN(a.value)) {
    throw new ValueError("cannot convert float NaN to integer");
  }
  if (!Number.isFinite(a.value)) {
    throw new OverflowError("cannot convert float infinity to integer");
  }
  return int(Math.floor(a.value));
}

/** Python `min(a, b)`: the first argument wins ties. */
export function min(a: PyNum, b: PyNum): PyNum {
  return b.value < a.value ? b : a;
}

/** Python `max(a, b)`: the first argument wins ties. */
export function max(a: PyNum, b: PyNum): PyNum {
  return b.value > a.value ? b : a;
}

/** Python truthiness of a number. */
export function truthy(a: PyNum): boolean {
  return a.value !== 0;
}

export function formatInt(value: number): string {
  if (!Number.isFinite(value)) {
    return formatFloat(value);
  }
  return BigInt(value).toString();
}

/** Python `repr(float)`: shortest round-trip digits, Python exponent rules. */
export function formatFloat(value: number): string {
  if (Number.isNaN(value)) return "nan";
  if (value === Infinity) return "inf";
  if (value === -Infinity) return "-inf";
  if (value === 0) return Object.is(value, -0) ? "-0.0" : "0.0";

  const sign = value < 0 ? "-" : "";
  // toExponential() with no argument yields the shortest round-trip digits.
  const [mantissa = "", expStr = "0"] = Math.abs(value).toExponential().split("e");
  const digits = mantissa.replace(".", "");
  const exp = Number.parseInt(expStr, 10);

  if (exp < -4 || exp >= 16) {
    const frac = digits.slice(1);
    const expSign = exp < 0 ? "-" : "+";
    const expAbs = String(Math.abs(exp)).padStart(2, "0");
    return `${sign}${digits[0] ?? ""}${frac ? "." + frac : ""}e${expSign}${expAbs}`;
  }

  if (exp < 0) {
    return `${sign}0.${"0".repeat(-exp - 1)}${digits}`;
  }
  const intLen = exp + 1;
  if (digits.length <= intLen) {
    return `${sign}${digits}${"0".repeat(intLen - digits.length)}.0`;
  }
  return `${sign}${digits.slice(0, intLen)}.${digits.slice(intLen)}`;
}

/** Python `repr(str)`. */
export function reprString(s: string): string {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === quote || ch === "\\") out += "\\" + ch;
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (code < 0x20 || code === 0x7f) out += "\\x" + code.toString(16).padStart(2, "0");
    else out += ch;
  }
  return out + quote;
}

/**
 * Marks an array that should be rendered as a Python tuple by `pyRepr`.
 * Plain arrays render as Python lists.
 */
export const TUPLE: unique symbol = Symbol("python-tuple");

/** Create an array that `pyRepr` renders as a Python tuple. */
export function tuple<const T extends readonly unknown[]>(...items: T): T {
  const arr = [...items];
  Object.defineProperty(arr, TUPLE, { value: true, enumerable: false });
  return arr as unknown as T;
}

export function isTuple(value: unknown): boolean {
  return Array.isArray(value) && (value as unknown as Record<symbol, unknown>)[TUPLE] === true;
}

/** An object that knows its own Python `repr`. */
export interface PyReprable {
  pyRepr(): string;
}

function hasPyRepr(value: unknown): value is PyReprable {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Partial<PyReprable>).pyRepr === "function"
  );
}

/** Python `repr()` of strings, numbers, lists, tuples and dicts. */
export function pyRepr(value: unknown): string {
  if (typeof value === "string") return reprString(value);
  if (value instanceof PyNum) return value.toString();
  if (typeof value === "number") return Number.isInteger(value) ? formatInt(value) : formatFloat(value);
  if (typeof value === "boolean") return value ? "True" : "False";
  if (value === null || value === undefined) return "None";
  if (hasPyRepr(value)) return value.pyRepr();
  if (Array.isArray(value)) {
    const items = value.map(pyRepr);
    if (isTuple(value)) {
      return items.length === 1 ? `(${items[0]},)` : `(${items.join(", ")})`;
    }
    return `[${items.join(", ")}]`;
  }
  if (value instanceof Map) {
    const items = [...(value as Map<unknown, unknown>).entries()].map(
      ([k, v]) => `${pyRepr(k)}: ${pyRepr(v)}`,
    );
    return `{${items.join(", ")}}`;
  }
  return Object.prototype.toString.call(value);
}

/** Python `str()`: like repr, except strings are returned as-is. */
export function pyStr(value: unknown): string {
  if (typeof value === "string") return value;
  if (hasPyRepr(value) && typeof (value as { pyStr?: unknown }).pyStr === "function") {
    return (value as unknown as { pyStr(): string }).pyStr();
  }
  return pyRepr(value);
}

/** Python `str.ljust`. */
export function ljust(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

/** Structural equality of lexed tokens (Python tuple/list `==`). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length || isTuple(a) !== isTuple(b)) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  return false;
}

/** Raised where Python would raise an `IndexError`. */
export class IndexError extends Error {
  override name = "IndexError";
}
