import { describe, expect, it } from "vitest";
import * as math from "mathjs";
import { createCalculatorEngine, calculatorCases } from "../../public/calculator/engine.js";

const engine = createCalculatorEngine(math);
describe("shared Web / Android calculator", () => {
  it.each(calculatorCases)("$name", (item) => {
    const result = engine.calculate(item.expression, { mode: item.mode || "DEG" });
    if (item.error) expect(result).toMatchObject({ ok: false, code: item.error });
    else expect(result).toMatchObject({ ok: true, display: item.expected });
  });
  it("compares expected errors rather than treating every error as a failed case", () => {
    expect(engine.runCases()).toHaveLength(14);
    expect(engine.runCases().every((item) => item.passed)).toBe(true);
  });
  it.each(["import(1)", "a=2", "[1,2]", '"hello"', "2 cm", "random()", "sqrt.constructor(1)", "true", "false", "null"])("rejects non-calculator syntax: %s", (input) => {
    expect(engine.calculate(input)).toMatchObject({ ok: false, code: "SYNTAX" });
  });
  it("supports previous answers without reducing them to display precision", () => {
    const third = engine.calculate("1/3");
    expect(engine.calculate("ans*3", { answer: third.value }).display).toBe("1");
  });
  it("rejects undefined tangent, empty input and expensive powers", () => {
    expect(engine.calculate("tan(90)").code).toBe("DOMAIN");
    expect(engine.calculate("").code).toBe("EMPTY");
    expect(engine.calculate("2^1001").code).toBe("RANGE");
    expect(engine.calculate("1".repeat(257)).code).toBe("RANGE");
  });
});
