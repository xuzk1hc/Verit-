const CURRENT_DATE = new Date("2026-04-29T00:00:00+08:00");
const AI_COMMITTEE_ENABLED = false;
const OPTIONAL_FORENSIC_IMPORTS = {
  exifr: "https://esm.sh/exifr@7.1.3?bundle",
  c2pa: "https://esm.sh/@contentauth/c2pa-web@0.2.2?bundle",
};
const forensicLibraryState = { attempted: false, exifr: null, c2pa: null };

const profiles = {
  event: {
    label: "默认事件类",
    weights: {
      web: 0.22,
      logic: 0.15,
      history: 0.1,
      sourceChain: 0.15,
      realWorld: 0.15,
      stats: 0.08,
      integrity: 0.15,
    },
  },
  data: {
    label: "数据类",
    weights: {
      web: 0.18,
      logic: 0.14,
      history: 0.1,
      sourceChain: 0.14,
      realWorld: 0.18,
      stats: 0.2,
      integrity: 0.06,
    },
  },
  statement: {
    label: "纯声明类",
    weights: {
      web: 0.3,
      logic: 0.1,
      history: 0.08,
      sourceChain: 0.22,
      realWorld: 0.08,
      stats: 0.04,
      integrity: 0.18,
    },
  },
};

const angleMeta = {
  web: "联网交叉检索",
  logic: "逻辑一致性与反事实",
  history: "历史复盘",
  sourceChain: "来源链溯源",
  realWorld: "现实世界旁证",
  stats: "统计异常与基准率",
  integrity: "内容与媒介完整性",
};

const tierScores = {
  T0: 95,
  T1: 85,
  T2: 76,
  T3: 60,
  T4: 42,
  T5: 18,
};

const academicAuthorityDomains = [
  "pubmed.ncbi.nlm.nih.gov",
  "ncbi.nlm.nih.gov",
  "clinicaltrials.gov",
  "cochranelibrary.com",
  "cochrane.org",
  "who.int",
  "cdc.gov",
  "fda.gov",
  "ema.europa.eu",
  "nice.org.uk",
  "nih.gov",
  "ahrq.gov",
  "ecdc.europa.eu",
];

const academicTopJournalDomains = [
  "nejm.org",
  "thelancet.com",
  "jamanetwork.com",
  "bmj.com",
  "nature.com",
  "science.org",
  "cell.com",
  "pnas.org",
  "acpjournals.org",
  "annals.org",
  "ahajournals.org",
  "diabetesjournals.org",
  "atsjournals.org",
  "jci.org",
  "ashpublications.org",
];

const academicPublisherDomains = [
  "crossref.org",
  "sciencedirect.com",
  "elsevier.com",
  "springer.com",
  "link.springer.com",
  "springernature.com",
  "wiley.com",
  "onlinelibrary.wiley.com",
  "oup.com",
  "academic.oup.com",
  "cambridge.org",
  "sagepub.com",
  "tandfonline.com",
  "plos.org",
  "elifesciences.org",
  "pubs.acs.org",
  "acs.org",
  "rsc.org",
  "royalsocietypublishing.org",
  "iopscience.iop.org",
  "aip.scitation.org",
  "journals.aps.org",
  "aps.org",
  "ieee.org",
  "ieeexplore.ieee.org",
  "acm.org",
  "dl.acm.org",
  "asm.org",
  "microbiologyresearch.org",
  "lww.com",
  "wolterskluwer.com",
];

const academicMixedQualityDomains = [
  "frontiersin.org",
  "biomedcentral.com",
  "bmc.com",
  "mdpi.com",
  "hindawi.com",
  "dovepress.com",
  "cureus.com",
  "peerj.com",
];

const academicPreprintDomains = [
  "arxiv.org",
  "medrxiv.org",
  "biorxiv.org",
  "ssrn.com",
  "researchsquare.com",
  "preprints.org",
  "osf.io",
  "zenodo.org",
];

const academicSignalDomains = [
  ...academicAuthorityDomains,
  ...academicTopJournalDomains,
  ...academicPublisherDomains,
  ...academicMixedQualityDomains,
  ...academicPreprintDomains,
  "doi.org",
];

const academicSourceNamePattern = /柳叶刀|自然杂志|自然期刊|新英格兰医学杂志|美国医学会杂志|英国医学杂志|科克伦|(^|[^a-z0-9])(lancet|nejm|jama|bmj|pnas|pubmed|cochrane|medrxiv|biorxiv|arxiv)([^a-z0-9]|$)|(^|[^a-z0-9])nature\s+(journal|medicine|paper|study|article|published|publishes)|(^|[^a-z0-9])science\s+(journal|paper|study|article|published|publishes)/i;

const sourceTierDomains = [
  { tier: "T0", match: ["gov", ...academicAuthorityDomains, "royal.uk", "whitehouse.gov", "congress.gov", "parliament.uk", "sec.gov", "justice.gov", "court", "europa.eu", "gov.cn", "gov.uk", "un.org"] },
  { tier: "T1", match: academicTopJournalDomains },
  { tier: "T2", match: academicPublisherDomains },
  { tier: "T3", match: academicMixedQualityDomains },
  { tier: "T4", match: academicPreprintDomains },
  { tier: "T1", match: ["reuters.com", "bloomberg.com", "apnews.com", "ft.com"] },
  { tier: "T2", match: ["bbc.", "nytimes.com", "wsj.com", "caixin.com", "nikkei.com", "theguardian.com", "washingtonpost.com", "cctv.com", "news.cctv.com", "cgtn.com"] },
  { tier: "T3", match: ["21jingji.com"] },
  { tier: "T4", match: ["x.com", "twitter.com", "weibo.com", "facebook.com", "instagram.com", "reddit.com", "tiktok.com", "youtube.com", "youtu.be", "telegram"] },
];

const channelLabels = {
  newsMedia: "新闻媒体",
  socialPlatform: "互联网平台",
  selfMedia: "自媒体 / KOL",
  authoritativeStatement: "权威发言",
  primaryRecord: "原始文件 / 数据",
  realWorldTrace: "现实世界旁证",
  academicEvidence: "学术 / 期刊证据",
  uploadedMedia: "图片 / 视频素材",
};

const form = document.getElementById("checkForm");
const resetBtn = document.getElementById("resetBtn");
const fileInput = document.getElementById("mediaFiles");
const fileStrip = document.getElementById("fileStrip");
const fileCountBadge = document.getElementById("fileCountBadge");
const backendBadge = document.getElementById("backendBadge");

fileInput.addEventListener("change", renderFileStrip);
resetBtn.addEventListener("click", resetApp);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setAnalyzing(true);
  try {
    const report = await analyzeInput();
    renderReport(report);
  } finally {
    setAnalyzing(false);
  }
});

function resetApp() {
  form.reset();
  fileStrip.innerHTML = "";
  fileCountBadge.textContent = "0 files";
  document.getElementById("report").classList.add("is-hidden");
  document.getElementById("emptyState").classList.remove("is-hidden");
  document.getElementById("reportTime").textContent = "等待分析";
  document.getElementById("mediaForensicsSection")?.classList.add("is-hidden");
  document.getElementById("mediaWorkflowSection")?.classList.add("is-hidden");
  document.getElementById("claimSplitSection")?.classList.add("is-hidden");
  document.getElementById("retrievalPlanSection")?.classList.add("is-hidden");
}

function renderFileStrip() {
  const files = Array.from(fileInput.files || []);
  fileCountBadge.textContent = `${files.length} files`;
  fileStrip.innerHTML = "";

  files.forEach((file) => {
    const row = document.createElement("div");
    row.className = "file-item";

    const thumb = document.createElement(file.type.startsWith("image/") ? "img" : "div");
    thumb.className = "thumb";
    if (file.type.startsWith("image/")) {
      thumb.src = URL.createObjectURL(file);
      thumb.onload = () => URL.revokeObjectURL(thumb.src);
      thumb.alt = "";
    }

    const body = document.createElement("div");
    body.innerHTML = `<div class="file-name">${escapeHtml(file.name)}</div><div class="file-meta">${formatBytes(file.size)} · ${escapeHtml(file.type || "unknown")}</div>`;

    const type = document.createElement("span");
    type.className = "badge good";
    type.textContent = file.type.startsWith("video/") ? "VIDEO" : "IMAGE";

    row.append(thumb, body, type);
    fileStrip.appendChild(row);
  });
}

async function analyzeInput() {
  const url = document.getElementById("newsUrl").value.trim();
  const text = document.getElementById("claimText").value.trim();
  const type = document.getElementById("claimType").value;
  const impact = document.getElementById("impactLevel").value;
  const sourceName = document.getElementById("sourceName").value.trim();
  const files = Array.from(fileInput.files || []);
  const media = await Promise.all(files.map(readMediaMeta));

  const backendReport = await analyzeWithBackend({ url, text, type, impact, sourceName, media });
  if (backendReport) return enrichReportWithClientMediaIntegrity(backendReport, media);

  const signals = extractSignals({ url, text, sourceName, files, media, impact });
  const profile = profiles[type];
  const angleScores = calculateAngleScores(signals);

  let weighted = 0;
  for (const [key, weight] of Object.entries(profile.weights)) {
    weighted += angleScores[key].score * weight;
  }

  const cap = calculateCap(signals, impact);
  const cappedScore = Math.min(weighted, cap.value);
  const verdict = verdictFor(cappedScore);

  return {
    url,
    text,
    type,
    impact,
    sourceName,
    media,
    signals,
    profile,
    angleScores,
    rawScore: weighted,
    finalScore: Math.round(cappedScore),
    cap,
    verdict,
    analysisSummary: buildClientAnalysisSummary({
      finalScore: Math.round(cappedScore),
      verdict,
      cap,
      evidence: buildEvidence(signals),
      risks: buildRisks(signals),
      channels: signals.channels,
      angleScores,
      mediaIntegrity: signals.mediaIntegrity,
    }),
    evidence: buildEvidence(signals),
    risks: buildRisks(signals),
    sources: buildSources(signals, sourceName, media),
    channels: signals.channels,
    review: buildReviewPlan(impact, type, signals),
    aiCommittee: AI_COMMITTEE_ENABLED ? buildLocalAiCommittee(signals, angleScores, Math.round(cappedScore), cap) : null,
    backendMode: "local_fallback",
  };
}

