# QA Lab

One small, real web application for SWT301 testing demonstrations. **Performance testing is the main topic**: k6 sends HTTP traffic to an actual CPU-bound Node.js API, while the browser shows server telemetry and reads k6 summaries. The other seven topics have focused, runnable cases. This is a teaching target, not a commercial service or a clone of the named testing tools.

## Start in Windows

Each group member can run an independent local copy. See the current [step-by-step Vietnamese guide](docs/for-team.md) for the connector and the on-page test decisions.

Download the [complete Vietnamese Word handbook](docs/QA_Lab_Huong_dan_cap_nhat_cai_dat_va_cac_topic.docx) for upgrading an older copy, first-time installation, detailed k6 connection steps, every topic's displayed values and pass/fail examples.

1. On this GitHub page, choose **Code > Download ZIP**, then extract it (or clone the repo).
2. Double-click `setup-windows.cmd` once. It installs missing Node.js/k6, installs dependencies and registers the `qalab://` connector for this Windows user. Keep the extracted folder in place; rerun setup after moving it.
3. Open the hosted Performance page and click **Connect k6**. Allow the browser to open QA Lab and access the local network. The connector starts the local API automatically and pairs the current tab without copying a code.
4. Choose Stress, Spike or Soak and click **Run local k6**. All measurements and decisions appear on the page. For an independent local page, double-click `start-windows.cmd` and open <http://localhost:4173>. `run-performance-windows.cmd` is optional when you want saved JSON evidence.

