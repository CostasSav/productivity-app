// Run from a widget row inside Scriptable. No credentials, titles or notes in URLs.
const BASE = "https://productivity-server-production-3494.up.railway.app/api/widgets";
const READ_KEY = "myworkspace.widget.read.v1";
const ACTION_KEY = "myworkspace.widget.action.v1";

function calendarDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function parameters(query) {
  const allowed = ["scriptName", "kind", "id", "date", "expected", "completed"];
  if (!query || Object.keys(query).some(k => !allowed.includes(k)) ||
      (query.scriptName !== undefined && query.scriptName !== "MyWorkspaceAction") ||
      !["tasks", "habits"].includes(query.kind) || typeof query.id !== "string" || !/^[1-9]\d*$/.test(query.id) ||
      !Number.isSafeInteger(Number(query.id)) || !calendarDate(query.date) ||
      !["true", "false"].includes(query.completed) ||
      !(query.kind === "tasks" ? ["todo", "in_progress", "done"] : ["true", "false"]).includes(query.expected)) return null;
  const expectedDone = query.kind === "tasks" ? query.expected === "done" : query.expected === "true";
  const completed = query.completed === "true";
  if (expectedDone === completed) return null;
  return { kind: query.kind, id: Number(query.id), date: query.date, expected: query.expected, completed };
}
function statusMessage(status, writing) {
  if (status === 401) return writing ? "Action token rejected, expired or not enabled on Railway. Check action setup; your read token is unchanged." :
    "Read token rejected or expired. Run MyWorkspaceSetup.";
  if (status === 403) return "Access denied. Check that separate tokens and HTTPS are configured correctly.";
  if (status === 404) return "Item unavailable. Refresh the widget and open My Workspace.";
  if (status === 409) return "Completion conflict. Refresh the widget and review this item in My Workspace. No automatic retry.";
  if (status === 429) return "Request limit reached. Wait before refreshing or trying again.";
  if (status >= 300 && status < 400) return "Redirect blocked. Check the API address.";
  if (status === 400) return "API rejected the request (HTTP 400). No change accepted. Check the action request format.";
  if (writing) return "The change could not be confirmed. It may have reached the server. Refresh the widget before trying again; no automatic retry.";
  return "Cannot fetch current state. Check your connection and try later.";
}
function errorTitle(status) {
  if (status === 401) return "Authentication failed";
  if (status === 403) return "Access denied";
  if (status === 400) return "Request rejected";
  if (status === 409) return "Completion conflict";
  if (status === 404) return "Item unavailable";
  if (status === 429) return "Request limit reached";
  if (status >= 500) return "Server error";
  return "Not confirmed";
}
async function requestJSON(url, token, method, body) {
  const request = new Request(url);
  request.method = method;
  const headers = { Authorization: "Bearer " + token, Accept: "application/json", "Cache-Control": "no-store" };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    request.body = JSON.stringify(body);
  }
  // Assign once: mutating a dictionary returned by a native property may only change a copy.
  request.headers = headers;
  request.timeoutInterval = 12;
  request.allowInsecureRequest = false;
  request.onRedirect = () => null;
  let text;
  try { text = await request.loadString(); }
  catch (_) {
    const status = request.response && request.response.statusCode;
    return { title: errorTitle(status), error: statusMessage(status, method !== "GET") };
  }
  const status = request.response && request.response.statusCode;
  if (status !== 200) return { title: errorTitle(status), error: statusMessage(status, method !== "GET") };
  try {
    if (typeof text !== "string" || text.length > (method === "GET" ? 50000 : 2000)) throw new Error();
    return { data: JSON.parse(text) };
  } catch (_) { return { error: method === "GET" ? "Unexpected snapshot. No change sent." :
    "Unexpected action response. The change may have applied. Refresh before trying again." }; }
}
function validSnapshot(data) {
  const count = value => Number.isSafeInteger(value) && value >= 0;
  const id = value => Number.isSafeInteger(value) && value > 0;
  function group(value) {
    return value && count(value.total) && count(value.completed) && count(value.remaining) &&
      value.completed + value.remaining === value.total &&
      (value.total === 0 ? value.progress === null : Number.isFinite(value.progress) &&
        Math.abs(value.progress - value.completed / value.total) <= 0.000051) &&
      typeof value.truncated === "boolean" && Array.isArray(value.items) &&
      value.items.length === Math.min(value.total, 10) && value.truncated === (value.total > 10) &&
      value.items.every(t => t && id(t.id)) && new Set(value.items.map(t => t.id)).size === value.items.length;
  }
  if (!data || data.schemaVersion !== 1 || !calendarDate(data.date) || typeof data.timeZone !== "string" ||
      typeof data.generatedAt !== "string" || !Number.isFinite(Date.parse(data.generatedAt)) ||
      !group(data.tasks) || !group(data.habits) || data.tasks.scope !== "due-today") return false;
  return data.tasks.items.every(t => typeof t.title === "string" && calendarDate(t.deadline) &&
      ["todo", "in_progress", "done"].includes(t.status) && ["low", "medium", "high"].includes(t.priority)) &&
    data.habits.items.every(h => typeof h.name === "string" && (h.icon == null || typeof h.icon === "string") &&
      typeof h.color === "string" && ["daily", "weekly", "weekly_count"].includes(h.frequency) &&
      typeof h.completedToday === "boolean" && (h.weekly === null || (h.weekly && count(h.weekly.completed) &&
        count(h.weekly.target) && count(h.weekly.remaining) && h.weekly.remaining === Math.max(0, h.weekly.target - h.weekly.completed))));
}
function checkState(data, action) {
  if (!validSnapshot(data)) return { error: "Unexpected snapshot. No change sent." };
  if (data.date !== action.date) return { error: "This widget belongs to another day. Refresh it. No change sent." };
  const item = data[action.kind].items.find(t => t.id === action.id);
  // The read API returns at most ten items. Never guess if this row is now outside that list.
  if (!item) return { error: "Item no longer visible in the current snapshot. Refresh or use My Workspace. No change sent." };
  const current = action.kind === "tasks" ? item.status : String(item.completedToday);
  if (current !== action.expected) return { error: "This item's state has changed since the widget rendered. Refresh it. No change sent." };
  return { item };
}
async function message(title, body) {
  const alert = new Alert(); alert.title = title; alert.message = body; alert.addAction("OK");
  await alert.presentAlert();
}
async function main() {
  if (!config.runsInApp) return; // Never mutate from a background widget or automation.
  const action = parameters(args.queryParameters);
  if (!action) { await message("Invalid action link", "Missing or invalid widget parameters. Tap a row in an updated medium or large widget; no change sent."); return; }
  if (!Keychain.contains(READ_KEY) || !Keychain.contains(ACTION_KEY)) {
    await message("Setup required", "Use MyWorkspaceSetup to save separate read and action tokens."); return;
  }
  const read = Keychain.get(READ_KEY), token = Keychain.get(ACTION_KEY);
  if (![read, token].every(t => /^[A-Za-z0-9_-]{43}$/.test(t)) || read === token) {
    await message("Separate tokens required", "Configure different valid read and action tokens in MyWorkspaceSetup."); return;
  }
  const first = await requestJSON(BASE + "/today", read, "GET");
  const checked = first.error ? first : checkState(first.data, action);
  if (checked.error) { await message(checked.title || "Not applied", checked.error); return; }
  const confirm = new Alert();
  confirm.title = action.completed ? "Mark complete?" : "Mark incomplete?";
  const title = action.kind === "tasks" ? checked.item.title : checked.item.name;
  confirm.message = title.replace(/[\r\n\t]/g, " ").slice(0, 160) + "\n" + action.date +
    (action.completed ? "\nApply this completion?" : "\nUndo this completion?");
  confirm.addAction(action.completed ? "Complete" : "Mark incomplete"); confirm.addCancelAction("Cancel");
  if (await confirm.presentAlert() !== 0) { await message("Cancelled", "No change sent."); return; }
  // Refresh again after the user has spent time in the confirmation dialog.
  const second = await requestJSON(BASE + "/today", read, "GET");
  const rechecked = second.error ? second : checkState(second.data, action);
  if (rechecked.error) { await message(rechecked.title || "Not applied", rechecked.error); return; }
  if (first.data.timeZone !== second.data.timeZone || JSON.stringify(checked.item) !== JSON.stringify(rechecked.item)) {
    await message("Not applied", "This item changed during confirmation. Refresh the widget and review it again."); return;
  }
  const result = await requestJSON(BASE + "/" + action.kind + "/" + action.id + "/completion", token,
    action.kind === "tasks" ? "PATCH" : "PUT", { date: action.date, completed: action.completed });
  if (result.error) { await message(result.title || "Not confirmed", result.error); return; }
  const data = result.data;
  if (!data || data.id !== action.id || data.date !== action.date || data.completed !== action.completed ||
      !["applied", "already-applied"].includes(data.outcome)) {
    await message("Not confirmed", "Unexpected result. The change may have applied. Refresh before trying again."); return;
  }
  await message(data.outcome === "already-applied" ? "Already applied" : "Saved",
    "The requested state is saved. iOS controls widget refresh timing. Run the Tasks or Habits script to preview fresh data; the Home Screen may update later.");
}
try { await main(); }
catch (_) { if (config.runsInApp) await message("Action unavailable", "Secure storage or the action could not be completed. If you confirmed a change, refresh before trying again."); }
Script.complete();
