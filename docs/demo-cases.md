# Classroom demo cases

The app is the **system under test**. A test passes when the observed result matches the expected result below. Fault switches deliberately change the system so a previously passing assertion can fail.

| ID | Topic | Action | Expected result |
| --- | --- | --- | --- |
| U1 | Unit | Run `npm run test:unit` | Normalization, valid leap day, impossible dates, invalid fields, statistics and test-idea rules pass. |
| A1 | API | Run `npm run test:api` | Login, authorization, isolated task data, CRUD, filtering, reset, malformed JSON and status codes pass. |
| A2 | API fault | Send `POST /api/tasks` with `X-Demo-Faults: validation-bypass` and an invalid task | Server incorrectly returns 201; the `@demo-fail` validation assertion detects the defect. |
| E1 | Web E2E | Run `npm run test:e2e` on desktop Chromium | Sign-in, invalid form messages, create, search/filter, edit, API Console and checklist pass. |
| M1 | Mobile web | Run `npm run test:e2e` on mobile Chromium | Same core workflow works at mobile size without page-level horizontal overflow; the task table itself can scroll. |
| M2 | Mobile fault | Enable **Mobile overflow**, then run `npm run test:demo-failures` | The viewport-width assertion fails as intended. This is not native Android/iOS testing. |
| P1 | Performance load | Run `k6 run k6/load.js` | At 5 virtual users, compare p95 response time and error rate with the script thresholds. |
| P2 | Performance stress | Run `k6 run k6/stress.js` | Gradual growth toward 40 virtual users can cross the latency threshold and produce HTTP 503. |
| P3 | Performance spike | Run `k6 run k6/spike.js` | Sudden jump toward 50 virtual users can cross the latency threshold and produce HTTP 503. |
| P4 | Performance soak | Run `k6 run k6/soak.js` | Sustained traffic shows latency and a rising **simulated** memory metric; this is not real RAM measurement. |
| V1 | Visual | Run `npm run test:visual` | Task board screenshot matches the committed Windows Chromium baseline. |
| V2 | Visual fault | Enable **Visual shift**, then run `npm run test:demo-failures` | Screenshot comparison fails against that same baseline. |
| AI1 | AI-assisted | Open **Test Ideas**, enter a requirement, generate the checklist and copy the AI prompt | Review suggested cases; use an external AI assistant to draft code, then verify and run it. The app does not call an AI model. |
| C1 | CI/CD | Push a commit or open a pull request | GitHub Actions runs unit, API and browser tests; on failure it uploads the Playwright report. |

`npm run test:demo-failures` is intentionally expected to exit with code 1. Run it separately from the normal suite. Stress and spike may also exit with code 1 when their performance thresholds are crossed. Do not run k6 against a public host without permission from its operator.
