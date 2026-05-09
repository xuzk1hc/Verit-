import { createServer, request as httpRequest } from "node:http";
import { mkdir, appendFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";

const UPSTREAM_ORIGIN = process.env.USAGE_UPSTREAM || "http://127.0.0.1:8787";
const PORT = Number(process.env.USAGE_PROXY_PORT || 8788);
const HOST = process.env.USAGE_PROXY_HOST || "0.0.0.0";
const DATA_FILE = resolve(process.env.USAGE_DATA_FILE || "./admin-usage/data/events.ndjson");
const SALT = String(process.env.USAGE_SALT || "la-verite-usage");
const STORE_UA = process.env.USAGE_STORE_UA === "1";
const STORE_IP = process.env.USAGE_STORE_IP === "1";
const MAX_BODY_BYTES = Number(process.env.USAGE_MAX_BODY_BYTES || 512 * 1024);
const MAX_RESPONSE_BYTES = Number(process.env.USAGE_MAX_RESPONSE_BYTES || 2 * 1024 * 1024);
const LOG_STATIC = process.env.USAGE_LOG_STATIC === "1";

await mkdir(dirname(DATA_FILE), { recursive: true });

let writeQueue = Promise.resolve();

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function readBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    if (!["POST", "PUT", "PATCH"].includes(req.method || "")) return resolveBody(Buffer.alloc(0));
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy(new Error("payload too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
    req.on("error", rejectBody);
    req.on("aborted", () => rejectBody(new Error("request aborted")));
  });
}

function parseInputMetric(pathname, bodyBuf, contentType) {
  if (!pathname?.startsWith("/api/")) return null;
  if (pathname !== "/api/check") return { api: pathname };
  if (!contentType?.includes("application/json")) return { api: pathname };
  try {
    const payload = JSON.parse(bodyBuf.toString("utf8") || "{}");
    const url = String(payload?.url || "");
    const text = String(payload?.text || "");
    const media = Array.isArray(payload?.media) ? payload.media : [];
    const type = ["event", "data", "statement"].includes(payload?.type) ? payload.type : "event";
    const impact = ["high", "medium", "low"].includes(payload?.impact) ? payload.impact : "medium";
    return {
      api: pathname,
      input: {
        urlLen: url.length,
        textLen: text.length,
        mediaCount: media.length,
        type,
        impact,
      },
    };
  } catch {
    return { api: pathname };
  }
}

function classifyPath(pathname) {
  if (!pathname) return { kind: "unknown", noise: true };
  if (pathname === "/api/check") return { kind: "check", noise: false };
  if (pathname.startsWith("/api/")) return { kind: "api", noise: false };
  if (pathname === "/favicon.ico" || pathname === "/robots.txt") return { kind: "static", noise: true };
  if (/\.(css|js|map|png|jpg|jpeg|gif|webp|svg|ico|woff2?)$/i.test(pathname)) return { kind: "static", noise: true };
  return { kind: "page", noise: false };
}

function parseConnectorErrors(items) {
  const errors = Array.isArray(items) ? items : [];
  const parsed = [];
  for (const raw of errors) {
    const text = String(raw || "");
    const connector = text.split("×")[0]?.trim();
    if (!connector) continue;
    const countRaw = text.split("×")[1]?.split(":")[0]?.trim();
    const count = Number(countRaw || 0) || 1;
    parsed.push({ connector, count });
  }
  return parsed.slice(0, 12);
}

function extractCheckSummary(payload) {
  const report = payload?.report || {};
  const diagnostics = payload?.diagnostics || {};
  const finalScore = Number(report?.finalScore ?? NaN);
  const verdict = String(report?.verdict?.label || report?.verdict || "");
  const capNote = String(report?.cap?.note || "");
  const channelHits = Array.isArray(report?.channels) ? report.channels.filter((c) => c && c.status === "已命中").map((c) => String(c.id || "")).filter(Boolean) : [];
  const channelHitCount = channelHits.length;
  const claimCount = Number(report?.claims?.activeCount ?? (Array.isArray(report?.claims?.activeClaims) ? report.claims.activeClaims.length : NaN)) || 0;
  const hasMedia = Boolean(report?.mediaIntegrity?.hasMedia || (Array.isArray(report?.media) && report.media.length));
  const hasAcademicEvidence = Array.isArray(report?.channels)
    ? report.channels.some((c) => c && c.id === "academicEvidence" && c.status === "已命中")
    : Boolean(Array.isArray(report?.links?.academic) && report.links.academic.length);
  const aiCommitteeEnabled = Boolean(report?.aiCommittee);
  const retrievalStageCount = Number(diagnostics?.retrievalStages ?? 0) || 0;
  const elapsedMs = Number(payload?.elapsedMs ?? 0) || 0;
  const connectorErrors = parseConnectorErrors(diagnostics?.errors);
  const supportCount = Array.isArray(report?.links?.evidence) ? report.links.evidence.filter((item) => item?.stance === "支持").length : 0;
  const refuteCount = Array.isArray(report?.links?.suspicious) ? report.links.suspicious.filter((item) => item?.stance === "反驳").length : 0;
  const riskItems = Array.isArray(report?.risks)
    ? report.risks
      .map((row) => Array.isArray(row) ? `${String(row[0] || "").slice(0, 12)}:${String(row[1] || "").slice(0, 60)}` : "")
      .filter(Boolean)
      .slice(0, 8)
    : [];
  return {
    finalScore: Number.isFinite(finalScore) ? finalScore : null,
    verdict: verdict || null,
    capNote: capNote || null,
    supportCount,
    refuteCount,
    channelHitCount,
    channelHits: channelHits.length ? channelHits.slice(0, 24) : [],
    claimCount,
    hasMedia,
    hasAcademicEvidence,
    aiCommitteeEnabled,
    retrievalStageCount,
    connectorErrors,
    elapsedMs,
    riskItems: riskItems.length ? riskItems : undefined,
  };
}

