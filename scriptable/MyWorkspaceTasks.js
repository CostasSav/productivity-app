// My Workspace — standalone Scriptable script. No imports or build needed.
// Credentials belong only in Keychain; run MyWorkspaceSetup first.
const KIND = "tasks";
// Optional: your verified public frontend URL. Never put credentials here.
// Leave empty to retain Scriptable's configured tap behavior.
const WEBSITE_URL = "";
const ENDPOINT = "https://productivity-server-production-3494.up.railway.app/api/widgets/today";
const TOKEN_KEY = "myworkspace.widget.read.v1";

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

const INK = new Color("#F1F5F9");
const MUTED = new Color("#B7C9C7");
const ACCENT = new Color("#2DD4BF");

function label(parent, value, size, color, bold) {
  const item = parent.addText(value);
  item.font = bold ? Font.semiboldSystemFont(size) : Font.systemFont(size);
  item.textColor = color;
  item.lineLimit = 1;
  item.minimumScaleFactor = 1;
  return item;
}

function progressBar(parent, progress, small) {
  const context = new DrawContext();
  const width = small ? 110 : 280;
  context.size = new Size(width, 5);
  context.opaque = false;
  context.respectScreenScale = true;
  context.setFillColor(new Color("#294341"));
  context.fillRect(new Rect(0, 0, width, 5));
  if (progress > 0) {
    context.setFillColor(new Color("#0D9488"));
    context.fillRect(new Rect(0, 0, width * progress, 5));
  }
  const image = parent.addImage(context.getImage());
  image.imageSize = new Size(width, 5);
  image.resizable = true;
}

function habitIcon(row, habit) {
  // Emoji are rendered as text; safe symbol names use SF Symbols when available.
  const icon = typeof habit.icon === "string" ? habit.icon.trim() : "";
  if (icon && /[^\x00-\x7F]/.test(icon)) {
    label(row, Array.from(icon).slice(0, 6).join(""), 12, INK, false);
  } else {
    let symbol = null;
    try { if (/^[a-z0-9.-]{1,32}$/.test(icon)) symbol = SFSymbol.named(icon); } catch (_) {}
    if (symbol) {
      const image = row.addImage(symbol.image);
      image.imageSize = new Size(12, 12);
      image.tintColor = ACCENT;
    } else { label(row, "•", 12, ACCENT, true); }
  }
  row.addSpacer(5);
}

function render(result, family) {
  const small = family === "small";
  const large = family === "large";
  const widget = new ListWidget();
  const gradient = new LinearGradient();
  gradient.colors = [new Color("#172625"), new Color("#101819")];
  gradient.locations = [0, 1];
  widget.backgroundGradient = gradient;
  widget.setPadding(12, 14, 12, 14);
  widget.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000);
  // Only a fixed HTTPS homepage/origin is supported; no deep links or secrets.
  if (/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?\/?$/i.test(WEBSITE_URL)) {
    widget.url = WEBSITE_URL;
  }
  const heading = KIND === "tasks" ? "Today's Tasks" : "Today's Habits";
  label(widget, heading, 15, INK, true);
  widget.addSpacer(5);
  if (result.error) {
    widget.addSpacer();
    const message = label(widget, result.error, 12, MUTED, false);
    message.lineLimit = small ? 4 : 3;
    widget.addSpacer();
    label(widget, "My Workspace", 10, ACCENT, true);
    return widget;
  }
  const data = result.data;
  const cohort = data[KIND];
  const summary = widget.addStack();
  summary.centerAlignContent();
  label(summary, cohort.completed + " / " + cohort.total + " completed", small ? 14 : 13, INK, true);
  if (!small) {
    summary.addSpacer();
    label(summary, cohort.progress === null ? "—" : Math.round(cohort.progress * 100) + "%", 12, ACCENT, true);
  }
  widget.addSpacer(5);
  progressBar(widget, cohort.progress || 0, small);
  widget.addSpacer(7);
  if (!cohort.total) {
    const empty = label(widget, KIND === "tasks" ? "Nothing due today." : "No habits scheduled.", 13, MUTED, false);
    empty.lineLimit = 2;
  } else if (small) {
    label(widget, cohort.remaining ? cohort.remaining + " remaining" : "All complete ✓", 13, ACCENT, true);
  } else {
    const done = item => KIND === "tasks" ? item.status === "done" : item.completedToday;
    const items = cohort.items.slice().sort((a, b) => Number(done(a)) - Number(done(b)));
    const visible = items.slice(0, large ? 4 : 3);
    visible.forEach((item, index) => {
      if (index) widget.addSpacer(large ? 12 : 3);
      const row = widget.addStack();
      row.centerAlignContent();
      label(row, done(item) ? "✓" : "○", 13, done(item) ? ACCENT : MUTED, true);
      row.addSpacer(6);
      if (KIND === "habits") habitIcon(row, item);
      const title = KIND === "tasks" ? item.title : item.name;
      label(row, title.replace(/[\r\n\t]/g, " ").slice(0, 100) || "Untitled", 12, done(item) ? MUTED : INK, false);
      if (KIND === "habits" && item.frequency === "weekly_count" && item.weekly) {
        row.addSpacer();
        label(row, item.weekly.completed + "/" + item.weekly.target + " wk", 10, ACCENT, false);
      }
    });
  }
  widget.addSpacer();
  const footer = widget.addStack();
  const visibleCount = small ? 0 : Math.min(cohort.items.length, large ? 4 : 3);
  const extra = cohort.total - visibleCount;
  if (!small && extra > 0) {
    label(footer, "+" + extra + " more", 10, MUTED, false);
    footer.addSpacer();
  }
  // Native relative date keeps indicating the age even if iOS delays a refresh.
  label(footer, "Updated ", 9, MUTED, false);
  const updated = footer.addDate(new Date(data.generatedAt));
  updated.applyRelativeStyle();
  updated.font = Font.systemFont(9);
  updated.textColor = MUTED;
  updated.lineLimit = 1;
  updated.minimumScaleFactor = 0.85;
  widget.addSpacer(2);
  label(widget, data.date + (small ? "" : " · " + data.timeZone), 9, MUTED, false);
  return widget;
}

async function main() {
  let result;
  try {
    if (!Keychain.contains(TOKEN_KEY)) result = { error: "Run MyWorkspaceSetup in Scriptable to connect." };
    else {
      const token = Keychain.get(TOKEN_KEY);
      result = /^[A-Za-z0-9_-]{43}$/.test(token) ? await fetchSnapshot(token) :
        { error: "Saved credential is invalid. Run MyWorkspaceSetup." };
    }
  } catch (_) { result = { error: "Secure storage unavailable. Open Scriptable and try again." }; }
  const family = config.widgetFamily || "medium";
  const widget = render(result, family);
  Script.setWidget(widget);
  if (config.runsInApp) {
    if (family === "small") await widget.presentSmall();
    else if (family === "large") await widget.presentLarge();
    else await widget.presentMedium();
  }
}
await main();
Script.complete();
