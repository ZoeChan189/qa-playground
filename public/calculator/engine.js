export const calculatorCases = [
  { name: "Addition", expression: "2+3", expected: "5" },
  { name: "Precedence", expression: "2+3*4", expected: "14" },
  { name: "Parentheses", expression: "(2+3)*4", expected: "20" },
  { name: "Decimals", expression: "0.1+0.2", expected: "0.3" },
  { name: "Negative number", expression: "-5+2", expected: "-3" },
  { name: "Square root", expression: "sqrt(81)", expected: "9" },
  { name: "Power", expression: "2^10", expected: "1024" },
  { name: "Percent", expression: "200*percent(10)", expected: "20" },
  { name: "Sine in degrees", expression: "sin(30)", expected: "0.5", mode: "DEG" },
  { name: "Sine in radians", expression: "sin(pi/2)", expected: "1", mode: "RAD" },
  { name: "Logarithm", expression: "log(100)", expected: "2" },
  { name: "Division by zero", expression: "1/0", error: "DIVIDE_BY_ZERO" },
  { name: "Negative root", expression: "sqrt(-1)", error: "DOMAIN" },
  { name: "Invalid expression", expression: "2+", error: "SYNTAX" },
];

export function createCalculatorEngine(library) {
  const math = library.create(library.all, { number: "BigNumber", precision: 64 });
  const pi = math.bignumber(math.pi.toString());
  const e = math.bignumber(math.e.toString());
  function fail(code, message) { throw Object.assign(new Error(message), { code }); }
  function checked(value) {
    if (!math.isBigNumber(value) || !value.isFinite() || value.abs().greaterThan("1e1000")) fail("RANGE", "Result is outside the supported range.");
    return value;
  }
  function trig(name, value, mode) {
    const radians = mode === "DEG" ? math.multiply(value, math.divide(pi, 180)) : value;
    if (name === "tan" && math.cos(radians).abs().lessThan("1e-14")) fail("DOMAIN", "Tangent is undefined at this angle.");
    const result = math[name](radians);
    if (result.abs().lessThan("1e-14")) return math.bignumber(0);
    if (result.minus(1).abs().lessThan("1e-14")) return math.bignumber(1);
    if (result.plus(1).abs().lessThan("1e-14")) return math.bignumber(-1);
    return result;
  }
  function calculate(expression, { mode = "DEG", answer = "0" } = {}) {
    try {
      if (typeof expression !== "string" || !expression.trim()) fail("EMPTY", "Enter a calculation.");
      if (expression.length > 256 || !["DEG", "RAD"].includes(mode)) fail("RANGE", "Calculation is too long or the angle mode is invalid.");
      let tree;
      try { tree = math.parse(expression); } catch { fail("SYNTAX", "Check the numbers, operators and parentheses."); }
      let nodes = 0;
      // Only scalar calculator operations are permitted, not arbitrary mathjs programs.
      function visit(node) {
        if (++nodes > 128) fail("RANGE", "Calculation has too many operations.");
        if (node.isConstantNode && (typeof node.value === "number" || math.isBigNumber(node.value))) return checked(math.bignumber(node.value));
        if (node.isParenthesisNode) return visit(node.content);
        if (node.isSymbolNode) {
          if (node.name === "pi") return pi;
          if (node.name === "e") return e;
          if (node.name === "ans") return checked(math.bignumber(answer));
          fail("SYNTAX", "Unknown calculator symbol.");
        }
        if (node.isOperatorNode) {
          const args = node.args.map(visit);
          if (args.length === 1 && node.op === "-") return checked(math.unaryMinus(args[0]));
          if (args.length === 1 && node.op === "+") return args[0];
          if (args.length === 2 && ["+", "-", "*", "/", "^"].includes(node.op)) {
            if (node.op === "/" && args[1].isZero()) fail("DIVIDE_BY_ZERO", "Cannot divide by zero.");
            if (node.op === "^" && args[1].abs().greaterThan(1000)) fail("RANGE", "Use a power between -1000 and 1000.");
            const method = { "+": "add", "-": "subtract", "*": "multiply", "/": "divide", "^": "pow" }[node.op];
            return checked(math[method](...args));
          }
        }
        if (node.isFunctionNode && node.fn.isSymbolNode && node.args.length === 1) {
          const name = node.fn.name;
          if (!["sqrt", "sin", "cos", "tan", "log", "ln", "percent", "abs"].includes(name)) fail("SYNTAX", "This function is not supported.");
          const value = visit(node.args[0]);
          if (name === "sqrt" && value.isNegative()) fail("DOMAIN", "Square root needs a nonnegative number.");
          if (["log", "ln"].includes(name) && !value.greaterThan(0)) fail("DOMAIN", "Logarithm needs a positive number.");
          const result = ["sin", "cos", "tan"].includes(name) ? trig(name, value, mode)
            : name === "percent" ? math.divide(value, 100)
              : name === "log" ? math.log10(value) : math[name === "ln" ? "log" : name](value);
          return checked(result);
        }
        fail("SYNTAX", "Use numbers and supported calculator operations only.");
      }
      const value = visit(tree);
      return { ok: true, value: value.toString(), display: math.format(value, { precision: 14 }), expression, mode };
    } catch (error) {
      return { ok: false, code: error.code || "DOMAIN", message: error.code ? error.message : "This calculation has no supported real-number result.", expression, mode };
    }
  }
  return {
    calculate,
    runCases: () => calculatorCases.map((item) => {
      const result = calculate(item.expression, { mode: item.mode || "DEG" });
      return { ...item, actual: result.ok ? result.display : result.code, passed: item.error ? !result.ok && result.code === item.error : result.ok && result.display === item.expected };
    }),
  };
}