function normalizeUpstream(origin) {
  try {
    return new URL(origin);
  } catch {
    return new URL("http://127.0.0.1:8787");
  }
}

const upstream = normalizeUpstream(UPSTREAM_ORIGIN);

createServer(async (req, res) => {
  const startedAt = Date.now();
  const remoteAddress = req.socket?.remoteAddress || "";
  const userAgent = String(req.headers["user-agent"] || "");
  const ipSeed = String(req.headers["x-forwarded-for"] || remoteAddress).split(",")[0].trim();
  const visitorId = sha256(`${SALT}|${ipSeed}|${userAgent}`);
  const pathname = (() => {
    try {
      return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
    } catch {
      return "/";
    }
  })();
  const classification = classifyPath(pathname);

  let bodyBuf = Buffer.alloc(0);
  let inputMetric = null;
  let bodyHash = "";
  let bodySize = 0;
  let upstreamError = "";

  try {
    bodyBuf = await readBody(req);
    bodySize = bodyBuf.length;
    if (bodySize) bodyHash = sha256(bodyBuf);
    inputMetric = parseInputMetric(pathname, bodyBuf, String(req.headers["content-type"] || ""));
  } catch (error) {
    upstreamError = error?.message || String(error);
  }

  const proxyHeaders = { ...req.headers };
  proxyHeaders.host = upstream.host;
  delete proxyHeaders.connection;

  const upstreamReq = httpRequest(
    {
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port,
      method: req.method,
      path: req.url,
      headers: proxyHeaders,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      let bytesOut = 0;
      const contentType = String(upstreamRes.headers["content-type"] || "");
      const captureCheckResponse = classification.kind === "check" && contentType.includes("application/json");
      let responseChunks = [];
      let responseSize = 0;
      let responseCaptureDisabled = false;
      upstreamRes.on("data", (chunk) => {
        bytesOut += chunk.length;
        if (captureCheckResponse && !responseCaptureDisabled) {
          responseSize += chunk.length;
          if (responseSize <= MAX_RESPONSE_BYTES) responseChunks.push(chunk);
          else {
            responseCaptureDisabled = true;
            responseChunks = [];
          }
        }
        res.write(chunk);
      });
      upstreamRes.on("end", () => {
        res.end();
        const durationMs = Date.now() - startedAt;
        let check = null;
        if (captureCheckResponse && !responseCaptureDisabled && responseChunks.length) {
          try {
            const parsed = JSON.parse(Buffer.concat(responseChunks).toString("utf8") || "{}");
            check = extractCheckSummary(parsed);
          } catch {
            check = null;
          }
        }
        if (classification.noise && !LOG_STATIC) return;
        const event = {
          ts: new Date().toISOString(),
          method: req.method || "GET",
          path: pathname,
          kind: classification.kind,
          noise: classification.noise,
          status: upstreamRes.statusCode || 0,
          durationMs,
          bytesIn: bodySize || Number(req.headers["content-length"] || 0) || 0,
          bytesOut,
          visitorId,
          ua: STORE_UA ? userAgent.slice(0, 220) : undefined,
          ip: STORE_IP ? ipSeed : undefined,
          uaHash: sha256(`${SALT}|ua|${userAgent}`),
          ipHash: sha256(`${SALT}|ip|${ipSeed}`),
          bodyHash: bodyHash || undefined,
          ...(inputMetric || {}),
          check: check || undefined,
          upstreamError: upstreamError || undefined,
        };
        writeQueue = writeQueue.then(() => appendFile(DATA_FILE, `${JSON.stringify(event)}\n`, "utf8")).catch(() => {});
      });
    },
  );

  upstreamReq.on("error", (error) => {
    const durationMs = Date.now() - startedAt;
    const message = error?.message || String(error);
    res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "Bad Gateway" }));
    if (classification.noise && !LOG_STATIC) return;
    const event = {
      ts: new Date().toISOString(),
      method: req.method || "GET",
      path: pathname,
      kind: classification.kind,
      noise: classification.noise,
      status: 502,
      durationMs,
      bytesIn: bodySize || Number(req.headers["content-length"] || 0) || 0,
      bytesOut: 0,
      visitorId,
      ua: STORE_UA ? userAgent.slice(0, 220) : undefined,
      ip: STORE_IP ? ipSeed : undefined,
      uaHash: sha256(`${SALT}|ua|${userAgent}`),
      ipHash: sha256(`${SALT}|ip|${ipSeed}`),
      bodyHash: bodyHash || undefined,
      ...(inputMetric || {}),
      upstreamError: upstreamError || message,
      proxy502: true,
    };
    writeQueue = writeQueue.then(() => appendFile(DATA_FILE, `${JSON.stringify(event)}\n`, "utf8")).catch(() => {});
  });

  if (bodyBuf.length) upstreamReq.write(bodyBuf);
  upstreamReq.end();
}).listen(PORT, HOST, () => {
  console.log(`Usage proxy listening on http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT} -> ${UPSTREAM_ORIGIN}`);
  console.log(`Usage events: ${DATA_FILE}`);
});
