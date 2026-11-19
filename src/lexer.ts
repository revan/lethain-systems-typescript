/**
 * Lexer for the systems DSL. Port of `systems/lexer.py`.
 *
 * Tokens are arrays shaped like the Python tuples; arrays that are tuples in
 * Python are created with `tuple()` so that `pyRepr` renders them faithfully
 * (error messages embed the repr of lexed lines).
 */
import { IllegalStockName, InvalidParameters } from "./errors.js";
import { IndexError, pyRepr, tuple } from "./py.js";

export const NEWLINE = "\n";
export const WHITESPACE = " ";
export const START_INFINITE_STOCK = "[";
export const END_INFINITE_STOCK = "]";
export const START_PAREN = "(";
export const START_PARAMETER_SET = "(";
export const END_PAREN = ")";
export const END_PARAMETER_SET = ")";
export const FLOW_DIRECTION = ">";
export const FLOW_DELIMITER = "@";
export const COMMENT = "#";
export const INFINITY = "inf";

export const TOKEN_WHITESPACE = "whitespace";
export const TOKEN_LINES = "lines";
export const TOKEN_LINE = "line";
export const TOKEN_NAME = "name";
export const TOKEN_STOCK = "stock";
export const TOKEN_STOCK_INFINITE = "infinite_stock";
export const TOKEN_FLOW = "flow";
export const TOKEN_FLOW_DIRECTION = "flow_direction";
export const TOKEN_FLOW_DELIMITER = "flow_delimiter";
export const TOKEN_PARAMS = "params";
export const TOKEN_WHOLE = "whole";
export const TOKEN_DECIMAL = "decimal";
export const TOKEN_INFINITY = "inf";
export const TOKEN_REFERENCE = "reference";
export const TOKEN_FORMULA = "formula";
export const TOKEN_OP = "operation";
export const TOKEN_COMMENT = "comment";

export const LEGAL_STOCK_NAME = "[a-zA-Z][a-zA-Z0-9_]*";
export const PARAM_WHOLE = "\\-?[0-9]+";
export const PARAM_DECIMAL = "[0-9]+\\.[0-9]+";
export const OPERATIONS = "[\\/\\+\\-\\*]";

const LEGAL_STOCK_NAME_RE = new RegExp("^" + LEGAL_STOCK_NAME);
const PARAM_WHOLE_RE = new RegExp("^(?:" + PARAM_WHOLE + ")$");
const PARAM_DECIMAL_RE = new RegExp("^(?:" + PARAM_DECIMAL + ")$");
const OPERATIONS_RE = new RegExp("^(?:" + OPERATIONS + ")$");

export type ValueKind = typeof TOKEN_WHOLE | typeof TOKEN_DECIMAL | typeof TOKEN_INFINITY | typeof TOKEN_REFERENCE;
export type ValueToken = readonly [ValueKind, string];
export type OpToken = readonly [typeof TOKEN_OP, string];
export type FormulaToken = readonly [typeof TOKEN_FORMULA, FormulaItem[]];
export type FormulaItem = ValueToken | OpToken | FormulaToken;
export type ParamsToken = readonly [typeof TOKEN_PARAMS, readonly FormulaToken[]];
export type StockToken = readonly [typeof TOKEN_STOCK | typeof TOKEN_STOCK_INFINITE, string, ParamsToken];
export type FlowToken = readonly [typeof TOKEN_FLOW, string, ParamsToken];
export type FlowDirectionToken = readonly [typeof TOKEN_FLOW_DIRECTION, string];
export type FlowDelimiterToken = readonly [typeof TOKEN_FLOW_DELIMITER, string];
export type CommentToken = readonly [typeof TOKEN_COMMENT, string];
export type LineItem = StockToken | FlowToken | FlowDirectionToken | FlowDelimiterToken | CommentToken;
export type LineToken = readonly [typeof TOKEN_LINE, number, LineItem[]];
export type LinesToken = readonly [typeof TOKEN_LINES, LineToken[]];
export type Token = FormulaItem | ParamsToken | LineItem | LineToken | LinesToken;

