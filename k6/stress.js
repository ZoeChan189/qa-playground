import { exercise } from "./common.js";

export const options = {
  scenarios: {
    stress: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "6s", target: 6 },
        { duration: "8s", target: 18 },
        { duration: "10s", target: 40 },
        { duration: "5s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<300"],
    http_req_failed: ["rate<0.05"],
  },
};

export default function () {
  exercise("stress", 0.04);
}
