import { exercise } from "./common.js";

export const options = {
  scenarios: {
    spike: {
      executor: "ramping-vus",
      startVUs: 3,
      stages: [
        { duration: "3s", target: 5 },
        { duration: "1s", target: 50 },
        { duration: "7s", target: 50 },
        { duration: "1s", target: 5 },
        { duration: "4s", target: 5 },
        { duration: "2s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<350"],
    http_req_failed: ["rate<0.05"],
  },
};

export default function () {
  exercise("spike", 0.04);
}
