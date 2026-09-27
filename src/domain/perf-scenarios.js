export const perfScenarios = {
  load: {
    label: "Load",
    work: 20,
    peakVus: 5,
    stages: [{ seconds: 3, vus: 5 }, { seconds: 12, vus: 5 }, { seconds: 2, vus: 0 }],
    p95LimitMs: 300,
    errorLimit: 0.01,
  },
  stress: {
    label: "Stress",
    work: 60,
    peakVus: 40,
    stages: [
      { seconds: 5, vus: 5 }, { seconds: 8, vus: 12 }, { seconds: 8, vus: 24 },
      { seconds: 8, vus: 40 }, { seconds: 5, vus: 0 },
    ],
    p95LimitMs: 900,
    errorLimit: 0.15,
  },
  spike: {
    label: "Spike",
    work: 60,
    peakVus: 45,
    stages: [
      { seconds: 4, vus: 5 }, { seconds: 1, vus: 45 }, { seconds: 8, vus: 45 },
      { seconds: 1, vus: 5 }, { seconds: 5, vus: 5 }, { seconds: 3, vus: 0 },
    ],
    p95LimitMs: 1000,
    errorLimit: 0.15,
  },
  soak: {
    label: "Soak",
    work: 25,
    peakVus: 10,
    stages: [{ seconds: 5, vus: 10 }, { seconds: 90, vus: 10 }, { seconds: 5, vus: 0 }],
    p95LimitMs: 500,
    errorLimit: 0.01,
  },
};
