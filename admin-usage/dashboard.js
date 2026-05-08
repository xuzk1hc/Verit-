import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { resolve, extname, dirname, join } from "node:path";
import { createHash, timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.USAGE_ADMIN_PORT || 8799);
const HOST = process.env.USAGE_ADMIN_HOST || "127.0.0.1";
const DATA_FILE = resolve(process.env.USAGE_DATA_FILE || "./admin-usage/data/events.ndjson");
const UI_DIR = resolve(process.env.USAGE_UI_DIR || "./admin-usage/ui");
const ADMIN_USER = String(process.env.ADMIN_USER || "");
const ADMIN_PASS = String(process.env.ADMIN_PASS || "");
const MAX_EVENTS = Number(process.env.USAGE_MAX_EVENTS || 200000);

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

function parseList(url, key) {
  const raw = String(url.searchParams.get(key) || "").trim();
  if (!raw) return [];
  return raw.split(",").map((v) => v.trim()).filter(Boolean);
}

function parseBool(url, key) {
  const raw = String(url.searchParams.get(key) || "").trim().toLowerCase();
  if (!raw) return null;
  if (["1", "true", "yes", "y"].includes(raw)) return true;
  if (["0", "false", "no", "n"].includes(raw)) return false;
  return null;
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function floorToHour(ms) {
  const d = new Date(ms);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

function floorToDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isoHour(ms) {
  return new Date(ms).toISOString().slice(0, 13) + ":00";
}

function isoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function quantile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
  return sorted[idx] || 0;
}

function scoreBucket(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return "unknown";
  if (s >= 90) return "90-100";
  if (s >= 75) return "75-89";
  if (s >= 60) return "60-74";
  if (s >= 45) return "45-59";
  if (s >= 25) return "25-44";
  return "0-24";
}

function toDisplayEvent(evt) {
  const check = evt.check || null;
  return {
    ts: evt.ts,
    kind: evt.kind,
    path: evt.path,
    status: evt.status,
    durationMs: evt.durationMs,
    visitor: evt.visitorId ? sha256(evt.visitorId).slice(0, 12) : "",
    type: evt.input?.type || "",
    impact: evt.input?.impact || "",
    finalScore: check?.finalScore ?? null,
    verdict: check?.verdict ?? null,
    capNote: check?.capNote ?? null,
    supportCount: check?.supportCount ?? 0,
    refuteCount: check?.refuteCount ?? 0,
    channelHitCount: check?.channelHitCount ?? 0,
    hasMedia: Boolean(check?.hasMedia),
    hasAcademicEvidence: Boolean(check?.hasAcademicEvidence),
    aiCommitteeEnabled: Boolean(check?.aiCommitteeEnabled),
    retrievalStageCount: check?.retrievalStageCount ?? 0,
    connectorErrorCount: Array.isArray(check?.connectorErrors) ? check.connectorErrors.length : 0,
    elapsedMs: check?.elapsedMs ?? null,
    proxy502: Boolean(evt.proxy502),
    upstreamError: evt.upstreamError || "",
  };
}

function matchFilters(evt, filters) {
  if (!within(evt.ts, filters.range)) return false;
  if (!filters.includeNoise && evt.noise) return false;
  if (filters.kind.length && !filters.kind.includes(String(evt.kind || ""))) return false;
  if (filters.type.length && !filters.type.includes(String(evt.input?.type || ""))) return false;
  if (filters.impact.length && !filters.impact.includes(String(evt.input?.impact || ""))) return false;
  const check = evt.check || null;
  if (filters.onlyChecks && !check) return false;
  if (filters.verdict.length && !filters.verdict.includes(String(check?.verdict || ""))) return false;
  if (Number.isFinite(filters.scoreMin) && !(Number(check?.finalScore) >= filters.scoreMin)) return false;
  if (Number.isFinite(filters.scoreMax) && !(Number(check?.finalScore) <= filters.scoreMax)) return false;
  if (filters.hasMedia !== null && Boolean(check?.hasMedia) !== filters.hasMedia) return false;
  if (filters.hasAcademicEvidence !== null && Boolean(check?.hasAcademicEvidence) !== filters.hasAcademicEvidence) return false;
  if (filters.hasRefute !== null && (Number(check?.refuteCount || 0) > 0) !== filters.hasRefute) return false;
  if (filters.hasConnectorError !== null && (Array.isArray(check?.connectorErrors) && check.connectorErrors.length > 0) !== filters.hasConnectorError) return false;
  if (filters.aiCommitteeEnabled !== null && Boolean(check?.aiCommitteeEnabled) !== filters.aiCommitteeEnabled) return false;
  if (filters.scoreBucket.length && !filters.scoreBucket.includes(scoreBucket(check?.finalScore))) return false;
  return true;
}

function parseFilters(url) {
  const range = parseRange(url);
  const kind = parseList(url, "kind");
  const type = parseList(url, "type");
  const impact = parseList(url, "impact");
  const verdict = parseList(url, "verdict");
  const scoreMinRaw = url.searchParams.get("scoreMin");
  const scoreMaxRaw = url.searchParams.get("scoreMax");
  const scoreMin = scoreMinRaw === null ? NaN : Number(scoreMinRaw);
  const scoreMax = scoreMaxRaw === null ? NaN : Number(scoreMaxRaw);
  const scoreBucketList = parseList(url, "scoreBucket");
  return {
    range,
    kind,
    type,
    impact,
    verdict,
    scoreMin: Number.isFinite(scoreMin) ? scoreMin : NaN,
    scoreMax: Number.isFinite(scoreMax) ? scoreMax : NaN,
    scoreBucket: scoreBucketList,
    includeNoise: Boolean(parseBool(url, "includeNoise")),
    onlyChecks: parseBool(url, "onlyChecks") ?? true,
    hasMedia: parseBool(url, "hasMedia"),
    hasAcademicEvidence: parseBool(url, "hasAcademicEvidence"),
    hasRefute: parseBool(url, "hasRefute"),
    hasConnectorError: parseBool(url, "hasConnectorError"),
    aiCommitteeEnabled: parseBool(url, "aiCommitteeEnabled"),
  };
}

const store = {
  pos: 0,
  size: 0,
  mtimeMs: 0,
  remainder: "",
  events: [],
};

async function ensureLoaded() {
  let info;
  try {
    info = await stat(DATA_FILE);
  } catch {
    store.pos = 0;
    store.size = 0;
    store.mtimeMs = 0;
    store.remainder = "";
    store.events = [];
    return;
  }

  const size = Number(info.size || 0);
  if (size < store.pos) {
    store.pos = 0;
    store.remainder = "";
    store.events = [];
  }
  if (size === store.pos && info.mtimeMs === store.mtimeMs) return;

  const start = store.pos;
  if (start >= size) {
    store.size = size;
    store.mtimeMs = info.mtimeMs;
    return;
  }

  await new Promise((resolveStream) => {
    const stream = createReadStream(DATA_FILE, { encoding: "utf8", start });
    stream.on("data", (chunk) => {
      const text = store.remainder + chunk;
      const parts = text.split("\n");
      store.remainder = parts.pop() || "";
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        let evt;
        try {
          evt = JSON.parse(trimmed);
        } catch {
          continue;
        }
        store.events.push(evt);
        if (store.events.length > MAX_EVENTS) store.events.splice(0, store.events.length - MAX_EVENTS);
      }
    });
    stream.on("error", () => resolveStream());
    stream.on("end", () => resolveStream());
  });

  store.pos = size;
  store.size = size;
  store.mtimeMs = info.mtimeMs;
}

