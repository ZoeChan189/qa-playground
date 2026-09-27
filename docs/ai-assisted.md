# AI-assisted testing exercise

The in-app **Test Ideas** view produces a deterministic checklist. It is not an AI model. Use **Copy AI prompt** to send a requirement to your preferred AI coding assistant, such as GitHub Copilot, and compare its suggestions with the app's actual behavior.

Recommended classroom exercise:

1. Open Test Ideas, enter a requirement and generate the checklist.
2. Copy the AI prompt into an AI assistant. Ask for concrete test cases and then for one Playwright test.
3. Check the proposed selectors, data, HTTP status codes and expected results against this repository. Edit incorrect assumptions.
4. Run the generated test. Record whether it passes on the default app.
5. Enable the relevant Fault Lab switch and run the same test again. Explain the failure from the report.

Suggested requirement: "A signed-in user can create a task with a title, owner email, priority, status and due date. Invalid values must be rejected."

Review questions: Did the assistant invent a field? Does the test assert a user-visible outcome? Does it cover both a valid leap day and an impossible date? Could it pass while the app is broken? The AI output is a draft; the observed test result is the evidence.
