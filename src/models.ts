/**
 * Core modeling functionality. Port of `systems/models.py`.
 *
 * Values are `PyNum`s so that int/float semantics (and therefore rendered
 * output) match the Python implementation exactly.
 */
import { findCycles } from "./algos.js";
import { CircularReferences, IllegalSourceStock, InvalidFormula } from "./errors.js";
import {
  TOKEN_DECIMAL,
  TOKEN_FORMULA,
  TOKEN_INFINITY,
  TOKEN_OP,
  TOKEN_REFERENCE,
  TOKEN_WHOLE,
  lexFormula,
  readable,
  type FormulaToken,
} from "./lexer.js";
import {
  INF,
  KeyError,
  PyNum,
  ZERO,
  add,
  floor,
  ljust,
  max,
  min,
  mul,
  parseFloat10,
  parseInt10,
  sub,
  truediv,
  truthy,
} from "./py.js";

export const DEFAULT_MAXIMUM = INF;

/** Model state: stock name to value, in insertion order (like a Python dict). */
export type Snapshot = Map<string, PyNum>;

/** Raised where Python would raise an `AttributeError` (e.g. on `None`). */
export class AttributeError extends Error {
  override name = "AttributeError";
}

function noneAttr(attr: string): AttributeError {
  return new AttributeError(`'NoneType' object has no attribute '${attr}'`);
}

/** Python `stock.name` where `stock` may be `None`. */
function nameOf(stock: Stock | null): string {
  if (stock === null) throw noneAttr("name");
  return stock.name;
}

export type FormulaDefinition = string | number | PyNum | FormulaToken;

/**
 * Formulas are the core unit of computation in models,
 * and also serve as the interface between lexed formula
 * definitions and the underlying models.
 */
export class Formula {
  lexed: FormulaToken;
  default: PyNum;

  constructor(definition: FormulaDefinition, defaultValue: PyNum = ZERO) {
    if (typeof definition === "string") {
      this.lexed = lexFormula(definition);
    } else if (typeof definition === "number" || definition instanceof PyNum) {
      // Python: lex_formula(str(definition)). A bare JS number is treated as a
      // Python int when it is integral, otherwise as a float.
      const n =
        definition instanceof PyNum ? definition : new PyNum(definition, !Number.isInteger(definition));
      this.lexed = lexFormula(n.toString());
    } else {
      this.lexed = definition;
    }
    this.default = defaultValue;
    this.validate();
  }

  /** Ensure formula is mathematically coherent. */
  validate(): void {
    const tokens = this.lexed[1];
    if (tokens.length === 0) {
      throw new InvalidFormula(this, "formula is empty. must specify a number or a reference");
    }
    let prevKind: string | null = null;
    for (const [kind] of tokens) {
      if (kind === TOKEN_OP) {
        if (prevKind === null) {
          throw new InvalidFormula(this, "can't start with an operation");
        } else if (prevKind === TOKEN_OP) {
          throw new InvalidFormula(this, "operation can't be preceeded by an operation");
        }
      } else if (prevKind !== null && prevKind !== TOKEN_OP) {
        throw new InvalidFormula(this, "must have an operation between values or references");
      }
      prevKind = kind;
    }
    if (prevKind === TOKEN_OP) {
      throw new InvalidFormula(this, "formula cannot end with an operation");
    }
  }

  /** Return list of all (top-level) references in formula. */
  references(): string[] {
    const refs: string[] = [];
    for (const token of this.lexed[1]) {
      if (token[0] === TOKEN_REFERENCE) refs.push(token[1]);
    }
    return refs;
  }

  compute(state: Snapshot = new Map()): PyNum {
    let acc: PyNum | null = null;
    let op: string | null = null;

    // validate() has already ensured that this is a legal formula
    for (const token of this.lexed[1]) {
      let val: PyNum;
      switch (token[0]) {
        case TOKEN_OP:
          op = token[1];
          continue;
        case TOKEN_WHOLE:
          val = parseInt10(token[1]);
          break;
        case TOKEN_INFINITY:
          val = INF;
          break;
        case TOKEN_DECIMAL:
          val = parseFloat10(token[1]);
          break;
        case TOKEN_REFERENCE: {
          const v = state.get(token[1]);
          if (v === undefined) throw new KeyError(token[1]);
          val = v;
          break;
        }
        case TOKEN_FORMULA:
          val = new Formula(token).compute(state);
          break;
      }

      if (acc === null) acc = val;
      else if (op === "/") acc = truediv(acc, val);
      else if (op === "*") acc = mul(acc, val);
      else if (op === "+") acc = add(acc, val);
      else if (op === "-") acc = sub(acc, val);
    }

    if (acc !== null && truthy(acc)) return acc;
    return this.default;
  }

  /** Human readable representation of a Formula. */
  pyStr(): string {
    return `F(${readable(this.lexed)})`;
  }