function enrichReportWithClientMediaIntegrity(report, media) {
  if (!Array.isArray(media) || !media.length) return report;
  const serverMedia = Array.isArray(report.media) ? report.media : [];
  const mergedMedia = media.map((item, index) => ({
    ...item,
    aiDetection: serverMedia[index]?.aiDetection || item.aiDetection,
  }));
  const mediaIntegrity = analyzeMediaIntegrity(mergedMedia);
  const next = {
    ...report,
    mediaIntegrity,
    media: mergedMedia,
    evidence: [...(report.evidence || [])],
    risks: [...(report.risks || [])],
    channels: [...(report.channels || [])],
  };

  if (next.angleScores?.integrity) {
    const mergedScore = clamp(next.angleScores.integrity.score + (mediaIntegrity.score - 62) * 0.55);
    next.angleScores = {
      ...next.angleScores,
      integrity: { score: mergedScore, signal: signalLabel(mergedScore) },
    };
    if (next.profile?.weights) {
      next.rawScore = Object.entries(next.profile.weights).reduce((sum, [key, weight]) => sum + (next.angleScores[key]?.score || 0) * weight, 0);
    }
  }

  if (mediaIntegrity.criticalForgeryRisk && (!next.cap || next.cap.value > 58)) next.cap = { value: 58, note: "上传素材存在 PS/AI 造假高风险" };
  else if (mediaIntegrity.forgeryConcern && (!next.cap || next.cap.value > 72)) next.cap = { value: 72, note: "上传素材存在媒介完整性疑点" };
  if (Number.isFinite(next.rawScore)) {
    next.finalScore = Math.round(Math.min(next.rawScore, next.cap?.value ?? 100));
    next.verdict = verdictFor(next.finalScore);
  }

  next.evidence.push(["支持", `内容与媒介完整性：${mediaIntegrity.status} · ${mediaIntegrity.score}%`, `${mediaIntegrity.score}`]);
  for (const item of mediaIntegrity.positiveSignals.slice(0, 2)) next.evidence.push(["支持", item, "+"]);
  for (const item of mediaIntegrity.suspiciousSignals.slice(0, 5)) next.risks.unshift(["媒介", item, "-"]);

  const uploadedIndex = next.channels.findIndex((channel) => channel.id === "uploadedMedia");
  const uploadedChannel = {
    id: "uploadedMedia",
    label: "图片 / 视频素材",
    status: "已命中",
    score: mediaIntegrity.score,
    role: "媒介取证",
    note: `${media.length} 个素材 · ${mediaIntegrity.status}`,
    count: media.length,
  };
  if (uploadedIndex >= 0) next.channels[uploadedIndex] = uploadedChannel;
  else next.channels.push(uploadedChannel);

  next.analysisSummary = buildClientAnalysisSummary(next);
  return next;
}