function aggregateDashboard(events, filters) {
  const matched = [];
  for (const evt of events) {
    if (!matchFilters(evt, filters)) continue;
    matched.push(evt);
  }

  const checks = matched.filter((e) => e.check);
  const checkVisitor = new Set(checks.map((e) => String(e.visitorId || "")).filter(Boolean));
  const allVisitor = new Set(matched.map((e) => String(e.visitorId || "")).filter(Boolean));

  const scoreSum = checks.reduce((sum, e) => sum + (Number(e.check?.finalScore) || 0), 0);
  const elapsedSum = checks.reduce((sum, e) => sum + (Number(e.check?.elapsedMs) || 0), 0);
  const elapsedSample = { values: [], count: 0 };
  const durationSample = { values: [], count: 0 };

  const scoreBuckets = new Map();
  const verdictCounts = new Map();
  const typeCounts = new Map();
  const impactCounts = new Map();
  const capCounts = new Map();
  const channelCounts = new Map();
  const connectorCounts = new Map();
  const riskCounts = new Map();
  const statusCounts = new Map();

  let high = 0;
  let mid = 0;
  let low = 0;
  let checkErrors = 0;
  let proxy502 = 0;

  const msRange = filters.range.to - filters.range.from;
  const bucketMode = msRange > 72 * 3600 * 1000 ? "day" : "hour";
  const series = new Map();

  function bucketKey(ms) {
    return bucketMode === "day" ? floorToDay(ms) : floorToHour(ms);
  }

  function ensureSeries(key) {
    if (!series.has(key)) {
      series.set(key, {
        key,
        checkCount: 0,
        scoreSum: 0,
        elapsedSum: 0,
        errorCount: 0,
        proxy502Count: 0,
        elapsedSample: { values: [], count: 0 },
      });
    }
    return series.get(key);
  }

  for (const evt of matched) {
    statusCounts.set(String(evt.status || 0), (statusCounts.get(String(evt.status || 0)) || 0) + 1);
    if (evt.proxy502) proxy502 += 1;
    if (evt.check) {
      const score = evt.check.finalScore;
      const bucket = scoreBucket(score);
      scoreBuckets.set(bucket, (scoreBuckets.get(bucket) || 0) + 1);
      const verdict = String(evt.check.verdict || "未知");
      verdictCounts.set(verdict, (verdictCounts.get(verdict) || 0) + 1);
      const type = String(evt.input?.type || "unknown");
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
      const impact = String(evt.input?.impact || "unknown");
      impactCounts.set(impact, (impactCounts.get(impact) || 0) + 1);
      const cap = String(evt.check.capNote || "未封顶");
      capCounts.set(cap, (capCounts.get(cap) || 0) + 1);
      for (const channel of evt.check.channelHits || []) {
        channelCounts.set(channel, (channelCounts.get(channel) || 0) + 1);
      }
      for (const item of evt.check.connectorErrors || []) {
        const key = String(item?.connector || "");
        if (!key) continue;
        connectorCounts.set(key, (connectorCounts.get(key) || 0) + (Number(item?.count) || 1));
      }
      for (const item of evt.check.riskItems || []) {
        const key = String(item || "");
        if (!key) continue;
        riskCounts.set(key, (riskCounts.get(key) || 0) + 1);
      }
      if (Number(score) >= 75) high += 1;
      else if (Number(score) >= 60) mid += 1;
      else low += 1;
      if ((evt.status || 0) >= 500 || (evt.check.connectorErrors || []).length) checkErrors += 1;
      const ms = Date.parse(evt.ts || "");
      if (Number.isFinite(ms)) {
        const key = bucketKey(ms);
        const s = ensureSeries(key);
        s.checkCount += 1;
        s.scoreSum += Number(evt.check.finalScore || 0);
        s.elapsedSum += Number(evt.check.elapsedMs || 0);
        if ((evt.status || 0) >= 500 || (evt.check.connectorErrors || []).length) s.errorCount += 1;
        if (evt.proxy502) s.proxy502Count += 1;
        reservoirPush(s.elapsedSample, Number(evt.check.elapsedMs || 0), 2000);
      }
      reservoirPush(elapsedSample, Number(evt.check.elapsedMs || 0), 8000);
      reservoirPush(durationSample, Number(evt.durationMs || 0), 8000);
    }
  }

  const seriesRows = [...series.values()]
    .sort((a, b) => a.key - b.key)
    .map((s) => {
      const count = s.checkCount || 0;
      return {
        t: bucketMode === "day" ? isoDay(s.key) : isoHour(s.key),
        count,
        avgScore: count ? Math.round(s.scoreSum / count) : 0,
        avgElapsedMs: count ? Math.round(s.elapsedSum / count) : 0,
        p95ElapsedMs: Math.round(quantile(s.elapsedSample.values, 0.95)),
        p99ElapsedMs: Math.round(quantile(s.elapsedSample.values, 0.99)),
        errorCount: s.errorCount,
        proxy502Count: s.proxy502Count,
      };
    });

  const totals = {
    checks: checks.length,
    checkUV: checkVisitor.size,
    requests: matched.length,
    uv: allVisitor.size,
    avgFinalScore: checks.length ? Math.round(scoreSum / checks.length) : 0,
    avgElapsedMs: checks.length ? Math.round(elapsedSum / checks.length) : 0,
    p95ElapsedMs: Math.round(quantile(elapsedSample.values, 0.95)),
    p99ElapsedMs: Math.round(quantile(elapsedSample.values, 0.99)),
    errorRate: checks.length ? Number((checkErrors / checks.length).toFixed(4)) : 0,
    proxy502,
    highRate: checks.length ? Number((high / checks.length).toFixed(4)) : 0,
    midRate: checks.length ? Number((mid / checks.length).toFixed(4)) : 0,
    lowRate: checks.length ? Number((low / checks.length).toFixed(4)) : 0,
  };

  function topEntries(map, limit = 12) {
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key, count]) => ({ key, count }));
  }

  const slowChecks = checks
    .map((e) => ({ ts: e.ts, elapsedMs: Number(e.check?.elapsedMs || 0), finalScore: e.check?.finalScore ?? null, verdict: e.check?.verdict ?? null, capNote: e.check?.capNote ?? null, visitor: e.visitorId ? sha256(e.visitorId).slice(0, 12) : "" }))
    .sort((a, b) => b.elapsedMs - a.elapsedMs)
    .slice(0, 12);

  const connectorFailures = topEntries(connectorCounts, 12);

  const alerts = (() => {
    const recentMs = Math.min(filters.range.to, Date.now());
    const cutoff = recentMs - 3 * 3600 * 1000;
    const recentChecks = checks.filter((e) => {
      const ms = Date.parse(e.ts || "");
      return Number.isFinite(ms) && ms >= cutoff && ms <= recentMs;
    });
    const lowScore = recentChecks.filter((e) => Number(e.check?.finalScore || 0) < 45).length;
    const err = recentChecks.filter((e) => (e.status || 0) >= 500 || (e.check?.connectorErrors || []).length).length;
    return {
      recentWindowHours: 3,
      recentChecks: recentChecks.length,
      lowScoreRate: recentChecks.length ? Number((lowScore / recentChecks.length).toFixed(4)) : 0,
      errorRate: recentChecks.length ? Number((err / recentChecks.length).toFixed(4)) : 0,
    };
  })();

  return {
    totals,
    bucketMode,
    trends: { checks: seriesRows },
    distributions: {
      scoreBuckets: topEntries(scoreBuckets, 20),
      verdicts: topEntries(verdictCounts, 20),
      types: topEntries(typeCounts, 20),
      impacts: topEntries(impactCounts, 20),
      capNotes: topEntries(capCounts, 20),
      channelHits: topEntries(channelCounts, 30),
      connectorErrors: connectorFailures,
      riskItems: topEntries(riskCounts, 20),
      statuses: [...statusCounts.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([key, count]) => ({ status: Number(key), count })),
    },
    tops: { slowChecks, connectorFailures },
    alerts,
  };
}

