import { exercise } from "./common.js";

export const options = {
  scenarios: {
    soak: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "5s", target: 12 },
        { duration: "35s", target: 12 },
        { duration: "5s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<350"],
    http_req_failed: ["rate<0.05"],
  },
};

export default function () {
  exercise("soak", 0.08);
}
