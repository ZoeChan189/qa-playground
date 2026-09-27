# QA Playground

A small full-stack application that students can test with one shared target: a task board, a REST API, a mobile layout and controlled fault switches. The app is the **system under test**. The scripts in this repository demonstrate how to test it.

## Quick start

Install [Node.js 20 or newer](https://nodejs.org/en/download), then run:

```bash
npm ci
npm start
```

Open <http://localhost:4173>. Use the **Fill demo account** button, or enter `qa@example.com` / `Test123!`. The account is deliberately public demo data. Tasks are stored in memory and kept separate for each sign-in session. Restarting the server clears them.

If `node` or `npm` is not recognized, install Node.js, close the terminal, open a new terminal and check `node --version` and `npm --version`. Browser users only need the hosted link. People running the tests locally need the tools below.

## What to demonstrate

| Topic | Test target and example | Command/tool |
| --- | --- | --- |
| Unit | Task validation, leap dates, statistics | `npm run test:unit` (Vitest) |
| API | Login, authorization, CRUD, errors, fault headers | `npm run test:api` (Supertest); also Postman |
| Web E2E | Sign-in, form validation, create/filter/edit | `npm run test:e2e` (Playwright) |
| Mobile web | Responsive board, no page overflow | Playwright mobile project in `npm run test:e2e` |
| Performance | Load, stress, spike and soak against `/api/performance` | k6 scripts in `k6/` |
| Visual regression | Task board screenshot against a checked-in baseline | `npm run test:visual` |
| AI-assisted testing | Use the in-app prompt with an AI coding assistant; review generated cases against the requirements and run them | Test Ideas view and `docs/ai-assisted.md` |
| CI/CD and reporting | Automatic unit, API and browser tests on each push/PR | GitHub Actions; Playwright HTML report on failure |

The mobile project covers **mobile web**. Native Android/iOS behavior requires a separate native app and device test setup.

See [the classroom demo case matrix](docs/demo-cases.md) for step-by-step targets and expected results across all eight topics.

## Run tests

```bash
npm test
npx playwright install chromium
npm run test:e2e
```

`npm run test:visual` runs the screenshot baseline. On Windows, the checked-in baseline is compared with Chromium. `npm run report` opens the browser test report after a Playwright run.

The Fault Lab offers five independent switches: validation bypass, slow API, API unavailable, visual shift and mobile overflow. The app stores the selected switches in the current browser. API clients can send `X-Demo-Faults: validation-bypass,api-delay,api-error`; each request specifies its own server fault profile.

For intentionally failing examples, run `npm run test:demo-failures`. A nonzero exit status is the expected demonstration result. The normal test suite excludes these tests, so CI stays green unless a real regression occurs.

## Manual API examples

Check the service:

```bash
curl http://localhost:4173/api/health
```

Sign in:

```bash
curl -X POST http://localhost:4173/api/auth/login -H "Content-Type: application/json" -d '{"email":"qa@example.com","password":"Test123!"}'
```

Use the returned `token` as `Authorization: Bearer <token>` for `/api/tasks`. In Postman, create a request to `GET http://localhost:4173/api/tasks`, set the Bearer token, then try `POST`, `PUT` and `DELETE`. The request body for `POST /api/tasks` is:

```json
{
  "title": "Review checkout flow",
  "ownerEmail": "qa@example.com",
  "priority": "high",
  "status": "todo",
  "dueDate": "2028-02-29"
}
```

Try title `x`, invalid email and `2028-02-30` to see a validation error. Add the `X-Demo-Faults: validation-bypass` header to the same request to demonstrate a defect that accepts invalid data. `POST /api/test/reset` restores sample tasks for the current token.

## Performance testing

Install [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) on the machine that runs the load test. Start the app, then run one script at a time:

```bash
k6 run k6/load.js
k6 run k6/stress.js
k6 run k6/spike.js
k6 run k6/soak.js
```

The stress and spike profiles intentionally increase delay and may return HTTP 503 under high concurrency. The soak profile returns a **simulated** memory number; it is not the Node process's real RAM. The soak duration is compressed for classroom demonstration. k6 measures the actual HTTP response times and status codes, but these numbers do not establish production capacity.

Stress and spike can exit with code 1 when their latency thresholds are crossed. This is an expected test result, not a broken script. Compare the p95 duration, error rate and request count between all four runs; exact numbers depend on the machine and current load.

By default k6 targets `http://127.0.0.1:4173`. For an authorized remote instance, set `BASE_URL` to its address, for example `k6 run -e BASE_URL=https://your-host.example k6/load.js`. Do not run load tests on a shared or public deployment without the operator's permission.

## Hosting

This project needs a service that runs Node.js, not static-only hosting. Use the repository root as the project directory, `npm ci` as the build/install command and `npm start` as the start command. The server reads the platform's `PORT` variable and listens on `0.0.0.0`. No database or secrets are required. GitHub Pages alone cannot run the API.

The demo account is intentionally public and is not real authentication. Do not put personal data into this app. In-memory sessions and tasks disappear when the host restarts. If multiple instances are started, each instance has independent data.

## Repository map

- `src/domain/`: validation and test idea rules
- `src/app.js`: REST API and fault behavior
- `public/`: browser app
- `tests/`: unit, API and browser test examples
- `k6/`: performance scenarios
- `.github/workflows/tests.yml`: CI pipeline
