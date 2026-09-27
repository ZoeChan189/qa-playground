import { exercise } from "./common.js";

export const options = {
  scenarios: {
    load: { executor: "constant-vus", vus: 5, duration: "15s" },
  },
  thresholds: {
    http_req_duration: ["p(95)<300"],
    http_req_failed: ["rate<0.05"],
  },
};

export default function () {
  exercise("load");
}
