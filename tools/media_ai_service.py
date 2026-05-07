from __future__ import annotations

import base64
import io
import json
import math
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    from PIL import Image, ImageChops, ImageStat

    PIL_AVAILABLE = True
except Exception:
    Image = None
    ImageChops = None
    ImageStat = None
    PIL_AVAILABLE = False


PORT = int(os.environ.get("VERITE_MEDIA_AI_PORT", "8790"))
MAX_SAMPLE_BYTES = int(os.environ.get("VERITE_MEDIA_AI_MAX_BYTES", str(3 * 1024 * 1024)))
MODEL_NAME = os.environ.get("VERITE_MEDIA_AI_MODEL", "")
MODEL = None
MODEL_FAILED = False


def clamp(value: float, low: int = 0, high: int = 100) -> int:
    return max(low, min(high, round(value)))


def decode_data_url(data_url: str) -> bytes:
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    raw = base64.b64decode(data_url, validate=False)
    if len(raw) > MAX_SAMPLE_BYTES:
        raise ValueError("sample too large")
    return raw


def byte_entropy(raw: bytes) -> float:
    if not raw:
        return 0.0
    counts = [0] * 256
    for byte in raw:
        counts[byte] += 1
    entropy = 0.0
    length = len(raw)
    for count in counts:
        if count:
            p = count / length
            entropy -= p * math.log2(p)
    return entropy


def pil_metrics(raw: bytes) -> dict:
    if not PIL_AVAILABLE:
        return {"pil": False}
    image = Image.open(io.BytesIO(raw)).convert("RGB")
    image.thumbnail((512, 512))
    width, height = image.size
    pixels = image.load()
    edge_total = 0.0
    edge_count = 0
    saturated = 0
    for y in range(0, height, 2):
        for x in range(0, width, 2):
            r, g, b = pixels[x, y]
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            if min(r, g, b) <= 2 or max(r, g, b) >= 253:
                saturated += 1
            if x + 2 < width:
                rr, gg, bb = pixels[x + 2, y]
                right_lum = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb
                edge_total += abs(lum - right_lum) / 255
                edge_count += 1

    sample_count = max(1, math.ceil(width / 2) * math.ceil(height / 2))
    ela_rms = 0.0
    try:
        compressed = io.BytesIO()
        image.save(compressed, format="JPEG", quality=90)
        recompressed = Image.open(io.BytesIO(compressed.getvalue())).convert("RGB")
        diff = ImageChops.difference(image, recompressed)
        stat = ImageStat.Stat(diff)
        ela_rms = math.sqrt(sum(value * value for value in stat.rms) / len(stat.rms))
    except Exception:
        ela_rms = 0.0

    return {
        "pil": True,
        "width": width,
        "height": height,
        "edgeDensity": edge_total / max(1, edge_count),
        "saturationRatio": saturated / sample_count,
        "elaRms": ela_rms,
    }


def optional_model_score(raw: bytes) -> dict | None:
    global MODEL, MODEL_FAILED
    if not MODEL_NAME or MODEL_FAILED or not PIL_AVAILABLE:
        return None
    try:
        if MODEL is None:
            from transformers import pipeline

            MODEL = pipeline("image-classification", model=MODEL_NAME)
        image = Image.open(io.BytesIO(raw)).convert("RGB")
        preds = MODEL(image)
        labels = []
        synthetic_score = 50.0
        for pred in preds[:5]:
            label = str(pred.get("label", "")).lower()
            score = float(pred.get("score", 0.0)) * 100
            labels.append({"label": pred.get("label", ""), "score": round(score, 2)})
            if any(token in label for token in ("fake", "synthetic", "generated", "ai")):
                synthetic_score = max(synthetic_score, score)
            if any(token in label for token in ("real", "authentic", "natural")):
                synthetic_score = min(synthetic_score, 100 - score)
        return {"model": MODEL_NAME, "syntheticScore": clamp(synthetic_score), "labels": labels}
    except Exception as error:
        MODEL_FAILED = True
        return {"model": MODEL_NAME, "error": str(error)}


def analyze_sample(sample: dict) -> dict:
    raw = decode_data_url(sample.get("dataUrl", ""))
    entropy = byte_entropy(raw)
    metrics = pil_metrics(raw)
    model_result = optional_model_score(raw)
    reasons = []

    if metrics.get("pil"):
        edge = metrics["edgeDensity"]
        saturation = metrics["saturationRatio"]
        ela_rms = metrics["elaRms"]
        risk = 18 + min(32, ela_rms * 1.8) + min(22, edge * 80) + min(14, saturation * 80)
        synthetic = 24 + min(34, edge * 95) + (10 if entropy < 6.2 else 0) + (8 if saturation > 0.08 else 0)
        if ela_rms > 8:
            reasons.append("ELA residual is high")
        if edge > 0.22:
            reasons.append("high-frequency edge density is elevated")
        if saturation > 0.1:
            reasons.append("saturation clipping is elevated")
    else:
        risk = 28 + (12 if entropy < 6.2 else 0)
        synthetic = 32 + (10 if entropy < 6.2 else 0)
        reasons.append("Pillow is not installed; byte-level fallback only")

    if entropy < 5.8:
        reasons.append("sample entropy is low")
    if model_result and not model_result.get("error"):
        synthetic = max(synthetic, model_result["syntheticScore"])
        risk = max(risk, model_result["syntheticScore"])
        reasons.append("optional image-classification model returned a signal")
    elif model_result and model_result.get("error"):
        reasons.append("optional model failed; using heuristic fallback")

    return {
        "mediaIndex": sample.get("mediaIndex", 0),
        "sampleIndex": sample.get("sampleIndex", 0),
        "sampleType": sample.get("sampleType", ""),
        "time": sample.get("time", 0),
        "syntheticScore": clamp(synthetic),
        "riskScore": clamp(risk),
        "entropy": round(entropy, 3),
        "metrics": metrics,
        "modelResult": model_result,
        "reasons": reasons[:4],
    }


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path != "/health":
            self.send_json({"ok": False, "error": "not found"}, 404)
            return
        self.send_json({"ok": True, "service": "La vérité media AI", "pillow": PIL_AVAILABLE, "model": MODEL_NAME or "heuristic"})

    def do_POST(self) -> None:
        if self.path != "/analyze":
            self.send_json({"ok": False, "error": "not found"}, 404)
            return
        length = int(self.headers.get("content-length", "0"))
        payload = json.loads(self.rfile.read(length) or b"{}")
        samples = []
        for sample in payload.get("samples", [])[:32]:
            try:
                samples.append(analyze_sample(sample))
            except Exception as error:
                samples.append({
                    "mediaIndex": sample.get("mediaIndex", 0),
                    "sampleIndex": sample.get("sampleIndex", 0),
                    "syntheticScore": 50,
                    "riskScore": 50,
                    "error": str(error),
                })
        self.send_json({
            "ok": True,
            "engine": "la-verite-lightweight-forensics",
            "model": MODEL_NAME or "ELA+frequency heuristic",
            "samples": samples,
        })

    def send_json(self, body: dict, status: int = 200) -> None:
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_args) -> None:
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"La vérité media AI service running at http://127.0.0.1:{PORT}")
    server.serve_forever()
