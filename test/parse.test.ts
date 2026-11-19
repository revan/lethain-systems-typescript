// Port of tests/test_parse.py
import { describe, expect, it } from "vitest";
import {
  CircularReferences,
  ConflictingValues,
  IllegalStockName,
  InvalidFormula,
  UnknownFlowType,
} from "../src/errors.js";
import { Model, type Snapshot } from "../src/models.js";
import { parse, parseFlow, parseStock } from "../src/parse.js";

const get = (row: Snapshot | undefined, name: string): number | undefined => row?.get(name)?.value;

const EXAMPLE_FULL = `
# ignore this comment
# ignore this comment too
[a] > b @ 25
b > c @ 0.5
c > d @ Leak(0.5)
d > [e] @ 1.0
`;

const EXAMPLE_MAXIMUM = `
[a] > b @ 10
b(0, 5) > c(0, 10) @ 5
`;

describe("TestParse", () => {
  it("test_parse", () => {
    const model = parse(EXAMPLE_FULL);
    const values: Record<string, number> = { a: Infinity, b: 0, e: Infinity };
    for (const stockName of ["a", "b", "c", "d", "e"]) {
      const stock = model.getStock(stockName);
      expect(stock).not.toBeNull();
      expect(stock?.name).toBe(stockName);
      if (stockName in values) {
        expect(stock?.initial.compute().value).toBe(values[stockName]);
      }
    }
  });

  it("test_parse_complex_formula", () => {
    const spec = `[Hires] > Developers @ 1
        [Ideas] > Projects   @ Developers / (Projects+1)
        Projects > Started   @ Developers - (Started+1)
        Started > Finished   @ Developers`;
    const model = parse(spec);
    for (const name of ["Hires", "Developers", "Ideas", "Projects", "Started", "Finished"]) {
      expect(model.getStock(name)?.name).toBe(name);
    }
    for (const row of model.run(10)) {
      for (const val of row.values()) {
        expect(val.value).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("test_maximums", () => {
    const final = parse(EXAMPLE_MAXIMUM).run(4).at(-1);
    expect(get(final, "b")).toBe(5);
    expect(get(final, "c")).toBe(10);
  });

  it("test_parsing_infinity", () => {
    const txt = `
        pi_a(100, inf) > pi_b @ 10
        pi_b > [pi_c] @ 5
        `;
    const final = parse(txt).run(5).at(-1);
    expect(get(final, "pi_a")).toBe(50);
    expect(get(final, "pi_b")).toBe(30);
  });

  it("test_parse_invalid_int_or_float", () => {
    const txt = `
        c > d @ 1
        d > e @ 3
        [a] > b @ hi

        `;
    expect(() => parse(txt).run()).toThrow(InvalidFormula);
  });

  it("test_circular_formula_dependency", () => {
    const txt = `
        A(D)
        B(A)
        C(B*3)
        D(C*B)
        `;
    expect(() => parse(txt, false).run()).toThrow(CircularReferences);
  });

  it("test_non_circular_formula_dependency", () => {
    const txt = `
        A(100)
        B(A)
        C(B*3)
        D(C*B)
        `;
    const final = parse(txt).run()[0];
    expect(get(final, "A")).toBe(100);
    expect(get(final, "B")).toBe(100);
    expect(get(final, "C")).toBe(300);
    expect(get(final, "D")).toBe(30000);
  });

  it("test_parens", () => {
    const txt = `
        A(5)
        B(10)
        C((A+B)/2)
        D((((A+A) * (B+B)) / A))
        `;
    const final = parse(txt).run()[0];
    expect(get(final, "A")).toBe(5);
    expect(get(final, "B")).toBe(10);
    expect(get(final, "C")).toBe(7.5);
    expect(get(final, "D")).toBe(40);
  });

  it("test_conflicting_stock_values", () => {
    const txt = `
        a(10) > b @ 1
        b > a(5) @ 2
        `;
    let caught: unknown;
    try {
      parse(txt, false);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ConflictingValues);
    const cv = caught as ConflictingValues;
    expect(cv.stockName).toBe("a");
    expect((cv.first as { compute(): { value: number } }).compute().value).toBe(10);
    expect((cv.second as { compute(): { value: number } }).compute().value).toBe(5);
  });

  it("test_standalone_stock", () => {
    const txt = `
        a
        b(2)
        c(3, 5)

        a > b @ 1
        b > c @ 2
        `;
    const m = parse(txt);
    m.run();
    expect(m.getStock("a")?.initial.compute().value).toBe(0);
    expect(m.getStock("b")?.initial.compute().value).toBe(2);
    expect(m.getStock("c")?.initial.compute().value).toBe(3);
    expect(m.getStock("c")?.maximum.compute().value).toBe(5);
  });
});

describe("TestParseStock", () => {
  it("test_parse_stock", () => {
    const opts: [string, string, number, number][] = [
      ["[a]", "a", Infinity, Infinity],
      ["b", "b", 0, Infinity],
      ["test_this", "test_this", 0, Infinity],
      ["  test ", "test", 0, Infinity],
      [" test", "test", 0, Infinity],
      ["test(0) ", "test", 0, Infinity],
      ["test(1) ", "test", 1, Infinity],
      ["test(200) ", "test", 200, Infinity],
      ["test(0, 10) ", "test", 0, 10],
      ["test(10, 10) ", "test", 10, 10],
      ["test(10, 20) ", "test", 10, 20],
    ];
    for (const [txt, name, val, maximum] of opts) {
      const m = new Model("TestParseStock");
      const stock = parseStock(m, txt);
      expect(stock.name).toBe(name);
      expect(stock.initial.compute().value).toBe(val);
      expect(stock.maximum.compute().value).toBe(maximum);
    }
  });

  it("test_illegal_names", () => {
    for (const name of ["A", "a", "Best", "Hiring", "a1", "A0", "A_1"]) {
      parseStock(new Model("TestParseStock"), name);
    }
    for (const name of ["1", "1a", "a-", "A-", "A+", "A 3"]) {
      expect(() => parseStock(new Model("TestParseStock"), name)).toThrow(IllegalStockName);
    }
  });
});

describe("TestParseFlow", () => {
  it("test_parse_flow", () => {
    const opts: [string, string, number][] = [
      ["1", "Rate", 1],
      ["Rate(1)", "Rate", 1],
      ["0.1", "Conversion", 0.1],
      ["Conversion(0.1)", "Conversion", 0.1],
      ["leak(0.1)", "Leak", 0.1],
    ];
    for (const [txt, kind, value] of opts) {
      const m = new Model("TestParseStock");
      const source = m.stock("source");
      const destination = m.stock("destination");
      const flow = parseFlow(m, source, destination, txt);
      expect(flow.rate.constructor.name).toBe(kind);
      expect(flow.rate.formula.compute().value).toBe(value);
    }
  });

  it("test_parse_formula", () => {
    const opts: [string, string][] = [
      ["Source * 2", "Rate"],
      ["Source * Source", "Rate"],
      ["Source + Source", "Rate"],
    ];
    for (const [txt, kind] of opts) {
      const m = new Model("TestParseStock");
      const source = m.stock("source");
      const destination = m.stock("destination");
      const flow = parseFlow(m, source, destination, txt);
      expect(flow.rate.constructor.name).toBe(kind);
    }
  });

  it("test_invalid_formulas", () => {
    for (const txt of ["+", "a * ", "* a", "1 3 4"]) {
      const m = new Model("TestParseStock");
      const source = m.stock("source");
      const destination = m.stock("destination");
      expect(() => parseFlow(m, source, destination, txt)).toThrow(InvalidFormula);
    }
  });

  it("test_invalid_flows", () => {
    const m = new Model("TestParseStock");
    const source = m.stock("source");
    const destination = m.stock("destination");
    for (const txt of ["Fake(5)", "Fake(0.1)"]) {
      expect(() => parseFlow(m, source, destination, txt)).toThrow(UnknownFlowType);
    }
  });
});
