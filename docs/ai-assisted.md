# AI-assisted testing exercise

The AI-assisted page builds a reusable prompt. It does **not** call an AI model, generate test code itself or incur API cost. Paste the prompt into an AI assistant available to your group, then verify its output against this repository.

1. Choose a topic and enter a concrete requirement. Example: "At 45 sudden virtual users, the API should report errors accurately and recover when traffic drops."
2. Build and copy the prompt. Ask the external assistant for valid, invalid, boundary and recovery cases, plus one runnable test.
3. Compare every endpoint, selector, input and expected status with `src/app.js` and the existing tests. Correct invented assumptions.
4. Run the proposed test locally. Record the observed result and why it passed or failed; do not report an unexecuted suggestion as evidence.
5. For performance ideas, keep k6 traffic local unless the host operator authorizes it. Compare phase metrics and repeat runs before making claims.

Review question: Can the generated assertion pass even if the target is broken? A useful AI output needs human review and a real test run.
