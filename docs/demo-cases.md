# Classroom test case matrix

The app is the **system under test**. A displayed case is a test idea; a passing assertion or recorded k6 measurement is the evidence. Run the commands from the repository root with the server running where required.

| ID | Topic | Steps / input | Expected observation |
| --- | --- | --- | --- |
| U01 | Unit | Evaluate p95=280 ms, errors=0.5%, limits=500 ms and 1%; `npm run test:unit` | Pass: both measurements are strictly below limits. |
| U02 | Unit boundary | Set p95 equal to its limit | Fail: equality breaches the strict `<` rule. |
| U03 | Unit invalid | Call evaluator with negative p95 or an empty rate | Validation error, not a false pass. |
| A01 | API | Send `GET /api/health`; `npm run test:api` | HTTP 200 with JSON service identifier. |
| A02 | API invalid | Send negative p95 to `POST /api/evaluate` | HTTP 400 with field error. |
| A03 | API missing | Send `GET /api/not-found` or look up an unknown plan ID | HTTP 404 JSON. |
| A04 | API capacity | More than 24 in-flight `GET /api/perf/work` calls | HTTP 503 with `Retry-After`; no unlimited work queue. |
| E01 | Web E2E | Enter a one-character plan name, review | Remain on the form with a validation message. |
| E02 | Web E2E | Enter valid plan, review, go back, edit, save; `npm run test:e2e` | Values persist across steps; API creates and retrieves the same plan. |
| M01 | Mobile web | Open at 412 px and run mobile Playwright project | No page-level horizontal overflow; navigation and plan form remain usable. |
| V01 | Visual | `npm run test:visual` | Stable specimen matches committed baseline. |
| V02 | Visual regression | `npm run test:demo-failures` | Shifted specimen fails screenshot comparison intentionally. |
| AI01 | AI-assisted | Build prompt, ask an external AI to draft a test, inspect and execute it | Human verifies selectors, assertions and actual result; generated prose alone is not a test pass. |
| C01 | CI/CD | Push or open PR | GitHub Actions runs unit, API, browser and visual checks. |
| C02 | CI reporting | A browser assertion fails | Workflow is red and uploads the Playwright report on failure. |

## Main topic: performance

| ID | Scenario | What to compare | Expected interpretation |
| --- | --- | --- | --- |
| P01 | Load, 5 VUs | Overall p95, errors, throughput | Reference baseline for the same machine and endpoint. |
| P02 | Stress, ramp 5/12/24/40 VUs | Per-ramp p95 and failures, active jobs, 503s | Identify the first stage where degradation appears; record whether the 24-job cap was reached. |
| P03 | Stress ramp-down | Peak vs ramp-down p95/failures | Check whether the service returns toward baseline after load falls. |
| P04 | Spike, 5 to 45 VUs in 1 s | Baseline, burst and recovery p95/failures | Sudden demand may trigger 503; recovery should improve after the burst. |
| P05 | Soak, 10 VUs held for 90 s | Early vs late p95/failures and average actual Node heap | Look for sustained degradation; a single short run cannot establish a memory leak. |
| P06 | Bad input / guardrails | `work=0`, `work=101`, missing k6, unavailable server or unauthorized remote URL | Clear validation or setup message; no accidental remote load. |

`npm run perf:spike` can return exit code 1 when an error threshold is breached. That is the expected *test verdict* under sufficient load; exact measurements depend on CPU, background processes and runtime. Do not claim a universal breaking point from one laptop. `npm run test:demo-failures` also exits nonzero by design.
