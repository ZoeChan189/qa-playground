# AI-assisted testing exercise

The AI-assisted page can call Gemini through the Node.js server to draft key test cases and one example test. Choose **Group API** (owner's key plus group code) or **My API key** (your own key for this request). It does not execute generated tests or assert that they passed. Without a key, **Build prompt** and **Copy prompt** still work.

## Configure locally or on Render

Set these environment variables on the **server**, not in browser code or GitHub:

- `GEMINI_API_KEY`: a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
- `AI_DEMO_ACCESS_CODE`: a private code shared with your group. Always required when Gemini is enabled; choose a long, hard-to-guess value. It is not your Gemini key.
- `GEMINI_MODEL`: optional; defaults to `gemini-3.5-flash-lite`. Check the [current model list](https://ai.google.dev/gemini-api/docs/models) if your key cannot use it.

On Render, open the web service, choose **Environment**, add the variables, and deploy/restart the service. Do not paste either secret into the repository, browser console, screenshots or chat. The app returns availability without exposing the key. A server with a key but no group code keeps the **Group API** mode disabled. The server permits at most 20 generation requests per hour and two concurrent requests per instance; these are classroom guardrails, not an account-wide billing cap. Set a billing alert/quota in Google Cloud too. Do not enter private or personal requirements.

With **My API key**, each student obtains a key from Google AI Studio, enters it into the password field, clicks **Load models**, selects a text model, and generates. The browser sends the key to this QA Lab server over the page's connection; the server forwards it to Google's Gemini API for that request and does not save it. The key remains in the field until the tab is closed or cleared, so use only the group's trusted HTTPS deployment. The code does **not** provide Google-account sign-in. A Gemini Pro subscription alone is not a substitute for Gemini API credentials; OAuth sign-in would need a separate Google Cloud OAuth project and consent configuration.

## Demonstrate

1. Choose a topic and enter a concrete requirement, such as "At 45 sudden virtual users, the API should report errors accurately and recover when traffic drops."
2. Choose **Group API** and enter the group code, or choose **My API key** and enter your own key. Click **Load models**, choose a model, then **Generate test cases**. If Gemini is unavailable, use **Build prompt**.
3. Compare endpoints, selectors, inputs and expected status codes with `src/app.js`, the shared rules and the existing tests. Correct any invented assumptions.
4. Run the proposed test locally or in CI. Record the actual result; a Gemini draft alone is not evidence of a passing test.
5. Keep k6 traffic local unless the host operator authorizes remote load. Compare phase metrics and repeat runs before drawing conclusions.

Review question: Can the generated assertion pass even if the target is broken? A useful AI output needs human review and a real test run.
