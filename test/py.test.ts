// Tests for the Python-compatibility helpers (not part of the upstream suite).
import { describe, expect, it } from "vitest";
import {
  KeyError,
  OverflowError,
  ValueError,
  ZeroDivisionError,
  add,
  deepEqual,
  float,
  floor,
  formatFloat,
  int,
  max,
  min,
  mul,
  pyRepr,
  sub,
  truediv,
  tuple,
} from "../src/py.js";

describe("formatFloat matches Python repr(float)", () => {
  it.each([
    [0, "0.0"],
    [-0, "-0.0"],
    [1, "1.0"],
    [7.5, "7.5"],
    [0.1 + 0.2, "0.30000000000000004"],
    [1e16, "1e+16"],
    [1.2345678901234568e17, "1.2345678901234568e+17"],
    [9999999999999998, "9999999999999998.0"],
    [1e-5, "1e-05"],
    [0.0001, "0.0001"],
    [2.5e-7, "2.5e-07"],
    [1e22, "1e+22"],
    [Infinity, "inf"],
    [-Infinity, "-inf"],
    [NaN, "nan"],
  ])("%s -> %s", (value, expected) => {
    expect(formatFloat(value)).toBe(expected);
  });
});

describe("int/float arithmetic", () => {
  it("keeps ints as ints", () => {
    expect(add(int(2), int(3)).toString()).toBe("5");
    expect(sub(int(2), int(3)).toString()).toBe("-1");
    expect(mul(int(2), int(3)).toString()).toBe("6");
  });

  it("promotes to float when either side is a float", () => {
    expect(add(int(2), float(3)).toString()).toBe("5.0");
    expect(mul(float(0.5), int(4)).toString()).toBe("2.0");
  });

  it("true division always yields a float", () => {
    expect(truediv(int(4), int(2)).toString()).toBe("2.0");
    expect(() => truediv(int(1), int(0))).toThrow(ZeroDivisionError);
  });

  it("floor yields an int and rejects inf/nan", () => {
    expect(floor(float(2.7)).toString()).toBe("2");
    expect(() => floor(float(Infinity))).toThrow(OverflowError);
    expect(() => floor(float(NaN))).toThrow(ValueError);
  });

  it("min/max return the first argument on ties", () => {
    expect(min(float(3), int(3)).toString()).toBe("3.0");
    expect(max(int(0), float(0)).toString()).toBe("0");
  });

  it("int(-0) is 0", () => {
    expect(mul(int(0), int(-1)).toString()).toBe("0");
  });
});

describe("pyRepr", () => {
  it("renders tuples, lists and strings like Python", () => {
    expect(pyRepr(tuple("a", "it's", 'q"', "n\n", tuple()))).toBe(`('a', "it's", 'q"', 'n\\n', ())`);
    expect(pyRepr(tuple(tuple("x", [1])))).toBe("(('x', [1]),)");
    expect(pyRepr(new Map([["a", ["b"]]]))).toBe("{'a': ['b']}");
  });

  it("KeyError message is the repr of the key", () => {
    expect(new KeyError("x").message).toBe("'x'");
  });

  it("deepEqual distinguishes tuples from lists", () => {
    expect(deepEqual(tuple("a", ["b"]), tuple("a", ["b"]))).toBe(true);
    expect(deepEqual(tuple("a"), ["a"])).toBe(false);
  });
});
