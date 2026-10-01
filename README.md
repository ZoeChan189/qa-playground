# QA Lab

One small, real web application for SWT301 testing demonstrations. **Performance testing is the main topic**: k6 sends HTTP traffic to an actual CPU-bound Node.js API, while the browser shows server telemetry and reads k6 summaries. The other seven topics have focused, runnable cases. This is a teaching target, not a commercial service or a clone of the named testing tools.

## Start in Windows

Each group member can run an independent local copy. See the [step-by-step Vietnamese guide](docs/for-team.md) and the [beginner Word guide](docs/QA_Lab_Performance_Huong_dan_de_hieu.docx).

1. On this GitHub page, choose **Code > Download ZIP**, then extract it (or clone the repo).
2. Install Node.js 20+ and, for real performance runs, Grafana k6. Verify `node -v`, `npm -v`, and `k6 version` in a new terminal.
3. Double-click `start-windows.cmd`. It installs project dependencies on first use and starts the local site. Open <http://localhost:4173> and keep that terminal open.
4. On the local Performance page, choose Stress, Spike or Soak and click **Run local k6**. Wait for the detailed result to appear, then repeat for the other scenarios. Use `run-performance-windows.cmd` only if you also want JSON evidence in `results/`.

If Node.js is missing or older than 20, install [Node.js 20+](https://nodejs.org/en/download), reopen the terminal, and try again. Other desktop platforms can run `npm ci` then `npm start`. A visitor to a hosted copy only needs a browser. The core lab needs no database, account or paid service; Gemini is optional and requires a server-side API key.

## What to click

- **Performance:** choose Load, Stress, Spike or Soak; inspect the planned VU curve and limits. **Run local k6** generates real load on your own computer and updates detailed results on this page automatically after each run. **Run probe** sends only one request. **Open summary** remains available for older JSON results.
- **Unit:** edit latency, error rate and thresholds; compare pass, boundary and invalid results.
- **API:** send preset valid/invalid requests and inspect HTTP status and JSON.
- **Web E2E:** create, review and save a test plan through the real UI and API.
- **Mobile web:** use a narrow screen or Playwright's mobile project; check overflow and repeat the plan flow.
- **Visual:** compare the stable specimen to its screenshot baseline; the shifted variant intentionally fails the image assertion.
- **AI-assisted:** generate draft test cases through Gemini when configured, or build a prompt for another AI tool. Review the draft and run its proposed test; generation alone is not a pass.
- **CI/CD:** open GitHub Actions to see automated unit, API, desktop, mobile and visual checks.

See [the case matrix](docs/demo-cases.md) and [the performance guide](docs/performance.md) for class demonstrations and interpretation.

## Automated tests

```bash
npm test
npx playwright install chromium
npm run test:e2e
npm run test:visual
```

`npm run test:all` combines unit, API and browser checks. `npm run test:demo-failures` deliberately produces a nonzero exit to show visual regression detection; run it separately. Browser visual baselines are committed for Windows Chromium. CI also runs on Windows so the screenshot comparison is consistent.

## Run real performance tests

Install [Grafana k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) on the **load generator** computer. Start this app locally and click **Run local k6** for each scenario. The latest completed result, including request counts, HTTP status counts, latency percentiles, phase measurements and threshold decisions, appears below the button. A new run clears the previous result while it is in progress. Browser-started summaries are held in the local server's memory and are lost on restart; use screenshots for evidence or run the commands below if you need saved JSON files. In a second terminal, the equivalent commands are:

```bash
npm run perf:load
npm run perf:stress
npm run perf:spike
npm run perf:soak
```

For a larger **local-only** run, change **Local peak VUs** on the Performance page and click **Run local k6**, or copy its command, for example `npm run perf:stress -- --vus 120`. The supported range is 1–200 VUs (5–200 for Spike). Run one scenario at a time and watch your computer's CPU. More VUs do not guarantee a high p95: the 24-job admission cap can return fast HTTP 503s, making the **error-rate** threshold fail while latency remains below its limit.

The command-line wrapper checks k6 and the target before starting, and saves a JSON summary to `results/`; the web button does not create a lasting file. If k6 is installed as a portable executable, set `K6_BIN` to its full path before starting the local server. A crossed threshold makes k6 exit nonzero but its measurements still appear on the page. The default target is `127.0.0.1:4173`. Remote load is blocked unless the operator explicitly allows it with `ALLOW_REMOTE_LOAD=1`. **Do not stress-test a public/shared host without permission.** The web button is disabled on a production host; local runs avoid hosting cost, and CI never runs the load scripts.

The target performs real asynchronous PBKDF2 work and caps concurrent jobs at 24, returning HTTP 503 above capacity. k6 records real response times, error rates, request counts and phase comparisons. The API reports actual Node heap usage, not a simulated memory value. An overall threshold can pass even when some requests fail; inspect the phase table too. These short, single-machine tests illustrate methods, not production capacity. See [performance methodology and caveats](docs/performance.md).

## Hosting

Use a provider that runs a Node.js service. Set install/build to `npm ci`, start to `npm start`, and expose the assigned `PORT`. Production mode listens on all interfaces; local development listens only on `127.0.0.1` unless `HOST` is set. GitHub Pages or other static-only hosting cannot run this API. With `NODE_ENV=production`, the expensive endpoint admits at most two requests per second per server instance (HTTP 429 after that), so the hosted site is for browsing and light probes. Run substantial k6 traffic against a local copy to avoid shared-server load or fees. There is no app-wide authentication; the optional AI endpoint requires a group code. Saved test plans and telemetry are in memory and disappear on restart; do not enter personal data. Multiple server instances do not share plans or metrics.

To enable Gemini on Render, set `GEMINI_API_KEY` and a long `AI_DEMO_ACCESS_CODE` under the service's Environment settings, then redeploy. Share only the access code with classmates; never share the Gemini key. The AI endpoint is disabled until both values are present. It allows 20 requests per hour and two concurrent requests per instance, but that is not a billing cap. `GEMINI_MODEL` optionally overrides the default `gemini-3.5-flash-lite`. See [the AI-assisted guide](docs/ai-assisted.md) for use and safety details. Core lab pages work without these variables.

## Repository map

- `src/app.js`: HTTP API, real workload and telemetry
- `src/domain/perf-scenarios.js`: shared scenario definitions
- `src/domain/local-perf-runner.js`: local-only browser-started k6 runs and latest result
- `src/cli/run-k6.js` and `k6/`: local load runner and phase metrics
- `public/`: browser workspace and pure rules shared with the server
- `tests/`: unit, API, E2E and visual checks
- `.github/workflows/tests.yml`: CI