/** Python `str.strip()` (whitespace only). */
function strip(txt: string): string {
  return txt.replace(/^\s+|\s+$/gu, "");
}

/** Lex a single value. One of: WHOLE, DECIMAL, INFINITY, REFERENCE. */
export function lexValue(txt: string): ValueToken {
  txt = strip(txt);
  if (txt === INFINITY) return tuple(TOKEN_INFINITY, txt);
  if (PARAM_WHOLE_RE.test(txt)) return tuple(TOKEN_WHOLE, txt);
  if (PARAM_DECIMAL_RE.test(txt)) return tuple(TOKEN_DECIMAL, txt);
  return tuple(TOKEN_REFERENCE, txt);
}

export function lexFormula(txt: string): FormulaToken {
  const groups: FormulaItem[][] = [];
  let tokens: FormulaItem[] = [];
  let acc = "";
  for (const c of strip(txt) + NEWLINE) {
    if (c === START_PAREN) {
      groups.push(tokens);
      tokens = [];
    } else if (c === END_PAREN) {
      if (acc) tokens.push(lexValue(acc));
      acc = "";
      const prevTokens = groups.pop();
      if (prevTokens === undefined) throw new IndexError("pop from empty list");
      prevTokens.push(tuple(TOKEN_FORMULA, tokens));
      tokens = prevTokens;
    } else if (c === WHITESPACE || c === NEWLINE) {
      if (acc) tokens.push(lexValue(acc));
      acc = "";
    } else if (OPERATIONS_RE.test(c)) {
      if (acc) {
        tokens.push(lexValue(acc));
        acc = "";
      }
      tokens.push(tuple(TOKEN_OP, c));
    } else {
      acc += c;
    }
  }
  return tuple(TOKEN_FORMULA, tokens);
}

export function lexParameters(txt: string): ParamsToken {
  if (txt === "") {
    return tuple(TOKEN_PARAMS, tuple());
  } else if (txt.startsWith(START_PARAMETER_SET) && txt.endsWith(END_PARAMETER_SET)) {
    const params = txt.slice(1, -1).split(",");
    return tuple(TOKEN_PARAMS, tuple(...params.map(lexFormula)));
  }
  throw new InvalidParameters(txt);
}

export function lexCaller<K extends typeof TOKEN_STOCK | typeof TOKEN_FLOW>(
  token: K,
  txt: string,
): readonly [K, string, ParamsToken] {
  txt = strip(txt);
  const match = LEGAL_STOCK_NAME_RE.exec(txt);
  if (!match) throw new IllegalStockName(txt, LEGAL_STOCK_NAME);

  const name = match[0];
  const rest = txt.slice(name.length);
  if (rest !== "" && !(rest.startsWith(START_PARAMETER_SET) && rest.endsWith(END_PARAMETER_SET))) {
    throw new IllegalStockName(txt, LEGAL_STOCK_NAME);
  }
  return tuple(token, name, lexParameters(rest));
}

export function lexStock(txt: string): StockToken {
  txt = strip(txt);
  if (txt.startsWith(START_INFINITE_STOCK) && txt.endsWith(END_INFINITE_STOCK)) {
    // Python uses a list (not a tuple) for infinite stock params.
    return tuple(TOKEN_STOCK_INFINITE, txt.slice(1, -1), tuple(TOKEN_PARAMS, []));
  }
  return lexCaller(TOKEN_STOCK, txt);
}

export function lexFlow(txt: string): FlowToken {
  txt = strip(txt);
  const match = LEGAL_STOCK_NAME_RE.exec(txt);
  if (match && txt.slice(match[0].length).startsWith(START_PARAMETER_SET) && txt.endsWith(END_PARAMETER_SET)) {
    return lexCaller(TOKEN_FLOW, txt);
  }
  return tuple(TOKEN_FLOW, "", lexParameters("(" + txt + ")"));
}

