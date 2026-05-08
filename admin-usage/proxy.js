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
      upstreamRes.on("data", (chunk) => {
        bytesOut += chunk.length;
        res.write(chunk);
      });
      upstreamRes.on("end", () => {
        res.end();
        const durationMs = Date.now() - startedAt;
        const event = {
          ts: new Date().toISOString(),
          method: req.method || "GET",
          path: pathname,
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
    const event = {
      ts: new Date().toISOString(),
      method: req.method || "GET",
      path: pathname,
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
    };
    writeQueue = writeQueue.then(() => appendFile(DATA_FILE, `${JSON.stringify(event)}\n`, "utf8")).catch(() => {});
  });

  if (bodyBuf.length) upstreamReq.write(bodyBuf);
  upstreamReq.end();
}).listen(PORT, HOST, () => {
  console.log(`Usage proxy listening on http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT} -> ${UPSTREAM_ORIGIN}`);
  console.log(`Usage events: ${DATA_FILE}`);
});

