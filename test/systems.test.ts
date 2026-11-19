// Port of tests/test_systems.py
import { describe, expect, it } from "vitest";
import { IllegalSourceStock } from "../src/errors.js";
import { lexFormula } from "../src/lexer.js";
import { Conversion, Formula, Leak, Model, Rate, type Snapshot } from "../src/models.js";
import { parseFlow } from "../src/parse.js";
import { int } from "../src/py.js";

const get = (row: Snapshot | undefined, name: string): number | undefined => row?.get(name)?.value;

describe("TestModels", () => {
  it("test_stock_maximum_rate", () => {
    const m = new Model("Maximum");
    const a = m.infiniteStock("a");
    const bMax = 3;
    const b = m.stock("b", new Formula(0), new Formula(bMax));
    m.flow(a, b, new Rate(1));
    const results = m.run();
    results.forEach((result, i) => {
      if (i > bMax) expect(get(result, "b")).toBe(bMax);
    });
  });

  it("test_illegal_conversion_leak_source", () => {
    // You can't apply a Conversion or Leak to an infinite stock.
    const m = new Model("Maximum");
    const a = m.infiniteStock("a");
    const b = m.stock("b");
    for (const rate of [new Conversion(0.25), new Leak(0.25)]) {
      expect(() => m.flow(a, b, rate)).toThrow(IllegalSourceStock);
    }
  });

  it("test_infinite_destination_stock", () => {
    // Should allow infinite stocks as destinations stock for all rates.
    for (const rate of [new Rate(5), new Conversion(0.25), new Leak(0.25)]) {
      const m = new Model("Maximum");
      const a = m.stock("a", new Formula("100"));
      const b = m.infiniteStock("b");
      m.flow(a, b, rate);
      m.run(3);
    }
  });

  it("test_stock_maximum_conversion", () => {
    const m = new Model("Maximum");
    const aInitial = 10;
    const a = m.stock("a", new Formula(aInitial));
    const bMax = 3;
    const b = m.stock("b", 0, new Formula(bMax));
    const fRate = 0.5;
    m.flow(a, b, new Conversion(fRate));
    const final = m.run(3).at(-1);
    expect(get(final, "b")).toBe(bMax);
    // 10 - ((1 / 0.5) * 3) = 4
    expect(get(final, "a")).toBe(aInitial - (1 / fRate) * bMax);
  });

  it("test_stock_maximum_leak", () => {
    const m = new Model("Maximum");
    const aInitial = 10;
    const a = m.stock("a", new Formula(aInitial));
    const bMax = 3;
    const b = m.stock("b", new Formula(0), new Formula(bMax));
    m.flow(a, b, new Leak(0.5));
    const final = m.run(2).at(-1);
    expect(get(final, "b")).toBe(bMax);
    expect(get(final, "a")).toBe(aInitial - bMax);
  });

  it("test_stock_minimums", () => {
    // Stocks should never dip below their minimum value.
    const m = new Model("Minimum");
    const a = m.stock("a", new Formula(2));
    const b = m.stock("b", new Formula(0));
    m.flow(a, b, new Rate(1));
    const final = m.run(5).at(-1);
    expect(get(final, "a")).toBe(0);
    expect(get(final, "b")).toBe(2);
  });

  it("test_stock_negative_flows", () => {
    // Stocks should never dip below their minimum value.
    const m = new Model("Minimum");
    m.stock("c", new Formula(2));
    const a = m.stock("a", new Formula(5));
    const b = m.stock("b", new Formula(0));
    m.flow(a, b, new Rate("c"));
    const final = m.run(5).at(-1);
    expect(get(final, "a")).toBe(0);
    expect(get(final, "b")).toBe(5);
  });

  it("test_partial_fulfillment_rate", () => {
    const m = new Model("Partial");
    const a = m.stock("a", new Formula(5));
    const b = m.stock("b", new Formula(0));
    parseFlow(m, a, b, "10");
    const final = m.run(3).at(-1);
    expect(get(final, "a")).toBe(0);
    expect(get(final, "b")).toBe(5);
  });

  it("test_formula_rate", () => {
    const m = new Model("Maximum");
    const a = m.infiniteStock("a");
    const b = m.stock("b");
    const c = m.stock("c");
    m.stock("d", new Formula(3));
    parseFlow(m, a, b, "d * 2");
    parseFlow(m, b, c, "d");
    const final = m.run(3).at(-1);
    expect(get(final, "b")).toBe(12);
    expect(get(final, "c")).toBe(6);
  });
});

describe("TestFormula", () => {
  it("test_simple_formulas", () => {
    const cases: [string, number][] = [
      ["0", 0],
      ["0.5", 0.5],
      ["100", 100],
      ["inf", Infinity],
    ];
    for (const [caseIn, caseOut] of cases) {
      const formula = new Formula(lexFormula(caseIn));
      expect(formula.compute().value).toBe(caseOut);
    }
  });

  it("test_reference_formulas", () => {
    const state: Snapshot = new Map([
      ["a", int(10)],
      ["b", int(5)],
      ["c", int(0)],
    ]);
    const cases: [string, number][] = [
      ["a", 10],
      ["b", 5],
      ["c", 0],
      ["a * 2", 20],
      ["b * 3", 15],
      ["c * 10", 0],
      ["2 * a", 20],
      ["3 * b", 15],
      ["10 * c", 0],
      ["b * a", 50],
      ["a * b", 50],
      ["b * b", 25],
      ["c * a", 0],
    ];
    for (const [caseIn, caseOut] of cases) {
      const formula = new Formula(lexFormula(caseIn));
      expect(formula.compute(state).value).toBe(caseOut);
    }
  });
});