async function analyzeWithBackend(payload) {
  const endpoint = backendEndpoint();
  if (!endpoint) return null;

  try {
    updateBackendBadge("联网后端", true);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Backend ${response.status}`);
    const data = await response.json();
    if (!data.ok || !data.report) throw new Error(data.error || "Backend returned no report");
    data.report.backendMode = data.mode || "online_backend";
    data.report.diagnostics = data.diagnostics;
    updateBackendBadge(`联网后端 · ${data.diagnostics?.rawResultCount ?? 0} 条`, true);
    return data.report;
  } catch (error) {
    console.warn("Verité backend unavailable, using local fallback:", error);
    updateBackendBadge("本地回退", false);
    return null;
  }
}

function backendEndpoint() {
  if (location.protocol === "http:" || location.protocol === "https:") return `${location.origin}/api/check`;
  return "http://127.0.0.1:8787/api/check";
}

function updateBackendBadge(text, online) {
  if (!backendBadge) return;
  backendBadge.textContent = text;
  backendBadge.classList.toggle("backend-online", online);
  backendBadge.classList.toggle("backend-offline", !online);
}

function setAnalyzing(active) {
  const button = form.querySelector("button[type=submit]");
  button.disabled = active;
  button.textContent = active ? "分析中..." : "分析";
  if (active) document.getElementById("reportTime").textContent = "联网检索中...";
}

function extractSignals({ url, text, sourceName, files, media, impact }) {
  const combined = `${url} ${text} ${sourceName}`.toLowerCase();
  const domain = safeDomain(url);
  const tier = sourceTier(domain);
  const hasUrl = Boolean(domain);
  const numberMatches = text.match(/(?:\d+(?:\.\d+)?)(?:\s?%|万|亿|万人|亿美元|美元|元|mw|gw|人|票|倍|x)?/gi) || [];
  const yearMatches = text.match(/20\d{2}[-/.年]?\d{0,2}[-/.月]?\d{0,2}/g) || [];
  const hasFutureYear = yearMatches.some((raw) => {
    const year = Number(raw.slice(0, 4));
    return year > CURRENT_DATE.getFullYear();
  });
  const shortAtomicClaim = isShortAtomicClaim(text);

  const anonymous = /(网传|据传|爆料|知情人士|消息人士|内部人士|相关人士|有人称|未经证实|rumou?r|sources said|people familiar)/i.test(combined);
  const official = /(官方|公告|声明|通报|监管|法院|文件|披露|招股书|年报|财报|filing|press release|regulator|court|gazette)/i.test(combined);
  const quote = /(“|”|"|表示|称|发文|posted|tweeted|said|statement|interview)/i.test(combined);
  const emotional = /(震惊|炸裂|疯传|惊天|实锤|紧急|突发|崩了|暴雷|彻底|内幕|黑幕|shocking|bombshell|exposed|urgent)/i.test(combined);
  const screenshotLanguage = /(截图|朋友圈|聊天记录|微信群|转发|screenshot|screen grab)/i.test(combined);
  const multiSourceLanguage = /(多家|多方|多名|多个现场|multiple|several|independent)/i.test(combined);
  const marketOrOfficialTrace = /(招标|采购|招聘|航班|卫星|海关|工商|专利|许可|环评|股价|成交量|医院|警方|地震|天气|tender|permit|satellite|customs|shipment|hiring)/i.test(combined);
  const socialOnly = Boolean(domain) && tier === "T4" && !multiSourceLanguage && !official;
  const textLength = text.replace(/\s/g, "").length;
  const hasMedia = files.length > 0;
  const hasImage = media.some((item) => item.kind === "image");
  const hasVideo = media.some((item) => item.kind === "video");
  const mediaIntegrity = analyzeMediaIntegrity(media);
  const hasNumbers = numberMatches.length > 0;
  const extremePercent = numberMatches.some((raw) => {
    const n = Number(raw.replace(/[^\d.]/g, ""));
    return /%/.test(raw) && n > 300;
  });
  const hugeNumber = numberMatches.some((raw) => {
    const n = Number(raw.replace(/[^\d.]/g, ""));
    return /(亿|billion|bn)/i.test(raw) ? n > 1000 : n > 1000000000000;
  });
  const academicNeed = detectAcademicNeed({ text, url, sourceName });
  const channels = detectChannels({
    combined,
    domain,
    tier,
    sourceName,
    official,
    quote,
    marketOrOfficialTrace,
    hasMedia,
    mediaIntegrity,
    shortAtomicClaim,
    academicNeed,
  });
  const channelCount = channels.filter((channel) => channel.status === "已命中").length;
  const strongChannelCount = channels.filter((channel) => channel.score >= 75).length;
  const channelDiversityScore = clamp(22 + channelCount * 13 + strongChannelCount * 4);
  const sourceScore = hasUrl ? tierScores[tier] || 50 : shortAtomicClaim ? 52 : tierScores[tier] || 50;

  return {
    url,
    domain,
    tier,
    sourceScore,
    hasUrl,
    hasMedia,
    hasImage,
    hasVideo,
    mediaIntegrity,
    textLength,
    numberMatches,
    hasNumbers,
    yearMatches,
    hasFutureYear,
    anonymous,
    official,
    quote,
    emotional,
    screenshotLanguage,
    multiSourceLanguage,
    marketOrOfficialTrace,
    socialOnly,
    extremePercent,
    hugeNumber,
    shortAtomicClaim,
    needsAcademicEvidence: academicNeed.needed,
    academicReason: academicNeed.reason,
    academicCategory: academicNeed.category,
    channels,
    channelCount,
    strongChannelCount,
    channelDiversityScore,
    impact,
    filesCount: files.length,
  };
}

function calculateAngleScores(s) {
  const crossChannelBonus = s.channelCount >= 4 ? 16 : s.channelCount >= 3 ? 12 : s.channelCount >= 2 ? 7 : s.shortAtomicClaim ? 0 : -10;
  const web = clamp(
    s.sourceScore +
      crossChannelBonus +
      (s.hasUrl ? 6 : s.shortAtomicClaim ? 0 : -8) +
      (s.multiSourceLanguage ? 8 : 0) +
      (s.quote && s.hasUrl ? 5 : 0) +
      (s.strongChannelCount >= 2 ? 5 : 0) +
      (s.anonymous ? -12 : 0) +
      (s.socialOnly ? -14 : 0) +
      (s.emotional ? -7 : 0),
  );

  const logic = clamp(
    66 +
      (s.official ? 8 : 0) +
      (s.marketOrOfficialTrace ? 7 : 0) +
      (s.shortAtomicClaim ? 5 : 0) +
      (s.hasFutureYear ? -6 : 0) +
      (s.anonymous ? -7 : 0) +
      (s.emotional ? -9 : 0) +
      (!s.hasUrl && s.impact === "high" ? -8 : 0),
  );

  const history = clamp(
    62 +
      (["T0", "T1", "T2"].includes(s.tier) ? 8 : 0) +
      (s.official ? 6 : 0) +
      (s.shortAtomicClaim ? 4 : 0) +
      (s.anonymous ? -10 : 0) +
      (s.emotional ? -11 : 0) +
      (s.screenshotLanguage && !s.hasUrl ? -9 : 0),
  );

  const sourceChain = clamp(
    50 +
      (s.hasUrl ? 20 : -12) +
      (s.shortAtomicClaim ? 10 : 0) +
      (["T0", "T1", "T2"].includes(s.tier) ? 10 : 0) +
      (s.multiSourceLanguage ? 8 : 0) +
      (s.screenshotLanguage && !s.hasUrl ? -18 : 0) +
      (s.anonymous ? -12 : 0) +
      (s.socialOnly ? -10 : 0),
  );

  const realWorld = clamp(
    56 +
      (s.marketOrOfficialTrace ? 16 : 0) +
      (s.official ? 12 : 0) +
      (s.hasNumbers ? 4 : 0) +
      (s.hasMedia ? 5 : 0) +
      (!s.marketOrOfficialTrace && s.impact === "high" ? -12 : 0) +
      (s.socialOnly ? -8 : 0),
  );

  const stats = clamp(
    (s.hasNumbers ? 68 : 64) +
      (s.official ? 8 : 0) +
      (s.marketOrOfficialTrace ? 6 : 0) +
      (s.extremePercent ? -28 : 0) +
      (s.hugeNumber ? -24 : 0) +
      (s.anonymous && s.hasNumbers ? -10 : 0),
  );

  const integrity = clamp(
    70 +
      (s.hasMedia ? 8 : 0) +
      (s.hasImage ? 4 : 0) +
      (s.hasVideo ? 5 : 0) +
      (s.hasUrl ? 5 : 0) +
      (s.hasMedia ? (s.mediaIntegrity.score - 68) * 0.65 : 0) +
      (s.screenshotLanguage && !s.hasUrl ? -16 : 0) +
      (s.emotional ? -14 : 0) +
      (s.anonymous ? -7 : 0) +
      (s.textLength < 30 && !s.hasUrl && !s.shortAtomicClaim ? -8 : 0),
  );

  return {
    web: { score: web, signal: signalLabel(web) },
    logic: { score: logic, signal: signalLabel(logic) },
    history: { score: history, signal: signalLabel(history) },
    sourceChain: { score: sourceChain, signal: signalLabel(sourceChain) },
    realWorld: { score: realWorld, signal: signalLabel(realWorld) },
    stats: { score: stats, signal: signalLabel(stats) },
    integrity: { score: integrity, signal: signalLabel(integrity) },
  };
}

function calculateCap(s, impact) {
  const caps = [];
  if (s.socialOnly) caps.push({ value: 49, note: "单一社交平台" });
  if (!s.hasUrl && s.screenshotLanguage) caps.push({ value: 35, note: "截图不可追溯" });
  if (impact === "high" && s.channelCount < 2) caps.push({ value: 69, note: s.shortAtomicClaim ? "待联网交叉验证" : "高影响缺少跨渠道验证" });
  if (s.extremePercent || s.hugeNumber) caps.push({ value: 59, note: "统计异常需强证据" });
  if (s.mediaIntegrity?.criticalForgeryRisk && !s.official) caps.push({ value: 58, note: "上传素材存在 PS/AI 造假高风险" });
  else if (s.mediaIntegrity?.forgeryConcern && !s.official) caps.push({ value: 72, note: "上传素材存在媒介完整性疑点" });
  if (!s.hasUrl && !s.hasMedia && s.textLength < 30 && !s.shortAtomicClaim) caps.push({ value: 55, note: "信息量不足" });

  if (!caps.length) return { value: 100, note: "无" };
  return caps.sort((a, b) => a.value - b.value)[0];
}

function buildEvidence(s) {
  const rows = [];
  if (s.shortAtomicClaim) rows.push(["支持", "短句已识别为可直接核验的信息", "+"]);
  if (s.hasUrl) rows.push(["支持", `提供可回溯链接：${s.domain}`, "+"]);
  if (s.channelCount >= 2) rows.push(["支持", `已命中 ${s.channelCount} 个验证渠道`, "+"]);
  if (["T0", "T1", "T2"].includes(s.tier)) rows.push(["支持", `来源初评 ${s.tier}`, "+"]);
  if (s.official) rows.push(["支持", "文本含官方文件 / 公告 / 监管信号", "+"]);
  if (s.marketOrOfficialTrace) rows.push(["支持", "出现现实世界旁证线索", "+"]);
  if (s.needsAcademicEvidence) rows.push(["支持", `已识别需学术渠道：${s.academicReason}`, "+"]);
  if (s.hasMedia) {
    rows.push(["支持", `上传素材 ${s.filesCount} 个 · 媒介完整性 ${s.mediaIntegrity.score}%`, `${s.mediaIntegrity.score}`]);
    for (const item of s.mediaIntegrity.positiveSignals.slice(0, 2)) rows.push(["支持", item, "+"]);
  }
  if (s.hasNumbers) rows.push(["支持", `包含 ${s.numberMatches.length} 个数字，可做口径核验`, "+"]);
  if (!rows.length) rows.push(["中性", "未发现强支持信号", "0"]);
  return rows;
}

function buildRisks(s) {
  const rows = [];
  if (s.anonymous) rows.push(["信源", "出现网传 / 匿名 / 消息人士表述", "-"]);
  if (s.channelCount < 2) rows.push(["交叉", s.shortAtomicClaim ? "短信息需要自动检索新闻、官方和旁证渠道" : "缺少新闻媒体、权威发言、平台或现实旁证之间的交叉验证", "-"]);
  if (s.socialOnly) rows.push(["传播", "当前主要来自单一社交平台", "-"]);
  if (s.screenshotLanguage && !s.hasUrl) rows.push(["溯源", "截图或转发文本缺少原始链接", "-"]);
  if (s.emotional) rows.push(["叙事", "存在强情绪或标题党语言", "-"]);
  if (s.extremePercent || s.hugeNumber) rows.push(["统计", "数字显著异常，需要硬证据", "-"]);
  if (s.needsAcademicEvidence) rows.push(["学术", "本地回退模式未执行 PubMed / 期刊检索", "-"]);
  if (s.hasMedia) {
    for (const item of s.mediaIntegrity.suspiciousSignals.slice(0, 5)) rows.push(["媒介", item, "-"]);
  }
  if (!s.marketOrOfficialTrace && s.impact === "high") rows.push(["旁证", "高影响事件尚缺现实世界旁证", "-"]);
  if (!rows.length) rows.push(["低", "未触发主要风险项", "0"]);
  return rows;
}

function buildSources(s, sourceName, media) {
  const rows = [];
  if (s.hasUrl) rows.push([s.domain, s.tier, s.sourceScore, "输入链接"]);
  if (sourceName) rows.push([sourceName, s.tier || "T3", s.sourceScore || 60, "用户标注"]);
  if (media.length) rows.push(["上传素材", "T4", 42, "待取证"]);
  if (!rows.length && s.shortAtomicClaim) rows.push(["用户输入短信息", "待检索", 52, "检索对象"]);
  if (!rows.length) rows.push(["未提供", "T5", 18, "待补充"]);
  return rows;
}

function hasAcademicSourceSignal(text, domain = "") {
  const haystack = `${text || ""} ${domain || ""}`.toLowerCase();
  return academicSignalDomains.some((part) => haystack.includes(part)) || academicSourceNamePattern.test(haystack);
}

function detectAcademicNeed({ text = "", url = "", sourceName = "" }) {
  const combined = `${text} ${url} ${sourceName}`.toLowerCase();
  const domain = safeDomain(url);
  if (hasAcademicSourceSignal(combined, domain)) {
    return { needed: true, category: "academic", reason: "输入包含论文 / 期刊 / DOI / 学术平台信号" };
  }
  if (/(医疗|医学|疾病|症状|诊断|治疗|疗效|药物|药品|疫苗|临床|试验|副作用|不良反应|感染|病毒|细菌|癌症|肿瘤|糖尿病|高血压|心脏病|心血管|抑郁|阿尔茨海默|新冠|covid|vaccine|clinical trial|randomized|placebo|drug|medicine|therapy|cancer|diabetes|hypertension|virus|infection)/i.test(combined)) {
    return { needed: true, category: "medical", reason: "识别为医疗 / 药物 / 疾病类信息" };
  }
  if (/(营养|保健品|维生素|蛋白粉|咖啡|饮酒|吸烟|减肥|肥胖|饮食|膳食|nutrition|supplement|vitamin|coffee|caffeine|alcohol|smoking|weight loss|obesity|diet)/i.test(combined)) {
    return { needed: true, category: "nutrition", reason: "识别为营养 / 生活方式健康类信息" };
  }
  if (/(研究发现|论文|期刊|同行评议|实验|样本量|显著性|meta.?analysis|systematic review|peer.?review|journal|paper|study finds|researchers found|preprint|retraction)/i.test(combined)) {
    return { needed: true, category: "academic", reason: "文本声称来自研究或论文" };
  }
  if (/(气候变化|全球变暖|温室气体|碳排放|超导|量子|材料|基因编辑|crispr|climate change|global warming|greenhouse gas|superconduct|quantum|gene editing)/i.test(combined)) {
    return { needed: true, category: "science", reason: "识别为科学研究类信息" };
  }
  return { needed: false, category: "general", reason: "未识别科学 / 医疗 / 论文类信息，跳过学术渠道" };
}

function detectChannels({ combined, domain, tier, sourceName, official, quote, marketOrOfficialTrace, hasMedia, mediaIntegrity, shortAtomicClaim, academicNeed }) {
  const newsMedia = ["T1", "T2"].includes(tier) || /(路透|彭博|美联社|bbc|纽约时报|华尔街日报|金融时报|财新|媒体|新闻|报道|日报|时报|reuters|bloomberg|associated press|ap news|financial times|new york times|wall street journal|news outlet|newsroom|newspaper)/i.test(combined);
  const socialPlatform = tier === "T4" || /(\bx\b|twitter|微博|weibo|facebook|instagram|reddit|youtube|tiktok|telegram|社交平台|帖子|转发|点赞|阅读量)/i.test(combined);
  const selfMedia = /(自媒体|公众号|博主|kol|大v|播客|newsletter|substack|medium|podcast|youtuber|influencer|creator)/i.test(combined);
  const authoritativeStatement = official || /(发言人|部长|总统|白宫|国会|央行|ceo|cfo|dario|trump|musk|official statement|spokesperson|minister|president|chair|chief executive)/i.test(combined);
  const primaryRecord = /(文件|公告|通报|监管|法院|数据库|年报|财报|招股书|备案|许可|filing|database|court record|regulatory filing|annual report|prospectus|permit)/i.test(combined);
  const realWorldTrace = marketOrOfficialTrace;
  const academicEvidence = academicNeed?.needed || hasAcademicSourceSignal(combined, domain) || /(论文|期刊|临床试验|系统综述|meta.?analysis|journal|paper)/i.test(combined);

  return [
    channelRow("newsMedia", newsMedia, newsMedia ? tierScoreForChannel(tier, 74) : 0, "交叉报道", newsMedia ? channelNote(domain || sourceName, "媒体报道可交叉比对") : pendingNote(shortAtomicClaim, "新闻媒体")),
    channelRow("socialPlatform", socialPlatform, socialPlatform ? 46 : 0, "传播 / 现场信号", socialPlatform ? "弱信号，需强渠道互证" : pendingNote(shortAtomicClaim, "平台传播")),
    channelRow("selfMedia", selfMedia, selfMedia ? 54 : 0, "线索 / 观点", selfMedia ? "适合发现线索，不能单独定案" : pendingNote(shortAtomicClaim, "自媒体 / KOL")),
    channelRow("authoritativeStatement", authoritativeStatement, authoritativeStatement ? 84 : 0, quote ? "声明核验" : "权威确认", authoritativeStatement ? "区分发言存在与事实为真" : pendingNote(shortAtomicClaim, "权威发言")),
    channelRow("primaryRecord", primaryRecord, primaryRecord ? 90 : 0, "原始证据", primaryRecord ? "原始文件 / 结构化记录" : pendingNote(shortAtomicClaim, "原始文件 / 数据")),
    channelRow("realWorldTrace", realWorldTrace, realWorldTrace ? 78 : 0, "外部旁证", realWorldTrace ? "现实流程痕迹可验证事件落地" : pendingNote(shortAtomicClaim, "现实旁证")),
    channelRow("academicEvidence", academicEvidence, academicEvidence ? 68 : 0, "论文 / 指南", academicEvidence ? academicNeed?.reason || "需要学术证据辅助验证" : "跳过：未识别科学 / 医疗 / 论文类信息"),
    channelRow("uploadedMedia", hasMedia, hasMedia ? mediaIntegrity?.score || 58 : 0, "媒介取证", hasMedia ? mediaIntegrity?.status || "需反向搜索、元数据和地理定位核验" : "未上传图片或视频"),
  ];
}

function isShortAtomicClaim(text) {
  const compact = text.replace(/\s/g, "");
  if (compact.length < 4 || compact.length > 80) return false;

  const upperEntities = text.match(/\b[A-Z][A-Z0-9]{1,}\b/g) || [];
  const hasEntitySignal =
    upperEntities.length >= 2 ||
    /(阿联酋|美国|中国|俄罗斯|欧盟|沙特|以色列|伊朗|乌克兰|英国|英王|国王|查尔斯|卡米拉|白宫|华盛顿|opec|欧佩克|openai|anthropic|tesla|nvidia|apple|microsoft|google|meta|charles)/i.test(text);

  const hasAction =
    /(退出|加入|宣布|离开|撤出|访问|访美|国事访问|会见|会晤|抵达|欢迎|制裁|起诉|收购|合并|关闭|发布|辞职|死亡|爆炸|袭击|停火|增产|减产|破产|上市|下架|withdraw|leave|exit|quit|visit|arrive|meet|host|join|announce|sanction|sue|acquire|merge|resign|bankrupt|launch)/i.test(text);

  return hasEntitySignal && hasAction;
}

function channelRow(id, matched, score, role, note) {
  return {
    id,
    label: channelLabels[id],
    status: matched ? "已命中" : note.startsWith("跳过") ? "跳过" : note.startsWith("待检索") ? "待检索" : "未命中",
    score,
    role,
    note,
  };
}

function pendingNote(shortAtomicClaim, channel) {
  return shortAtomicClaim ? `待检索：${channel}` : `未识别${channel}信号`;
}

function tierScoreForChannel(tier, fallback) {
  if (tier === "T5" || !tier) return fallback;
  return tierScores[tier] || fallback;
}

function channelNote(source, fallback) {
  return source ? `${source} · ${fallback}` : fallback;
}

function buildReviewPlan(impact, type, s) {
  const rows = [];
  if (impact === "high") {
    rows.push(["1h", "官方回应 / 平台处置", "待复核"]);
    rows.push(["24h", "权威媒体 / 原始文件", "待复核"]);
    rows.push(["72h", "反证 / 更正 / 撤稿", "待复核"]);
  } else {
    rows.push(["24h", "新证据 / 更正", "待复核"]);
    rows.push(["7d", "归档或更新评分", "待复核"]);
  }
  if (s.shortAtomicClaim) rows.unshift(["即时", "生成检索式并抓取跨渠道证据", "待接入"]);
  if (type === "data" || s.hasNumbers) rows.push(["7d", "数据口径 / 结构化记录", "待复核"]);
  if (s.hasMedia) rows.push(["24h", "反向图片 / 视频搜索", "待接入"]);
  return rows.slice(0, 4);
}

function renderReport(report) {
  document.getElementById("emptyState").classList.add("is-hidden");
  document.getElementById("report").classList.remove("is-hidden");
  document.getElementById("reportTime").textContent = new Date().toLocaleString("zh-CN", { hour12: false });

  const score = report.finalScore;
  document.getElementById("scoreValue").textContent = `${score}%`;
  document.getElementById("verdictLabel").textContent = report.verdict.label;
  document.getElementById("scoreBar").style.width = `${score}%`;
  document.getElementById("scoreBar").style.background = scoreColor(score);
  document.getElementById("profileUsed").textContent = report.profile.label;
  document.getElementById("capValue").textContent = report.cap.value === 100 ? "无" : `${report.cap.value}% · ${report.cap.note}`;
  const counterQueries = report.diagnostics?.counterQueryCount || 0;
  const englishQueries = report.diagnostics?.englishNetworkQueryCount || 0;
  const savedJobs = report.retrievalPlan?.savedJobs || report.diagnostics?.retrievalSavedJobs || 0;
  document.getElementById("counterCount").textContent = savedJobs ? `省 ${savedJobs} / 证伪 ${counterQueries}` : englishQueries ? `证伪 ${counterQueries} / 英网 ${englishQueries}` : counterQueries ? `${counterQueries} 式` : `${report.media.length} 个素材`;
  const weights = report.profile.weights;
  renderAnalysisSummary(report.analysisSummary || buildClientAnalysisSummary(report), report);
  setRows("angleRows", Object.entries(report.angleScores).map(([key, item]) => {
    const contribution = item.score * weights[key];
    return [
      angleMeta[key],
      scoreCell(item.score),
      `${Math.round(weights[key] * 100)}%`,
      `${contribution.toFixed(1)}`,
      badge(item.signal, item.score),
    ];
  }));

  setRows("evidenceRows", report.evidence.map((row) => [badge(row[0], row[0] === "支持" ? 82 : 58), row[1], row[2]]));
  setRows("riskRows", report.risks.map((row) => [badge(row[0], row[2] === "-" ? 42 : 70), row[1], row[2]]));
  setRows("sourceRows", report.sources.map((row) => [row[0], badge(row[1], row[2]), scoreCell(row[2]), row[3]]));
  setRows("channelRows", report.channels.map((row) => [
    row.label,
    badge(row.status, row.status === "已命中" ? row.score || 60 : row.status === "待检索" || row.status === "跳过" ? 54 : 42),
    row.score ? scoreCell(row.score) : "--",
    row.role,
    row.note,
  ]));
  renderClaimSplit(report.claims);
  renderRetrievalPlan(report.retrievalPlan);
  renderMediaForensics(report.mediaIntegrity);
  renderMediaWorkflow(report.mediaWorkflow);
  renderAiCommittee(report.aiCommittee);
  renderReportLinks(report.links);
}

function setRows(id, rows) {
  const target = document.getElementById(id);
  target.innerHTML = rows.map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("");
}

function renderAnalysisSummary(summary = {}, report = {}) {
  const verdictTarget = document.getElementById("analysisSummaryVerdict");
  const textTarget = document.getElementById("analysisSummaryText");
  const pointsTarget = document.getElementById("analysisSummaryPoints");
  if (!textTarget || !pointsTarget) return;
  const score = Number(report.finalScore ?? summary.score ?? 0);
  const verdict = report.verdict?.label || summary.verdict || verdictFor(score).label;
  if (verdictTarget) verdictTarget.textContent = `${score}% · ${verdict}`;
  textTarget.textContent = summary.text || "暂无分析总结。";
  const points = Array.isArray(summary.points) ? summary.points : [];
  pointsTarget.innerHTML = points.map((point) => `<span class="summary-point">${escapeHtml(point)}</span>`).join("");
}

function buildClientAnalysisSummary(report = {}) {
  const finalScore = Number(report.finalScore || 0);
  const verdict = report.verdict?.label || verdictFor(finalScore).label;
  const evidenceRows = Array.isArray(report.evidence) ? report.evidence : [];
  const riskRows = Array.isArray(report.risks) ? report.risks : [];
  const channels = Array.isArray(report.channels) ? report.channels : [];
  const supports = evidenceRows.filter((row) => row?.[0] === "支持").length;
  const refutes = evidenceRows.filter((row) => row?.[0] === "反驳").length;
  const hitChannels = channels.filter((channel) => channel.status === "已命中");
  const capNote = report.cap?.value && report.cap.value < 100 ? report.cap.note : "";
  const topRisks = riskRows.filter((row) => row?.[2] === "-").slice(0, 2).map((row) => row[1]);
  const mediaStatus = report.mediaIntegrity?.hasMedia ? report.mediaIntegrity.status : "";

  let text = `本次验证给出 ${finalScore}%（${verdict}）。`;
  if (supports && !refutes) text += ` 系统找到了 ${supports} 条支持信号，暂未发现明显反证。`;
  else if (supports && refutes) text += ` 系统同时存在 ${supports} 条支持信号和 ${refutes} 条反向线索，需要重点复核来源链和时间线。`;
  else if (!supports && refutes) text += ` 系统未找到可靠支持信号，但发现 ${refutes} 条反向线索。`;
  else text += " 系统暂未找到能直接支撑原信息的独立证据。";
  if (hitChannels.length) text += ` 当前命中 ${hitChannels.length} 个验证渠道。`;
  if (capNote) text += ` 总分受到“${capNote}”封顶限制。`;
  if (mediaStatus) text += ` 上传素材的媒介完整性结论为：${mediaStatus}。`;
  if (topRisks.length) text += ` 主要可疑点是：${topRisks.join("；")}。`;
  text += finalScore >= 75
    ? " 整体可以作为较高可信线索使用，但仍建议保留关键证据链接。"
    : finalScore >= 60
      ? " 整体可作为待确认信息参考，最好继续补充官方或原始来源。"
      : finalScore >= 45
        ? " 整体证据不足或存在冲突，不建议作为确定事实传播。"
        : " 整体偏低可信，除非后续出现原始文件、官方声明或多家独立报道，否则不建议采信。";

  return {
    score: finalScore,
    verdict,
    text,
    points: [
      `支持信号 ${supports} 条`,
      `反向线索 ${refutes} 条`,
      `命中渠道 ${hitChannels.length} 个`,
      capNote ? `封顶：${capNote}` : "",
      mediaStatus ? `媒介：${mediaStatus}` : "",
    ].filter(Boolean).slice(0, 6),
  };
}

function renderClaimSplit(claimPlan = {}) {
  const section = document.getElementById("claimSplitSection");
  if (!section) return;
  const claims = Array.isArray(claimPlan.claims) ? claimPlan.claims : [];
  if (!claims.length) {
    section.classList.add("is-hidden");
    return;
  }
  section.classList.remove("is-hidden");
  setRows("claimRows", claims.map((claim) => [
    escapeHtml(claim.id || "--"),
    escapeHtml(claim.text || "--"),
    escapeHtml(claim.kind || "--"),
    scoreCell(claim.worthiness || 0),
    scoreCell(claim.priority || 0),
  ]));
}

function renderRetrievalPlan(plan = {}) {
  const section = document.getElementById("retrievalPlanSection");
  if (!section) return;
  const stages = Array.isArray(plan.stages) ? plan.stages : [];
  if (!stages.length) {
    section.classList.add("is-hidden");
    return;
  }
  section.classList.remove("is-hidden");
  setRows("retrievalRows", stages.map((stage) => [
    escapeHtml(stage.name || "--"),
    `${Math.round(Number(stage.jobs || 0))}`,
    `${Math.round(Number(stage.newResults || 0))} 条 / 错误 ${Math.round(Number(stage.errors || 0))}`,
    scoreCell(stage.confidence || 0),
    `${badge(stage.decision || "--", stage.decision === "stop" ? 80 : stage.decision === "continue" ? 58 : 66)}<div class="agent-action">${escapeHtml(stage.reason || "")}</div>`,
  ]));
}

function renderMediaForensics(mediaIntegrity = {}) {
  const section = document.getElementById("mediaForensicsSection");
  const rows = Array.isArray(mediaIntegrity.details) ? mediaIntegrity.details : [];
  if (!section) return;
  if (!mediaIntegrity.hasMedia) {
    section.classList.add("is-hidden");
    return;
  }
  section.classList.remove("is-hidden");
  const tableRows = rows.length ? rows.map((row) => [
    escapeHtml(row.file || "--"),
    escapeHtml(row.check || "--"),
    escapeHtml(row.result || "--"),
    scoreCell(row.score || 0),
    escapeHtml(row.note || "--"),
  ]) : [["--", "媒介取证", "暂无明细", "--", "未收到结构化取证结果"]];
  setRows("mediaForensicRows", tableRows);
}

function renderMediaWorkflow(workflow = {}) {
  const section = document.getElementById("mediaWorkflowSection");
  if (!section) return;
  const rows = Array.isArray(workflow.rows) ? workflow.rows : [];
  if (!workflow.enabled || !rows.length) {
    section.classList.add("is-hidden");
    return;
  }
  section.classList.remove("is-hidden");
  setRows("mediaWorkflowRows", rows.map((row) => [
    escapeHtml(row[0] || "--"),
    escapeHtml(row[1] || "--"),
    badge(row[2] || "--", row[3] || 50),
    scoreCell(row[3] || 0),
    escapeHtml(row[4] || "--"),
  ]));
}

function renderAiCommittee(committee = {}) {
  const section = document.getElementById("aiCommitteeSection");
  if (!section) return;
  if (!committee || committee.enabled === false) {
    section.classList.add("is-hidden");
    return;
  }
  section.classList.remove("is-hidden");
  document.getElementById("aiConsensus").textContent = committee.consensusScore ? `${committee.consensusScore}% · ${committee.consensusVerdict || "--"}` : "--";
  document.getElementById("aiMode").textContent = committee.mode || "--";
  const adjustment = Number(committee.suggestedAdjustment || 0);
  document.getElementById("aiAdjustment").textContent = adjustment ? `${adjustment > 0 ? "+" : ""}${adjustment}` : "0";
  document.getElementById("aiDisagreement").textContent = Number.isFinite(Number(committee.disagreement)) ? `${Math.round(Number(committee.disagreement))}` : "--";
  document.getElementById("aiCommitteeNote").textContent = committee.note || "";

  const agents = Array.isArray(committee.agents) ? committee.agents : [];
  if (!agents.length) {
    setRows("aiCommitteeRows", [["--", badge("待复核", 54), "--", "暂无 AI 复核结果", "--"]]);
    return;
  }

  setRows("aiCommitteeRows", agents.map((agent) => [
    `<strong>${escapeHtml(agent.name || "--")}</strong><div class="agent-role">${escapeHtml(agent.role || "")}</div>`,
    badge(agent.stance || "--", agent.score || 50),
    scoreCell(agent.confidence || agent.score || 0),
    escapeHtml(agent.basis || "--"),
    `${escapeHtml(agent.concern || "--")}<div class="agent-action">${escapeHtml(agent.action || "")}</div>`,
  ]));
}

function buildLocalAiCommittee(signals, angleScores, finalScore, cap) {
  const agents = [
    localCommitteeAgent("支持证据 Agent", "验证正向证据", clamp(44 + signals.channelCount * 8 + signals.strongChannelCount * 5), signals.channelCount ? `本地识别 ${signals.channelCount} 个渠道信号` : "尚未完成联网证据抓取", signals.channelCount >= 2 ? "需要确认是否为独立来源" : "支持证据不足", "优先启动联网后端"),
    localCommitteeAgent("反证 Agent", "主动寻找否认 / 辟谣 / 更正", signals.anonymous ? 48 : 62, signals.anonymous ? "文本存在匿名或网传表述" : "本地未识别强反证语言", "本地模式无法主动检索反证", "启用联网后端执行证伪检索式"),
    localCommitteeAgent("来源评级 Agent", "审查来源链和引用身份", signals.hasUrl ? signals.sourceScore : 46, signals.hasUrl ? `输入来源 ${signals.domain || "unknown"} · ${signals.tier}` : "未提供可回溯链接", signals.hasUrl ? "仍需确认原始上下文" : "缺少来源链", "补充原始链接或官方来源"),
    localCommitteeAgent("逻辑 / 反事实 Agent", "检查时间线和反事实冲突", angleScores.logic.score, `逻辑角度 ${angleScores.logic.score} 分，封顶：${cap.note}`, signals.hasFutureYear ? "存在未来时间，需要复核" : "未发现主要逻辑冲突", "对照关键日期和制度流程"),
    localCommitteeAgent("历史 / 基准率 Agent", "比较历史模式和统计异常", clamp((angleScores.history.score + angleScores.stats.score) / 2), `历史 ${angleScores.history.score} 分，基准率 ${angleScores.stats.score} 分`, signals.extremePercent || signals.hugeNumber ? "数字异常明显" : "未触发明显统计异常", "寻找相似事件和数据口径"),
    localCommitteeAgent("媒介取证 Agent", "图片 / 视频 / 截图完整性", signals.hasMedia ? signals.mediaIntegrity.score : 50, signals.hasMedia ? `${signals.filesCount} 个上传素材 · ${signals.mediaIntegrity.status}` : "未上传图片或视频", signals.hasMedia ? signals.mediaIntegrity.suspiciousSignals[0] || "仍需反搜和元数据检查" : "无法进行媒介取证", signals.hasMedia ? "补充 EXIF/C2PA、ELA、AI 检测、多引擎反搜和地理定位" : "补充原始素材"),
  ];
  const consensusScore = clamp(agents.reduce((sum, agent) => sum + agent.score, 0) / agents.length);
  const adjustment = Math.max(-12, Math.min(12, Math.round((consensusScore - finalScore) * 0.35)));
  const disagreement = Math.max(...agents.map((agent) => agent.score)) - Math.min(...agents.map((agent) => agent.score));
  agents.push(localCommitteeAgent("裁判 Agent", "汇总多 Agent 结论", clamp(consensusScore * 0.7 + finalScore * 0.3), `${agents.length} 个复核 Agent 均值为 ${consensusScore}%`, disagreement >= 28 ? "Agent 分歧较大" : "Agent 分歧可控", adjustment ? `仅作解释层参考，偏差 ${adjustment > 0 ? "+" : ""}${adjustment}` : "与主评分一致"));

  return {
    mode: "本地回退多 Agent",
    note: "本地回退模式不调用外部 LLM，只基于用户输入和本地规则复核；联网后端可给出更完整结论。",
    consensusScore,
    consensusVerdict: verdictFor(consensusScore).label,
    suggestedAdjustment: adjustment,
    disagreement,
    agents,
  };
}

function localCommitteeAgent(name, role, score, basis, concern, action) {
  const normalizedScore = clamp(score);
  return {
    name,
    role,
    stance: committeeStance(normalizedScore),
    score: normalizedScore,
    confidence: normalizedScore,
    basis,
    concern,
    action,
  };
}

function committeeStance(score) {
  if (score >= 82) return "强支持";
  if (score >= 70) return "偏支持";
  if (score >= 55) return "待确认";
  if (score >= 40) return "偏怀疑";
  return "强怀疑";
}

function renderReportLinks(links = {}) {
  renderLinkGroup("evidenceLinks", links.evidence || []);
  renderLinkGroup("suspiciousLinks", links.suspicious || []);
  renderLinkGroup("crossReportLinks", links.crossReports || []);
  renderLinkGroup("academicLinks", links.academic || []);
}

function renderLinkGroup(id, links) {
  const target = document.getElementById(id);
  if (!target) return;

  const safeLinks = links
    .map((item) => ({ ...item, href: safeHref(item.url) }))
    .filter((item) => item.href)
    .slice(0, 12);

  if (!safeLinks.length) {
    target.innerHTML = `<div class="link-empty">暂无可用链接</div>`;
    return;
  }

  target.innerHTML = safeLinks.map((item) => {
    const title = escapeHtml(item.title || item.href);
    const source = escapeHtml(item.source || safeDomain(item.href) || "unknown");
    const tier = escapeHtml(item.tier || "--");
    const score = Number.isFinite(Number(item.score)) ? Math.round(Number(item.score)) : "--";
    const stance = escapeHtml(item.stance || "背景");
    const channel = escapeHtml(item.channel || "");
    const match = item.match ? ` · ${escapeHtml(item.match)}${item.contextScore ? ` ${Math.round(Number(item.contextScore))}%` : ""}` : "";
    const duplicates = Number(item.duplicateCount) > 1 ? ` · 同源转载 ${Math.round(Number(item.duplicateCount))} 条按 1 条计` : "";
    return `
      <a class="link-item" href="${escapeHtml(item.href)}" target="_blank" rel="noopener noreferrer">
        <span class="link-title">${title}</span>
        <span class="link-meta">${source} · ${tier} · ${score} · ${stance}${channel ? ` · ${channel}` : ""}${match}${duplicates}</span>
      </a>
    `;
  }).join("");
}

function setupCollapsibleSections() {
  document.querySelectorAll("#report .table-section").forEach((section) => {
    if (section.dataset.collapsible === "ready") return;

    const title = section.querySelector(":scope > .section-title");
    if (!title) return;

    const label = title.textContent.trim();
    const body = document.createElement("div");
    body.className = "section-body";
    while (title.nextSibling) body.appendChild(title.nextSibling);
    section.appendChild(body);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "section-toggle";
    button.setAttribute("aria-expanded", "true");
    button.innerHTML = `<span>${escapeHtml(label)}</span><span class="toggle-indicator" aria-hidden="true">▾</span>`;

    title.textContent = "";
    title.appendChild(button);
    section.dataset.collapsible = "ready";

    button.addEventListener("click", () => {
      const collapsed = section.classList.toggle("is-collapsed");
      button.setAttribute("aria-expanded", String(!collapsed));
    });
  });
}

function safeHref(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function scoreCell(score) {
  const cls = score >= 75 ? "score-high" : score >= 55 ? "score-mid" : "score-low";
  return `<span class="num ${cls}">${Math.round(score)}</span>`;
}

function badge(text, score) {
  const cls = score >= 75 ? "good" : score >= 50 ? "warn" : "bad";
  return `<span class="badge ${cls}">${escapeHtml(String(text))}</span>`;
}

function verdictFor(score) {
  if (score >= 90) return { label: "已确认" };
  if (score >= 75) return { label: "高可信" };
  if (score >= 60) return { label: "中等可信" };
  if (score >= 45) return { label: "证据不足 / 冲突" };
  if (score >= 25) return { label: "低可信" };
  return { label: "基本不实 / 已反证" };
}

function signalLabel(score) {
  if (score >= 80) return "强";
  if (score >= 60) return "中";
  if (score >= 45) return "弱";
  return "风险";
}

function analyzeMediaIntegrity(media = []) {
  const items = Array.isArray(media) ? media : [];
  if (!items.length) {
    return {
      hasMedia: false,
      score: 62,
      riskScore: 0,
      status: "未上传图片 / 视频",
      suspiciousSignals: [],
      positiveSignals: [],
      detectedTools: [],
      detectedAiTools: [],
      c2paPresent: false,
      forgeryConcern: false,
      criticalForgeryRisk: false,
      details: [],
    };
  }

  const suspicious = [];
  const positives = [];
  const details = [];
  const detectedTools = new Set();
  const detectedAiTools = new Set();
  let risk = 0;
  let positive = 0;
  let inspected = 0;
  let c2paPresent = false;

  for (const item of items) {
    const forensic = item?.forensic || {};
    const label = item?.name || item?.type || "上传素材";
    const editTools = normalizeList(forensic.editingSoftware);
    const aiTools = normalizeList(forensic.aiGeneratorMarkers);
    const markers = normalizeList(forensic.metadataMarkers);
    const riskSignals = normalizeList(forensic.riskSignals);
    const positiveSignals = normalizeList(forensic.positiveSignals);
    const aiDetection = item?.aiDetection || null;
    const keyframes = Array.isArray(item?.videoKeyframes) ? item.videoKeyframes : [];
    const hasForensic = Object.keys(forensic).length > 0;
    if (hasForensic) inspected += 1;

    editTools.forEach((tool) => detectedTools.add(tool));
    aiTools.forEach((tool) => detectedAiTools.add(tool));

    if (aiTools.length) {
      risk += 45;
      suspicious.push(`${label} 检测到 AI 生成工具痕迹：${aiTools.join("、")}`);
    }
    if (editTools.length) {
      risk += aiTools.length ? 14 : 24;
      suspicious.push(`${label} 检测到图像编辑软件痕迹：${editTools.join("、")}`);
    }
    if (forensic.extensionMimeMismatch) {
      risk += 20;
      suspicious.push(`${label} 文件扩展名与 MIME 类型不一致`);
    }
    if (forensic.compressionAnomaly) {
      risk += 12;
      suspicious.push(`${label} 压缩率 / 尺寸异常，需做 JPEG 结构或 ELA 复核`);
    }
    if (forensic.elaSuspicion) {
      risk += 18;
      suspicious.push(`${label} ELA / 重压缩残差异常，疑似局部编辑或多次压缩`);
    }
    if (forensic.jpegGhostSuspicion) {
      risk += 14;
      suspicious.push(`${label} JPEG Ghost / 压缩层不一致，需复核是否拼接`);
    }
    if (forensic.resamplingSuspicion) {
      risk += 10;
      suspicious.push(`${label} 像素重采样痕迹偏高，需复核裁切、缩放或拼接`);
    }
    if (forensic.videoTimelineIssue) {
      risk += 16;
      suspicious.push(`${label} 视频关键帧尺寸或时间线不一致，需复核剪辑链`);
    }
    if (riskSignals.length) {
      risk += Math.min(28, riskSignals.length * 8);
      suspicious.push(...riskSignals.map((signal) => `${label} ${signal}`));
    }
    if (forensic.c2paPresent || markers.includes("C2PA")) {
      c2paPresent = true;
      positive += 14;
      positives.push(`${label} 包含 C2PA / Content Credentials 来源凭证信号`);
    }
    if (forensic.hasExif) {
      positive += 5;
      positives.push(`${label} 保留 EXIF 元数据，可继续核验设备 / 时间 / GPS`);
    }
    if (forensic.hasXmp || markers.includes("XMP")) {
      positive += 3;
      positives.push(`${label} 包含 XMP 元数据，可核验编辑历史`);
    }
    if (forensic.exifrStatus === "parsed") {
      positive += 3;
      positives.push(`${label} 已通过 EXIF/XMP 解析库读取结构化元数据`);
    }
    if (forensic.c2paStatus === "verified") {
      positive += 18;
      positives.push(`${label} C2PA 内容凭证已完成验证`);
    } else if (forensic.c2paStatus === "quick_scan") {
      positives.push(`${label} 已执行 C2PA / JUMBF 快速扫描`);
    }
    if (aiDetection?.enabled && !aiDetection.unavailable) {
      const synthetic = Number(aiDetection.syntheticScore || 0);
      const aiRisk = Number(aiDetection.riskScore || synthetic || 0);
      risk += Math.min(38, aiRisk * 0.42);
      if (synthetic >= 72) suspicious.push(`${label} AI 图像检测模型提示高风险：${synthetic}%`);
      else if (synthetic >= 55) suspicious.push(`${label} AI 图像检测模型提示中等风险：${synthetic}%`);
      else positives.push(`${label} AI 图像检测未见强生成痕迹：${synthetic}%`);
    } else if (item?.kind === "image" || keyframes.length) {
      suspicious.push(`${label} AI 图像检测服务未启用或未响应，当前仅使用轻量取证规则`);
    }
    if (positiveSignals.length) positives.push(...positiveSignals.map((signal) => `${label} ${signal}`));
    if (!hasForensic) {
      risk += 12;
      suspicious.push(`${label} 缺少可用元数据 / 压缩结构摘要，仍需 EXIF、C2PA、ELA 和反向图搜`);
    }
    details.push(...mediaDetailRows(item, forensic, aiDetection));
  }

  if (inspected === 0) suspicious.push("上传素材尚未完成本地取证摘要，无法判断是否 PS 或 AI 生成");
  const normalizedRisk = clamp(Math.min(85, risk / Math.max(1, items.length)));
  const normalizedPositive = Math.min(24, positive / Math.max(1, items.length));
  const score = clamp(78 + normalizedPositive - normalizedRisk);
  const criticalForgeryRisk = detectedAiTools.size > 0 || normalizedRisk >= 60;
  const forgeryConcern = criticalForgeryRisk || detectedTools.size > 0 || normalizedRisk >= 35;
  const status = criticalForgeryRisk ? "高风险：疑似 PS / AI 造假" : forgeryConcern ? "中风险：存在编辑或取证疑点" : c2paPresent || normalizedPositive ? "低风险：有来源 / 元数据线索" : "待取证：未发现强造假信号";

  return {
    hasMedia: true,
    score,
    riskScore: normalizedRisk,
    status,
    suspiciousSignals: uniqueValues(suspicious).slice(0, 8),
    positiveSignals: uniqueValues(positives).slice(0, 6),
    detectedTools: [...detectedTools],
    detectedAiTools: [...detectedAiTools],
    c2paPresent,
    forgeryConcern,
    criticalForgeryRisk,
    details: details.slice(0, 28),
  };
}

function mediaDetailRows(item = {}, forensic = {}, aiDetection = null) {
  const label = item.name || item.type || "上传素材";
  const rows = [];
  const metadataScore = clamp(46 + (forensic.hasExif ? 16 : 0) + (forensic.hasXmp ? 8 : 0) + (forensic.hasIcc ? 5 : 0) + (forensic.exifrStatus === "parsed" ? 8 : 0));
  rows.push({ file: label, check: "EXIF / XMP 元数据", result: forensic.hasExif || forensic.hasXmp ? "已读取" : "缺失或被清除", score: metadataScore, note: forensic.exifrStatus === "parsed" ? "结构化解析已启用" : "使用文件头快速扫描" });
  const c2paScore = forensic.c2paStatus === "verified" ? 92 : forensic.c2paPresent ? 76 : 48;
  rows.push({ file: label, check: "C2PA / Content Credentials", result: forensic.c2paPresent ? "发现凭证信号" : "未发现", score: c2paScore, note: forensic.c2paStatus || "quick_scan" });
  rows.push({ file: label, check: "编辑软件痕迹", result: normalizeList(forensic.editingSoftware).join("、") || "未发现", score: normalizeList(forensic.editingSoftware).length ? 46 : 76, note: "编辑痕迹不等于造假，需结合上下文" });
  rows.push({ file: label, check: "AI 生成元数据痕迹", result: normalizeList(forensic.aiGeneratorMarkers).join("、") || "未发现", score: normalizeList(forensic.aiGeneratorMarkers).length ? 28 : 74, note: "来自 XMP / prompt / 软件标记扫描" });
  rows.push({ file: label, check: "压缩 / ELA / JPEG Ghost", result: forensic.elaSuspicion || forensic.jpegGhostSuspicion || forensic.compressionAnomaly ? "异常" : "未见强异常", score: forensic.elaSuspicion || forensic.jpegGhostSuspicion ? 42 : 70, note: forensic.elaSummary || "轻量残差与压缩结构检查" });
  if (item.kind === "video") {
    rows.push({ file: label, check: "视频关键帧 / 时间线", result: `${Array.isArray(item.videoKeyframes) ? item.videoKeyframes.length : 0} 帧`, score: forensic.videoTimelineIssue ? 44 : 68, note: forensic.videoTimelineSummary || "抽帧后按图片路径复核" });
  }
  if (aiDetection?.enabled) {
    rows.push({ file: label, check: "可选 AI 检测服务", result: aiDetection.unavailable ? "未响应" : aiDetection.verdict || "已分析", score: aiDetection.unavailable ? 50 : clamp(100 - Number(aiDetection.syntheticScore || 0)), note: aiDetection.unavailable ? aiDetection.error || "服务未启用" : `${aiDetection.engine || "service"} ${aiDetection.model || ""}`.trim() });
  } else if (item.kind === "image" || item.kind === "video") {
    rows.push({ file: label, check: "可选 AI 检测服务", result: "未启用", score: 50, note: "设置 VERITE_MEDIA_AI=1 后调用本地服务" });
  }
  return rows;
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function uniqueValues(items) {
  return [...new Set(items.filter(Boolean))];
}

function scoreColor(score) {
  if (score >= 75) return "var(--green)";
  if (score >= 55) return "var(--amber)";
  return "var(--red)";
}

function sourceTier(domain) {
  if (!domain) return "T5";
  const hit = sourceTierDomains.find((item) => item.match.some((part) => domain.includes(part)));
  if (hit) return hit.tier;
  if (domain.endsWith(".edu") || domain.includes("official")) return "T1";
  if (domain.includes("news") || domain.includes("media")) return "T3";
  return "T3";
}

function safeDomain(url) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const order = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** order).toFixed(order ? 1 : 0)} ${units[order]}`;
}

async function readMediaMeta(file) {
  const base = {
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
    kind: file.type.startsWith("video/") ? "video" : "image",
  };
  let details = {};
  let aiSamples = [];
  let videoKeyframes = [];

  if (file.type.startsWith("image/")) {
    const url = URL.createObjectURL(file);
    try {
      details = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({});
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
    aiSamples = await createImageSamples(file);
  } else if (file.type.startsWith("video/")) {
    const url = URL.createObjectURL(file);
    try {
      details = await new Promise((resolve) => {
        const video = document.createElement("video");
        video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
        video.onerror = () => resolve({});
        video.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
    videoKeyframes = await extractVideoKeyframes(file, details);
  }

  const forensic = await readForensicHints(file, { ...base, ...details, aiSamples, videoKeyframes });
  return { ...base, ...details, aiSamples, videoKeyframes, forensic };
}

async function readForensicHints(file, meta) {
  const text = await readFileTextSample(file);
  const compact = text.replace(/\u0000/g, "");
  const haystack = `${text}\n${compact}\n${file.name}\n${file.type}`.toLowerCase();
  const structured = await readStructuredMetadata(file);
  const fileExtension = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
  const expectedMime = expectedMimeForExtension(fileExtension);
  const extensionMimeMismatch = Boolean(expectedMime && file.type && !file.type.toLowerCase().startsWith(expectedMime));
  const editingSoftware = collectPatternLabels(haystack, [
    ["Adobe Photoshop", /photoshop/],
    ["Adobe Lightroom", /lightroom|camera raw/],
    ["Canva", /canva/],
    ["GIMP", /gimp/],
    ["Snapseed", /snapseed/],
    ["PicsArt", /picsart/],
    ["Meitu", /meitu|美图/],
    ["CapCut", /capcut|jianying|剪映/],
  ]);
  const aiGeneratorMarkers = collectPatternLabels(haystack, [
    ["Stable Diffusion", /stable diffusion|\bsdxl\b|\bsd1\.5\b|\bsd3\b/],
    ["ComfyUI", /comfyui/],
    ["AUTOMATIC1111", /automatic1111|a1111/],
    ["Midjourney", /midjourney/],
    ["DALL-E", /dall[- ]?e|openai image|gpt-image/],
    ["Firefly", /firefly/],
    ["NovelAI", /novelai/],
    ["Leonardo", /leonardo\.ai|leonardo ai/],
    ["Ideogram", /ideogram/],
  ]);
  const hasExif = structured.hasExif || /exif/.test(haystack);
  const hasXmp = structured.hasXmp || /xmpmeta|xmp/.test(haystack);
  const hasIcc = structured.hasIcc || /icc_profile|icc profile/.test(haystack);
  const c2paPresent = structured.c2paPresent || /c2pa|jumbf|content credentials|contentauth/.test(haystack);
  const c2paStatus = c2paPresent ? structured.c2paStatus || "quick_scan" : structured.c2paStatus || "absent";
  const metadataMarkers = [
    hasExif ? "EXIF" : "",
    hasXmp ? "XMP" : "",
    hasIcc ? "ICC" : "",
    c2paPresent ? "C2PA" : "",
  ].filter(Boolean);
  const pixelCount = meta.width && meta.height ? meta.width * meta.height : 0;
  const bytesPerPixel = pixelCount ? file.size / pixelCount : null;
  const compressionAnomaly = Boolean(file.type === "image/jpeg" && bytesPerPixel && (bytesPerPixel < 0.035 || bytesPerPixel > 12));
  const sampleMetrics = [...(meta.aiSamples || []), ...(meta.videoKeyframes || [])].map((sample) => sample.metrics).filter(Boolean);
  const avgEdgeDensity = sampleMetrics.reduce((sum, item) => sum + Number(item.edgeDensity || 0), 0) / Math.max(1, sampleMetrics.length);
  const elaSuspicion = Boolean(file.type === "image/jpeg" && bytesPerPixel && bytesPerPixel < 0.055 && avgEdgeDensity > 0.18);
  const jpegGhostSuspicion = Boolean(file.type === "image/jpeg" && compressionAnomaly && (editingSoftware.length || !hasExif));
  const resamplingSuspicion = Boolean(pixelCount && meta.width && meta.height && (meta.width % 16 !== 0 || meta.height % 16 !== 0) && avgEdgeDensity > 0.24);
  const frameShapes = new Set((meta.videoKeyframes || []).map((frame) => `${frame.width}x${frame.height}`));
  const videoTimelineIssue = Boolean(meta.kind === "video" && ((meta.duration > 8 && (meta.videoKeyframes || []).length < 3) || frameShapes.size > 1));
  const riskSignals = [];
  const positiveSignals = [];

  if (/screenshot|screen shot|截屏|截图|wechat|微信|whatsapp|telegram/i.test(file.name)) riskSignals.push("文件名显示可能是截图或二次转发素材");
  if (!hasExif && file.type === "image/jpeg") riskSignals.push("JPEG 未检测到 EXIF，不能单独证明原始拍摄时间");
  if (compressionAnomaly) riskSignals.push(`压缩率异常：约 ${bytesPerPixel.toFixed(3)} B/px`);
  if (elaSuspicion) riskSignals.push("轻量 ELA 代理指标异常：高边缘残差叠加低字节密度");
  if (jpegGhostSuspicion) riskSignals.push("JPEG Ghost 代理指标异常：压缩层与元数据链不一致");
  if (resamplingSuspicion) riskSignals.push("重采样代理指标偏高：尺寸和边缘分布需人工复核");
  if (videoTimelineIssue) riskSignals.push("视频关键帧数量或尺寸一致性异常");
  if (pixelCount && pixelCount < 200000) riskSignals.push("图片分辨率较低，细节不足以支撑强媒介取证");
  if (hasExif) positiveSignals.push("检测到 EXIF 元数据");
  if (c2paPresent) positiveSignals.push("检测到 C2PA / Content Credentials 标记");
  if (structured.exifrStatus === "parsed") positiveSignals.push("EXIF/XMP 结构化解析成功");
  if ((meta.videoKeyframes || []).length) positiveSignals.push(`已抽取 ${meta.videoKeyframes.length} 个视频关键帧`);

  return {
    fileExtension,
    expectedMime,
    extensionMimeMismatch,
    metadataMarkers,
    exifrStatus: structured.exifrStatus,
    c2paStatus,
    editingSoftware,
    aiGeneratorMarkers,
    hasExif,
    hasXmp,
    hasIcc,
    c2paPresent,
    bytesPerPixel,
    compressionAnomaly,
    elaSuspicion,
    jpegGhostSuspicion,
    resamplingSuspicion,
    videoTimelineIssue,
    elaSummary: sampleMetrics.length ? `边缘残差 ${avgEdgeDensity.toFixed(3)} · B/px ${bytesPerPixel ? bytesPerPixel.toFixed(3) : "--"}` : "未生成像素样本",
    videoTimelineSummary: (meta.videoKeyframes || []).length ? `duration ${Math.round(meta.duration || 0)}s · keyframes ${(meta.videoKeyframes || []).length}` : "",
    riskSignals,
    positiveSignals,
  };
}

async function loadOptionalForensicLibraries() {
  if (forensicLibraryState.attempted) return forensicLibraryState;
  forensicLibraryState.attempted = true;
  try {
    forensicLibraryState.exifr = await promiseWithTimeout(import(OPTIONAL_FORENSIC_IMPORTS.exifr), 2200);
  } catch {
    forensicLibraryState.exifr = null;
  }
  try {
    forensicLibraryState.c2pa = await promiseWithTimeout(import(OPTIONAL_FORENSIC_IMPORTS.c2pa), 2200);
  } catch {
    forensicLibraryState.c2pa = null;
  }
  return forensicLibraryState;
}

function promiseWithTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
  ]);
}

async function readStructuredMetadata(file) {
  const libs = await loadOptionalForensicLibraries();
  const output = {
    exifrStatus: libs.exifr ? "available" : "fallback",
    c2paStatus: "quick_scan",
    hasExif: false,
    hasXmp: false,
    hasIcc: false,
    c2paPresent: false,
  };
  if (libs.exifr?.parse) {
    try {
      const parsed = await libs.exifr.parse(file, {
        tiff: true,
        exif: true,
        gps: true,
        xmp: true,
        iptc: true,
        icc: true,
        jfif: true,
        ihdr: true,
        mergeOutput: false,
      });
      const text = JSON.stringify(parsed || {}).toLowerCase();
      output.exifrStatus = "parsed";
      output.hasExif = Boolean(parsed?.exif || parsed?.tiff || /exif/.test(text));
      output.hasXmp = Boolean(parsed?.xmp || /xmp/.test(text));
      output.hasIcc = Boolean(parsed?.icc || /icc/.test(text));
      output.c2paPresent = /c2pa|jumbf|content credentials|contentauth/.test(text);
    } catch {
      output.exifrStatus = "failed";
    }
  }
  if (libs.c2pa && output.c2paPresent) {
    output.c2paStatus = "quick_scan";
  }
  return output;
}

async function createImageSamples(file) {
  if (!file.type.startsWith("image/")) return [];
  try {
    const url = URL.createObjectURL(file);
    try {
      const image = await loadImage(url);
      return [drawMediaSample(image, { sampleType: "image_preview", time: 0, maxSize: 512 })];
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return [];
  }
}

async function extractVideoKeyframes(file, details = {}) {
  if (!file.type.startsWith("video/")) return [];
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";
    video.crossOrigin = "anonymous";
    video.src = url;
    await waitForEvent(video, "loadedmetadata", 3500);
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : details.duration || 0;
    const times = duration > 0 ? [0.08, 0.33, 0.66, 0.92].map((ratio) => Math.max(0, Math.min(duration - 0.05, duration * ratio))) : [0];
    const frames = [];
    for (const time of times) {
      try {
        if (duration > 0) {
          video.currentTime = time;
          await waitForEvent(video, "seeked", 2500);
        }
        frames.push(drawMediaSample(video, { sampleType: "video_keyframe", time, maxSize: 480 }));
      } catch {
        // Skip individual frames that the browser cannot seek to.
      }
    }
    return frames.slice(0, 4);
  } catch {
    return [];
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function waitForEvent(target, eventName, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`${eventName} timeout`));
    }, timeoutMs);
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`${eventName} error`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener(eventName, onEvent);
      target.removeEventListener("error", onError);
    };
    target.addEventListener(eventName, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

function drawMediaSample(source, { sampleType, time = 0, maxSize = 512 }) {
  const sourceWidth = source.videoWidth || source.naturalWidth || source.width || 1;
  const sourceHeight = source.videoHeight || source.naturalHeight || source.height || 1;
  const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  return {
    sampleType,
    time,
    width,
    height,
    dataUrl: canvas.toDataURL("image/jpeg", 0.82),
    metrics: imageMetrics(imageData.data, width, height),
  };
}

function imageMetrics(data, width, height) {
  let luminanceSum = 0;
  let edgeSum = 0;
  let saturated = 0;
  let compared = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const idx = (y * width + x) * 4;
      const lum = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
      luminanceSum += lum;
      if (data[idx] <= 2 || data[idx + 1] <= 2 || data[idx + 2] <= 2 || data[idx] >= 253 || data[idx + 1] >= 253 || data[idx + 2] >= 253) saturated += 1;
      if (x + 2 < width) {
        const right = (y * width + x + 2) * 4;
        const rightLum = 0.2126 * data[right] + 0.7152 * data[right + 1] + 0.0722 * data[right + 2];
        edgeSum += Math.abs(lum - rightLum) / 255;
        compared += 1;
      }
    }
  }
  const samples = Math.max(1, Math.ceil(width / 2) * Math.ceil(height / 2));
  return {
    luminance: Number((luminanceSum / samples / 255).toFixed(3)),
    edgeDensity: Number((edgeSum / Math.max(1, compared)).toFixed(3)),
    saturationRatio: Number((saturated / samples).toFixed(3)),
  };
}

async function readFileTextSample(file) {
  const headSize = Math.min(file.size, 2 * 1024 * 1024);
  const tailSize = Math.min(Math.max(0, file.size - headSize), 256 * 1024);
  const buffers = [];
  if (headSize) buffers.push(await file.slice(0, headSize).arrayBuffer());
  if (tailSize) buffers.push(await file.slice(file.size - tailSize).arrayBuffer());
  return buffers.map(arrayBufferToLatin1).join("\n");
}

function arrayBufferToLatin1(buffer) {
  const bytes = new Uint8Array(buffer);
  let output = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    output += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return output;
}

function expectedMimeForExtension(extension) {
  return {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
  }[extension] || "";
}

function collectPatternLabels(text, patterns) {
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

setupCollapsibleSections();
resetApp();
