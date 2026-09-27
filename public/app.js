const state = {
  token: sessionStorage.getItem("qa-token") || "",
  user: null,
  tasks: [],
  faults: new Set(JSON.parse(localStorage.getItem("qa-faults") || "[]")),
};

const byId = (id) => document.getElementById(id);
const loginView = byId("login-view");
const appView = byId("app-view");
const taskDialog = byId("task-dialog");
let latestTaskRequest = 0;

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "error" : ""}`;
  toast.textContent = message;
  byId("toast-region").append(toast);
  setTimeout(() => toast.remove(), 3200);
}

function activeServerFaults() {
  return [...state.faults].filter((fault) => ["validation-bypass", "api-delay", "api-error"].includes(fault));
}

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.token) headers.set("Authorization", `Bearer ${state.token}`);
  if (activeServerFaults().length) headers.set("X-Demo-Faults", activeServerFaults().join(","));
  if (options.body) headers.set("Content-Type", "application/json");
  const started = performance.now();
  const response = await fetch(url, { ...options, headers });
  const elapsed = Math.round(performance.now() - started);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body, elapsed };
}

function applyFaultClasses() {
  document.body.classList.toggle("fault-visual-shift", state.faults.has("visual-shift"));
  document.body.classList.toggle("fault-mobile-overflow", state.faults.has("mobile-overflow"));
  byId("fault-count").textContent = `${state.faults.size} fault${state.faults.size === 1 ? "" : "s"}`;
  document.querySelectorAll(".fault-row input").forEach((input) => {
    input.checked = state.faults.has(input.value);
  });
}

function switchView(viewName) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === viewName));
  document.querySelectorAll(".view-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `view-${viewName}`));
}

function setAuthenticated(authenticated) {
  loginView.hidden = authenticated;
  appView.hidden = !authenticated;
}

async function login(email, password) {
  const { response, body } = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(body?.message || "Sign in failed.");
  state.token = body.token;
  state.user = body.user;
  sessionStorage.setItem("qa-token", state.token);
  setAuthenticated(true);
  await loadTasks();
}

function renderStats(stats) {
  byId("stat-total").textContent = stats.total;
  byId("stat-todo").textContent = stats.todo;
  byId("stat-progress").textContent = stats.inProgress;
  byId("stat-done").textContent = stats.done;
  byId("stat-risk").textContent = stats.highRisk;
}

function taskRow(task) {
  const row = document.createElement("tr");
  row.dataset.taskId = task.id;
  row.innerHTML = `
    <td class="task-title"></td>
    <td class="task-owner"></td>
    <td><span class="pill task-priority"></span></td>
    <td><span class="pill task-status"></span></td>
    <td class="task-due"></td>
    <td><div class="row-actions"><button class="row-button edit" type="button" title="Edit" aria-label="Edit task">E</button><button class="row-button delete" type="button" title="Delete" aria-label="Delete task">×</button></div></td>`;
  row.querySelector(".task-title").textContent = task.title;
  row.querySelector(".task-owner").textContent = task.ownerEmail;
  row.querySelector(".task-due").textContent = task.dueDate;
  const priority = row.querySelector(".task-priority");
  priority.textContent = task.priority ?? "invalid";
  if (["low", "medium", "high"].includes(task.priority)) priority.classList.add(`priority-${task.priority}`);
  const status = row.querySelector(".task-status");
  status.textContent = String(task.status ?? "invalid").replace("-", " ");
  if (["todo", "in-progress", "done"].includes(task.status)) status.classList.add(`status-${task.status}`);
  row.querySelector(".edit").addEventListener("click", () => openTaskDialog(task));
  row.querySelector(".delete").addEventListener("click", () => deleteTask(task));
  return row;
}

function renderTasks(tasks, stats) {
  const rows = byId("task-rows");
  rows.replaceChildren(...tasks.map(taskRow));
  byId("empty-state").hidden = tasks.length > 0;
  renderStats(stats);
}

async function loadTasks() {
  const requestId = ++latestTaskRequest;
  const params = new URLSearchParams();
  if (byId("task-search").value.trim()) params.set("search", byId("task-search").value.trim());
  if (byId("status-filter").value) params.set("status", byId("status-filter").value);
  if (byId("priority-filter").value) params.set("priority", byId("priority-filter").value);
  try {
    const { response, body, elapsed } = await apiFetch(`/api/tasks?${params}`);
    if (requestId !== latestTaskRequest) return;
    byId("response-time").textContent = `${elapsed} ms`;
    if (response.status === 401) return logout();
    if (!response.ok) throw new Error(body?.message || `Request failed with HTTP ${response.status}.`);
    state.tasks = body.tasks;
    renderTasks(body.tasks, body.stats);
    byId("api-status").innerHTML = "<i></i> API online";
  } catch (error) {
    if (requestId !== latestTaskRequest) return;
    byId("api-status").textContent = "API fault";
    showToast(error.message, "error");
  }
}

function clearTaskErrors() {
  document.querySelectorAll("[data-error]").forEach((node) => { node.textContent = ""; });
  byId("task-form-error").textContent = "";
}

function openTaskDialog(task = null) {
  clearTaskErrors();
  byId("task-dialog-title").textContent = task ? "Edit task" : "New task";
  byId("task-id").value = task?.id || "";
  byId("task-title").value = task?.title || "";
  byId("task-owner").value = task?.ownerEmail || "";
  byId("task-priority").value = task?.priority || "medium";
  byId("task-status").value = task?.status || "todo";
  byId("task-due").value = task?.dueDate || "2026-10-10";
  taskDialog.showModal();
  byId("task-title").focus();
}

async function saveTask(event) {
  event.preventDefault();
  clearTaskErrors();
  const id = byId("task-id").value;
  const payload = {
    title: byId("task-title").value,
    ownerEmail: byId("task-owner").value,
    priority: byId("task-priority").value,
    status: byId("task-status").value,
    dueDate: byId("task-due").value,
  };
  const { response, body } = await apiFetch(id ? `/api/tasks/${id}` : "/api/tasks", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    Object.entries(body?.fields || {}).forEach(([field, message]) => {
      const target = document.querySelector(`[data-error="${field}"]`);
      if (target) target.textContent = message;
    });
    byId("task-form-error").textContent = body?.message || (body?.fields ? "Correct the highlighted values." : "Task could not be saved.");
    return;
  }
  taskDialog.close();
  showToast(id ? "Task updated." : "Task created.");
  await loadTasks();
}

async function deleteTask(task) {
  const { response } = await apiFetch(`/api/tasks/${task.id}`, { method: "DELETE" });
  if (!response.ok) return showToast("Task could not be deleted.", "error");
  showToast("Task deleted.");
  await loadTasks();
}

function logout() {
  sessionStorage.removeItem("qa-token");
  state.token = "";
  state.user = null;
  setAuthenticated(false);
}

async function sendConsoleRequest() {
  const endpoint = byId("api-endpoint").value;
  const routes = {
    health: ["/api/health", {}],
    tasks: ["/api/tasks", {}],
    performance: ["/api/performance?profile=load", {}],
    ideas: ["/api/test-ideas", { method: "POST", body: byId("api-body").value }],
  };
  const [url, options] = routes[endpoint];
  try {
    const { response, body, elapsed } = await apiFetch(url, options);
    byId("api-result-status").textContent = `HTTP ${response.status}`;
    byId("api-result-time").textContent = `${elapsed} ms`;
    byId("api-response").textContent = JSON.stringify(body, null, 2);
  } catch (error) {
    byId("api-result-status").textContent = "Request error";
    byId("api-response").textContent = error.message;
  }
}

async function generateIdeas() {
  const { response, body } = await apiFetch("/api/test-ideas", {
    method: "POST",
    body: JSON.stringify({ requirement: byId("requirement-input").value }),
  });
  const results = byId("idea-results");
  if (!response.ok) {
    results.innerHTML = `<div class="idea-item"><strong>Validation</strong><p></p></div>`;
    results.querySelector("p").textContent = body?.message || "Could not generate ideas.";
    return;
  }
  results.replaceChildren(...body.ideas.map((idea) => {
    const item = document.createElement("div");
    item.className = "idea-item";
    item.innerHTML = "<strong></strong><p></p>";
    item.querySelector("strong").textContent = idea.type;
    item.querySelector("p").textContent = idea.case;
    return item;
  }));
}

function buildAiPrompt() {
  const requirement = byId("requirement-input").value.trim();
  return `You are helping a software testing student. The test target is QA Playground, a demo task management app with a REST API.\n\nRequirement: ${requirement}\n\nSuggest concrete test cases for happy path, invalid input, boundary values, API status codes, mobile layout, and fault recovery. For each case, include setup, steps, expected result, and a short reason. Do not claim a result was observed. Review the app's actual API contract and existing tests before writing executable test code.`;
}