If Node.js is missing or older than 20, install [Node.js 20+](https://nodejs.org/en/download), reopen the terminal, and try again. Other desktop platforms can run `npm ci` then `npm start`. A visitor browsing the hosted copy only needs a browser; someone running local k6 also needs Node.js, k6 and a local QA Lab copy. The core lab needs no database or paid service. Gemini is optional.

## What to click

- **Performance:** **Connect k6** starts/pairs the local runner after one-time setup; **Run local k6** starts the selected test. The latest run ID, request counts, full latency statistics, error rate, status counts, response-contract failures, exported k6 thresholds, exit code and stage decisions appear automatically. **Run probe** sends one request. **Open summary** is an optional older-result import.
- **Unit:** edit latency, error rate and thresholds; compare pass, boundary and invalid results.
- **API:** send preset valid/invalid requests and inspect HTTP status and JSON.
- **Web E2E:** create, review and save a test plan through the real UI and API.
- **Mobile web:** use a narrow screen or Playwright's mobile project; check overflow and repeat the plan flow.
- **Visual:** **Compare images** shows changed pixels, percentage, image dimensions, tolerance and PASS/FAIL against a browser-rendered unchanged reference. `npm run test:visual` separately compares against the checked-in Playwright screenshot. The shifted variant fails both comparisons.
- **AI-assisted:** use the group Gemini key or enter a personal Gemini API key, load available models, then generate a draft. Review and run the proposed test; generation alone is not a pass.
- **CI/CD:** the page displays the latest actual workflow, commit, jobs and individual step conclusions. **Refresh results** fetches the latest state.

Every topic has an **Expected / limit**, **Observed**, **Result** table. Unit **Run key cases** executes 12 assertions directly in the browser. API HTTP 400 can be PASS when rejection is expected. Web E2E checks save/retrieve status, ID and every submitted field. Mobile measures overflow and visible target sizes. AI displays generation HTTP status and response validity while keeping generated-test execution **NOT VERIFIED** until it is actually run elsewhere.

See [the case matrix](docs/demo-cases.md) and [the performance guide](docs/performance.md) for class demonstrations and interpretation.

Version **1.1.1** adds stricter input validation, safe Gemini diagnostics, current-input evidence invalidation, correct long-Soak phase timing, and dependency/security fixes. See [the Vietnamese audit and error catalogue](docs/audit-2026-10-08.md) for verified cases, remaining limits, and fixes by topic.

## Automated tests

```bash
npm test
npx playwright install chromium
npm run test:e2e
npm run test:visual
```

`npm run test:all` combines unit, API and browser checks. `npm run test:demo-failures` deliberately produces a nonzero exit to show visual regression detection; run it separately. Browser visual baselines are committed for Windows Chromium. CI also runs on Windows so the screenshot comparison is consistent.

## Run real performance tests

Install [Grafana k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) on the **load generator** computer. Start this app locally and click **Run local k6** for each scenario. A prominent verdict near the top shows request count, p95 and error rate against scenario limits; detailed HTTP status counts, latency percentiles, phase measurements and threshold decisions appear below the button. A new run clears the previous result while it is in progress. Browser-started summaries are held in the local server's memory and are lost on restart; use screenshots for evidence or run the commands below if you need saved JSON files. In a second terminal, the equivalent commands are:

```bash
npm run perf:load
npm run perf:stress
npm run perf:spike
npm run perf:soak
```

For a larger **local-only** run, change **Local peak VUs** on the Performance page and click **Run local k6**, or copy its command, for example `npm run perf:stress -- --vus 120`. The supported range is 1–200 VUs (5–200 for Spike). Run one scenario at a time and watch your computer's CPU. More VUs do not guarantee a high p95: the 24-job admission cap can return fast HTTP 503s, making the **error-rate** threshold fail while latency remains below its limit.

The command-line wrapper checks k6 and the target before starting, and saves a JSON summary to `results/`; the web button does not create a lasting file. If k6 is installed as a portable executable, set `K6_BIN` to its full path before starting the local server. A crossed threshold makes k6 exit nonzero but its measurements still appear on the page. The default target is `127.0.0.1:4173`. Remote load is blocked unless the operator explicitly allows it with `ALLOW_REMOTE_LOAD=1`. **Do not stress-test a public/shared host without permission.** The hosted server never runs k6; local runs avoid hosting cost, and CI never runs the load scripts.

### Run local k6 while viewing the hosted site

Run `setup-windows.cmd` once, then click **Connect k6** on the hosted page. Windows uses the registered `qalab://` protocol to start the local server if needed. A Windows named pipe pairs a random tab token with the local server; it is not sent to Render. Confirm the browser's external-app and local-network prompts. **Run local k6** then launches k6 against `127.0.0.1:4173`, never the Render API. k6 is a command-line process: it does not have a desktop window to display. The button connects the runner; the subsequent Run button starts the actual scenario.

The bridge allows only the configured hosted origin and loopback interface. The default is `https://qa-playground-5n74.onrender.com`; set the Windows user environment variable `LOCAL_BRIDGE_ORIGIN` if the hosted URL changes. A page reload needs **Connect k6** again. An already-running old server must be restarted once after updating this code. **Manual connection** with the terminal pairing code remains available. If browser policy blocks localhost, use the local page directly. Having only k6 installed, without the QA Lab connector, cannot enable web-to-desktop launch.

The target performs real asynchronous PBKDF2 work and caps concurrent jobs at 24, returning HTTP 503 above capacity. k6 records real response times, error rates, request counts and phase comparisons. The API reports actual Node heap usage, not a simulated memory value. An overall threshold can pass even when some requests fail; inspect the phase table too. These short, single-machine tests illustrate methods, not production capacity. See [performance methodology and caveats](docs/performance.md).

## Hosting

Use a provider that runs a Node.js service. Set install/build to `npm ci`, start to `npm start`, and expose the assigned `PORT`. Production mode listens on all interfaces; local development listens only on `127.0.0.1` unless `HOST` is set. GitHub Pages or other static-only hosting cannot run this API. With `NODE_ENV=production`, the expensive endpoint admits at most two requests per second per server instance (HTTP 429 after that), so the hosted site is for browsing and light probes. Run substantial k6 traffic against a local copy to avoid shared-server load or fees. There is no app-wide authentication; the group-key AI endpoint requires a group code, while personal-key mode uses each visitor's key for a request. Saved test plans and telemetry are in memory and disappear on restart; do not enter personal data. Multiple server instances do not share plans or metrics.

To enable the shared Gemini mode on Render, set `GEMINI_API_KEY` and a long `AI_DEMO_ACCESS_CODE` under the service's Environment settings, then redeploy. Share only the access code with classmates; never share the Gemini key. Personal-key mode works without these variables: the key is sent through this server to Gemini for that request but is not saved. Generation allows 20 requests per hour and two concurrent requests per instance, but that is not a billing cap. `GEMINI_MODEL` optionally overrides the default `gemini-3.5-flash-lite`; users can load and select available models. See [the AI-assisted guide](docs/ai-assisted.md) for safety details. Core lab pages work without any Gemini configuration.

## Repository map

- `src/app.js`: HTTP API, real workload and telemetry
- `src/domain/perf-scenarios.js`: shared scenario definitions
- `src/domain/local-perf-runner.js`: local-only browser-started k6 runs and latest result
- `src/cli/run-k6.js` and `k6/`: local load runner and phase metrics
- `public/`: browser workspace and pure rules shared with the server
- `tests/`: unit, API, E2E and visual checks
- `.github/workflows/tests.yml`: CI
