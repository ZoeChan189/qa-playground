import { describe, expect, it } from "vitest";
import { calculateStats, generateTestIdeas, normalizeTask, validateTask } from "../../src/domain/task-rules.js";

const validTask = {
  title: "Review task",
  ownerEmail: "qa@example.com",
  priority: "medium",
  status: "todo",
  dueDate: "2028-02-29",
};

describe("task rules", () => {
  it("normalizes text before saving", () => {
    expect(normalizeTask({ ...validTask, title: "  Review   task  ", ownerEmail: " QA@Example.com " })).toMatchObject({
      title: "Review task",
      ownerEmail: "qa@example.com",
    });
  });

  it("accepts a real leap day and rejects impossible calendar dates", () => {
    expect(validateTask(validTask).valid).toBe(true);
    for (const dueDate of ["2027-02-29", "2028-02-30", "2028-13-01", "2028-00-01"]) {
      expect(validateTask({ ...validTask, dueDate }).errors.dueDate).toBe("Due date must be a real calendar date.");
    }
  });

  it("reports each invalid field independently", () => {
    const result = validateTask({ title: "a", ownerEmail: "broken", priority: "urgent", status: "unknown", dueDate: "soon" });
    expect(Object.keys(result.errors)).toEqual(["title", "ownerEmail", "priority", "status", "dueDate"]);
  });

  it("treats a null or array task body as invalid input", () => {
    expect(validateTask(null).valid).toBe(false);
    expect(validateTask([]).valid).toBe(false);
  });

  it("counts completed and high-risk tasks correctly", () => {
    const result = calculateStats([
      { status: "todo", priority: "high" },
      { status: "in-progress", priority: "high" },
      { status: "done", priority: "high" },
    ]);
    expect(result).toEqual({ total: 3, todo: 1, inProgress: 1, done: 1, highRisk: 2 });
  });

  it("returns a checklist only for a meaningful requirement", () => {
    expect(generateTestIdeas("short").valid).toBe(false);
    const result = generateTestIdeas("A user can create a task with an owner and due date.");
    expect(result.valid).toBe(true);
    expect(result.ideas.map((idea) => idea.type)).toContain("Boundary");
  });
});