function legacySummary(events, range) {
  const totals = { requests: 0, ok: 0, error: 0, bytesIn: 0, bytesOut: 0, uniqueVisitors: 0, avgDurationMs: 0, p95DurationMs: 0 };
  const visitorSet = new Set();
  const endpointCounts = new Map();
  const statusCounts = new Map();
  const daily = new Map();
  const durationSample = { values: [], count: 0 };
  let durationSum = 0;
  for (const evt of events) {
    if (!within(evt.ts, range)) continue;
    if (evt.noise) continue;
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
    const ms = Date.parse(evt.ts || "");
    const day = Number.isFinite(ms) ? isoDay(floorToDay(ms)) : "";
    if (day) daily.set(day, (daily.get(day) || 0) + 1);
    const dur = Number(evt.durationMs || 0);
    durationSum += dur;
    reservoirPush(durationSample, dur, 5000);
  }
  totals.uniqueVisitors = visitorSet.size;
  totals.avgDurationMs = totals.requests ? Math.round(durationSum / totals.requests) : 0;
  totals.p95DurationMs = Math.round(quantile(durationSample.values, 0.95));

  const endpoints = [...endpointCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([path, count]) => ({ path, count }));
  const statuses = [...statusCounts.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([status, count]) => ({ status: Number(status), count }));
  const dailySeries = [...daily.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, count]) => ({ day, count }));
  return { totals, endpoints, statuses, daily: dailySeries };
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

