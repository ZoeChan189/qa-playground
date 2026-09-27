import http from "k6/http";
import { check, sleep } from "k6";
import { Gauge } from "k6/metrics";

const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:4173";
export const simulatedMemory = new Gauge("simulated_memory_mb");

export function exercise(profile, pauseSeconds = 0.1) {
  const response = http.get(`${baseUrl}/api/performance?profile=${profile}`, {
    tags: { profile },
  });
  check(response, {
    "status is 200": (result) => result.status === 200,
    "JSON response": (result) => result.headers["Content-Type"]?.includes("application/json"),
  });
  if (response.body) {
    try {
      simulatedMemory.add(response.json().simulatedMemoryMb, { profile });
    } catch {
      // Standard HTTP metrics still record malformed responses.
    }
  }
  sleep(pauseSeconds);
}
