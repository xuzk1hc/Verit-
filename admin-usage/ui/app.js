function pad2(n) {
  return String(n).padStart(2, "0");
}

function toLocalInputValue(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function qs(id) {
  return document.getElementById(id);
}

function pct(v) {
  if (!Number.isFinite(v)) return "-";
  return `${(v * 100).toFixed(1)}%`;
}

function buildParams() {
  const params = new URLSearchParams();
  const from = qs("from").value;
  const to = qs("to").value;
  if (from) params.set("from", new Date(from).toISOString());
  if (to) params.set("to", new Date(to).toISOString());

  const type = qs("type").value;
  const impact = qs("impact").value;
  const verdict = qs("verdict").value;
  const scoreBucket = qs("scoreBucket").value;
  if (type) params.set("type", type);
  if (impact) params.set("impact", impact);
  if (verdict) params.set("verdict", verdict);
  if (scoreBucket) params.set("scoreBucket", scoreBucket);

  if (qs("hasMedia").checked) params.set("hasMedia", "1");
  if (qs("hasAcademicEvidence").checked) params.set("hasAcademicEvidence", "1");
  if (qs("hasConnectorError").checked) params.set("hasConnectorError", "1");
  if (qs("aiCommitteeEnabled").checked) params.set("aiCommitteeEnabled", "1");
  params.set("onlyChecks", "1");
  return params;
}

function renderBars(container, items, onPick) {
  container.innerHTML = "";
  const max = Math.max(1, ...items.map((i) => Number(i.count || 0)));
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "bar";
    row.tabIndex = 0;
    const name = document.createElement("div");
    name.className = "bar-name";
    name.textContent = String(item.key || "");
    const value = document.createElement("div");
    value.className = "bar-value";
    value.textContent = String(item.count || 0);
    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${Math.round((Number(item.count || 0) / max) * 100)}%`;
    track.append(fill);
    row.append(name, value, track);
    row.addEventListener("click", () => onPick?.(item.key));
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") onPick?.(item.key);
    });
    container.append(row);
  }
}

function renderLineChart(container, points, series) {
  container.innerHTML = "";
  const w = 980;
  const h = 220;
  const padX = 36;
  const padY = 18;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", String(h));

  const xs = points.map((_, i) => i);
  const xMax = Math.max(1, xs.length - 1);

  function xScale(i) {
    if (!xMax) return padX;
    return padX + (i / xMax) * (w - padX * 2);
  }

  const allY = [];
  for (const def of series) {
    for (const p of points) allY.push(Number(p[def.key] || 0));
  }
  const yMax = Math.max(1, ...allY);

  function yScale(v) {
    const t = Number(v || 0) / yMax;
    return h - padY - t * (h - padY * 2);
  }

  const grid = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const gridPath = [];
  for (let i = 0; i <= 4; i += 1) {
    const y = padY + (i / 4) * (h - padY * 2);
    gridPath.push(`M ${padX} ${y} L ${w - padX} ${y}`);
  }
  grid.setAttribute("d", gridPath.join(" "));
  grid.setAttribute("stroke", "rgba(255,255,255,0.06)");
  grid.setAttribute("stroke-width", "1");
  grid.setAttribute("fill", "none");
  svg.append(grid);

  const axis = document.createElementNS("http://www.w3.org/2000/svg", "path");
  axis.setAttribute("d", `M ${padX} ${padY} L ${padX} ${h - padY} L ${w - padX} ${h - padY}`);
  axis.setAttribute("stroke", "rgba(255,255,255,0.14)");
  axis.setAttribute("stroke-width", "1");
  axis.setAttribute("fill", "none");
  svg.append(axis);

  for (const def of series) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(i)} ${yScale(p[def.key])}`).join(" ");
    path.setAttribute("d", d);
    path.setAttribute("stroke", def.color);
    path.setAttribute("stroke-width", "2");
    path.setAttribute("fill", "none");
    svg.append(path);
  }

  const last = points[points.length - 1];
  if (last) {
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(w - padX));
    label.setAttribute("y", String(padY + 10));
    label.setAttribute("text-anchor", "end");
    label.setAttribute("fill", "rgba(232,234,240,0.8)");
    label.setAttribute("font-size", "12");
    label.textContent = String(last.t || "");
    svg.append(label);
  }

  container.append(svg);
}

let tableOffset = 0;
let tableTotal = 0;

function resetTable() {
  tableOffset = 0;
  tableTotal = 0;
  qs("table-events").querySelector("tbody").innerHTML = "";
  qs("table-meta").textContent = "";
}

function renderTableRows(events, append) {
  const tbody = qs("table-events").querySelector("tbody");
  if (!append) tbody.innerHTML = "";
  for (const e of events) {
    const tr = document.createElement("tr");
    const flags = [
      e.hasMedia ? "media" : "",
      e.hasAcademicEvidence ? "academic" : "",
      e.refuteCount ? "refute" : "",
      e.connectorErrorCount ? "connErr" : "",
      e.aiCommitteeEnabled ? "ai" : "",
      e.proxy502 ? "proxy502" : "",
    ].filter(Boolean).join(" ");

    const cols = [
      e.ts ? new Date(e.ts).toLocaleString() : "",
      e.visitor || "",
      e.type || "",
      e.impact || "",
      e.finalScore ?? "",
      e.verdict ?? "",
      e.capNote ?? "",
      e.elapsedMs ?? "",
      e.status ?? "",
      e.connectorErrorCount ? String(e.connectorErrorCount) : (e.upstreamError ? "upstream" : ""),
      flags,
    ];
    for (let i = 0; i < cols.length; i += 1) {
      const td = document.createElement("td");
      if ([4, 7, 8].includes(i)) td.className = "right";
      td.textContent = String(cols[i]);
      tr.append(td);
    }
    tbody.append(tr);
  }
}

