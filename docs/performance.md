# Performance testing guide

## Architecture and cost

`npm run perf:*` starts **k6 on the student's own computer**. k6 calls the locally running Express endpoint `GET /api/perf/work?work=N`. Each accepted request performs `N * 1000` PBKDF2 iterations in Node's asynchronous crypto worker pool. This is real computation with real HTTP timing, not a timer that pretends to work. At most 24 jobs are admitted at once; extra requests get HTTP 503 and `Retry-After: 1`. The browser's **Run probe** button sends one request only and cannot start a load run.

The server exposes current active jobs, completed and rejected counts, last-1,000 accepted-job p95, and actual `process.memoryUsage().heapUsed`. k6 records client-side p95, request count, failure rate and throughput. **Client p95 and server p95 are different**: the former includes HTTP/network and failures; the latter covers accepted work only. The heap gauge is the Node heap, not total machine RAM, and its normal garbage-collection cycle can make it rise and fall.

No Grafana account or server is necessary for the exercise. Run k6 locally and import its JSON summary into the web page. This keeps the public host out of the load path and avoids paying for hosted load generation. The exported file remains on the student's device. In production mode the workload endpoint is limited to two requests per second per server instance (HTTP 429 above that); use the local app for k6 scenarios.

## Setup

1. Install Node.js 20+ and [Grafana k6](https://grafana.com/docs/k6/latest/set-up/install-k6/). On Windows, `start-windows.cmd` checks the required Node installation and tells you if k6 is absent.
2. Start the app with `npm start` and keep that terminal open. Check <http://localhost:4173/api/health>.
3. In a second terminal, run `npm run perf:load`, then stress, spike and soak **one at a time**. Do not run them simultaneously because their measurements interfere.
4. In Performance, choose the scenario and open its `results/<scenario>-<timestamp>.json` file. The summary shows overall thresholds and stage comparisons.

If k6 is installed portably and is not on `PATH`, set `K6_BIN` to the full `k6.exe` path before running. If port 4173 is occupied, start with a different `PORT` and set matching `BASE_URL` in the k6 terminal. The wrapper refuses a non-local `BASE_URL` unless `ALLOW_REMOTE_LOAD=1`; this override is only for a server whose operator has authorized the test.

## Scenarios and key questions

| Scenario | Planned traffic | What it answers |
| --- | --- | --- |
| Load | Ramp to 5 VUs, hold 12 s, ramp down | What is this machine's normal p95, errors and throughput? |
| Stress | Ramp through 5, 12, 24 and 40 VUs over 34 s | Where do latency and 503s first increase as demand exceeds capacity? |
| Spike | Jump from 5 to 45 VUs in 1 s, then drop back | How does the sudden burst affect failures and how quickly does the API recover? |
| Soak | Ramp to 10 VUs, hold 90 s, ramp down | Does latency/error rate drift while sustained work continues? Does heap merit investigation? |

The script records phase-specific p95 and failure rates. Stress phases follow **time windows**, so a label such as "ramp to 24" does not mean every sampled request ran at exactly 24 VUs. Spike has baseline, burst and recovery windows. Soak compares the first and last quarters of its steady hold; middle samples still contribute to overall metrics. These are teaching profiles, not a universal service-level objective. The p95/error thresholds are demonstration criteria in `src/domain/perf-scenarios.js`, not claims about production requirements.

## Reading a result

- **p95** means 95% of measured requests completed no slower than that duration. Report the endpoint, work factor, VUs, hardware and whether failures were included when comparing numbers.
- **HTTP 503** means the admission limit was reached. An intentional 503 is still a failed request from the user's perspective and appears in k6's error rate. A threshold breach exits k6 with code 1, while the JSON result is still saved.
- **Stress:** compare each ramp's p95/error rate. The first sustained rise or 503 indicates a candidate capacity boundary. Repeat runs to distinguish it from noise.
- **Spike:** compare baseline, burst and recovery. A return toward baseline after the drop is evidence of recovery; the overall average alone can hide the burst.
- **Soak:** compare early and late p95/error rate and mean Node heap. Increasing heap in one 90-second run is **not proof of a leak**; garbage collection and allocation patterns matter. A serious leak investigation needs longer repeated runs and process/GC profiling.
- **Throughput:** `http_reqs` rate is completed HTTP requests per second, not configured VUs. Increasing VUs can raise errors without increasing useful throughput.

Save results from more than one run on the same machine. Do not compare different computers as though their raw latency were an application invariant. Avoid asserting a universal breaking point or "production ready" from this toy workload. Real applications also include network, databases, cache, dependencies and realistic request mixes; this lab isolates one CPU-bound endpoint so the three test shapes are visible.

## Troubleshooting

| Symptom | Likely cause / action |
| --- | --- |
| `k6 is missing` | Install k6 or set `K6_BIN` to the executable path; reopen the terminal. |
| `QA Lab is not available` | Start `npm start`; verify the port and `BASE_URL`. |
| k6 exits 1 after printing a result | Read `THRESHOLDS`; a breached performance criterion is a measured test failure. |
| Some stress/spike requests are 503 | Expected at the 24-job admission cap. Compare phase failure rates and recovery. |
| Summary import rejects a file | Select an unmodified JSON file created by this repo's `npm run perf:*` wrapper. |
| Browser heap line rises | Check longer/repeated runs and GC before claiming a leak. |

Do not run stress, spike or soak against a public/shared deployment without the operator's permission. Public hosts can incur charges or become unavailable to classmates.
