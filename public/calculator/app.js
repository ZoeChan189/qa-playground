import { createCalculatorEngine } from "./engine.js";

const byId = (id) => document.getElementById(id);
const expression = byId("calc-expression");
const result = byId("calc-result");
const status = byId("calc-status");
const native = window.Capacitor?.getPlatform?.() === "android";
byId("calc-platform").textContent = native ? "Android" : "Web";
if (new URLSearchParams(location.search).get("embedded") === "1") document.body.classList.add("embedded");
const engine = createCalculatorEngine(window.math);
const storageKey = "qa-calculator-v1";
let mode = "DEG";
let answer = "0";
let completed = false;
let history = [];
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved && ["DEG", "RAD"].includes(saved.mode)) mode = saved.mode;
  if (Array.isArray(saved?.history)) history = saved.history.filter((item) => typeof item.expression === "string" && item.expression.length <= 256 && typeof item.display === "string" && item.display.length <= 100 && ["DEG", "RAD"].includes(item.mode)).slice(0, 10);
} catch { /* Storage can be disabled or contain an older invalid record. */ }
function save() { try { localStorage.setItem(storageKey, JSON.stringify({ mode, history })); } catch { /* Calculator remains usable without storage. */ } }
function setStatus(text, error = false) { status.textContent = text; status.className = error ? "error" : ""; }
function setMode(next) {
  mode = next;
  byId("calc-deg").setAttribute("aria-pressed", String(mode === "DEG"));
  byId("calc-rad").setAttribute("aria-pressed", String(mode === "RAD"));
  setStatus(`${mode} mode`);
  completed = false;
  save();
}
function renderHistory() {
  byId("calc-history-empty").hidden = history.length > 0;
  byId("calc-clear-history").disabled = !history.length;
  byId("calc-history").replaceChildren(...history.map((entry) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    const label = document.createElement("span");
    label.textContent = `${entry.expression} [${entry.mode}]`;
    const value = document.createElement("strong");
    value.textContent = entry.display;
    button.append(label, value);
    button.addEventListener("click", () => { setMode(entry.mode); expression.value = entry.expression; completed = false; result.textContent = entry.display; setStatus("History selected"); });
    li.append(button);
    return li;
  }));
  resizeParent();
}
function resizeParent() {
  if (window.parent !== window) window.parent.postMessage({ type: "qa-calculator-size", height: Math.ceil(document.documentElement.scrollHeight) }, location.origin);
}
function insert(text) {
  if (completed) expression.value = /^[+*/^\-]$/.test(text) ? "ans" : "";
  completed = false;
  const start = expression.selectionStart ?? expression.value.length;
  const end = expression.selectionEnd ?? start;
  const next = expression.value.slice(0, start) + text + expression.value.slice(end);
  if (next.length > 256) { setStatus("Maximum expression length is 256 characters.", true); return; }
  expression.value = next;
  expression.setSelectionRange(start + text.length, start + text.length);
  setStatus("Not calculated");
}
function evaluate() {
  const measured = engine.calculate(expression.value, { mode, answer });
  if (!measured.ok) { result.textContent = "Error"; setStatus(`${measured.code}: ${measured.message}`, true); completed = false; return; }
  result.textContent = measured.display;
  answer = measured.value;
  byId("calc-answer-indicator").textContent = `Ans: ${measured.display}`;
  setStatus("Calculated");
  completed = true;
  history.unshift({ expression: expression.value, display: measured.display, mode });
  history.length = Math.min(history.length, 10);
  save();
  renderHistory();
}
function action(name) {
  if (name === "evaluate") return evaluate();
  if (name === "clear") { expression.value = ""; result.textContent = "0"; completed = false; setStatus("Cleared"); return; }
  if (name === "delete") {
    completed = false;
    const start = expression.selectionStart ?? expression.value.length;
    const end = expression.selectionEnd ?? start;
    const removeAt = start === end ? Math.max(0, start - 1) : start;
    expression.value = expression.value.slice(0, removeAt) + expression.value.slice(end);
    expression.setSelectionRange(removeAt, removeAt);
    setStatus("Not calculated");
    return;
  }
  const base = completed ? "ans" : expression.value || "0";
  const next = { square: `(${base})^2`, reciprocal: `1/(${base})`, negate: `-(${base})`, percent: `percent(${base})` }[name];
  if (next?.length > 256) { setStatus("Maximum expression length is 256 characters.", true); return; }
  if (next) { expression.value = next; completed = false; setStatus("Not calculated"); }
}
document.querySelectorAll("[data-insert]").forEach((button) => button.addEventListener("click", () => insert(button.dataset.insert)));
document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => action(button.dataset.action)));
expression.addEventListener("input", () => { completed = false; setStatus("Not calculated"); });
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === "Enter" && (event.target === expression || event.target === document.body)) { event.preventDefault(); evaluate(); }
  else if (event.key === "Escape") { event.preventDefault(); action("clear"); }
  else if (event.target !== expression && event.target === document.body) {
    if (/^[0-9.+\-*/^()]$/.test(event.key)) { event.preventDefault(); insert(event.key); }
    else if (event.key === "Backspace") { event.preventDefault(); action("delete"); }
    else if (event.key === "%") { event.preventDefault(); action("percent"); }
  }
});
byId("calc-deg").addEventListener("click", () => setMode("DEG"));
byId("calc-rad").addEventListener("click", () => setMode("RAD"));
byId("calc-clear-history").addEventListener("click", () => { history = []; save(); renderHistory(); });
byId("calc-run-cases").addEventListener("click", () => {
  const cases = engine.runCases();
  const passed = cases.filter((item) => item.passed).length;
  byId("calc-case-verdict").textContent = `${passed === cases.length ? "PASS" : "FAIL"} - ${passed} / ${cases.length} cases matched`;
  byId("calc-case-verdict").className = passed === cases.length ? "pass" : "fail";
  byId("calc-case-rows").replaceChildren(...cases.map((item) => {
    const row = document.createElement("tr");
    for (const value of [item.name, item.error || item.expected, item.actual, item.passed ? "PASS" : "FAIL"]) { const cell = document.createElement("td"); cell.textContent = value; row.append(cell); }
    const input = document.createElement("small"); input.textContent = `${item.expression} [${item.mode || "DEG"}]`; row.firstElementChild.append(input);
    row.lastElementChild.className = item.passed ? "pass" : "fail";
    return row;
  }));
  document.querySelector(".test-table-wrap").hidden = false;
  resizeParent();
});
new ResizeObserver(resizeParent).observe(document.body);
setMode(mode);
renderHistory();