const loopback = ["127.0.0.1", "::1", "localhost"].includes(String(HOST || ""));
if (!loopback && (!ADMIN_USER || !ADMIN_PASS)) {
  throw new Error("ADMIN_USER/ADMIN_PASS required when binding admin to a public host");
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname || "/";
    if (!requireAuth(req, res)) return;
    await ensureLoaded();

    if (pathname === "/api/health") return sendJson(res, 200, { ok: true });
    if (pathname === "/api/stats/summary") {
      const range = parseRange(url);
      const result = legacySummary(store.events, range);
      return sendJson(res, 200, { ok: true, ...result });
    }
    if (pathname === "/api/events/recent") {
      const range = parseRange(url);
      const limit = clampInt(url.searchParams.get("limit") || 50, 1, 200, 50);
      const filters = parseFilters(url);
      filters.range = range;
      const matched = [];
      for (const evt of store.events) {
        if (!within(evt.ts, range)) continue;
        if (evt.noise) continue;
        matched.push(toDisplayEvent(evt));
        if (matched.length > limit) matched.shift();
      }
      return sendJson(res, 200, { ok: true, events: matched.reverse() });
    }
    if (pathname === "/api/dashboard") {
      const filters = parseFilters(url);
      const result = aggregateDashboard(store.events, filters);
      return sendJson(res, 200, { ok: true, filters: { ...filters, range: filters.range }, ...result });
    }
    if (pathname === "/api/events/query") {
      const filters = parseFilters(url);
      const limit = clampInt(url.searchParams.get("limit") || 50, 1, 200, 50);
      const offset = clampInt(url.searchParams.get("offset") || 0, 0, 10_000_000, 0);
      const sort = String(url.searchParams.get("sort") || "tsDesc");
      const matched = [];
      for (const evt of store.events) {
        if (!matchFilters(evt, filters)) continue;
        matched.push(evt);
      }

      matched.sort((a, b) => {
        if (sort === "elapsedDesc") return Number(b.check?.elapsedMs || 0) - Number(a.check?.elapsedMs || 0);
        if (sort === "scoreAsc") return Number(a.check?.finalScore || 0) - Number(b.check?.finalScore || 0);
        if (sort === "scoreDesc") return Number(b.check?.finalScore || 0) - Number(a.check?.finalScore || 0);
        if (sort === "durationDesc") return Number(b.durationMs || 0) - Number(a.durationMs || 0);
        return Date.parse(b.ts || "") - Date.parse(a.ts || "");
      });

      const slice = matched.slice(offset, offset + limit).map(toDisplayEvent);
      return sendJson(res, 200, { ok: true, total: matched.length, events: slice });
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
