export const MAX_LOCAL_PEAK_VUS = 200;

export function soakSteadySeconds(value = "90s") {
  const units = { ms: 0.001, s: 1, m: 60, h: 3600 };
  const parts = typeof value === "string" ? value.match(/\d+(?:\.\d+)?(?:ms|s|m|h)/g) : null;
  if (!parts || parts.join("") !== value) throw new RangeError("SOAK_STEADY must be a duration such as 90s, 5m or 1h30m.");
  const seconds = parts.reduce((sum, part) => {
    const [, amount, unit] = part.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/);
    return sum + Number(amount) * units[unit];
  }, 0);
  if (seconds < 1 || seconds > 86400) throw new RangeError("SOAK_STEADY must be between 1 second and 24 hours.");
  return seconds;
}

export function scenarioWithPeak(profile, config, peakVus) {
  if (!Number.isInteger(peakVus) || peakVus < 1 || peakVus > MAX_LOCAL_PEAK_VUS) {
    throw new RangeError(`Peak VUs must be an integer from 1 to ${MAX_LOCAL_PEAK_VUS}.`);
  }
  if (profile === "spike" && peakVus < 5) {
    throw new RangeError("Spike needs at least 5 peak VUs for its baseline.");
  }
  const stages = config.stages.map((stage) => {
    if (profile === "spike") return { ...stage, vus: stage.vus === config.peakVus ? peakVus : stage.vus };
    return { ...stage, vus: stage.vus === 0 ? 0 : Math.max(1, Math.round(stage.vus * peakVus / config.peakVus)) };
  });
  return { ...config, peakVus, stages };
}
