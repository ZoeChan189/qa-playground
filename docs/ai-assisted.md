# AI-assisted testing exercise

The AI-assisted page can call Gemini through the Node.js server to draft key test cases and one example test. It does not execute that test or assert that it passed. Without Gemini configuration, **Build prompt** and **Copy prompt** still work for an external AI assistant.

## Configure locally or on Render

Set these environment variables on the **server**, not in browser code or GitHub:

- `GEMINI_API_KEY`: a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
- `AI_DEMO_ACCESS_CODE`: a private code shared with your group. Always required when Gemini is enabled; choose a long, hard-to-guess value. It is not your Gemini key.
- `GEMINI_MODEL`: optional; defaults to `gemini-3.5-flash-lite`. Check the [current model list](https://ai.google.dev/gemini-api/docs/models) if your key cannot use it.

On Render, open the web service, choose **Environment**, add the variables, and deploy/restart the service. Do not paste either secret into the repository, browser console, screenshots or chat. The app returns an availability status without exposing the key. A server with a key but no group code keeps Gemini disabled. The server permits at most 20 requests per hour and two concurrent requests per instance; these are classroom guardrails, not an account-wide billing cap. Set a billing alert/quota in Google Cloud too. Inputs are sent to Gemini with `store: false`, but do not enter private or personal data.

## Demonstrate

1. Choose a topic and enter a concrete requirement, such as "At 45 sudden virtual users, the API should report errors accurately and recover when traffic drops."
2. Enter the group access code if shown and click **Generate test cases**. If Gemini is unavailable, click **Build prompt** and copy it into another assistant.
3. Compare endpoints, selectors, inputs and expected status codes with `src/app.js`, the shared rules and the existing tests. Correct any invented assumptions.
4. Run the proposed test locally or in CI. Record the actual result; a Gemini draft alone is not evidence of a passing test.
5. Keep k6 traffic local unless the host operator authorizes remote load. Compare phase metrics and repeat runs before drawing conclusions.

Review question: Can the generated assertion pass even if the target is broken? A useful AI output needs human review and a real test run.
