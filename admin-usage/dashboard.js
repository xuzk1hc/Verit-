import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { resolve, extname, dirname, join } from "node:path";
import { createHash, timingSafeEqual } from "node:crypto";
import { createInterface } from "node:readline";

const PORT = Number(process.env.USAGE_ADMIN_PORT || 8799);
const HOST = process.env.USAGE_ADMIN_HOST || "0.0.0.0";
const DATA_FILE = resolve(process.env.USAGE_DATA_FILE || "./admin-usage/data/events.ndjson");
const UI_DIR = resolve(process.env.USAGE_UI_DIR || "./admin-usage/ui");
const ADMIN_USER = String(process.env.ADMIN_USER || "");
const ADMIN_PASS = String(process.env.ADMIN_PASS || "");

await mkdir(dirname(DATA_FILE), { recursive: true });

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type });
  res.end(text);
}

function constantTimeEquals(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}

function requireAuth(req, res) {
  if (!ADMIN_USER || !ADMIN_PASS) return true;
  const raw = String(req.headers.authorization || "");
  if (!raw.startsWith("Basic ")) {
    res.writeHead(401, { "www-authenticate": 'Basic realm="usage-admin", charset="UTF-8"' });
    res.end("Unauthorized");
    return false;
  }
  const decoded = Buffer.from(raw.slice(6), "base64").toString("utf8");
  const index = decoded.indexOf(":");
  const user = index >= 0 ? decoded.slice(0, index) : decoded;
  const pass = index >= 0 ? decoded.slice(index + 1) : "";
  if (!constantTimeEquals(user, ADMIN_USER) || !constantTimeEquals(pass, ADMIN_PASS)) {
    res.writeHead(401, { "www-authenticate": 'Basic realm="usage-admin", charset="UTF-8"' });
    res.end("Unauthorized");
    return false;
  }
  return true;
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function ymd(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function parseRange(url) {
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const fromMs = from ? Date.parse(from) : NaN;
  const toMs = to ? Date.parse(to) : NaN;
  return {
    from: Number.isNaN(fromMs) ? 0 : fromMs,
    to: Number.isNaN(toMs) ? Date.now() + 365 * 24 * 3600 * 1000 : toMs,
  };
}

function within(ts, range) {
  const ms = Date.parse(ts || "");
  if (Number.isNaN(ms)) return false;
  return ms >= range.from && ms <= range.to;
}

function reservoirPush(state, value, maxSize) {
  state.count += 1;
  if (state.values.length < maxSize) {
    state.values.push(value);
    return;
  }
  const index = Math.floor(Math.random() * state.count);
  if (index < maxSize) state.values[index] = value;
}

async function summarize(range) {
  const totals = { requests: 0, ok: 0, error: 0, bytesIn: 0, bytesOut: 0, uniqueVisitors: 0, avgDurationMs: 0, p95DurationMs: 0 };
  const visitorSet = new Set();
  const endpointCounts = new Map();
  const statusCounts = new Map();
  const daily = new Map();
  const durationSample = { values: [], count: 0 };

  try {
    await stat(DATA_FILE);
  } catch {
    return { totals, endpoints: [], statuses: [], daily: [] };
  }

  const rl = createInterface({ input: createReadStream(DATA_FILE, { encoding: "utf8" }), crlfDelay: Infinity });
  let durationSum = 0;
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let evt;
    try {
      evt = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!within(evt.ts, range)) continue;
    totals.requests += 1;
    if ((evt.status || 0) >= 200 && (evt.status || 0) < 400) totals.ok += 1;
    else totals.error += 1;
    totals.bytesIn += Number(evt.bytesIn || 0);
    totals.bytesOut += Number(evt.bytesOut || 0);
    const visitor = String(evt.visitorId || "");
    if (visitor) visitorSet.add(visitor);
    const path = String(evt.path || "");
    endpointCounts.set(path, (endpointCounts.get(path) || 0) + 1);
    const status = String(evt.status || 0);
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    const day = ymd(evt.ts);
    if (day) daily.set(day, (daily.get(day) || 0) + 1);
    const dur = Number(evt.durationMs || 0);
    durationSum += dur;
    reservoirPush(durationSample, dur, 5000);
  }

  totals.uniqueVisitors = visitorSet.size;
  totals.avgDurationMs = totals.requests ? Math.round(durationSum / totals.requests) : 0;
  durationSample.values.sort((a, b) => a - b);
  if (durationSample.values.length) {
    const idx = Math.min(durationSample.values.length - 1, Math.floor(durationSample.values.length * 0.95));
    totals.p95DurationMs = Math.round(durationSample.values[idx] || 0);
  }

  const endpoints = [...endpointCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([path, count]) => ({ path, count }));

  const statuses = [...statusCounts.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([status, count]) => ({ status: Number(status), count }));

  const dailySeries = [...daily.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, count]) => ({ day, count }));

  return { totals, endpoints, statuses, daily: dailySeries };
}

async function loadRecent(limit, range) {
  try {
    await stat(DATA_FILE);
  } catch {
    return [];
  }
  const rl = createInterface({ input: createReadStream(DATA_FILE, { encoding: "utf8" }), crlfDelay: Infinity });
  const buf = [];
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let evt;
    try {
      evt = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!within(evt.ts, range)) continue;
    buf.push({
      ts: evt.ts,
      method: evt.method,
      path: evt.path,
      status: evt.status,
      durationMs: evt.durationMs,
      visitorId: evt.visitorId ? sha256(evt.visitorId).slice(0, 12) : "",
      input: evt.input || null,
      upstreamError: evt.upstreamError || "",
    });
    if (buf.length > limit) buf.shift();
  }
  return buf.reverse();
}

async function serveStatic(req, res, pathname) {
  const safe = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(join(UI_DIR, safe.replace(/^\/+/, "")));
  if (!filePath.startsWith(UI_DIR)) return sendText(res, 403, "Forbidden");
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return sendText(res, 404, "Not Found");
  } catch {
    return sendText(res, 404, "Not Found");
  }
  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, { "content-type": mimeTypes[ext] || "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname || "/";
    if (!requireAuth(req, res)) return;

    if (pathname === "/api/health") return sendJson(res, 200, { ok: true });
    if (pathname === "/api/stats/summary") {
      const range = parseRange(url);
      const result = await summarize(range);
      return sendJson(res, 200, { ok: true, ...result });
    }
    if (pathname === "/api/events/recent") {
      const range = parseRange(url);
      const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || 50) || 50));
      const events = await loadRecent(limit, range);
      return sendJson(res, 200, { ok: true, events });
    }

    return serveStatic(req, res, pathname);
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error?.message || String(error) });
  }
}).listen(PORT, HOST, () => {
  console.log(`Usage admin listening on http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}`);
  console.log(`Usage events: ${DATA_FILE}`);
  if (ADMIN_USER && ADMIN_PASS) console.log(`Auth enabled: ${ADMIN_USER}`);
});

