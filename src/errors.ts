/**
 * Custom exceptions for systems package.
 *
 * Class names and message formats mirror `systems/errors.py`. Messages are
 * computed lazily (like Python's `__str__`) because `parse()` fills in line
 * information after the error has been constructed.
 */
import { pyStr } from "./py.js";

/** Base class for systems package. */
export class SystemsException extends Error {
  constructor() {
    super();
    this.name = new.target.name;
    Object.defineProperty(this, "message", {
      get: () => this.str(),
      enumerable: false,
      configurable: true,
    });
  }

  /** Python `__str__` equivalent. */
  str(): string {
    return "";
  }

  override toString(): string {
    return this.str();
  }
}

/** Base class for parse exceptions. */
export class ParseException extends SystemsException {}

/** Base class for illegal system configurations. */
export class IllegalSystemException extends SystemsException {}

/** Illegal stock name specified. */
export class IllegalStockName extends SystemsException {
  constructor(
    public stockName: string,
    public allowed: string,
  ) {
    super();
  }

  override str(): string {
    return `name '${this.stockName}' is not a legal stock name, must be of format ${this.allowed}`;
  }
}

/** Source can't be used with this Rate. */
export class IllegalSourceStock extends IllegalSystemException {
  constructor(
    public rate: unknown,
    public source: unknown,
  ) {
    super();
  }

  override str(): string {
    return `stock '${pyStr(this.source)}' can be used as source for rate '${pyStr(this.rate)}'`;
  }
}

/** Parent class for formula exceptions. */
export class FormulaError extends IllegalSystemException {
  constructor(public formula: unknown) {
    super();
  }

  override str(): string {
    return `${this.constructor.name} for formula '${pyStr(this.formula)}'`;
  }
}

export class CircularReferences extends IllegalSystemException {
  constructor(
    public cycle: Map<string, string[]>,
    public graph: Map<string, string[]>,
  ) {
    super();
  }

  override str(): string {
    return `found cycle '${pyStr(this.cycle)}' in references '${pyStr(this.graph)}'`;
  }
}

export class InvalidFormula extends IllegalSystemException {
  constructor(
    public formula: unknown,
    public msg: string,
  ) {
    super();
  }

  override str(): string {
    return `illegal formula '${pyStr(this.formula)}' due to '${this.msg}'`;
  }
}

/** Most generic parse error. */
export class ParseError extends ParseException {
  constructor(
    public line: unknown = "",
    public lineNumber = 0,
    public exception: unknown = null,
  ) {
    super();
  }

  override str(): string {
    let s = `line ${this.lineNumber} could not be parsed: "${pyStr(this.line)}"`;
    if (this.exception !== null && this.exception !== undefined) {
      s += "\n" + errorStr(this.exception);
    }
    return s;
  }
}

export class DeferLineInfo extends ParseError {}

export class InvalidParameters extends DeferLineInfo {
  constructor(public txt: string) {
    super();
  }

  override str(): string {
    return `line ${this.lineNumber} specifies invalid parameters '${this.txt}': "${pyStr(this.line)}"`;
  }
}

/** Stock intialized with multiple distinct values. */
export class ConflictingValues extends DeferLineInfo {
  constructor(
    public stockName: string,
    public first: unknown,
    public second: unknown,
  ) {
    super();
  }

  override str(): string {
    if (this.lineNumber || pyTruthy(this.line)) {
      return `line ${this.lineNumber} initializes ${this.stockName} with conflict value ${pyStr(this.second)} (was ${pyStr(this.first)}): "${pyStr(this.line)}"`;
    }
    return `'${this.stockName}' initialized with conflicting value ${pyStr(this.second)} (was ${pyStr(this.first)})`;
  }
}

/** Specified flow type is unknown. */
export class UnknownFlowType extends DeferLineInfo {
  constructor(public flowType: string) {
    super();
  }

  override str(): string {
    return `line ${this.lineNumber} has invalid flow type "${this.flowType}": "${pyStr(this.line)}"`;
  }
}

function pyTruthy(value: unknown): boolean {
  if (Array.isArray(value) || typeof value === "string") return value.length > 0;
  return Boolean(value);
}

/** Python `str(exception)` for both systems errors and JS errors. */
export function errorStr(err: unknown): string {
  if (err instanceof SystemsException) return err.str();
  if (err instanceof Error) return err.message;
  return String(err);
}