async function loadDashboard() {
  const params = buildParams();
  const dashUrl = `/api/dashboard?${params.toString()}`;
  const dashRes = await fetch(dashUrl);
  const dash = await dashRes.json();
  const totals = dash.totals || {};

  qs("kpi-checks").textContent = String(totals.checks ?? "-");
  qs("kpi-checkuv").textContent = String(totals.checkUV ?? "-");
  qs("kpi-req").textContent = String(totals.requests ?? "-");

  qs("kpi-score").textContent = String(totals.avgFinalScore ?? "-");
  qs("kpi-high").textContent = pct(totals.highRate ?? 0);
  qs("kpi-mid").textContent = pct(totals.midRate ?? 0);
  qs("kpi-low").textContent = pct(totals.lowRate ?? 0);

  qs("kpi-avgElapsed").textContent = `${totals.avgElapsedMs ?? "-"} ms`;
  qs("kpi-p95p99").textContent = `${totals.p95ElapsedMs ?? "-"} / ${totals.p99ElapsedMs ?? "-"} ms`;
  qs("kpi-errRate").textContent = pct(totals.errorRate ?? 0);
  qs("kpi-proxy502").textContent = String(totals.proxy502 ?? 0);

  const alerts = dash.alerts || {};
  qs("kpi-alertLow").textContent = pct(alerts.lowScoreRate ?? 0);
  qs("kpi-alertErr").textContent = pct(alerts.errorRate ?? 0);

  const verdictSelect = qs("verdict");
  const prev = verdictSelect.value;
  verdictSelect.innerHTML = '<option value="">全部</option>';
  for (const item of dash.distributions?.verdicts || []) {
    const opt = document.createElement("option");
    opt.value = item.key;
    opt.textContent = `${item.key} (${item.count})`;
    verdictSelect.append(opt);
  }
  verdictSelect.value = prev;

  const trend = dash.trends?.checks || [];
  renderLineChart(qs("chart-count"), trend, [{ key: "count", color: "rgba(107,220,255,0.95)" }]);
  renderLineChart(qs("chart-score"), trend, [{ key: "avgScore", color: "rgba(182,107,255,0.95)" }]);
  renderLineChart(qs("chart-latency"), trend, [
    { key: "avgElapsedMs", color: "rgba(107,220,255,0.85)" },
    { key: "p95ElapsedMs", color: "rgba(255,211,106,0.85)" },
    { key: "p99ElapsedMs", color: "rgba(255,106,173,0.85)" },
  ]);
  renderLineChart(qs("chart-errors"), trend, [
    { key: "errorCount", color: "rgba(255,106,173,0.9)" },
    { key: "proxy502Count", color: "rgba(255,211,106,0.9)" },
  ]);

  renderBars(qs("dist-score"), dash.distributions?.scoreBuckets || [], (key) => {
    qs("scoreBucket").value = key === "unknown" ? "" : key;
    resetTable();
    refresh().catch(() => {});
  });
  renderBars(qs("dist-verdict"), dash.distributions?.verdicts || [], (key) => {
    qs("verdict").value = key;
    resetTable();
    refresh().catch(() => {});
  });
  renderBars(qs("dist-type"), dash.distributions?.types || [], (key) => {
    qs("type").value = key === "unknown" ? "" : key;
    resetTable();
    refresh().catch(() => {});
  });
  renderBars(qs("dist-impact"), dash.distributions?.impacts || [], (key) => {
    qs("impact").value = key === "unknown" ? "" : key;
    resetTable();
    refresh().catch(() => {});
  });
  renderBars(qs("dist-channel"), dash.distributions?.channelHits || [], () => {});
  renderBars(qs("dist-risk"), dash.distributions?.riskItems || [], () => {});
  renderBars(qs("dist-connector"), dash.distributions?.connectorErrors || [], () => {
    qs("hasConnectorError").checked = true;
    resetTable();
    refresh().catch(() => {});
  });
  renderBars(qs("dist-cap"), dash.distributions?.capNotes || [], () => {});
  renderBars(qs("dist-status"), (dash.distributions?.statuses || []).map((s) => ({ key: String(s.status), count: s.count })), () => {});

  return dash;
}

async function loadEvents(append) {
  const params = buildParams();
  params.set("limit", "50");
  params.set("offset", String(tableOffset));
  params.set("sort", qs("sort").value);
  const url = `/api/events/query?${params.toString()}`;
  const res = await fetch(url);
  const data = await res.json();
  tableTotal = data.total || 0;
  const items = data.events || [];
  renderTableRows(items, append);
  tableOffset += items.length;
  qs("table-meta").textContent = `已加载 ${tableOffset} / ${tableTotal}`;
  qs("loadMore").disabled = tableOffset >= tableTotal;
}

async function refresh() {
  await loadDashboard();
  await loadEvents(false);
}

function initRangeDefaults() {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 3600 * 1000);
  qs("from").value = toLocalInputValue(from);
  qs("to").value = toLocalInputValue(now);
}

qs("refresh").addEventListener("click", () => {
  resetTable();
  refresh().catch(() => {});
});
qs("loadMore").addEventListener("click", () => loadEvents(true).catch(() => {}));
qs("sort").addEventListener("change", () => {
  resetTable();
  refresh().catch(() => {});
});

initRangeDefaults();
resetTable();
refresh().catch(() => {});