export function lex(txt: string): LinesToken {
  // to eliminate edge cases, every txt starts with
  // a whitespace and ends with a newline
  txt = " " + txt + "\n";

  const tokens: LineToken[] = [];
  let line: LineItem[] = [];
  let charBuff = WHITESPACE;
  let parsing: string = TOKEN_STOCK;
  let lineNum = 0;

  for (let c of [...txt].slice(1)) {
    if (c === COMMENT && line.length === 0) {
      parsing = TOKEN_COMMENT;
    } else if (parsing === TOKEN_COMMENT) {
      if (c === NEWLINE) {
        line.push(tuple(TOKEN_COMMENT, charBuff.slice(1)));
        charBuff = WHITESPACE;
      }
    } else if (parsing === TOKEN_STOCK) {
      if (c === FLOW_DIRECTION) {
        // if you encounter a flow_direction, you must encounter a flow
        line.push(lexStock(charBuff));
        line.push(tuple(TOKEN_FLOW_DIRECTION, c));
        c = WHITESPACE;
        charBuff = WHITESPACE;
        parsing = TOKEN_STOCK;
      }
      // Note: `if`, not `else if`, matching upstream.
      if (c === FLOW_DELIMITER) {
        line.push(lexStock(charBuff));
        line.push(tuple(TOKEN_FLOW_DELIMITER, c));
        c = WHITESPACE;
        charBuff = WHITESPACE;
        parsing = TOKEN_FLOW;
      } else if (c === NEWLINE) {
        if (charBuff !== WHITESPACE) line.push(lexStock(charBuff));
        charBuff = WHITESPACE;
      }
    } else if (parsing === TOKEN_FLOW) {
      if (c === NEWLINE) {
        if (charBuff !== WHITESPACE) line.push(lexFlow(charBuff));
        charBuff = WHITESPACE;
      }
    }

    if (c === NEWLINE) {
      lineNum += 1;
      if (charBuff !== WHITESPACE) throw new Error(`unused char_buff: ${charBuff}`);
      if (line.length > 0) tokens.push(tuple(TOKEN_LINE, lineNum, line));
      line = [];
      parsing = TOKEN_STOCK;
      charBuff = WHITESPACE;
    } else if ((c === WHITESPACE || c === FLOW_DIRECTION) && parsing !== TOKEN_COMMENT) {
      continue;
    } else {
      charBuff += c;
    }
  }
  return tuple(TOKEN_LINES, tokens);
}

/** Create human readable format of lexed tokens. */
export function readable(token: Token, classStr?: string): string {
  switch (token[0]) {
    case TOKEN_INFINITY:
      return INFINITY;
    case TOKEN_LINES:
      return token[1].map((x) => readable(x)).join("\n");
    case TOKEN_FORMULA:
      return token[1].map((x) => readable(x)).join(" ");
    case TOKEN_LINE:
      return token[2].map((x) => readable(x)).join(" ");
    case TOKEN_FLOW_DIRECTION:
    case TOKEN_FLOW_DELIMITER:
    case TOKEN_OP:
    case TOKEN_COMMENT:
    case TOKEN_DECIMAL:
    case TOKEN_WHOLE:
    case TOKEN_REFERENCE:
      return token[1];
    case TOKEN_PARAMS: {
      const params = token[1];
      if (params.length === 0) return "";
      const joined = params.map((x) => readable(x)).join(", ");
      return classStr ? `(${joined})` : joined;
    }
    case TOKEN_STOCK_INFINITE:
      return START_INFINITE_STOCK + token[1] + END_INFINITE_STOCK;
    case TOKEN_STOCK:
    case TOKEN_FLOW:
      return token[1] + readable(token[2], token[1]);
    default:
      return `[unexpected token: '${pyRepr(token)}']`;
  }
}
