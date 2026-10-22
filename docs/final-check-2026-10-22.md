# QA Lab 1.3.2 final check

Checked on Windows on 22 October 2026. This is a classroom demonstration audit, not a guarantee that no defects remain.

## Fixes in this update

- Disabled Web E2E Back during asynchronous save/read-back, then restored it on success and failure. A regression test reproduced the problem before the fix.
- Rejected malformed connector versions and unsupported major versions before pairing. Added five version regression cases.
- Patched vulnerable test dependencies. `npm audit` reported zero vulnerabilities after installation.
- Matched the Windows Node checks to the test dependency requirements: 20.19+, 22.12+, or 24+; not 21/23.
- Added `stop-windows.cmd` to stop an identified QA Lab server, including a hidden connector server. It does not stop other Node apps and refuses during an active k6 run.
- Added a four-page Vietnamese update guide covering ZIP/Git upgrades, changed running steps and common update problems.

## Automated verification

| Area | Result |
| --- | --- |
| Unit and shared rules | 129 passed |
| API integration | 25 passed |
| Desktop and mobile Chromium | 94 passed, 6 intentionally skipped |
| Dependency audit | 0 vulnerabilities reported |
| Windows launcher Node minimum checks | 18 version checks passed |

The six ordinary browser skips are four opt-in real-k6 entries and two viewport-specific cases. Real k6 was run separately rather than silently counted as covered by the ordinary browser suite.

Topics covered: Performance, Unit, API, Web E2E, Mobile calculator/layout, Visual, AI-assisted and CI/CD. Checks include positive/negative input, current expected/observed evidence, stale-result clearing, provider failures, loading locks, layout overflow, screenshot differences and CI job/step verdicts. Mocked upstream responses are used to exercise AI and GitHub error paths deterministically; they are not evidence of a live AI account request.

## Real local k6

These runs were initiated through the page's Run local k6 button against the local Node workload, not against Render. Every completed run received a new ID and replaced the previous on-page result.

| Scenario | Peak VUs | Requests | p95 | Error rate | k6 outcome |
| --- | ---: | ---: | ---: | ---: | --- |
| Load | 5 | 1,102 | 6.69 ms | 0% | PASS, exit 0 |
| Stress | 200 | 36,454 | 103.80 ms | 79.86% | FAIL, exit 99 |
| Spike | 120 | 14,592 | 105.46 ms | 80.71% | FAIL, exit 99 |
| Soak with 90-second hold | 10 | 14,247 | 7.85 ms | 0% | PASS, exit 0 |
| Soak with 3-minute hold | 10 | 27,660 | 9.04 ms | 0% | PASS, exit 0 |

Stress and Spike intentionally exceed the 15% error threshold. A low p95 does not override an error-rate failure; fast rejected requests can keep aggregate latency low. The server's 24-job admission cap is part of this demonstration. These observations apply to this machine and workload, not arbitrary production capacity.

The longer Soak lasted 190 seconds including ramp-up/down. Its early and late windows contained 6,744 and 6,741 requests respectively, both within the expected 15-35% share of total requests. This short classroom run cannot rule out leaks or degradation over hours.

## Connector and update checks

Actual local processes verified: cold start from `qalab://` parameters, pairing, reconnect, version 1.3.2, all four scenario definitions, telemetry/status, rejection of a wrong token (401) and an unapproved origin (403). Stopping the hidden QA Lab process left an unrelated HTTP service running. Stopping an empty port returned successfully. The stop script refused to stop the separate active Soak server.

The complete Windows setup also passed, reinstalled locked dependencies and registered the D-drive project location. A second integration check invoked the registered Windows `qalab://` handler, waited for successful pairing, ran a real 5-VU Load through the authenticated bridge, verified a completed summary/exit 0, rejected an overlapping run (409), and refused to stop during that run. The hidden QA Lab server was then stopped successfully.

The operating system's external-app prompt and browser local-network permission still require the user to allow access. Launching the registered handler through Windows does not certify browser permission prompts on every browser or Windows policy.

The existing calculator 1.0.2 APK download returned HTTP 200 with Android package content type and length 4,342,101 bytes. Calculator browser parity/key/error/layout tests passed. No Android device/emulator was available locally for this audit; native testing is provided by the Android GitHub Actions workflow, and its current run must be checked separately.

## Reproduce

```powershell
npm ci
npm test
$env:QA_TEST_PORT = '4197'
npm run test:e2e -- --workers=2
$env:QA_REAL_K6_TEST = '1'
npx playwright test tests/e2e/real-k6.spec.js --project=desktop-chromium --workers=1 --grep 'real button'
Remove-Item Env:QA_REAL_K6_TEST
$env:QA_REAL_SOAK_TEST = '1'
$env:SOAK_STEADY = '3m'
npx playwright test tests/e2e/real-k6.spec.js --project=desktop-chromium --workers=1 --grep 'long soak'
```

## Remaining external conditions

- Live Gemini generation depends on a valid key, enabled API, permitted model, quota and provider availability. No private key was exported or used to certify a new live response in this audit.
- Live ChatGPT sign-in/generation depends on account eligibility, consent and unexpired authorization. Mocked success/expired/provider-error flows passed; this is not a claim that the user's account was reauthorized.
- Render deploy completion must be confirmed with `/api/version`, not inferred from a successful Git push. Load generation remains local by default.
- Browser results are retained in memory and can disappear after restarting the server/reloading. Copy or capture evidence before updating.
