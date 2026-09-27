const seedTasks = [
  {
    id: 1,
    title: "Review login validation",
    ownerEmail: "student.one@example.com",
    priority: "high",
    status: "in-progress",
    dueDate: "2026-10-03",
  },
  {
    id: 2,
    title: "Check responsive task table",
    ownerEmail: "student.two@example.com",
    priority: "medium",
    status: "todo",
    dueDate: "2026-10-05",
  },
  {
    id: 3,
    title: "Approve API contract",
    ownerEmail: "qa@example.com",
    priority: "low",
    status: "done",
    dueDate: "2026-09-30",
  },
];

export function createTaskStore() {
  let tasks = structuredClone(seedTasks);
  let nextId = Math.max(...tasks.map((task) => task.id)) + 1;

  return {
    list() {
      return structuredClone(tasks);
    },
    find(id) {
      return structuredClone(tasks.find((task) => task.id === Number(id)) ?? null);
    },
    create(task) {
      const created = { id: nextId++, ...task };
      tasks.push(created);
      return structuredClone(created);
    },
    update(id, task) {
      const index = tasks.findIndex((candidate) => candidate.id === Number(id));
      if (index === -1) return null;
      tasks[index] = { id: Number(id), ...task };
      return structuredClone(tasks[index]);
    },
    remove(id) {
      const index = tasks.findIndex((candidate) => candidate.id === Number(id));
      if (index === -1) return false;
      tasks.splice(index, 1);
      return true;
    },
    reset() {
      tasks = structuredClone(seedTasks);
      nextId = Math.max(...tasks.map((task) => task.id)) + 1;
    },
  };
}
