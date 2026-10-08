import { parseMetric } from "./evaluation.js";

const allowedScenarios = new Set(["stress", "spike", "soak"]);

export function validatePlan(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const value = {
    name: typeof source.name === "string" ? source.name.trim().replace(/\s+/g, " ") : "",
    scenario: typeof source.scenario === "string" ? source.scenario.trim() : "",
    targetVus: parseMetric(source.targetVus),
    notes: typeof source.notes === "string" ? source.notes.trim() : "",
  };
  const errors = {};
  if (value.name.length < 3 || value.name.length > 40) errors.name = "Use 3 to 40 characters.";
  if (!allowedScenarios.has(value.scenario)) errors.scenario = "Choose stress, spike or soak.";
  if (!Number.isInteger(value.targetVus) || value.targetVus < 1 || value.targetVus > 50) errors.targetVus = "Use 1 to 50 virtual users.";
  if ((source.notes != null && typeof source.notes !== "string") || value.notes.length > 200) errors.notes = "Use text with 200 characters or fewer.";
  return { valid: Object.keys(errors).length === 0, errors, value };
}
