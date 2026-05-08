function pad2(n) {
  return String(n).padStart(2, "0");
}

function toLocalInputValue(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function bytes(n) {
  const v = Number(n || 0);
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 * 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MB`;
  return `${(v / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function qs(id) {
  return document.getElementById(id);
}

function getRange() {
  const from = qs("from").value;
  const to = qs("to").value;
  const params = new URLSearchParams();
  if (from) params.set("from", new Date(from).toISOString());
  if (to) params.set("to", new Date(to).toISOString());
  return params;
}

function inputSummary(input) {
  if (!input) return "";
  const parts = [];
  if (typeof input.type === "string") parts.push(input.type);
  if (typeof input.impact === "string") parts.push(input.impact);
  if (Number.isFinite(input.urlLen) && input.urlLen) parts.push(`url:${input.urlLen}`);
  if (Number.isFinite(input.textLen) && input.textLen) parts.push(`text:${input.textLen}`);
  if (Number.isFinite(input.mediaCount) && input.mediaCount) parts.push(`media:${input.mediaCount}`);
  return parts.join(" ");
}

function renderEndpoints(endpoints) {
  const tbody = qs("table-endpoints").querySelector("tbody");
  tbody.innerHTML = "";
  for (const row of endpoints || []) {
    const tr = document.createElement("tr");
    const tdPath = document.createElement("td");
    tdPath.textContent = row.path || "";
    const tdCount = document.createElement("td");
    tdCount.className = "right";
    tdCount.textContent = String(row.count || 0);
    tr.append(tdPath, tdCount);
    tbody.append(tr);
  }
}

function renderRecent(events) {
  const tbody = qs("table-recent").querySelector("tbody");
  tbody.innerHTML = "";
  for (const evt of events || []) {
    const tr = document.createElement("tr");
    const tdTs = document.createElement("td");
    tdTs.textContent = evt.ts ? new Date(evt.ts).toLocaleString() : "";
    const tdMethod = document.createElement("td");
    tdMethod.textContent = evt.method || "";
    const tdPath = document.createElement("td");
    tdPath.textContent = evt.path || "";
    const tdStatus = document.createElement("td");
    tdStatus.className = "right";
    tdStatus.textContent = String(evt.status || "");
    const tdDur = document.createElement("td");
    tdDur.className = "right";
    tdDur.textContent = String(evt.durationMs || 0);
    const tdVisitor = document.createElement("td");
    tdVisitor.textContent = evt.visitorId || "";
    const tdInput = document.createElement("td");
    tdInput.textContent = inputSummary(evt.input);
    tr.append(tdTs, tdMethod, tdPath, tdStatus, tdDur, tdVisitor, tdInput);
    tbody.append(tr);
  }
}

async function refresh() {
  const params = getRange();
  const summaryUrl = `/api/stats/summary?${params.toString()}`;
  const recentUrl = `/api/events/recent?${params.toString()}&limit=60`;
  const [summaryRes, recentRes] = await Promise.all([fetch(summaryUrl), fetch(recentUrl)]);
  const summary = await summaryRes.json();
  const recent = await recentRes.json();

  const totals = summary.totals || {};
  qs("kpi-requests").textContent = String(totals.requests ?? "-");
  qs("kpi-ok").textContent = String(totals.ok ?? "-");
  qs("kpi-error").textContent = String(totals.error ?? "-");
  qs("kpi-visitors").textContent = String(totals.uniqueVisitors ?? "-");
  qs("kpi-avg").textContent = String(totals.avgDurationMs ?? "-");
  qs("kpi-p95").textContent = String(totals.p95DurationMs ?? "-");
  qs("kpi-in").textContent = bytes(totals.bytesIn ?? 0);
  qs("kpi-out").textContent = bytes(totals.bytesOut ?? 0);

  renderEndpoints(summary.endpoints || []);
  renderRecent(recent.events || []);
}

function initRangeDefaults() {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 3600 * 1000);
  qs("from").value = toLocalInputValue(from);
  qs("to").value = toLocalInputValue(now);
}

qs("refresh").addEventListener("click", () => refresh().catch(() => {}));
initRangeDefaults();
refresh().catch(() => {});