function updateAiPrompt() {
  byId("ai-prompt").value = buildAiPrompt();
}

byId("fill-demo").addEventListener("click", () => {
  byId("login-email").value = "qa@example.com";
  byId("login-password").value = "Test123!";
});
byId("fill-locked").addEventListener("click", () => {
  byId("login-email").value = "locked@example.com";
  byId("login-password").value = "Test123!";
});
byId("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  byId("login-error").textContent = "";
  try { await login(byId("login-email").value, byId("login-password").value); }
  catch (error) { byId("login-error").textContent = error.message; }
});
byId("logout-button").addEventListener("click", logout);
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));
byId("new-task-button").addEventListener("click", () => openTaskDialog());
byId("reset-data-button").addEventListener("click", async () => {
  const { response } = await apiFetch("/api/test/reset", { method: "POST" });
  if (!response.ok) return showToast("Data could not be reset.", "error");
  showToast("Sample tasks restored.");
  await loadTasks();
});
byId("close-task-dialog").addEventListener("click", () => taskDialog.close());
byId("cancel-task").addEventListener("click", () => taskDialog.close());
byId("task-form").addEventListener("submit", saveTask);
byId("task-search").addEventListener("input", loadTasks);
byId("status-filter").addEventListener("change", loadTasks);
byId("priority-filter").addEventListener("change", loadTasks);
byId("send-request").addEventListener("click", sendConsoleRequest);
byId("generate-ideas").addEventListener("click", generateIdeas);
byId("requirement-input").addEventListener("input", updateAiPrompt);
byId("copy-ai-prompt").addEventListener("click", async () => {
  updateAiPrompt();
  try {
    await navigator.clipboard.writeText(byId("ai-prompt").value);
    showToast("Prompt copied.");
  } catch {
    byId("ai-prompt").select();
    showToast("Select and copy the prompt.");
  }
});
document.querySelectorAll(".fault-row input").forEach((input) => input.addEventListener("change", async () => {
  input.checked ? state.faults.add(input.value) : state.faults.delete(input.value);
  localStorage.setItem("qa-faults", JSON.stringify([...state.faults]));
  applyFaultClasses();
  if (["api-delay", "api-error"].includes(input.value)) await loadTasks();
}));
byId("reset-faults").addEventListener("click", async () => {
  state.faults.clear();
  localStorage.removeItem("qa-faults");
  applyFaultClasses();
  await loadTasks();
});

applyFaultClasses();
updateAiPrompt();
if (state.token) {
  setAuthenticated(true);
  loadTasks();
} else {
  setAuthenticated(false);
}
