export const MAX_LOCAL_PEAK_VUS = 200;

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