  pyRepr(): string {
    return this.pyStr();
  }

  toString(): string {
    return this.pyStr();
  }
}

export class Stock {
  name: string;
  initial: Formula;
  maximum: Formula;
  show: boolean;

  constructor(name: string, initial?: Formula | 0 | null, maximum?: Formula | 0 | null, show = true) {
    this.name = name;
    this.initial = initial || new Formula(0);
    this.maximum = maximum || new Formula(INF);
    this.show = show;
  }

  pyRepr(): string {
    return `${this.constructor.name}(${this.name})`;
  }

  toString(): string {
    return this.pyRepr();
  }
}

export class Rate {
  formula: Formula;

  constructor(formula: FormulaDefinition) {
    this.formula = new Formula(formula);
  }

  calculate(state: Snapshot, src: PyNum, dest: PyNum, capacity: PyNum): [PyNum, PyNum] {
    const evaluated = this.formula.compute(state);
    if (src.value > 0) {
      let change = sub(src, evaluated).value >= 0 ? evaluated : src;
      change = min(capacity, max(ZERO, change));
      return [change, change];
    }
    return [ZERO, ZERO];
  }

  /** Raise exception if source is not legal. */
  validateSource(sourceStock: Stock | null): void {
    void sourceStock;
  }

  pyRepr(): string {
    return `${this.constructor.name}(${this.formula.pyStr()})`;
  }

  toString(): string {
    return this.pyRepr();
  }
}

/** Converts a stock into another at a discount rate. */
export class Conversion extends Rate {
  override calculate(state: Snapshot, src: PyNum, dest: PyNum, capacity: PyNum): [PyNum, PyNum] {
    const evaluated = this.formula.compute(state);
    let maxSrcChange: PyNum;
    if (dest.value === Infinity || capacity.value === Infinity) {
      maxSrcChange = src;
    } else {
      maxSrcChange = max(ZERO, floor(truediv(sub(capacity, dest), evaluated)));
    }
    const change = floor(mul(maxSrcChange, evaluated));
    if (change.value === 0) return [ZERO, ZERO];
    return [maxSrcChange, change];
  }

  override validateSource(sourceStock: Stock | null): void {
    if (sourceStock === null) throw noneAttr("initial");
    if (sourceStock.initial.compute().value === Infinity) {
      throw new IllegalSourceStock(this, sourceStock);
    }
  }
}

/** A stock leaks a percentage of its value into another. */
export class Leak extends Conversion {
  override calculate(state: Snapshot, src: PyNum, _dest: PyNum, capacity: PyNum): [PyNum, PyNum] {
    const evaluated = this.formula.compute(state);
    let change = floor(mul(src, evaluated));
    if (!Number.isNaN(capacity.value)) change = min(capacity, change);
    return [change, change];
  }
}

export class Flow {
  constructor(
    public source: Stock | null,
    public destination: Stock | null,
    public rate: Rate,
  ) {
    this.rate.validateSource(this.source);
  }

  change(state: Snapshot, sourceState: PyNum, destState: PyNum): [PyNum, PyNum] {
    if (this.destination === null) throw noneAttr("maximum");
    let capacity = this.destination.maximum.compute(state);
    if (destState.value !== Infinity) capacity = sub(capacity, destState);
    return this.rate.calculate(state, sourceState, destState, capacity);
  }

  pyRepr(): string {
    const s = (x: Stock | null) => (x === null ? "None" : x.pyRepr());
    return `${this.constructor.name}(${s(this.source)} to ${s(this.destination)} at ${this.rate.pyRepr()})`;
  }

  toString(): string {
    return this.pyRepr();
  }
}

function getOrKeyError(state: Snapshot, name: string): PyNum {
  const v = state.get(name);
  if (v === undefined) throw new KeyError(name);
  return v;
}

export class State {
  model: Model;
  state: Snapshot = new Map();

  constructor(model: Model) {
    this.model = model;
    for (const stock of model.stocks) {
      if (!model.initialPath.includes(stock.name)) {
        this.state.set(stock.name, stock.initial.compute(this.state));
      }
    }
    for (const name of model.initialPath) {
      const stock = model.getStock(name);
      if (stock === null) throw noneAttr("initial");
      this.state.set(name, stock.initial.compute(this.state));
    }
  }

  advance(): void {
    const deferred: [string, PyNum][] = [];

    // HACK (upstream): process flows from the end of the list, applying
    // removals immediately and deferring additions to the end of the round.
    for (const flow of [...this.model.flows].reverse()) {
      const srcName = nameOf(flow.source);
      const destName = nameOf(flow.destination);
      const sourceState = getOrKeyError(this.state, srcName);
      const destinationState = getOrKeyError(this.state, destName);
      const [remChange, addChange] = flow.change(this.state, sourceState, destinationState);
      this.state.set(srcName, sub(getOrKeyError(this.state, srcName), remChange));
      deferred.push([destName, addChange]);
    }

    for (const [dest, change] of deferred) {
      this.state.set(dest, add(getOrKeyError(this.state, dest), change));
    }
  }

