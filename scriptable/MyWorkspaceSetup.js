// Run interactively in Scriptable. Never paste credentials into this file.
const ENDPOINT = "https://productivity-server-production-3494.up.railway.app/api/widgets/today";
const TOKEN_KEY = "myworkspace.widget.read.v1";
const ACTION_KEY = "myworkspace.widget.action.v1";

async function fetchSnapshot(token) {
  const request = new Request(ENDPOINT);
  request.method = "GET";
  request.headers = { Authorization: "Bearer " + token, Accept: "application/json", "Cache-Control": "no-store" };
  request.timeoutInterval = 12;
  request.allowInsecureRequest = false;
  request.onRedirect = () => null;
  let body;
  try { body = await request.loadString(); }
  catch (_) { return { error: statusMessage(request.response && request.response.statusCode) }; }
  const status = request.response && request.response.statusCode;
  if (status !== 200) return { error: statusMessage(status) };
  try {
    if (typeof body !== "string" || body.length > 50000) throw new Error();
    const data = JSON.parse(body);
    if (!validSnapshot(data)) throw new Error();
    return { data };
  } catch (_) { return { error: "Unexpected response. Check the API version." }; }
}

function statusMessage(status) {
  if (status === 401) return "Credential rejected or expired. Run MyWorkspaceSetup.";
  if (status === 403) return "Access denied. Check widget configuration.";
  if (status === 429) return "Refresh limit reached. Try again later.";
  if (status >= 300 && status < 400) return "Redirect blocked. Check the API address.";
  if (status === 404) return "Widget API not found. Check the deployment.";
  if (status >= 500) return "Service unavailable. Try again later.";
  return "Cannot connect. Check your connection and try again.";
}

function validSnapshot(data) {
  const count = value => Number.isSafeInteger(value) && value >= 0;
  const string = value => typeof value === "string";
  const id = value => Number.isSafeInteger(value) && value > 0;
  const date = value => string(value) && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  function group(value) {
    return value && count(value.total) && count(value.completed) && count(value.remaining) &&
      value.completed + value.remaining === value.total &&
      (value.total === 0 ? value.progress === null : typeof value.progress === "number" &&
        Number.isFinite(value.progress) && Math.abs(value.progress - value.completed / value.total) <= 0.000051) &&
      typeof value.truncated === "boolean" && Array.isArray(value.items) &&
      value.items.length === Math.min(value.total, 10) && value.truncated === (value.total > 10);
  }
  if (!data || data.schemaVersion !== 1 || !date(data.date) || !string(data.timeZone) ||
      !string(data.generatedAt) || !Number.isFinite(Date.parse(data.generatedAt)) ||
      !group(data.tasks) || !group(data.habits) || data.tasks.scope !== "due-today") return false;
  return data.tasks.items.every(t => t && id(t.id) && string(t.title) && date(t.deadline) &&
      ["todo", "in_progress", "done"].includes(t.status) && ["low", "medium", "high"].includes(t.priority)) &&
    data.habits.items.every(h => h && id(h.id) && string(h.name) && (h.icon == null || string(h.icon)) && string(h.color) &&
      ["daily", "weekly", "weekly_count"].includes(h.frequency) && typeof h.completedToday === "boolean" &&
      (h.weekly === null || (h.weekly && count(h.weekly.completed) && count(h.weekly.target) &&
        count(h.weekly.remaining) && h.weekly.remaining === Math.max(0, h.weekly.target - h.weekly.completed))));
}

async function message(title, body) {
  const alert = new Alert();
  alert.title = title;
  alert.message = body;
  alert.addAction("OK");
  await alert.presentAlert();
}
async function main() {
  if (!config.runsInApp) return; // No credential dialogs in a widget or automation.
  const menu = new Alert();
  menu.title = "My Workspace";
  menu.message = "Read and action credentials are separate and stay in this iPhone's Keychain.";
  menu.addAction("Save or replace credential");
  menu.addDestructiveAction("Remove saved credential");
  menu.addAction("Save or replace action token");
  menu.addDestructiveAction("Remove action token");
  menu.addCancelAction("Cancel");
  const choice = await menu.presentAlert();
  const action = choice === 2 || choice === 3;
  const selectedKey = action ? ACTION_KEY : TOKEN_KEY;
  if (choice === 1 || choice === 3) {
    const confirm = new Alert();
    confirm.title = "Remove credential?";
    confirm.message = action ? "Completion taps will be disabled. Read-only widgets keep working. This does not revoke the token on Railway." :
      "Widgets will stop refreshing. This removes the local credential only; it does not revoke it on Railway.";
    confirm.addDestructiveAction("Remove");
    confirm.addCancelAction("Cancel");
    if (await confirm.presentAlert() === 0) {
      if (Keychain.contains(selectedKey)) Keychain.remove(selectedKey);
      await message(action ? "Action token removed" : "Credential removed", action ?
        "Read-only widgets keep working. Run both widget scripts to remove completion links; iOS may retain the old image until refresh." :
        "Run setup again to reconnect. iOS may retain the last rendered widget until its next refresh.");
    }
    return;
  }
  if (choice !== 0 && choice !== 2) return;
  const input = new Alert();
  input.title = action ? "Separate action token" : "Widget credential";
  input.message = action ? "Paste the separately provisioned raw action token. Saving does not validate it with Railway or change any task. Your read token is preserved." :
    "Paste the existing raw widget token from your password manager. It will be validated before replacing the saved credential.";
  input.addSecureTextField("Widget token");
  input.addAction(action ? "Continue" : "Validate and save");
  input.addCancelAction("Cancel");
  if (await input.presentAlert() !== 0) return;
  let token = input.textFieldValue(0).trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    await message("Invalid format", "Enter the raw 43-character widget token, not its digest or a Bearer prefix.");
    return;
  }
  const otherKey = action ? TOKEN_KEY : ACTION_KEY;
  if (Keychain.contains(otherKey) && Keychain.get(otherKey) === token) {
    token = "";
    await message("Separate tokens required", "Read and action tokens must be different. Nothing was saved.");
    return;
  }
  if (action) {
    const confirm = new Alert();
    confirm.title = "Enable completion taps?";
    confirm.message = "Store this action token separately in Keychain? It must already be provisioned on Railway. It cannot be validated without an action, so its validity will be checked on your first confirmed completion. No changes are sent now.";
    confirm.addAction("Save action token");
    confirm.addCancelAction("Cancel");
    if (await confirm.presentAlert() === 0) {
      Keychain.set(ACTION_KEY, token);
      await message("Action token saved", "Read token unchanged. Run both widget scripts again to enable row taps. Each change requires confirmation.");
    }
    token = "";
    return;
  }
  const result = await fetchSnapshot(token);
  if (result.error) {
    token = "";
    await message("Credential not saved", result.error + " Any previously saved credential is unchanged.");
    return;
  }
  Keychain.set(TOKEN_KEY, token);
  token = "";
  await message("Connected", "The validated credential is stored in Keychain. Run the Tasks and Habits scripts to preview them.");
}
try { await main(); }
catch (_) {
  if (config.runsInApp) await message("Setup unavailable", "Secure storage or setup could not be completed. Try again inside Scriptable.");
}
Script.complete();
