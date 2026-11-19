/** Parse the systems DSL into a Model. Port of `systems/parse.py`. */
import { ConflictingValues, DeferLineInfo, ParseError, UnknownFlowType } from "./errors.js";
import {
  TOKEN_DECIMAL,
  TOKEN_FLOW,
  TOKEN_STOCK,
  TOKEN_STOCK_INFINITE,
  lex,
  lexFlow,
  lexStock,
  type FlowToken,
  type StockToken,
} from "./lexer.js";
import { Conversion, DEFAULT_MAXIMUM, Formula, Leak, Model, Rate, type Flow, type Stock } from "./models.js";
import { TypeError, deepEqual } from "./py.js";

/** Build stock from the lexed components. */
export function buildStock(model: Model, token: StockToken): Stock {
  const [kind, name, [, params]] = token;

  if (kind === TOKEN_STOCK_INFINITE) {
    return model.infiniteStock(name);
  }

  const defaultInitial = new Formula(0);
  let initial = defaultInitial;
  const defaultMaximum = new Formula(DEFAULT_MAXIMUM);
  let maximum = defaultMaximum;

  if (params.length > 0) initial = new Formula(params[0]!);
  if (params.length > 1) maximum = new Formula(params[1]!);

  const exists = model.getStock(name);
  if (exists) {
    if (!deepEqual(initial.lexed, defaultInitial.lexed)) {
      if (!deepEqual(exists.initial.lexed, initial.lexed) && deepEqual(exists.initial.lexed, defaultInitial.lexed)) {
        exists.initial = initial;
      } else {
        throw new ConflictingValues(name, exists.initial, initial);
      }
    }
    if (!deepEqual(maximum.lexed, defaultMaximum.lexed)) {
      if (!deepEqual(exists.maximum.lexed, maximum.lexed) && deepEqual(exists.maximum.lexed, defaultMaximum.lexed)) {
        exists.maximum = maximum;
      } else {
        throw new ConflictingValues(name, exists.maximum, maximum);
      }
    }
    return exists;
  }

  return model.stock(name, initial, maximum);
}

/** Parse stock from raw text. Used primarily for testing or iterative parsing. */
export function parseStock(model: Model, txt: string): Stock {
  return buildStock(model, lexStock(txt));
}

export function buildFlow(model: Model, src: Stock | null, dest: Stock | null, token: FlowToken): Flow {
  const [, rawClassStr, [, params]] = token;

  let RateClass: typeof Rate;
  const classStr = rawClassStr.toLowerCase();
  if (classStr === "leak") {
    RateClass = Leak;
  } else if (classStr === "conversion") {
    RateClass = Conversion;
  } else if (classStr === "rate") {
    RateClass = Rate;
  } else if (classStr === "") {
    const first = params[0]?.[1];
    RateClass = first?.length === 1 && first[0]?.[0] === TOKEN_DECIMAL ? Conversion : Rate;
  } else {
    throw new UnknownFlowType(classStr);
  }

  // Python: rate_class(*params)
  if (params.length === 0) {
    throw new TypeError("Rate.__init__() missing 1 required positional argument: 'formula'");
  }
  if (params.length > 1) {
    throw new TypeError(`Rate.__init__() takes 2 positional arguments but ${params.length + 1} were given`);
  }
  const rate = new RateClass(params[0]!);
  return model.flow(src, dest, rate);
}

/** Parse flow from raw text. Used primarily for testing or iterative parsing. */
export function parseFlow(model: Model, src: Stock | null, dest: Stock | null, txt: string): Flow {
  return buildFlow(model, src, dest, lexFlow(txt));
}

/**
 * Parse a full model specification.
 *
 * `tracebacks` is accepted for API compatibility with the Python version,
 * which prints a traceback to stdout before re-raising; this port never
 * prints.
 */
export function parse(txt: string, tracebacks = true): Model {
  void tracebacks;
  const m = new Model("Parsed");

  const [, tokens] = lex(txt);
  for (const [, n, line] of tokens) {
    let firstStock: Stock | null = null;
    let secondStock: Stock | null = null;

    try {
      for (const token of line) {
        if (token[0] === TOKEN_STOCK || token[0] === TOKEN_STOCK_INFINITE) {
          if (firstStock === null) firstStock = buildStock(m, token);
          else if (secondStock === null) secondStock = buildStock(m, token);
        } else if (token[0] === TOKEN_FLOW) {
          buildFlow(m, firstStock, secondStock, token);
        }
      }
    } catch (e) {
      if (e instanceof DeferLineInfo) {
        e.line = line;
        e.lineNumber = n;
        throw e;
      }
      throw new ParseError(line, n, e);
    }
  }
  return m;
}