  snapshot(): Snapshot {
    return new Map(this.state);
  }
}

/** Models contain and run stocks and flows. */
export class Model {
  name: string;
  stocks: Stock[] = [];
  flows: Flow[] = [];
  /**
   * Updated in validateInitialCycles(); the sequence used to build up the
   * initial state.
   */
  initialPath: string[] = [];

  constructor(name: string) {
    this.name = name;
  }

  getStock(name: string): Stock | null {
    return this.stocks.find((s) => s.name === name) ?? null;
  }

  infiniteStock(name: string): Stock {
    const s = new Stock(name, new Formula(INF), null, false);
    this.stocks.push(s);
    return s;
  }

  stock(...args: ConstructorParameters<typeof Stock>): Stock {
    const s = new Stock(...args);
    this.stocks.push(s);
    return s;
  }

  flow(...args: ConstructorParameters<typeof Flow>): Flow {
    const f = new Flow(...args);
    this.flows.push(f);
    return f;
  }

  validate(): void {
    this.validateExistingStocks();
    this.validateInitialCycles();
  }

  /** References in initial values must not have cycles. */
  validateInitialCycles(): void {
    const inwardRefs = new Map<string, string[]>();
    const outwardRefs = new Map<string, string[]>();
    for (const stock of this.stocks) {
      inwardRefs.set(stock.name, []);
      outwardRefs.set(stock.name, []);
    }
    for (const stock of this.stocks) {
      for (const ref of stock.initial.references()) {
        getList(outwardRefs, stock.name).push(ref);
        getList(inwardRefs, ref).push(stock.name);
      }
    }
    const [hasCycle, cycles, initialPath] = findCycles(inwardRefs, outwardRefs);
    if (hasCycle) throw new CircularReferences(cycles, outwardRefs);
    this.initialPath = initialPath;
  }

  /** All references should point to existing stocks. */
  validateExistingStocks(): void {
    const stocks = this.stocks.map((s) => s.name);
    const refs: [Formula, string][] = [];
    for (const stock of this.stocks) {
      refs.push(...stock.maximum.references().map((x): [Formula, string] => [stock.maximum, x]));
      refs.push(...stock.initial.references().map((x): [Formula, string] => [stock.initial, x]));
    }
    for (const flow of this.flows) {
      refs.push(...flow.rate.formula.references().map((x): [Formula, string] => [flow.rate.formula, x]));
    }
    for (const [formula, ref] of refs) {
      if (!stocks.includes(ref)) {
        throw new InvalidFormula(formula, `reference to non-existant stock '${ref}'`);
      }
    }
  }

  /** Run the model, returning `rounds + 1` snapshots (including the initial state). */
  run(rounds = 10): Snapshot[] {
    this.validate();
    const s = new State(this);
    const snapshots = [s.snapshot()];
    for (let i = 0; i < rounds; i++) {
      s.advance();
      snapshots.push(s.snapshot());
    }
    return snapshots;
  }

  renderHtml(results: Snapshot[]): string {
    const rows = ["<table>", "<theader>", "<tr>"];
    const colStocks = this.stocks.filter((s) => s.show);
    rows.push("<td><strong>Round</strong></td>");
    rows.push(...colStocks.map((s) => `<td><strong>${s.name}</strong></td>`));
    rows.push("</tr>", "</theader>", "<tbody>");
    results.forEach((snapshot, i) => {
      let row = `<tr><td>${i}</td>`;
      for (const col of colStocks) {
        row += `<td>${getOrKeyError(snapshot, col.name).toString()}</td>`;
      }
      row += "</tr>";
      rows.push(row);
    });
    rows.push("</tbody>", "</table>");
    return rows.join("\n");
  }

  /** Render results to string from Model run. */
  render(results: Snapshot[], sep = "\t", pad = true): string {
    const lines: string[] = [];
    const colStocks = this.stocks.filter((s) => s.show);
    lines.push(sep + colStocks.map((s) => s.name).join(sep));
    const colSize = colStocks.map((s) => s.name.length);
    results.forEach((snapshot, i) => {
      let row = String(i);
      colStocks.forEach((col, j) => {
        let num = getOrKeyError(snapshot, col.name).toString();
        if (pad) num = ljust(num, colSize[j] ?? 0);
        row += sep + num;
      });
      lines.push(row);
    });
    return lines.join("\n");
  }
}

function getList(map: Map<string, string[]>, key: string): string[] {
  const v = map.get(key);
  if (v === undefined) throw new KeyError(key);
  return v;
}

/** Convert a snapshot of `PyNum`s into plain JS numbers. */
export function toNumbers(snapshot: Snapshot): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of snapshot) out[k] = v.value;
  return out;
}

