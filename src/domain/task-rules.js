const priorities = new Set(["low", "medium", "high"]);
const statuses = new Set(["todo", "in-progress", "done"]);

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());
}

export function normalizeTask(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return {
    title: String(source.title ?? "").trim().replace(/\s+/g, " "),
    ownerEmail: String(source.ownerEmail ?? "").trim().toLowerCase(),
    priority: String(source.priority ?? "medium").trim().toLowerCase(),
    status: String(source.status ?? "todo").trim().toLowerCase(),
    dueDate: String(source.dueDate ?? "").trim(),
  };
}

export function validateTask(input = {}) {
  const task = normalizeTask(input);
  const errors = {};

  if (task.title.length < 3 || task.title.length > 80) {
    errors.title = "Title must contain 3 to 80 characters.";
  }
  if (!isEmail(task.ownerEmail)) {
    errors.ownerEmail = "Owner email must be valid.";
  }
  if (!priorities.has(task.priority)) {
    errors.priority = "Priority must be low, medium or high.";
  }
  if (!statuses.has(task.status)) {
    errors.status = "Status must be todo, in-progress or done.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)) {
    errors.dueDate = "Due date must use YYYY-MM-DD.";
  } else {
    const parsed = new Date(`${task.dueDate}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== task.dueDate) {
      errors.dueDate = "Due date must be a real calendar date.";
    }
  }

  return { valid: Object.keys(errors).length === 0, errors, value: task };
}

export function calculateStats(tasks = []) {
  return tasks.reduce(
    (summary, task) => {
      summary.total += 1;
      if (task.status === "done") summary.done += 1;
      if (task.status === "in-progress") summary.inProgress += 1;
      if (task.status === "todo") summary.todo += 1;
      if (task.priority === "high" && task.status !== "done") summary.highRisk += 1;
      return summary;
    },
    { total: 0, todo: 0, inProgress: 0, done: 0, highRisk: 0 },
  );
}

export function generateTestIdeas(requirement) {
  const subject = String(requirement ?? "").trim();
  if (subject.length < 10) {
    return { valid: false, error: "Describe the requirement using at least 10 characters." };
  }

  const shortSubject = subject.length > 72 ? `${subject.slice(0, 69)}...` : subject;
  return {
    valid: true,
    requirement: subject,
    ideas: [
      { type: "Happy path", case: `Verify the expected result for: ${shortSubject}` },
      { type: "Validation", case: "Submit empty, malformed and over-limit values." },
      { type: "Boundary", case: "Test the minimum, maximum and values immediately outside each limit." },
      { type: "API", case: "Verify status code, response schema and unauthorized access." },
      { type: "Resilience", case: "Repeat the operation during slow and failed API responses." },
      { type: "Accessibility", case: "Complete the workflow using keyboard navigation and readable labels." },
    ],
  };
}

export const taskOptions = {
  priorities: [...priorities],
  statuses: [...statuses],
};
