import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

await loadEnvFile(".env");
await loadEnvFile(".env.local");

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const AI_COMMITTEE_ENABLED = process.env.VERITE_AI_COMMITTEE === "1" || process.env.CHEK_AI_COMMITTEE === "1";
const AI_API_KEY = process.env.VERITE_AI_API_KEY || process.env.OPENAI_API_KEY || "";
const AI_API_KEY_CONFIGURED = Boolean(AI_API_KEY);
const AI_BASE_URL = (process.env.VERITE_AI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const AI_MODEL = process.env.VERITE_AI_MODEL || process.env.OPENAI_MODEL || "qwen-plus";
const MEDIA_AI_ENABLED = process.env.VERITE_MEDIA_AI === "1";
const MEDIA_AI_URL = process.env.VERITE_MEDIA_AI_URL || "http://127.0.0.1:8790/analyze";
const BING_SEARCH_API_KEY = process.env.BING_SEARCH_API_KEY || "";
const GOOGLE_CSE_API_KEY = process.env.GOOGLE_CSE_API_KEY || "";
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID || "";
const SERPAPI_KEY = process.env.SERPAPI_KEY || "";
const NEWSAPI_KEY = process.env.NEWSAPI_KEY || "";
const GOOGLE_NEWS_RSS_ENABLED = process.env.VERITE_GOOGLE_NEWS_RSS === "1";
const CURRENT_DATE = new Date();
const USER_AGENT = "La-verite/0.2 (+local fact-check research tool)";

async function loadEnvFile(fileName) {
  let text = "";
  try {
    text = await readFile(join(__dirname, fileName), "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") console.warn(`Failed to load ${fileName}: ${error.message || error}`);
    return;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const profiles = {
  event: {
    label: "默认事件类",
    weights: { web: 0.22, logic: 0.15, history: 0.1, sourceChain: 0.15, realWorld: 0.15, stats: 0.08, integrity: 0.15 },
  },
  data: {
    label: "数据类",
    weights: { web: 0.18, logic: 0.14, history: 0.1, sourceChain: 0.14, realWorld: 0.18, stats: 0.2, integrity: 0.06 },
  },
  statement: {
    label: "纯声明类",
    weights: { web: 0.3, logic: 0.1, history: 0.08, sourceChain: 0.22, realWorld: 0.08, stats: 0.04, integrity: 0.18 },
  },
};

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

const englishNewsNetworkTerms = ["Reuters", "AP", "BBC", "Bloomberg", "Financial Times", "New York Times", "Wall Street Journal"];

const crossLingualConcepts = [
  { id: "united_states", kind: "entity", triggers: [/美国|美方|白宫|华盛顿|united states|america|u\.?s\.?|white house|washington/i], terms: ["United States", "US", "America", "White House", "Washington"], patterns: [/united states|\bu\.s\.\b|\bus\b|america|american|white house|washington|美国|美方|白宫|华盛顿/i], domains: ["whitehouse.gov", "state.gov"] },
  { id: "china", kind: "entity", triggers: [/中国|中方|北京|访华|访中|来华|赴华|china|beijing/i], terms: ["China", "Beijing", "Chinese government"], patterns: [/china|chinese|beijing|中国|中方|北京|访华|访中|来华|赴华/i], domains: ["gov.cn", "fmprc.gov.cn"] },
  { id: "china_football_team", kind: "entity", triggers: [/中国队|国足|中国男足|男足|中国足球|china national football team|chinese national football team|team china|china soccer/i], terms: ["China national football team", "Chinese men's football team", "China soccer team", "Team China football"], patterns: [/china national football team|chinese national football team|chinese men's football team|china soccer team|team china football|中国队|国足|中国男足|男足|中国足球/i] },
  { id: "united_kingdom", kind: "entity", triggers: [/英国|英方|伦敦|united kingdom|britain|u\.?k\.|london/i], terms: ["United Kingdom", "Britain", "UK", "London"], patterns: [/united kingdom|britain|british|\bu\.k\.\b|\buk\b|london|英国|英方|伦敦/i], domains: ["gov.uk", "parliament.uk"] },
  { id: "russia", kind: "entity", triggers: [/俄罗斯|俄方|莫斯科|russia|moscow/i], terms: ["Russia", "Moscow", "Kremlin"], patterns: [/russia|russian|moscow|kremlin|俄罗斯|俄方|莫斯科/i], domains: ["kremlin.ru"] },
  { id: "ukraine", kind: "entity", triggers: [/乌克兰|基辅|ukraine|kyiv|kiev/i], terms: ["Ukraine", "Kyiv"], patterns: [/ukraine|ukrainian|kyiv|kiev|乌克兰|基辅/i], domains: ["president.gov.ua"] },
  { id: "israel", kind: "entity", triggers: [/以色列|耶路撒冷|israel|jerusalem/i], terms: ["Israel", "Jerusalem"], patterns: [/israel|israeli|jerusalem|以色列|耶路撒冷/i], domains: ["gov.il"] },
  { id: "iran", kind: "entity", triggers: [/伊朗|德黑兰|iran|tehran/i], terms: ["Iran", "Tehran"], patterns: [/iran|iranian|tehran|伊朗|德黑兰/i], domains: ["president.ir"] },
  { id: "uae", kind: "entity", triggers: [/uae|阿联酋|united arab emirates/i], terms: ["United Arab Emirates", "UAE"], patterns: [/uae|united arab emirates|emirati|阿联酋/i], domains: ["wam.ae", "moei.gov.ae", "mofa.gov.ae"] },
  { id: "saudi_arabia", kind: "entity", triggers: [/沙特|沙特阿拉伯|saudi|riyadh/i], terms: ["Saudi Arabia", "Riyadh"], patterns: [/saudi arabia|saudi|riyadh|沙特|利雅得/i], domains: ["spa.gov.sa"] },
  { id: "european_union", kind: "entity", triggers: [/欧盟|欧洲委员会|european union|eu\b|european commission/i], terms: ["European Union", "EU", "European Commission"], patterns: [/european union|\beu\b|european commission|欧盟|欧洲委员会/i], domains: ["europa.eu"] },
  { id: "nato", kind: "entity", triggers: [/北约|nato/i], terms: ["NATO"], patterns: [/nato|north atlantic treaty organization|北约/i], domains: ["nato.int"] },
  { id: "un", kind: "entity", triggers: [/联合国|united nations|\bun\b/i], terms: ["United Nations", "UN"], patterns: [/united nations|\bun\b|联合国/i], domains: ["un.org"] },
  { id: "who", kind: "entity", triggers: [/世界卫生组织|who\b|world health organization/i], terms: ["World Health Organization", "WHO"], patterns: [/world health organization|\bwho\b|世界卫生组织/i], domains: ["who.int"] },
  { id: "opec", kind: "entity", triggers: [/opec|欧佩克/i], terms: ["OPEC", "OPEC+"], patterns: [/opec|opec\+|organization of the petroleum exporting countries|欧佩克/i], domains: ["opec.org"] },
  { id: "federal_reserve", kind: "entity", triggers: [/美联储|联邦储备|fed|federal reserve|fomc/i], terms: ["Federal Reserve", "Fed", "FOMC", "Fed chair"], patterns: [/federal reserve|\bfed\b|fomc|美联储|联邦储备/i], domains: ["federalreserve.gov"] },
  { id: "ecb", kind: "entity", triggers: [/欧洲央行|ecb|european central bank/i], terms: ["European Central Bank", "ECB"], patterns: [/european central bank|\becb\b|欧洲央行/i], domains: ["ecb.europa.eu"] },
  { id: "boj", kind: "entity", triggers: [/日本央行|boj|bank of japan/i], terms: ["Bank of Japan", "BOJ"], patterns: [/bank of japan|\bboj\b|日本央行/i], domains: ["boj.or.jp"] },
  { id: "powell", kind: "entity", triggers: [/鲍威尔|powell/i], terms: ["Jerome Powell", "Powell"], patterns: [/jerome powell|powell|鲍威尔/i] },
  { id: "warsh", kind: "entity", triggers: [/沃什|warsh/i], terms: ["Kevin Warsh", "Warsh"], patterns: [/kevin warsh|warsh|沃什/i] },
  { id: "trump", kind: "entity", triggers: [/特朗普|trump/i], terms: ["Donald Trump", "Trump"], patterns: [/donald trump|trump|特朗普/i] },
  { id: "musk", kind: "entity", triggers: [/马斯克|musk|elon/i], terms: ["Elon Musk", "Musk"], patterns: [/elon musk|musk|马斯克/i] },
  { id: "dario", kind: "entity", triggers: [/dario|达里奥|amodei/i], terms: ["Dario Amodei", "Anthropic"], patterns: [/dario amodei|anthropic|达里奥/i], domains: ["anthropic.com"] },
  { id: "visit", kind: "action", triggers: [/访华|访中|来华|赴华|访美|访问|国事访问|会见|会晤|抵达|visit|state visit|official visit|meet|arrive/i], terms: ["visit", "state visit", "official visit", "arrive", "host", "meet"], patterns: [/visit|visited|visiting|state visit|official visit|trip|arriv|welcome|host|meet|访问|访华|访中|来华|赴华|访美|国事访问|抵达|欢迎|会晤|会见/i] },
  { id: "announcement", kind: "action", triggers: [/宣布|公告|声明|发布|证实|确认|announce|announcement|statement|confirm/i], terms: ["announce", "announcement", "official statement", "confirmed"], patterns: [/announc|statement|declare|official|confirm|press release|宣布|公告|声明|发布|证实|确认/i] },
  { id: "resignation", kind: "action", triggers: [/辞职|卸任|离任|下台|resign|step down|quit/i], terms: ["resign", "step down", "resignation", "leave office"], patterns: [/resign|step down|resignation|leave office|辞职|卸任|离任|下台/i] },
  { id: "succession", kind: "action", triggers: [/任期|交接|继任|接棒|接任|换届|successor|succession|transition|term|replacement/i], terms: ["term ends", "term expires", "transition", "succession", "successor", "replacement"], patterns: [/term ends|term expires|chair term|successor|succession|succeed|replace|replacement|transition|handover|任期|交接|继任|接棒|接任|换届/i] },
  { id: "withdrawal", kind: "action", triggers: [/退出|离开|撤出|withdraw|leave|exit|quit/i], terms: ["withdraw", "leave", "exit"], patterns: [/withdraw|leav|exit|quit|退出|离开|撤出/i] },
  { id: "qualification", kind: "action", triggers: [/进世界杯|晋级|出线|入围|获得资格|qualified|qualify|qualification|advance/i], terms: ["qualified", "qualification", "qualify for", "advance to", "book a place", "secure a spot"], patterns: [/qualif(?:y|ied|ication)|advance|book(?:ed)?\s+(?:a\s+)?place|secure(?:d)?\s+(?:a\s+)?spot|晋级|出线|入围|获得资格|进世界杯/i] },
  { id: "sanctions", kind: "action", triggers: [/制裁|禁令|出口管制|sanction|ban|export control/i], terms: ["sanctions", "ban", "export controls"], patterns: [/sanction|ban|export control|blacklist|制裁|禁令|出口管制/i] },
  { id: "acquisition", kind: "action", triggers: [/收购|并购|合并|acquire|acquisition|merger/i], terms: ["acquisition", "acquire", "merger", "takeover"], patterns: [/acquir|acquisition|takeover|merger|buy|merge|收购|并购|合并/i] },
  { id: "lawsuit", kind: "action", triggers: [/起诉|诉讼|法院|判决|裁定|lawsuit|sue|court|ruling/i], terms: ["lawsuit", "court ruling", "sued", "legal case"], patterns: [/lawsuit|sue|sued|court|ruling|judge|legal case|起诉|诉讼|法院|判决|裁定/i], domains: ["justice.gov", "courtlistener.com"] },
  { id: "investigation", kind: "action", triggers: [/调查|监管|审查|probe|investigation|regulator/i], terms: ["investigation", "probe", "regulatory review"], patterns: [/investigation|probe|regulator|regulatory review|scrutiny|调查|监管|审查/i] },
  { id: "war_conflict", kind: "topic", triggers: [/战争|冲突|袭击|爆炸|停火|军方|war|conflict|attack|ceasefire|military/i], terms: ["war", "conflict", "attack", "ceasefire", "military"], patterns: [/war|conflict|attack|strike|ceasefire|military|战争|冲突|袭击|爆炸|停火|军方/i], domains: ["un.org"] },
  { id: "election", kind: "topic", triggers: [/选举|投票|民调|总统大选|election|vote|poll/i], terms: ["election", "vote", "poll", "campaign"], patterns: [/election|vote|voting|poll|campaign|选举|投票|民调/i] },
  { id: "world_cup", kind: "topic", triggers: [/世界杯|world cup|fifa world cup/i], terms: ["FIFA World Cup", "World Cup"], patterns: [/fifa world cup|world cup|世界杯/i] },
  { id: "football", kind: "topic", triggers: [/足球|国足|男足|soccer|football/i], terms: ["football", "soccer", "national football team"], patterns: [/football|soccer|national football team|足球|国足|男足/i] },
  { id: "rate_policy", kind: "topic", triggers: [/利率|降息|加息|按兵不动|维持|会议|发布会|interest rate|rate cut|hold rates|press conference/i], terms: ["interest rates", "rate decision", "hold rates", "rate cut", "press conference"], patterns: [/interest rate|rates|rate cut|hold rates|keeps rates|unchanged|meeting|press conference|利率|降息|加息|维持|会议|发布会|按兵不动/i] },
  { id: "central_bank_independence", kind: "topic", triggers: [/独立性|政治压力|央行独立|independence|political pressure/i], terms: ["central bank independence", "political pressure", "Fed independence"], patterns: [/central bank independence|fed independence|independence|independent|political pressure|legal attack|独立性|政治压力|央行独立/i] },
  { id: "dissent_vote", kind: "topic", triggers: [/分歧|反对票|投票|dissent|split vote|vote/i], terms: ["dissent", "split vote", "policy division"], patterns: [/dissent|split vote|divided|division|vote|voted|反对票|投票|分歧|分裂/i] },
  { id: "market", kind: "topic", triggers: [/股价|市场|油价|金价|汇率|债券|market|stock|oil price|bond|currency/i], terms: ["market reaction", "stock price", "oil price", "bond yields", "currency"], patterns: [/market|stock|share price|oil price|bond yield|currency|market reaction|股价|市场|油价|金价|汇率|债券/i] },
  { id: "medical", kind: "topic", triggers: [/医疗|医学|疾病|药物|疫苗|临床|治疗|副作用|medicine|disease|drug|vaccine|clinical/i], terms: ["medical evidence", "clinical trial", "study", "guideline"], patterns: [/medical|medicine|disease|drug|vaccine|clinical trial|guideline|医疗|医学|疾病|药物|疫苗|临床|治疗/i], domains: ["who.int", "cdc.gov", "nih.gov", "clinicaltrials.gov"] },
  { id: "technology_ai", kind: "topic", triggers: [/人工智能|大模型|芯片|半导体|ai\b|artificial intelligence|chip|semiconductor/i], terms: ["artificial intelligence", "AI", "chips", "semiconductors"], patterns: [/artificial intelligence|\bai\b|chip|semiconductor|人工智能|大模型|芯片|半导体/i] },
  { id: "climate", kind: "topic", triggers: [/气候|全球变暖|碳排放|climate|global warming|carbon emissions/i], terms: ["climate change", "global warming", "carbon emissions"], patterns: [/climate change|global warming|carbon emissions|气候|全球变暖|碳排放/i], domains: ["ipcc.ch", "noaa.gov", "nasa.gov"] },
];

const sourceTiers = [
  { tier: "T0", score: 92, channel: "academicEvidence", match: academicAuthorityDomains },
  { tier: "T1", score: 86, channel: "academicEvidence", match: academicTopJournalDomains },
  { tier: "T2", score: 74, channel: "academicEvidence", match: academicPublisherDomains },
  { tier: "T3", score: 62, channel: "academicEvidence", match: academicMixedQualityDomains },
  { tier: "T4", score: 48, channel: "academicEvidence", match: academicPreprintDomains },
  { tier: "T0", score: 95, channel: "primaryRecord", match: ["wam.ae", "opec.org", "royal.uk", "whitehouse.gov", "congress.gov", "parliament.uk", ".gov", "gov.", "sec.gov", "justice.gov", "court", "europa.eu", "gov.cn", "gov.uk", "who.int", "un.org", "moei.gov.ae", "mofa.gov.ae"] },
  { tier: "T1", score: 86, channel: "newsMedia", match: ["reuters.com", "bloomberg.com", "apnews.com", "afp.com", "ft.com", "argusmedia.com", "spglobal.com"] },
  { tier: "T2", score: 76, channel: "newsMedia", match: ["bbc.", "nytimes.com", "wsj.com", "caixin.com", "nikkei.com", "theguardian.com", "washingtonpost.com", "npr.org", "aljazeera.com", "euronews.com", "cctv.com", "news.cctv.com", "cgtn.com", "央视新闻"] },
  { tier: "T3", score: 62, channel: "newsMedia", match: ["thenationalnews.com", "aletihad.ae", "hydrocarbonengineering.com", "oilprice.com", "businessinsider.com", "cfr.org", "atlanticcouncil.org", "economictimes.com", "21jingji.com"] },
  { tier: "T4", score: 42, channel: "socialPlatform", match: ["x.com", "twitter.com", "weibo.com", "facebook.com", "instagram.com", "reddit.com", "tiktok.com", "youtube.com", "youtu.be", "telegram", "substack.com", "medium.com"] },
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return sendCors(res, 204, "");
    if (req.url === "/api/health") {
      return sendJson(res, {
        ok: true,
        service: "La vérité backend",
        online: true,
        aiCommitteeEnabled: AI_COMMITTEE_ENABLED,
        aiApiKeyConfigured: AI_API_KEY_CONFIGURED,
        aiModel: AI_API_KEY_CONFIGURED ? AI_MODEL : "",
        aiBaseUrlConfigured: Boolean(AI_BASE_URL),
        time: new Date().toISOString(),
      });
    }
    if (req.url === "/api/check" && req.method === "POST") {
      const payload = await readJson(req);
      const result = await checkClaim(payload);
      return sendJson(res, result);
    }
    if (req.url?.startsWith("/api/search") && req.method === "GET") {
      const url = new URL(req.url, `http://${HOST}:${PORT}`);
      const q = url.searchParams.get("q") || "";
      const results = await runSearchPlan({ text: q, url: "", sourceName: "", type: "event", impact: "medium", media: [] });
      return sendJson(res, { ok: true, query: q, results });
    }
    return serveStatic(req, res);
  } catch (error) {
    console.error(error);
    return sendJson(res, { ok: false, error: error.message || String(error) }, 500);
  }
}).listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;
  console.log(`La vérité backend running at http://${displayHost}:${PORT}`);
});

async function checkClaim(payload) {
  const input = normalizeInput(payload);
  input.media = await enrichMediaWithAiDetection(input.media);
  input.claimPlan = buildClaimPlan(input);
  const startedAt = Date.now();
  const localSignals = extractLocalSignals(input);
  const searchBundle = await runSearchPlan(input);
  const evidence = scoreEvidence(searchBundle, input, localSignals);
  const report = buildReport(input, localSignals, evidence, searchBundle);
  await enrichReportWithAiCommittee(input, localSignals, evidence, report);
  return {
    ok: true,
    mode: "online_backend",
    elapsedMs: Date.now() - startedAt,
    report,
    diagnostics: {
      queryCount: searchBundle.queries.length,
      academicNeeded: searchBundle.academicNeeded,
      academicReason: searchBundle.academicReason,
      academicQueryCount: searchBundle.academicQueries.length,
      englishNetworkEnabled: searchBundle.englishNetworkEnabled,
      englishNetworkQueryCount: searchBundle.englishNetworkQueries.length,
      englishConcepts: searchBundle.englishConcepts,
      counterQueryCount: searchBundle.counterQueries.length,
      retrievalStages: searchBundle.retrievalPlan?.stages?.length || 0,
      retrievalSavedJobs: searchBundle.retrievalPlan?.savedJobs || 0,
      connectorCount: searchBundle.connectors.length,
      rawResultCount: searchBundle.rawCount,
      counterRawResultCount: searchBundle.counterRawCount,
      errorCount: searchBundle.errorSummary?.reduce((sum, item) => sum + item.count, 0) || searchBundle.errors.length,
      failedConnectorCount: searchBundle.errorSummary?.length || 0,
      errors: (searchBundle.errorSummary || summarizeSearchErrors(searchBundle.errors)).slice(0, 6).map((item) => `${item.connector} ×${item.count}: ${item.sample}`),
    },
  };
}

function normalizeInput(payload) {
  return {
    url: String(payload?.url || "").trim(),
    text: String(payload?.text || "").trim(),
    type: ["event", "data", "statement"].includes(payload?.type) ? payload.type : "event",
    impact: ["high", "medium", "low"].includes(payload?.impact) ? payload.impact : "medium",
    sourceName: String(payload?.sourceName || "").trim(),
    media: Array.isArray(payload?.media) ? payload.media : [],
  };
}

function buildClaimPlan(input) {
  const source = safeText(`${input.text || ""}\n${input.sourceName || ""}`).replace(/\s+/g, " ").trim();
  const candidates = splitClaimCandidates(source);
  const fallback = input.url ? [source || input.url] : [source].filter(Boolean);
  const rawClaims = (candidates.length ? candidates : fallback).filter(Boolean);
  const claims = rawClaims.map((text, index) => {
    const cleaned = decontextualizeClaim(text, input);
    const worthiness = claimWorthiness(cleaned, input);
    const kind = claimKind(cleaned);
    const searchText = claimSearchText(cleaned, input);
    return {
      id: `C${index + 1}`,
      text: cleaned,
      kind,
      worthiness,
      priority: claimPriority(worthiness, kind, input),
      searchText,
      signals: claimSignals(cleaned),
    };
  })
    .filter((claim) => claim.text && claim.worthiness >= 35)
    .sort((a, b) => b.priority - a.priority || b.worthiness - a.worthiness)
    .slice(0, 6)
    .map((claim, index) => ({ ...claim, id: `C${index + 1}` }));

  const selected = claims.filter((claim) => claim.priority >= 58).slice(0, input.impact === "high" ? 4 : 3);
  const activeClaims = selected.length ? selected : claims.slice(0, 2);
  const summary = {
    totalCandidates: rawClaims.length,
    activeCount: activeClaims.length,
    averageWorthiness: clamp(claims.reduce((sum, claim) => sum + claim.worthiness, 0) / Math.max(1, claims.length)),
    hasCheckworthyClaim: activeClaims.some((claim) => claim.worthiness >= 55),
  };
  return { claims, activeClaims, summary };
}

function splitClaimCandidates(text) {
  if (!text) return [];
  const normalized = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/([。！？!?；;])\s*/g, "$1\n")
    .replace(/\s*[|｜]\s*/g, "\n")
    .replace(/\s+-\s+/g, "\n")
    .replace(/\n+/g, "\n");
  const sentences = normalized.split(/\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 8 && !/^(来源|编辑|责任编辑|免责声明)[:：]/.test(item));
  const expanded = [];
  for (const item of sentences) {
    const parts = item.length > 90 ? item.split(/(?<=，|,)\s*(?=[^，,]{12,})/u) : [item];
    for (const part of parts) expanded.push(part.trim());
  }
  return unique(expanded).slice(0, 10);
}

function decontextualizeClaim(text, input) {
  let claim = safeText(text).trim();
  claim = claim.replace(/^(据|报道称|媒体称|北美观察|快讯|独家|视频|图)[丨:：\s]*/u, "");
  claim = claim.replace(/\s+/g, " ");
  if (input.sourceName && claim.length < 24) claim = `${input.sourceName}：${claim}`;
  return claim.slice(0, 220);
}

function claimWorthiness(claim, input) {
  let score = 38;
  if (/[A-Z][a-z]+|[\u4e00-\u9fa5]{2,}|[A-Z]{2,}/.test(claim)) score += 10;
  if (/\d|今日|昨天|明天|周[一二三四五六日]|202\d|19\d\d|today|yesterday|tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/i.test(claim)) score += 10;
  if (/宣布|确认|称|表示|发布|通过|批准|拒绝|退出|卸任|访问|到访|拜访|参访|考察|会见|死亡|受伤|增长|下降|收购|制裁|起诉|调查|announce|confirm|say|release|approve|reject|withdraw|resign|visit|meet|kill|injure|increase|decrease|acquire|sanction|sue|probe/i.test(claim)) score += 18;
  if (/可能|或许|预计|分析|认为|担忧|考验|挑战|影响|could|may|might|likely|analysis|opinion|concern|challenge/i.test(claim)) score -= 8;
  if (/我觉得|怎么看|是否|吗$|what do you think|should we/i.test(claim)) score -= 18;
  if (input.impact === "high") score += 5;
  if (input.media?.length && /(图|视频|照片|截图|image|photo|video)/i.test(claim)) score += 8;
  return clamp(score);
}

function claimKind(claim) {
  if (/导致|引起|造成|增加|降低|风险|治疗|预防|有效|无效|cause|risk|increase|reduce|treat|prevent|effective/i.test(claim)) return "因果 / 科学";
  if (/\d|%|万|亿|美元|票|人|barrel|price|rate|data/i.test(claim)) return "数据";
  if (/称|表示|声明|发言|quote|said|statement/i.test(claim)) return "声明 / 引用";
  if (/图片|视频|截图|照片|image|photo|video|screenshot/i.test(claim)) return "媒介";
  if (/到访|拜访|参访|考察|访问|会见|visit|visited|meet|met/i.test(claim)) return "到访 / 会见";
  if (/分析|考验|挑战|影响|前景|analysis|challenge|impact|outlook/i.test(claim)) return "分析判断";
  return "事件";
}

function claimPriority(worthiness, kind, input) {
  let score = worthiness;
  if (["事件", "声明 / 引用", "数据", "因果 / 科学"].includes(kind)) score += 8;
  if (kind === "分析判断") score -= 4;
  if (input.impact === "high") score += 5;
  return clamp(score);
}

function claimSignals(claim) {
  return {
    hasNumbers: /\d/.test(claim),
    hasQuote: /[“”"']|称|表示|said|quote|statement/i.test(claim),
    hasTime: /202\d|19\d\d|今日|今天|昨天|明天|today|yesterday|tomorrow/i.test(claim),
    mediaDependent: /图片|视频|截图|照片|image|photo|video|screenshot/i.test(claim),
    speculative: /可能|或许|预计|据称|传|could|may|might|reportedly|allegedly/i.test(claim),
  };
}

function claimSearchText(claim, input) {
  const sourceHint = input.sourceName && !claim.includes(input.sourceName) ? ` ${input.sourceName}` : "";
  return `${claim}${sourceHint}`.trim();
}

async function enrichMediaWithAiDetection(media = []) {
  if (!MEDIA_AI_ENABLED || !Array.isArray(media) || !media.length) return media;
  const samples = media.flatMap((item, mediaIndex) => {
    const imageSamples = Array.isArray(item.aiSamples) ? item.aiSamples : [];
    const frameSamples = Array.isArray(item.videoKeyframes) ? item.videoKeyframes : [];
    return [...imageSamples, ...frameSamples]
      .filter((sample) => typeof sample?.dataUrl === "string" && sample.dataUrl.startsWith("data:image/"))
      .slice(0, 8)
      .map((sample, sampleIndex) => ({
        mediaIndex,
        sampleIndex,
        name: item.name || `media-${mediaIndex + 1}`,
        kind: item.kind || "image",
        sampleType: sample.sampleType || (item.kind === "video" ? "video_keyframe" : "image_preview"),
        time: sample.time || 0,
        width: sample.width || item.width || 0,
        height: sample.height || item.height || 0,
        dataUrl: sample.dataUrl,
      }));
  });
  if (!samples.length) return media;

  try {
    const response = await fetch(MEDIA_AI_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ samples }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`media ai service ${response.status}`);
    const result = await response.json();
    const byMedia = new Map();
    for (const sample of result.samples || []) {
      const bucket = byMedia.get(sample.mediaIndex) || [];
      bucket.push(sample);
      byMedia.set(sample.mediaIndex, bucket);
    }
    return media.map((item, index) => {
      const sampleResults = byMedia.get(index) || [];
      if (!sampleResults.length) return item;
      const syntheticScore = Math.round(sampleResults.reduce((sum, sample) => sum + Number(sample.syntheticScore || 0), 0) / sampleResults.length);
      const riskScore = Math.round(sampleResults.reduce((sum, sample) => sum + Number(sample.riskScore || 0), 0) / sampleResults.length);
      return {
        ...item,
        aiDetection: {
          enabled: true,
          engine: result.engine || "media_ai_service",
          model: result.model || "",
          syntheticScore: clamp(syntheticScore),
          riskScore: clamp(riskScore),
          verdict: syntheticScore >= 72 ? "疑似 AI 生成" : syntheticScore >= 55 ? "AI 生成风险中等" : "未见强 AI 生成信号",
          samples: sampleResults.slice(0, 8),
        },
      };
    });
  } catch (error) {
    return media.map((item) => ({
      ...item,
      aiDetection: {
        enabled: true,
        engine: "media_ai_service",
        unavailable: true,
        verdict: "AI 图像检测服务未响应",
        error: error.message || String(error),
      },
    }));
  }
}

async function runSearchPlan(input) {
  const queries = buildQueries(input);
  const raw = [];
  const errors = [];
  const connectors = new Set();
  const executed = new Set();
  const stages = [];
  const allSpecs = buildRetrievalJobSpecs(input, queries);

  const runStage = async (name, specs) => {
    const runnable = specs.filter((spec) => spec.query !== "" && !executed.has(spec.key));
    if (!runnable.length) return evaluateRetrievalState(raw, input);
    for (const spec of runnable) {
      executed.add(spec.key);
      connectors.add(spec.connector);
    }
    const startedRawCount = raw.length;
    const startedErrorCount = errors.length;
    const settled = await Promise.allSettled(runnable.map((spec) => withTimeout(spec.make(), spec.timeout || 9000)));
    for (const [index, item] of settled.entries()) {
      if (item.status === "fulfilled") raw.push(...(item.value.results || []));
      else errors.push({ connector: runnable[index]?.connector || "unknown", message: item.reason?.message || String(item.reason) });
    }
    const state = evaluateRetrievalState(raw, input);
    stages.push({
      name,
      jobs: runnable.length,
      newResults: raw.length - startedRawCount,
      errors: errors.length - startedErrorCount,
      confidence: state.confidence,
      supportSignals: state.supportSignals,
      refuteSignals: state.refuteSignals,
      sourceDiversity: state.sourceDiversity,
      decision: "",
      reason: "",
    });
    return state;
  };

  let state = await runStage("FIRE-1 快速定位", allSpecs.foundation);
  let decision = retrievalDecision("foundation", state, input, queries);
  if (stages.length) Object.assign(stages[stages.length - 1], { decision: decision.action, reason: decision.reason });

  if (decision.action === "continue") {
    state = await runStage("FIRE-2 标准交叉验证", allSpecs.standard);
    decision = retrievalDecision("standard", state, input, queries);
    if (stages.length) Object.assign(stages[stages.length - 1], { decision: decision.action, reason: decision.reason });
  }

  if (decision.action === "continue") {
    state = await runStage("FIRE-3 扩展反证 / 专项渠道", allSpecs.expanded);
    decision = retrievalDecision("expanded", state, input, queries);
    if (stages.length) Object.assign(stages[stages.length - 1], { decision: decision.action, reason: decision.reason });
  }

  const counterRawCount = raw.filter((result) => result.channelHint === "counter_evidence").length;
  const deduped = dedupeResults(raw).slice(0, 100);
  const totalPotentialJobs = [...allSpecs.foundation, ...allSpecs.standard, ...allSpecs.expanded].length;
  return {
    queries: [...queries.primary, ...queries.englishNetwork, ...queries.official, ...queries.realWorld, ...queries.social, ...queries.selfMedia],
    englishNetworkEnabled: queries.englishNetworkEnabled,
    englishNetworkQueries: queries.englishNetwork,
    englishConcepts: queries.englishConcepts,
    academicNeeded: queries.academicNeeded,
    academicReason: queries.academicReason,
    academicQueries: queries.academic,
    counterQueries: queries.counterEvidence,
    connectors: [...connectors],
    rawCount: raw.length,
    counterRawCount,
    errors,
    errorSummary: summarizeSearchErrors(errors),
    results: deduped,
    retrievalPlan: {
      mode: "FIRE-style adaptive retrieval",
      totalPotentialJobs,
      executedJobs: executed.size,
      savedJobs: Math.max(0, totalPotentialJobs - executed.size),
      stoppedEarly: executed.size < totalPotentialJobs,
      finalDecision: decision.action,
      finalReason: decision.reason,
      stages,
    },
  };
}

function buildRetrievalJobSpecs(input, queries) {
  const job = (connector, query, make, timeout = 9000) => ({
    connector,
    query: query || "",
    key: `${connector}:${query || ""}`,
    make,
    timeout,
  });
  const ddg = (query, hint = "web") => job(hint === "web" ? "duckduckgo_web" : hint, query, () => searchDuckDuckGo(query, hint));
  const gnews = (query, hint = "news") => GOOGLE_NEWS_RSS_ENABLED ? [job(hint === "news" ? "google_news_rss" : hint, query, () => searchGoogleNews(query, hint))] : [];
  const gdelt = (query, hint = "gdelt_news") => job(hint === "gdelt_news" ? "gdelt_news" : hint, query, () => searchGdelt(query, hint));
  const reddit = (query) => job("reddit", query, () => searchReddit(query));
  const apiWeb = (query, hint = "web") => officialSearchApiJobs(query, hint, job);
  const apiNews = (query, hint = "newsMedia") => newsSearchApiJobs(query, hint, job);

  const foundation = [];
  if (input.url) foundation.push(job("direct_url", input.url, () => fetchDirectUrl(input.url), 9000));
  for (const query of queries.primary.slice(0, 3)) {
    foundation.push(...apiNews(query, "newsMedia"));
    foundation.push(...apiWeb(query, "web"));
    foundation.push(...gnews(query));
    foundation.push(ddg(query, "web"));
  }
  for (const query of queries.englishNetwork.slice(0, 2)) {
    foundation.push(...apiNews(query, "english_network"));
    foundation.push(...apiWeb(query, "english_network"));
    foundation.push(...gnews(query, "english_network"));
    foundation.push(ddg(query, "english_network"));
  }
  for (const query of queries.counterEvidence.slice(0, 2)) {
    foundation.push(...apiNews(query, "counter_evidence"));
    foundation.push(...apiWeb(query, "counter_evidence"));
    foundation.push(...gnews(query, "counter_evidence"));
    foundation.push(ddg(query, "counter_evidence"));
  }
  if (queries.academicNeeded && queries.academic[0]) foundation.push(job("pubmed", queries.academic[0], () => searchPubMed(queries.academic[0])));

  const standard = [];
  for (const query of queries.primary.slice(3, 7)) {
    standard.push(...apiNews(query, "newsMedia"));
    standard.push(...gnews(query));
    standard.push(gdelt(query));
    standard.push(ddg(query, "web"));
  }
  for (const query of queries.englishNetwork.slice(2, 5)) {
    standard.push(...apiNews(query, "english_network"));
    standard.push(...apiWeb(query, "english_network"));
    standard.push(...gnews(query, "english_network"));
    standard.push(gdelt(query, "english_network"));
    standard.push(ddg(query, "english_network"));
  }
  for (const query of queries.official.slice(0, 4)) {
    standard.push(...apiWeb(query, "official"));
    standard.push(ddg(query, "official"));
  }
  for (const query of queries.realWorld.slice(0, 3)) {
    standard.push(...apiWeb(query, "real_world"));
    standard.push(ddg(query, "real_world"));
  }
  for (const query of queries.counterEvidence.slice(2, 7)) {
    standard.push(...apiNews(query, "counter_evidence"));
    standard.push(...apiWeb(query, "counter_evidence"));
    standard.push(...gnews(query, "counter_evidence"));
    standard.push(ddg(query, "counter_evidence"));
  }
  for (const query of queries.academic.slice(1, 3)) {
    standard.push(job("pubmed", query, () => searchPubMed(query)));
    standard.push(job("crossref", query, () => searchCrossref(query)));
  }

  const expanded = [];
  for (const query of queries.primary.slice(7)) {
    expanded.push(...apiWeb(query, "web"));
    expanded.push(ddg(query, "web"));
  }
  for (const query of queries.englishNetwork.slice(5)) {
    expanded.push(...apiNews(query, "english_network"));
    expanded.push(...gnews(query, "english_network"));
    expanded.push(ddg(query, "english_network"));
  }
  for (const query of queries.official.slice(4)) {
    expanded.push(...apiWeb(query, "official"));
    expanded.push(ddg(query, "official"));
  }
  for (const query of queries.realWorld.slice(3)) {
    expanded.push(...apiWeb(query, "real_world"));
    expanded.push(ddg(query, "real_world"));
  }
  for (const query of queries.social) {
    expanded.push(...apiWeb(query, "social"));
    expanded.push(ddg(query, "social"));
    expanded.push(reddit(query));
  }
  for (const query of queries.selfMedia) {
    expanded.push(...apiWeb(query, "self_media"));
    expanded.push(ddg(query, "self_media"));
  }
  for (const query of queries.academic.slice(3)) {
    expanded.push(job("pubmed", query, () => searchPubMed(query)));
    expanded.push(job("crossref", query, () => searchCrossref(query)));
    expanded.push(ddg(query, "academic"));
  }
  for (const query of queries.counterEvidence.slice(7)) {
    expanded.push(...gnews(query, "counter_evidence"));
    expanded.push(ddg(query, "counter_evidence"));
  }

  return {
    foundation: dedupeJobSpecs(foundation),
    standard: dedupeJobSpecs(standard),
    expanded: dedupeJobSpecs(expanded),
  };
}

function dedupeJobSpecs(specs) {
  const seen = new Set();
  const output = [];
  for (const spec of specs) {
    if (!spec.query || seen.has(spec.key)) continue;
    seen.add(spec.key);
    output.push(spec);
  }
  return output;
}

function summarizeSearchErrors(errors = []) {
  const groups = new Map();
  for (const item of errors) {
    const rawConnector = typeof item === "string" ? "unknown" : item.connector || "unknown";
    const connector = normalizeErrorConnector(rawConnector);
    const message = typeof item === "string" ? item : item.message || "";
    const bucket = groups.get(connector) || { connector, count: 0, sample: "" };
    bucket.count += 1;
    if (!bucket.sample && message) bucket.sample = message;
    groups.set(connector, bucket);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

function normalizeErrorConnector(connector) {
  if (/gdelt|english_network/.test(connector)) return "gdelt_news";
  if (/google_news/.test(connector)) return "google_news_rss";
  if (/duckduckgo|ddg/.test(connector)) return "duckduckgo";
  return connector || "unknown";
}

function officialSearchApiJobs(query, channelHint, job) {
  const jobs = [];
  if (BING_SEARCH_API_KEY) jobs.push(job(`bing_${channelHint}`, query, () => searchBingWeb(query, channelHint), 10000));
  if (GOOGLE_CSE_API_KEY && GOOGLE_CSE_ID) jobs.push(job(`google_cse_${channelHint}`, query, () => searchGoogleCse(query, channelHint), 10000));
  if (SERPAPI_KEY) jobs.push(job(`serpapi_${channelHint}`, query, () => searchSerpApi(query, channelHint), 12000));
  return jobs;
}

function newsSearchApiJobs(query, channelHint, job) {
  const jobs = [];
  if (NEWSAPI_KEY) jobs.push(job(`newsapi_${channelHint}`, query, () => searchNewsApi(query, channelHint), 10000));
  if (SERPAPI_KEY) jobs.push(job(`serpapi_news_${channelHint}`, query, () => searchSerpApiNews(query, channelHint), 12000));
  return jobs;
}

function evaluateRetrievalState(raw, input) {
  const claim = input.text || input.sourceName || input.url;
  const terms = expandClaimTerms(claim, buildEnglishInformationContext(input));
  const supportive = [];
  const refuting = [];
  const sourceSet = new Set();
  const strongSet = new Set();
  for (const result of dedupeResults(raw).slice(0, 80)) {
    const text = `${result.title || ""} ${result.snippet || ""}`.toLowerCase();
    const source = classifySource(result.url, result.sourceName, result.channelHint, result.connector);
    const relevance = relevanceScore(text, terms, claim);
    const support = supportScore(text, claim);
    const contradiction = contradictionScore(text, claim, result.channelHint);
    const host = hostname(result.url) || result.sourceName || result.connector || "unknown";
    if (relevance >= 38) sourceSet.add(host);
    if (source.score >= 75 && relevance >= 45) strongSet.add(host);
    if (relevance >= 45 && support >= 42 && contradiction < 55) supportive.push({ host, score: source.score + relevance + support });
    if (contradiction >= 55 && relevance >= 35) refuting.push({ host, score: source.score + contradiction });
  }
  const supportSignals = unique(supportive.map((item) => item.host)).length;
  const refuteSignals = unique(refuting.map((item) => item.host)).length;
  const sourceDiversity = sourceSet.size;
  const strongSources = strongSet.size;
  let confidence = clamp(28 + supportSignals * 13 + refuteSignals * 14 + sourceDiversity * 4 + strongSources * 7);
  if (!supportSignals && !refuteSignals) confidence = Math.min(confidence, 48 + Math.min(8, sourceDiversity));
  return {
    confidence,
    supportSignals,
    refuteSignals,
    sourceDiversity,
    strongSources,
  };
}

function retrievalDecision(stage, state, input, queries) {
  const highImpact = input.impact === "high";
  const academicNeed = queries.academicNeeded;
  const mediaNeed = Boolean(input.media?.length);
  const hasConflict = state.refuteSignals > 0 && state.supportSignals > 0;
  const enoughStrong = state.supportSignals >= (highImpact ? 3 : 2) && state.strongSources >= (highImpact ? 3 : 2) && state.sourceDiversity >= (highImpact ? 4 : 3);

  if (stage === "foundation") {
    if (!highImpact && !academicNeed && !mediaNeed && !hasConflict && enoughStrong && state.confidence >= 78) {
      return { action: "stop", reason: "快速阶段已找到足够独立强来源，停止扩展以节省检索成本" };
    }
    return { action: "continue", reason: highImpact || academicNeed || mediaNeed ? "高影响 / 学术 / 媒介信息需要更深交叉验证" : "快速阶段证据密度不足，进入标准交叉验证" };
  }

  if (stage === "standard") {
    if (!hasConflict && enoughStrong && state.confidence >= 82 && !academicNeed) {
      return { action: "stop", reason: "标准阶段证据已收敛，跳过社交 / 自媒体扩展检索" };
    }
    if (state.supportSignals === 0 && state.refuteSignals === 0) {
      return { action: "continue", reason: "仅命中背景来源，没有形成支持或反证，继续扩展检索" };
    }
    if (state.confidence < 62 || hasConflict || highImpact || academicNeed) {
      return { action: "continue", reason: hasConflict ? "支持与反证并存，扩展反证和专项渠道" : "证据仍不足或信息风险较高，继续扩展检索" };
    }
    return { action: "stop", reason: "标准阶段达到可用置信度，停止额外检索" };
  }

  return { action: "finalize", reason: "已完成扩展检索，进入评分汇总" };
}

function buildQueries(input) {
  const claim = input.text || input.url || input.sourceName;
  const activeClaims = input.claimPlan?.activeClaims?.length ? input.claimPlan.activeClaims : [{ id: "C1", searchText: claim, text: claim, priority: 60 }];
  const activeClaimTexts = activeClaims.map((item) => item.searchText || item.text).filter(Boolean);
  const englishContext = buildEnglishInformationContext(input);
  const terms = unique(activeClaimTexts.flatMap((item) => expandClaimTerms(item, englishContext))).slice(0, 32);
  const variants = unique(activeClaimTexts.flatMap((item) => buildClaimVariants(item, terms, englishContext))).slice(0, 16);
  const academicNeed = detectAcademicNeed(input);
  const quoted = claim.length <= 80 ? `"${claim}"` : claim;
  const englishNetwork = buildEnglishNetworkQueries(claim, terms, variants, englishContext);
  const primary = unique([
    ...activeClaimTexts,
    claim,
    quoted,
    ...variants,
    terms.join(" "),
    `${variants[0] || claim} official`,
    `${variants[0] || claim} Reuters Bloomberg AP BBC`,
  ]).filter(Boolean).slice(0, 10);

  const officialDomains = inferOfficialDomains(claim, englishContext);
  const official = officialDomains.flatMap((domain) => variants.slice(0, 4).map((variant) => `site:${domain} ${variant}`)).slice(0, 12);
  const englishBase = englishContext.terms.slice(0, 12).join(" ") || terms.filter((term) => /[a-z]/i.test(term)).slice(0, 10).join(" ");
  const contextBase = englishBase || terms.join(" ");
  const realWorld = [
    `${contextBase} filing official statement`,
    `${contextBase} market reaction price effective date`,
    `${contextBase} permit tender registry database`,
    ...englishNetwork.realWorld,
  ];
  const social = [
    `site:reddit.com ${contextBase}`,
    `site:x.com ${contextBase}`,
    `site:youtube.com ${contextBase}`,
    ...englishNetwork.social,
  ];
  const selfMedia = [
    `site:substack.com ${contextBase}`,
    `site:medium.com ${contextBase}`,
    `${contextBase} expert analysis`,
    ...englishNetwork.selfMedia,
  ];
  const academic = academicNeed.needed ? buildAcademicQueries(claim, terms, academicNeed).slice(0, 5) : [];
  const counterEvidence = buildCounterEvidenceQueries(claim, terms, officialDomains, englishContext);

  return {
    primary,
    official: unique(official),
    realWorld: unique(realWorld),
    social: unique(social),
    selfMedia: unique(selfMedia),
    academic: unique(academic),
    academicNeeded: academicNeed.needed,
    academicReason: academicNeed.reason,
    counterEvidence,
    englishNetwork: englishNetwork.primary,
    englishNetworkEnabled: englishContext.enabled,
    englishConcepts: englishContext.concepts.map((concept) => concept.id),
  };
}

function buildEnglishInformationContext(input) {
  const claim = `${input.text || ""} ${input.sourceName || ""} ${input.url || ""}`.trim();
  const concepts = matchedCrossLingualConcepts(claim);
  const latinAnchors = extractLatinAnchors(claim);
  const terms = unique([
    ...latinAnchors,
    ...concepts.flatMap((concept) => concept.terms || []),
  ]).filter((term) => /[a-z]/i.test(term)).slice(0, 24);
  return {
    enabled: hasNonEnglishSignal(claim) || concepts.length > 0 || terms.length >= 2,
    nonEnglish: hasNonEnglishSignal(claim),
    concepts,
    terms,
    domains: unique(concepts.flatMap((concept) => concept.domains || [])),
    original: claim,
  };
}

function matchedCrossLingualConcepts(text) {
  return crossLingualConcepts.filter((concept) => concept.triggers.some((pattern) => pattern.test(text)));
}

function hasNonEnglishSignal(text) {
  return /[^\u0000-\u007f]/.test(text || "");
}

function extractLatinAnchors(text) {
  const anchors = new Set();
  const value = String(text || "");
  const acronyms = value.match(/\b[A-Z][A-Z0-9&.+-]{1,}\b/g) || [];
  for (const item of acronyms) anchors.add(item);
  const namedPhrases = value.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/g) || [];
  for (const item of namedPhrases) anchors.add(item);
  const domains = value.match(/\b[a-z0-9-]+\.(?:com|org|net|gov|edu|int|cn|uk|jp|de|fr|ae|sa|ru|ua)\b/gi) || [];
  for (const item of domains) anchors.add(item.toLowerCase());
  return [...anchors].filter((item) => item.length > 1).slice(0, 10);
}

function buildEnglishNetworkQueries(claim, terms, variants, context) {
  if (!context.enabled) return { primary: [], realWorld: [], social: [], selfMedia: [] };
  const englishTerms = unique([...context.terms, ...terms.filter((term) => /[a-z]/i.test(term))]).slice(0, 14);
  const base = englishTerms.join(" ");
  const shortOriginal = claim.length <= 90 ? claim : "";
  const anchor = base || shortOriginal;
  const primary = unique([
    base,
    `${base} ${englishNewsNetworkTerms.slice(0, 5).join(" ")}`,
    `${base} English news`,
    `${base} analysis explainer`,
    shortOriginal ? `${shortOriginal} English translation news` : "",
    shortOriginal ? `${shortOriginal} English Reuters AP BBC` : "",
    ...variants.filter((variant) => /[a-z]/i.test(variant)),
  ]).filter((query) => query && query.trim().length > 3).slice(0, 7);

  return {
    primary,
    realWorld: unique([
      anchor ? `${anchor} official statement filing database English` : "",
      anchor ? `${anchor} timeline effective date market reaction English` : "",
    ]).filter((query) => query.trim().length > 8).slice(0, 3),
    social: unique([
      anchor ? `site:reddit.com ${anchor}` : "",
      anchor ? `site:x.com ${anchor}` : "",
      anchor ? `site:youtube.com ${anchor}` : "",
    ]).filter((query) => query.trim().length > 12).slice(0, 3),
    selfMedia: unique([
      anchor ? `${anchor} expert analysis English` : "",
      anchor ? `site:substack.com ${anchor}` : "",
      anchor ? `site:medium.com ${anchor}` : "",
    ]).filter((query) => query.trim().length > 12).slice(0, 3),
  };
}

function buildAcademicQueries(claim, terms, academicNeed) {
  const base = academicQueryBase(claim, terms);
  const isMedical = ["medical", "nutrition"].includes(academicNeed.category);
  if (isMedical) {
    return unique([
      `${base} systematic review meta analysis`,
      `${base} randomized controlled trial clinical trial`,
      `${base} guideline WHO CDC FDA Cochrane`,
      `${base} PubMed Cochrane`,
      `${base} Lancet Nature NEJM JAMA BMJ`,
    ]);
  }
  return unique([
    `${base} peer reviewed journal review`,
    `${base} systematic review evidence`,
    `${base} Nature Science Cell PNAS paper`,
    `${base} arXiv preprint replication`,
  ]);
}

function academicQueryBase(claim, terms) {
  const extra = [];
  const text = claim.toLowerCase();
  if (/疫苗|vaccine/i.test(claim)) extra.push("vaccine");
  if (/自闭症|autism/i.test(claim)) extra.push("autism");
  if (/新冠|covid|冠状病毒/i.test(claim)) extra.push("COVID-19", "SARS-CoV-2");
  if (/癌症|肿瘤|cancer|tumou?r/i.test(claim)) extra.push("cancer", "tumor");
  if (/糖尿病|diabetes/i.test(claim)) extra.push("diabetes");
  if (/高血压|hypertension/i.test(claim)) extra.push("hypertension");
  if (/心脏|心血管|heart|cardio/i.test(claim)) extra.push("cardiovascular", "heart disease");
  if (/阿尔茨海默|alzheimer/i.test(claim)) extra.push("Alzheimer disease");
  if (/抑郁|depression/i.test(claim)) extra.push("depression");
  if (/咖啡|coffee|caffeine/i.test(claim)) extra.push("coffee", "caffeine");
  if (/维生素|vitamin/i.test(claim)) extra.push("vitamin");
  if (/减肥|肥胖|weight loss|obesity/i.test(claim)) extra.push("weight loss", "obesity");
  if (/超导|superconduct/i.test(claim)) extra.push("superconductivity");
  if (/气候|climate|全球变暖/i.test(claim)) extra.push("climate change", "global warming");
  if (/导致|增加|降低|治疗|预防|cause|risk|treat|prevent|reduce/i.test(claim)) extra.push("effect", "risk");
  return unique([...terms, ...extra]).slice(0, 12).join(" ") || text;
}

function buildCounterEvidenceQueries(claim, terms, officialDomains, englishContext = buildEnglishInformationContext({ text: claim })) {
  const base = terms.join(" ");
  const englishBase = englishContext.terms.slice(0, 12).join(" ") || terms.filter((term) => /[a-z]/i.test(term)).slice(0, 10).join(" ");
  const contradictionTerms = [
    "false",
    "hoax",
    "fake",
    "denies",
    "denied",
    "no plan",
    "not leaving",
    "debunked",
    "fact check",
    "correction",
    "retraction",
    "撤稿",
    "更正",
    "辟谣",
    "否认",
    "不退出",
    "假的",
    "谣言",
  ];
  const queries = [
    `${claim} false OR hoax OR fake`,
    `${base} denied no plan not leaving`,
    `${base} fact check debunked correction retraction`,
    englishBase ? `${englishBase} false hoax fake denied fact check correction retraction` : "",
    englishBase ? `${englishBase} no evidence disputed debunked` : "",
    `${claim} 否认 辟谣 更正 撤稿`,
  ].filter(Boolean);
  for (const domain of officialDomains.slice(0, 5)) {
    queries.push(`site:${domain} ${base} denied OR false OR correction`);
    queries.push(`site:${domain} ${claim} 否认 更正`);
  }
  for (const term of contradictionTerms.slice(0, 5)) queries.push(`${base} ${term}`);
  return unique(queries).slice(0, 14);
}

function expandClaimTerms(claim, englishContext = buildEnglishInformationContext({ text: claim })) {
  const cleaned = claim.replace(/[“”"'`]/g, " ").trim();
  const terms = cleaned.split(/\s+/).filter(Boolean);
  const compact = cleaned.replace(/\s+/g, "");
  terms.push(...(englishContext.terms || []));

  if (/uae|阿联酋/i.test(cleaned) || /UAE/i.test(claim)) terms.push("United Arab Emirates", "UAE");
  if (/opec|欧佩克/i.test(cleaned)) terms.push("OPEC", "OPEC+");
  if (/查尔斯|charles/i.test(cleaned)) terms.push("King Charles III", "King Charles", "Charles III");
  if (/卡米拉|camilla/i.test(cleaned)) terms.push("Queen Camilla", "Camilla");
  if (/英王|英国国王|英国君主|国王|british monarch|king/i.test(cleaned)) terms.push("British monarch", "King");
  if (/美国|访美|白宫|华盛顿|united states|america|u\.?s\.?/i.test(cleaned)) terms.push("United States", "US", "America", "White House", "Washington");
  if (/访华|访中|来华|赴华/i.test(cleaned)) terms.push("China", "Beijing", "visit China", "China visit", "official visit to China");
  if (/访美|访华|访中|来华|赴华|访问|国事访问|visit|state visit|official visit/i.test(cleaned)) terms.push("visit", "state visit", "official visit", "arrive", "host");
  if (/中国队|国足|中国男足|男足|中国足球/i.test(cleaned)) terms.push("China national football team", "Chinese men's football team", "China soccer team", "Team China football");
  if (/世界杯|world cup|fifa world cup/i.test(cleaned)) terms.push("FIFA World Cup", "World Cup");
  if (/进世界杯|晋级|出线|入围|获得资格|qualified|qualify|qualification|advance/i.test(cleaned)) terms.push("qualified", "qualification", "qualify for World Cup", "World Cup qualification");
  if (/鲍威尔|powell/i.test(cleaned)) terms.push("Jerome Powell", "Powell");
  if (/美联储|联邦储备|fed|federal reserve|fomc/i.test(cleaned)) terms.push("Federal Reserve", "Fed", "FOMC", "Fed chair");
  if (/沃什|warsh/i.test(cleaned)) terms.push("Kevin Warsh", "Warsh");
  if (/卸任|任期|交接|继任|接棒|接任|successor|succession|transition|term/i.test(cleaned)) terms.push("chair term ends", "Fed chair transition", "succession", "successor", "replacement");
  if (/利率|降息|加息|按兵不动|维持|会议|发布会|interest rate|rate cut|hold rates|press conference/i.test(cleaned)) terms.push("interest rates", "hold rates", "rate decision", "press conference");
  if (/独立性|政治压力|特朗普|共和党|independence|political pressure|trump/i.test(cleaned)) terms.push("Fed independence", "political pressure", "Trump");
  if (/分歧|反对票|投票|dissent|split vote|vote/i.test(cleaned)) terms.push("dissent", "split vote", "policy division");
  if (/退出|离开|撤出|withdraw|leave|exit|quit/i.test(cleaned)) terms.push("withdraw", "leave", "exit");
  if (/宣布|announcement|announce/i.test(cleaned)) terms.push("announce", "statement");
  if (/制裁|sanction/i.test(cleaned)) terms.push("sanction", "sanctions");
  if (/收购|acquire|acquisition/i.test(cleaned)) terms.push("acquire", "acquisition");
  if (/辞职|resign/i.test(cleaned)) terms.push("resign", "resignation");
  if (/疫苗|vaccine/i.test(cleaned)) terms.push("vaccine");
  if (/自闭症|autism/i.test(cleaned)) terms.push("autism");
  if (/新冠|冠状病毒|covid/i.test(cleaned)) terms.push("COVID-19", "SARS-CoV-2");
  if (/癌症|肿瘤|cancer|tumou?r/i.test(cleaned)) terms.push("cancer", "tumor", "oncology");
  if (/糖尿病|diabetes/i.test(cleaned)) terms.push("diabetes");
  if (/高血压|hypertension/i.test(cleaned)) terms.push("hypertension");
  if (/心脏|心血管|heart|cardio/i.test(cleaned)) terms.push("cardiovascular", "heart disease");
  if (/咖啡|coffee|caffeine/i.test(cleaned)) terms.push("coffee", "caffeine");
  if (/气候|climate|全球变暖/i.test(cleaned)) terms.push("climate change", "global warming");
  if (/超导|superconduct/i.test(cleaned)) terms.push("superconductivity");
  if (/治疗|预防|导致|风险|降低|增加|treat|prevent|cause|risk|reduce|increase/i.test(cleaned)) terms.push("treatment", "prevention", "cause", "risk");
  if (!terms.length && compact) terms.push(compact);
  return unique(terms).slice(0, 18);
}

function buildClaimVariants(claim, terms, englishContext = buildEnglishInformationContext({ text: claim })) {
  const variants = [claim, terms.join(" ")];
  const englishBase = englishContext.terms.slice(0, 12).join(" ");
  if (englishBase) {
    variants.push(
      englishBase,
      `${englishBase} ${englishNewsNetworkTerms.slice(0, 4).join(" ")}`,
      `${englishBase} official statement timeline`,
    );
  }
  if (/查尔斯|charles|英王|英国国王|国王|卡米拉/i.test(claim)) {
    variants.push(
      "King Charles III Queen Camilla United States state visit",
      "King Charles III White House state visit",
      "King Charles III address Congress visit United States",
    );
  }
  if (/uae|阿联酋|opec|欧佩克/i.test(claim)) variants.push("UAE OPEC withdraw exit official statement");
  if (/中国队|国足|中国男足|男足|中国足球|世界杯|world cup/i.test(claim)) {
    variants.push(
      "China national football team qualified for FIFA World Cup",
      "Chinese men's football team World Cup qualification",
      "China soccer team qualify World Cup Reuters AP FIFA",
    );
  }
  if (/鲍威尔|powell|美联储|federal reserve|fed|沃什|warsh/i.test(claim)) {
    variants.push(
      "Jerome Powell Federal Reserve chair term ends May 15 2026",
      "Powell final press conference Fed independence Kevin Warsh transition",
      "Federal Reserve keeps rates unchanged Powell Warsh succession dissent",
      "Powell remain Fed governor after chair term ends Fed independence",
      "Fed chair transition challenges Powell Warsh rate decision political pressure",
    );
  }
  return unique(variants).filter((variant) => variant.length > 2).slice(0, 9);
}

function inferOfficialDomains(claim, englishContext = buildEnglishInformationContext({ text: claim })) {
  const domains = ["gov", "reuters.com", "apnews.com"];
  domains.push(...(englishContext.domains || []));
  if (/uae|阿联酋|opec|欧佩克/i.test(claim)) domains.push("wam.ae", "opec.org", "moei.gov.ae", "mofa.gov.ae", "en.aletihad.ae");
  if (/查尔斯|charles|英王|英国国王|国王|卡米拉|访美|国事访问/i.test(claim)) domains.push("royal.uk", "whitehouse.gov", "congress.gov", "gov.uk", "parliament.uk");
  if (/中国队|国足|中国男足|男足|中国足球|世界杯|world cup|fifa/i.test(claim)) domains.push("fifa.com", "the-afc.com", "thecfa.cn");
  if (/鲍威尔|powell|美联储|federal reserve|fed|fomc|沃什|warsh/i.test(claim)) domains.push("federalreserve.gov", "senate.gov", "whitehouse.gov", "treasury.gov");
  if (/openai/i.test(claim)) domains.push("openai.com");
  if (/anthropic/i.test(claim)) domains.push("anthropic.com");
  if (/sec|上市|财报|年报|filing/i.test(claim)) domains.push("sec.gov");
  return unique(domains);
}

function hasAcademicSourceSignal(text, domain = "") {
  const haystack = `${text || ""} ${domain || ""}`.toLowerCase();
  return academicSignalDomains.some((part) => haystack.includes(part)) || academicSourceNamePattern.test(haystack);
}

function detectAcademicNeed(input) {
  const text = `${input.text || ""} ${input.url || ""} ${input.sourceName || ""}`.toLowerCase();
  const domain = hostname(input.url || "");
  if (hasAcademicSourceSignal(text, domain)) {
    return { needed: true, category: "academic", reason: "输入包含论文 / 期刊 / DOI / 学术平台信号" };
  }
  if (/(医疗|医学|疾病|症状|诊断|治疗|疗效|药物|药品|疫苗|临床|试验|副作用|不良反应|感染|病毒|细菌|癌症|肿瘤|糖尿病|高血压|心脏病|心血管|抑郁|阿尔茨海默|新冠|covid|vaccine|clinical trial|randomized|placebo|drug|medicine|therapy|cancer|diabetes|hypertension|virus|infection)/i.test(text)) {
    return { needed: true, category: "medical", reason: "识别为医疗 / 药物 / 疾病类信息" };
  }
  if (/(营养|保健品|维生素|蛋白粉|咖啡|饮酒|吸烟|减肥|肥胖|饮食|膳食|nutrition|supplement|vitamin|coffee|caffeine|alcohol|smoking|weight loss|obesity|diet)/i.test(text)) {
    return { needed: true, category: "nutrition", reason: "识别为营养 / 生活方式健康类信息" };
  }
  if (/(研究发现|论文|期刊|同行评议|实验|样本量|显著性|meta.?analysis|systematic review|peer.?review|journal|paper|study finds|researchers found|preprint|retraction)/i.test(text)) {
    return { needed: true, category: "academic", reason: "文本声称来自研究或论文" };
  }
  if (/(气候变化|全球变暖|温室气体|碳排放|超导|量子|材料|基因编辑|crispr|climate change|global warming|greenhouse gas|superconduct|quantum|gene editing)/i.test(text)) {
    return { needed: true, category: "science", reason: "识别为科学研究类信息" };
  }
  return { needed: false, category: "general", reason: "未识别科学 / 医疗 / 论文类信息，跳过学术渠道" };
}

async function fetchDirectUrl(url) {
  try {
    const html = await fetchText(url);
    const title = extractTitle(html) || url;
    const description = extractMetaDescription(html);
    return { results: [normalizeResult({ title, url, snippet: description || cleanText(html).slice(0, 500), connector: "direct_url", channelHint: "direct" })] };
  } catch (error) {
    return { results: [], error: error.message };
  }
}

async function searchGoogleNews(query, channelHint = "newsMedia") {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const xml = await fetchText(url);
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 12).map((match) => {
    const item = match[1];
    const title = decodeXml(pickTag(item, "title"));
    const linkRaw = decodeXml(pickTag(item, "link"));
    const source = decodeXml(pickTag(item, "source"));
    const pubDate = decodeXml(pickTag(item, "pubDate"));
    const description = stripHtml(decodeXml(pickTag(item, "description")));
    return normalizeResult({ title, url: linkRaw, snippet: description, publishedAt: pubDate, sourceName: source, connector: channelHint === "counter_evidence" ? "google_news_counter" : "google_news_rss", channelHint, query });
  });
  return { results: items };
}

async function searchGdelt(query, channelHint = "newsMedia") {
  const params = new URLSearchParams({ query, mode: "ArtList", maxrecords: "20", format: "json", sort: "HybridRel" });
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`;
  const json = await fetchJson(url);
  const articles = Array.isArray(json?.articles) ? json.articles : [];
  return {
    results: articles.slice(0, 14).map((article) =>
      normalizeResult({
        title: article.title,
        url: article.url,
        snippet: article.seendate ? `${article.seendate} · ${article.domain || ""}` : article.domain,
        publishedAt: article.seendate,
        sourceName: article.sourceCountry || article.domain,
        connector: channelHint === "english_network" ? "gdelt_english_network" : "gdelt_news",
        channelHint,
        query,
      }),
    ),
  };
}

async function searchDuckDuckGo(query, channelHint = "web") {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchText(url);
  const blocks = html.split(/<div class="result results_links[^>]*>/).slice(1, 11);
  const results = blocks.map((block) => {
    const titleMatch = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>|class="result__snippet"[^>]*>([\s\S]*?)<\/div>/);
    const rawUrl = titleMatch ? decodeHtml(titleMatch[1]) : "";
    const target = unwrapDuckDuckGoUrl(rawUrl);
    const title = titleMatch ? stripHtml(decodeHtml(titleMatch[2])) : "";
    const snippet = snippetMatch ? stripHtml(decodeHtml(snippetMatch[1] || snippetMatch[2] || "")) : "";
    return normalizeResult({ title, url: target, snippet, connector: `duckduckgo_${channelHint}`, channelHint, query });
  }).filter((result) => result.title && result.url);
  return { results };
}

async function searchReddit(query) {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=10&sort=relevance&type=link`;
  const json = await fetchJson(url);
  const posts = json?.data?.children || [];
  return {
    results: posts.map((post) => {
      const data = post.data || {};
      return normalizeResult({
        title: data.title,
        url: data.url_overridden_by_dest || `https://www.reddit.com${data.permalink || ""}`,
        snippet: `${data.subreddit_name_prefixed || "reddit"} · score ${data.score || 0} · comments ${data.num_comments || 0}`,
        publishedAt: data.created_utc ? new Date(data.created_utc * 1000).toISOString() : "",
        sourceName: data.subreddit_name_prefixed || "Reddit",
        connector: "reddit_search",
        channelHint: "socialPlatform",
        query,
      });
    }),
  };
}

async function searchBingWeb(query, channelHint = "web") {
  const params = new URLSearchParams({ q: query, count: "10", mkt: "en-US", responseFilter: "Webpages,News" });
  const url = `https://api.bing.microsoft.com/v7.0/search?${params.toString()}`;
  const json = await fetchJson(url, { "Ocp-Apim-Subscription-Key": BING_SEARCH_API_KEY });
  const webPages = json?.webPages?.value || [];
  const news = json?.news?.value || [];
  return {
    results: [...webPages, ...news].slice(0, 14).map((item) =>
      normalizeResult({
        title: item.name,
        url: item.url,
        snippet: item.snippet || item.description,
        publishedAt: item.datePublished,
        sourceName: item.provider?.[0]?.name || hostname(item.url),
        connector: "bing_search_api",
        channelHint,
        query,
      }),
    ),
  };
}

async function searchGoogleCse(query, channelHint = "web") {
  const params = new URLSearchParams({ key: GOOGLE_CSE_API_KEY, cx: GOOGLE_CSE_ID, q: query, num: "10" });
  const url = `https://www.googleapis.com/customsearch/v1?${params.toString()}`;
  const json = await fetchJson(url);
  const items = Array.isArray(json?.items) ? json.items : [];
  return {
    results: items.slice(0, 10).map((item) =>
      normalizeResult({
        title: item.title,
        url: item.link,
        snippet: item.snippet || item.htmlSnippet,
        sourceName: item.displayLink,
        connector: "google_custom_search",
        channelHint,
        query,
      }),
    ),
  };
}

async function searchSerpApi(query, channelHint = "web") {
  const params = new URLSearchParams({ engine: "google", q: query, api_key: SERPAPI_KEY, num: "10", hl: "en", gl: "us" });
  const url = `https://serpapi.com/search.json?${params.toString()}`;
  const json = await fetchJson(url);
  const organic = Array.isArray(json?.organic_results) ? json.organic_results : [];
  return {
    results: organic.slice(0, 10).map((item) =>
      normalizeResult({
        title: item.title,
        url: item.link,
        snippet: item.snippet || item.rich_snippet?.top?.detected_extensions?.join(" "),
        sourceName: item.source || hostname(item.link),
        connector: "serpapi_google",
        channelHint,
        query,
      }),
    ),
  };
}

async function searchSerpApiNews(query, channelHint = "newsMedia") {
  const params = new URLSearchParams({ engine: "google_news", q: query, api_key: SERPAPI_KEY, num: "10", hl: "en", gl: "us" });
  const url = `https://serpapi.com/search.json?${params.toString()}`;
  const json = await fetchJson(url);
  const news = Array.isArray(json?.news_results) ? json.news_results : [];
  return {
    results: news.slice(0, 10).map((item) =>
      normalizeResult({
        title: item.title,
        url: item.link,
        snippet: item.snippet || item.date || item.source,
        publishedAt: item.date,
        sourceName: item.source?.name || item.source || hostname(item.link),
        connector: "serpapi_google_news",
        channelHint,
        query,
      }),
    ),
  };
}

async function searchNewsApi(query, channelHint = "newsMedia") {
  const params = new URLSearchParams({ q: query, apiKey: NEWSAPI_KEY, pageSize: "10", sortBy: "relevancy", language: "en" });
  const url = `https://newsapi.org/v2/everything?${params.toString()}`;
  const json = await fetchJson(url);
  const articles = Array.isArray(json?.articles) ? json.articles : [];
  return {
    results: articles.slice(0, 10).map((article) =>
      normalizeResult({
        title: article.title,
        url: article.url,
        snippet: article.description || article.content,
        publishedAt: article.publishedAt,
        sourceName: article.source?.name,
        connector: "newsapi_everything",
        channelHint,
        query,
      }),
    ),
  };
}

async function searchPubMed(query) {
  const searchParams = new URLSearchParams({
    db: "pubmed",
    term: query,
    retmode: "json",
    retmax: "8",
    sort: "relevance",
    tool: "la-verite",
  });
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${searchParams.toString()}`;
  const searchJson = await fetchJson(searchUrl);
  const ids = searchJson?.esearchresult?.idlist || [];
  if (!ids.length) return { results: [] };

  const summaryParams = new URLSearchParams({
    db: "pubmed",
    id: ids.join(","),
    retmode: "json",
    tool: "la-verite",
  });
  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${summaryParams.toString()}`;
  const summaryJson = await fetchJson(summaryUrl);
  const result = summaryJson?.result || {};
  const uids = result.uids || ids;
  return {
    results: uids.slice(0, 8).map((id) => {
      const item = result[id] || {};
      const journal = item.fulljournalname || item.source || "PubMed";
      const pubdate = item.pubdate || item.epubdate || "";
      const authors = Array.isArray(item.authors) ? item.authors.slice(0, 2).map((author) => author.name).filter(Boolean).join(", ") : "";
      return normalizeResult({
        title: item.title || `PubMed ${id}`,
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        snippet: `${pubdate} · ${journal}${authors ? ` · ${authors}` : ""}`,
        publishedAt: pubdate,
        sourceName: journal,
        connector: "pubmed_search",
        channelHint: "academic",
        query,
      });
    }),
  };
}

async function searchCrossref(query) {
  const params = new URLSearchParams({ query, rows: "8", sort: "relevance", order: "desc" });
  const url = `https://api.crossref.org/works?${params.toString()}`;
  const json = await fetchJson(url);
  const items = json?.message?.items || [];
  return {
    results: items.slice(0, 8).map((item) => {
      const title = Array.isArray(item.title) ? item.title[0] : item.title;
      const container = Array.isArray(item["container-title"]) ? item["container-title"][0] : item["container-title"];
      const publishedAt = crossrefDate(item);
      const doiUrl = item.DOI ? `https://doi.org/${item.DOI}` : item.URL;
      return normalizeResult({
        title: title || item.DOI || "Crossref work",
        url: item.URL || doiUrl,
        snippet: `${publishedAt || "date unknown"} · ${container || item.publisher || "Crossref"} · ${item.type || "work"}${item["is-referenced-by-count"] ? ` · cited ${item["is-referenced-by-count"]}` : ""}`,
        publishedAt,
        sourceName: container || item.publisher || "Crossref",
        connector: "crossref_works",
        channelHint: "academic",
        query,
      });
    }).filter((result) => result.title && result.url),
  };
}

function crossrefDate(item) {
  const parts =
    item?.published?.["date-parts"]?.[0] ||
    item?.["published-print"]?.["date-parts"]?.[0] ||
    item?.["published-online"]?.["date-parts"]?.[0] ||
    item?.created?.["date-parts"]?.[0] ||
    [];
  if (!parts.length) return "";
  const [year, month = 1, day = 1] = parts;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildVerificationContext(input, results = []) {
  const direct = results
    .filter((item) => item.connector === "direct_url")
    .map((item) => `${item.title || ""} ${item.snippet || ""}`)
    .join(" ");
  return safeText(`${input.text || ""} ${input.sourceName || ""} ${direct}`.trim()).slice(0, 1800);
}

function buildClaimContextFrame(contextText) {
  const text = String(contextText || "");
  const concepts = matchedCrossLingualConcepts(text);
  const groups = semanticConceptGroups(text);
  const years = unique((text.match(/\b20\d{2}\b/g) || []).slice(0, 8));
  const dates = unique((text.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\d{1,2}\s+月\s*\d{0,2}\s*日?|\d{4}[-/.年]\d{1,2}[-/.月]\d{0,2}/gi) || []).slice(0, 8));
  const numbers = unique((text.match(/(?:\d+(?:\.\d+)?)(?:\s?%|万|亿|万人|亿美元|美元|元|mw|gw|票|倍|x)?/gi) || []).slice(0, 10));
  return {
    raw: text,
    concepts,
    groups,
    entities: concepts.filter((concept) => concept.kind === "entity"),
    actions: concepts.filter((concept) => concept.kind === "action"),
    topics: concepts.filter((concept) => concept.kind === "topic"),
    years,
    dates,
    numbers,
    isAnalytical: /(观察|分析|评论|三重|主线|考验|影响|意味着|前景|why it matters|analysis|opinion|explainer|takeaway|challenge|risk|pressure)/i.test(text),
  };
}

function contextualMatchProfile(resultText, frame, input) {
  const text = String(resultText || "");
  const entityMatches = matchedConceptIds(frame.entities, text);
  const actionMatches = matchedConceptIds(frame.actions, text);
  const topicMatches = matchedConceptIds(frame.topics, text);
  const conceptMatches = matchedConceptIds(frame.concepts, text);
  const yearMatches = frame.years.filter((year) => text.includes(year));
  const dateMatches = frame.dates.filter((date) => looseTextIncludes(text, date));
  const numberMatches = frame.numbers.filter((number) => looseTextIncludes(text, number));
  const entityCoverage = coverage(entityMatches.length, frame.entities.length);
  const actionCoverage = coverage(actionMatches.length, frame.actions.length);
  const topicCoverage = coverage(topicMatches.length, frame.topics.length);
  const conceptCoverage = coverage(conceptMatches.length, frame.concepts.length);
  const temporalCoverage = Math.max(coverage(yearMatches.length + dateMatches.length, frame.years.length + frame.dates.length), frame.years.length || frame.dates.length ? 0 : 0.55);
  const numericCoverage = frame.numbers.length ? coverage(numberMatches.length, frame.numbers.length) : 0.55;
  const coreCoverage = clamp((entityCoverage * 0.34 + actionCoverage * 0.24 + topicCoverage * 0.22 + temporalCoverage * 0.12 + numericCoverage * 0.08) * 100);
  const semantic = semanticOverlapScore(text, frame.raw || input.text || "");
  const score = clamp(coreCoverage * 0.72 + semantic * 0.28);
  const hasCoreEntity = frame.entities.length ? entityCoverage >= 0.34 : conceptCoverage >= 0.34;
  const hasContext = actionCoverage >= 0.34 || topicCoverage >= 0.34 || temporalCoverage >= 0.5 || semantic >= 58;
  const actionRequired = frame.actions.length ? actionCoverage >= 0.5 : true;
  const topicRequired = frame.topics.length >= 2 ? topicCoverage >= 0.5 : true;
  const conceptRequired = frame.concepts.length >= 3 ? conceptCoverage >= 0.6 : conceptCoverage >= 0.45;
  const concreteSupportive = hasCoreEntity && actionRequired && topicRequired && conceptRequired && score >= 55;
  const analyticalSupportive = hasCoreEntity && hasContext && score >= 45;
  const supportive = frame.isAnalytical ? analyticalSupportive : concreteSupportive;
  const role = supportive ? (frame.isAnalytical ? "上下文语义支持" : "事实链语义支持") : score >= 42 ? "背景相关" : "弱相关";
  const reasons = [];
  if (entityMatches.length) reasons.push(`主体:${entityMatches.slice(0, 4).join(",")}`);
  if (actionMatches.length) reasons.push(`动作:${actionMatches.slice(0, 3).join(",")}`);
  if (topicMatches.length) reasons.push(`主题:${topicMatches.slice(0, 4).join(",")}`);
  if (yearMatches.length || dateMatches.length) reasons.push(`时间:${[...yearMatches, ...dateMatches].slice(0, 3).join(",")}`);
  if (numberMatches.length) reasons.push(`数字:${numberMatches.slice(0, 3).join(",")}`);
  return {
    score,
    role,
    supportive,
    entityCoverage: clamp(entityCoverage * 100),
    actionCoverage: clamp(actionCoverage * 100),
    topicCoverage: clamp(topicCoverage * 100),
    temporalCoverage: clamp(temporalCoverage * 100),
    numericCoverage: clamp(numericCoverage * 100),
    conceptCoverage: clamp(conceptCoverage * 100),
    matchedConcepts: conceptMatches,
    reasons,
  };
}

function contextSupportScore(contextMatch, localSignals) {
  if (!contextMatch?.supportive) return clamp(24 + (contextMatch?.score || 0) * 0.42);
  const analysisBonus = localSignals.analysisClaim ? 8 : 0;
  return clamp(46 + contextMatch.score * 0.48 + analysisBonus);
}

function matchedConceptIds(concepts, text) {
  return unique((concepts || [])
    .filter((concept) => (concept.patterns || []).some((pattern) => pattern.test(text)))
    .map((concept) => concept.id || concept.patterns?.[0]?.source || "concept"));
}

function coverage(matches, total) {
  if (!total) return 0;
  return Math.min(1, matches / total);
}

function looseTextIncludes(text, token) {
  const left = String(text || "").replace(/\s+/g, "").toLowerCase();
  const right = String(token || "").replace(/\s+/g, "").toLowerCase();
  return Boolean(right && left.includes(right));
}

function scoreEvidence(bundle, input, localSignals) {
  const verificationContext = buildVerificationContext(input, bundle.results);
  const claimFrame = buildClaimContextFrame(verificationContext || input.text);
  const claimTerms = expandClaimTerms(verificationContext || input.text).map((term) => term.toLowerCase());
  const scored = bundle.results.map((result) => {
    const tierInfo = classifySource(result.url, result.sourceName, result.channelHint, result.connector);
    const text = `${result.title} ${result.snippet} ${result.sourceName}`.toLowerCase();
    const contextMatch = contextualMatchProfile(text, claimFrame, input);
    const keywordRelevance = relevanceScore(text, claimTerms, input.text);
    const semanticSupport = supportScore(text, input.text);
    const relevance = Math.max(keywordRelevance, clamp(18 + contextMatch.score * 0.78));
    const support = Math.max(semanticSupport, contextSupportScore(contextMatch, localSignals));
    const contradiction = contradictionScore(text, input.text, result.channelHint);
    const recency = recencyScore(result.publishedAt);
    const freshness = evidenceFreshness(result.publishedAt, input, localSignals);
    const counterProbe = result.channelHint === "counter_evidence";
    const academicQuality = academicQualityScore(text, result.url, result.connector);
    const finalScore = clamp(Math.round(tierInfo.score * 0.32 + relevance * 0.19 + support * 0.16 + contextMatch.score * 0.14 + recency * 0.16 + (tierInfo.channel === "academicEvidence" ? academicQuality * 0.1 : 0) + (counterProbe ? contradiction * 0.14 : 0) - contradiction * 0.2 - freshness.penalty));
    return {
      ...result,
      tier: tierInfo.tier,
      channel: tierInfo.channel,
      sourceScore: tierInfo.score,
      relevance,
      keywordRelevance,
      support,
      contradiction,
      recency,
      freshness,
      academicQuality,
      contextMatch,
      contextScore: contextMatch.score,
      contextRole: contextMatch.role,
      contextReasons: contextMatch.reasons,
      score: finalScore,
      counterProbe,
      stance: stanceForEvidence({ support, contradiction, resultText: text, input, localSignals, contextMatch }),
    };
  }).filter((item) => item.relevance >= 35 || item.contextScore >= 48 || (item.sourceScore >= 90 && (item.relevance >= 25 || item.contextScore >= 35)));

  const { representatives, duplicateClusters } = clusterSameStoryResults(scored, input);
  const top = representatives.sort((a, b) => b.score - a.score).slice(0, 30);
  const refuting = representatives
    .filter((item) => item.stance === "反驳")
    .sort((a, b) => b.contradiction - a.contradiction || b.score - a.score)
    .slice(0, 8);
  const channels = buildChannelScores(top, input, localSignals);
  const supporting = top.filter((item) => item.stance === "支持" && supportEligibleForClaim(item, input, localSignals)).slice(0, 10);
  return {
    all: top,
    supporting,
    refuting,
    background: top.filter((item) => item.stance === "背景").slice(0, 8),
    channels,
    contextFrame: claimFrame,
    duplicateClusters,
  };
}

function supportEligibleForClaim(item, input, localSignals) {
  if (localSignals.timeSensitiveNews && !freshEnoughForSupport(item, input, localSignals)) return false;
  if (!isOutcomeClaimRequiringConfirmation(input, localSignals)) return true;
  const text = `${item.title || ""} ${item.snippet || ""} ${item.sourceName || ""}`.toLowerCase();
  const host = hostname(item.url);
  const strongSource = item.tier === "T0" || item.tier === "T1" || item.channel === "authoritativeStatement" || item.channel === "primaryRecord" || /reuters\.com|apnews\.com|bbc\.|bloomberg\.com|fifa\.com|the-afc\.com|thecfa\.cn/i.test(host);
  return strongSource && outcomeConfirmationSignal(text, input.text) >= 65;
}

function freshEnoughForSupport(item, input, localSignals) {
  if (hasHistoricalDateSignal(input.text)) return true;
  const freshness = item.freshness || evidenceFreshness(item.publishedAt, input, localSignals);
  if (freshness.level === "fresh" || freshness.level === "recent") return true;
  const text = `${item.title || ""} ${item.snippet || ""} ${item.sourceName || ""}`.toLowerCase();
  const host = hostname(item.url);
  const primaryLiveSource = item.tier === "T0" || item.channel === "primaryRecord" || item.channel === "authoritativeStatement" || /reuters\.com|apnews\.com|bbc\.|bloomberg\.com|fifa\.com|the-afc\.com|thecfa\.cn/i.test(host);
  if (freshness.level === "unknown") return primaryLiveSource && outcomeConfirmationSignal(text, input.text) >= 78;
  return false;
}

function clusterSameStoryResults(items = [], input) {
  const groups = new Map();
  for (const item of items) {
    const key = storyClusterKey(item, input);
    const bucket = groups.get(key) || [];
    bucket.push(item);
    groups.set(key, bucket);
  }

  const representatives = [];
  const duplicateClusters = [];
  for (const [key, group] of groups.entries()) {
    const sorted = [...group].sort((a, b) => representativePriority(b) - representativePriority(a));
    const representative = { ...sorted[0] };
    const sources = unique(group.map((item) => hostname(item.url) || item.sourceName || item.connector).filter(Boolean));
    const urls = unique(group.map((item) => item.url).filter(Boolean));
    representative.storyClusterKey = key;
    representative.duplicateCount = group.length;
    representative.duplicateSources = sources;
    representative.clusteredUrls = urls.slice(0, 6);
    representative.sameStorySyndication = group.length > 1;
    representative.inputSourceCluster = isInputSourceCluster(representative, group, input);
    if (representative.inputSourceCluster) {
      representative.stance = "输入原文";
      representative.contextRole = "输入原文 / 同源分发";
      representative.support = Math.min(representative.support || 0, 45);
      representative.score = Math.min(representative.score || 0, 58);
    }
    if (group.length > 1) {
      duplicateClusters.push({
        key,
        title: representative.title,
        count: group.length,
        sources,
        representativeUrl: representative.url,
      });
    }
    representatives.push(representative);
  }
  return { representatives, duplicateClusters: duplicateClusters.sort((a, b) => b.count - a.count).slice(0, 12) };
}

function isInputSourceCluster(representative, group, input) {
  const inputKey = normalizedStoryTitle(input?.text || "");
  const inputBody = compactStoryText(`${input?.text || ""} ${input?.sourceName || ""}`);
  const representativeTitle = compactStoryText(representative.title || "");
  const hasDirectUrl = group.some((item) => item.connector === "direct_url");
  const sameUrl = input?.url && group.some((item) => sameArticleUrl(item.url, input.url));
  const sameTitle = inputKey.length >= 12 && storyTitlesOverlap(normalizedStoryTitle(representative.title || ""), inputKey);
  const titleInInput = representativeTitle.length >= 12 && inputBody.includes(representativeTitle);
  return Boolean(hasDirectUrl || sameUrl || sameTitle || titleInInput);
}

function representativePriority(item) {
  return (item.connector === "direct_url" ? 1000 : 0) + (item.tier === "T0" ? 180 : item.tier === "T1" ? 120 : item.tier === "T2" ? 80 : 0) + (item.sourceScore || 0) + (item.contextScore || 0) * 0.35 + (item.score || 0) * 0.25;
}

function storyClusterKey(item, input) {
  const titleKey = normalizedStoryTitle(item.title || "");
  const inputKey = normalizedStoryTitle(input?.text || "");
  const combined = normalizedStoryTitle(`${item.title || ""} ${item.snippet || ""}`);
  if (inputKey.length >= 12 && storyTitlesOverlap(combined || titleKey, inputKey)) return `claim:${inputKey}`;
  if (titleKey.length >= 12) return `title:${titleKey}`;
  return `url:${canonicalUrl(item.url || `${item.connector}:${item.title}`)}`;
}

function normalizedStoryTitle(value) {
  let text = safeText(value || "").toLowerCase();
  text = text.replace(/<[^>]+>/g, " ");
  text = text.split(/\s[-–—_]\s|[|｜]|[_]/)[0] || text;
  text = text.replace(/^[\u4e00-\u9fa5a-z0-9]{2,12}丨/u, "");
  text = text.replace(/[-–—_][\u4e00-\u9fa5a-z0-9\s]*(网|新闻|客户端|app|时间|日报|晚报|时报|在线|快讯).*$/giu, "");
  text = text.replace(/(手机)?新浪网|腾讯新闻|网易新闻|搜狐新闻|凤凰网|澎湃新闻|央视新闻客户端|21经济网|财联社|齐鲁晚报网|新黄河app|北京时间|来源[:：].*$/gi, "");
  text = text.replace(/[\s"'“”‘’.,，。:：;；!?！？()[\]{}<>《》【】_-]+/g, "");
  return text.slice(0, 90);
}

function compactStoryText(value) {
  let text = safeText(value || "").toLowerCase();
  text = text.replace(/https?:\/\/\S+/g, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/^[\u4e00-\u9fa5a-z0-9]{2,12}丨/u, "");
  text = text.replace(/(手机)?新浪网|腾讯新闻|网易新闻|搜狐新闻|凤凰网|澎湃新闻|央视新闻客户端|21经济网|财联社|齐鲁晚报网|新黄河app|北京时间|来源[:：].*$/gi, "");
  text = text.replace(/[\s"'“”‘’.,，。:：;；!?！？()[\]{}<>《》【】_-]+/g, "");
  return text.slice(0, 260);
}

function storyTitlesOverlap(left, right) {
  if (!left || !right) return false;
  if (left.includes(right) || right.includes(left)) return true;
  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  const minWindow = Math.min(24, Math.max(12, shorter.length - 4));
  for (let i = 0; i <= shorter.length - minWindow; i += 1) {
    if (longer.includes(shorter.slice(i, i + minWindow))) return true;
  }
  return false;
}

function buildChannelScores(results, input, localSignals) {
  const channelMap = new Map(Object.entries(channelLabels).map(([id, label]) => [id, { id, label, status: "未命中", score: 0, role: defaultRole(id), note: `未识别${label}证据`, count: 0 }]));
  if (input.media.length) {
    const mediaIntegrity = localSignals.mediaIntegrity || analyzeMediaIntegrity(input.media);
    channelMap.set("uploadedMedia", { id: "uploadedMedia", label: channelLabels.uploadedMedia, status: "已命中", score: mediaIntegrity.score, role: "媒介取证", note: `${input.media.length} 个素材 · ${mediaIntegrity.status}`, count: input.media.length });
  }
  for (const result of results) {
    if (result.inputSourceCluster) continue;
    const ids = inferredChannelsForResult(result);
    for (const id of ids) {
      const existing = channelMap.get(id) || { id, label: channelLabels[id] || id, status: "未命中", score: 0, role: defaultRole(id), note: "", count: 0 };
      existing.status = "已命中";
      existing.score = Math.max(existing.score, result.score);
      existing.count += 1;
      existing.note = `${existing.count} 条 · 最高 ${hostname(result.url) || result.sourceName || result.connector}`;
      channelMap.set(id, existing);
    }
  }

  const academic = channelMap.get("academicEvidence");
  if (academic && !localSignals.needsAcademicEvidence && academic.status === "未命中") {
    academic.status = "跳过";
    academic.role = "按需验证";
    academic.note = localSignals.academicReason || "未识别科学 / 医疗 / 论文类信息，跳过学术渠道";
    channelMap.set("academicEvidence", academic);
  }

  if (localSignals.shortAtomicClaim) {
    for (const channel of channelMap.values()) {
      if (channel.status === "未命中" && channel.id !== "uploadedMedia" && (channel.id !== "academicEvidence" || localSignals.needsAcademicEvidence)) {
        channel.status = "待检索";
        channel.note = `待检索：${channel.label}`;
      }
    }
  }

  return [...channelMap.values()];
}

function buildReport(input, localSignals, evidence, bundle) {
  const profile = profiles[input.type] || profiles.event;
  const angleScores = calculateAngleScores(input, localSignals, evidence);
  const rawScore = Object.entries(profile.weights).reduce((sum, [key, weight]) => sum + angleScores[key].score * weight, 0);
  const cap = calculateCap(input, localSignals, evidence);
  const finalScore = Math.round(Math.min(rawScore, cap.value));
  const verdict = verdictFor(finalScore);
  const evidenceRows = buildEvidenceRows(input, localSignals, evidence);
  const riskRows = buildRiskRows(input, localSignals, evidence, bundle);

  return {
    url: input.url,
    text: input.text,
    type: input.type,
    impact: input.impact,
    sourceName: input.sourceName,
    media: input.media,
    claims: input.claimPlan,
    profile,
    angleScores,
    rawScore,
    finalScore,
    cap,
    verdict,
    analysisSummary: buildAnalysisSummary(input, localSignals, evidence, bundle, angleScores, finalScore, cap, verdict, evidenceRows, riskRows),
    evidence: evidenceRows,
    risks: riskRows,
    sources: buildSourceRows(evidence),
    channels: evidence.channels,
    links: buildReportLinks(evidence),
    mediaIntegrity: localSignals.mediaIntegrity,
    retrievalPlan: bundle.retrievalPlan,
    mediaWorkflow: buildMediaWorkflow(input, localSignals),
    aiCommittee: AI_COMMITTEE_ENABLED ? buildAiCommitteeReview(input, localSignals, evidence, angleScores, finalScore, cap) : null,
    review: buildReviewPlan(input, localSignals, evidence),
    retrievedAt: new Date().toISOString(),
  };
}

function calculateAngleScores(input, localSignals, evidence) {
  const supports = evidence.supporting;
  const refutes = evidence.refuting;
  const channelHits = evidence.channels.filter((channel) => channel.status === "已命中");
  const strongChannels = channelHits.filter((channel) => channel.score >= 75);
  const externalEvidence = evidence.all.filter((item) => !item.inputSourceCluster);
  const topSupport = supports[0]?.score || 0;
  const topSource = externalEvidence[0]?.sourceScore || 0;
  const refutePenalty = Math.min(35, refutes.length * 10 + (refutes[0]?.score || 0) * 0.12);
  const highImpactMissing = input.impact === "high" && strongChannels.length < 2;
  const academicHit = evidence.channels.some((channel) => channel.id === "academicEvidence" && channel.status === "已命中");
  const academicMissingPenalty = localSignals.needsAcademicEvidence && !academicHit ? 12 : 0;
  const contextSignal = aggregateContextSignal(evidence.all);

  const web = clamp(35 + topSupport * 0.28 + topSource * 0.16 + contextSignal.score * 0.18 + channelHits.length * 5 + strongChannels.length * 4 + (academicHit ? 5 : 0) - refutePenalty - academicMissingPenalty * 0.4);
  const logic = clamp(56 + (supports.length ? 10 : 0) + contextSignal.score * 0.16 + (localSignals.shortAtomicClaim ? 5 : 0) + (highImpactMissing ? -8 : 0) - refutePenalty * 0.25 - academicMissingPenalty * 0.25);
  const history = clamp(54 + (supports.some((item) => item.publishedAt && recencyScore(item.publishedAt) > 70) ? 8 : 0) + (supports.some((item) => item.tier === "T1" || item.tier === "T2") ? 10 : 0) + contextSignal.diversity * 3 - refutes.length * 5);
  const sourceChain = clamp(38 + (externalEvidence.some((item) => item.tier === "T0") ? 25 : 0) + (externalEvidence.some((item) => item.tier === "T1") ? 16 : 0) + channelHits.length * 4 + contextSignal.strongCount * 3 + (academicHit ? 8 : 0) - refutes.length * 7 - academicMissingPenalty);
  const realWorld = clamp(43 + (channelHits.some((item) => item.id === "realWorldTrace") ? 20 : 0) + (externalEvidence.some((item) => /effective|permit|market|price|date|filing|statement|声明|生效|市场|文件/.test(`${item.title} ${item.snippet}`.toLowerCase())) ? 15 : 0) + (supports.length ? 8 : 0) + contextSignal.score * 0.08);
  const stats = clamp((localSignals.hasNumbers ? 60 : 64) + (externalEvidence.some((item) => /data|capacity|price|market|barrel|production|quota|数字|产量|价格|sample|trial|cohort|meta.?analysis/.test(`${item.title} ${item.snippet}`.toLowerCase())) ? 10 : 0) + (academicHit ? 8 : 0) + contextSignal.score * 0.04 - (localSignals.extremePercent ? 25 : 0) - academicMissingPenalty);
  const mediaIntegrity = localSignals.mediaIntegrity || analyzeMediaIntegrity(input.media);
  const mediaAdjustment = mediaIntegrity.hasMedia ? (mediaIntegrity.score - 62) * 0.72 : 0;
  const integrity = clamp(62 + (input.url ? 8 : 0) + (supports.length ? 8 : 0) + (externalEvidence.some((item) => item.tier === "T0") ? 12 : 0) + mediaAdjustment - refutes.length * 4);

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

function aggregateContextSignal(items = []) {
  const contextual = items.filter((item) => !item.inputSourceCluster && item.contextScore >= 45);
  const strong = contextual.filter((item) => item.contextScore >= 65);
  const sources = new Set(contextual.map((item) => hostname(item.url) || item.sourceName || item.connector).filter(Boolean));
  const avgTop = contextual.slice(0, 6).reduce((sum, item) => sum + item.contextScore, 0) / Math.max(1, Math.min(6, contextual.length));
  return {
    score: clamp(avgTop + Math.min(18, sources.size * 3) + Math.min(10, strong.length * 2)),
    count: contextual.length,
    strongCount: strong.length,
    diversity: sources.size,
  };
}

function calculateCap(input, localSignals, evidence) {
  const supports = evidence.supporting;
  const strongChannels = evidence.channels.filter((channel) => channel.status === "已命中" && channel.score >= 75);
  const hasOfficialOrPrimary = evidence.all.some((item) => !item.inputSourceCluster && (item.tier === "T0" || item.channel === "authoritativeStatement" || item.channel === "primaryRecord"));
  const strongSupportCount = supports.filter((item) => ["T0", "T1", "T2"].includes(item.tier)).length;
  const weakSupportCount = supports.filter((item) => item.tier === "T3" || item.tier === "T4").length;
  const hasAcademicEvidence = evidence.channels.some((channel) => channel.id === "academicEvidence" && channel.status === "已命中");
  const hasDirectOutcomeConfirmation = isOutcomeClaimRequiringConfirmation(input, localSignals) && evidence.supporting.some((item) => {
    const text = `${item.title || ""} ${item.snippet || ""} ${item.sourceName || ""}`.toLowerCase();
    const host = hostname(item.url);
    const strongSource = item.tier === "T0" || item.tier === "T1" || item.channel === "authoritativeStatement" || item.channel === "primaryRecord" || /reuters\.com|apnews\.com|bbc\.|bloomberg\.com|fifa\.com|the-afc\.com|thecfa\.cn/i.test(host);
    return strongSource && outcomeConfirmationSignal(text, input.text) >= 65;
  });
  const mediaIntegrity = localSignals.mediaIntegrity;
  const caps = [];
  if (!supports.length) {
    const value = localSignals.specificNamedEvent ? 38 : localSignals.shortAtomicClaim ? 58 : 55;
    const note = localSignals.specificNamedEvent ? "具体人物 / 机构事件未找到直接支持证据" : localSignals.shortAtomicClaim ? "待联网交叉验证" : "未找到支持证据";
    caps.push({ value, note });
  }
  if (input.impact === "high" && strongChannels.length < 2) caps.push({ value: hasOfficialOrPrimary ? 84 : 69, note: "高影响需至少两个强渠道" });
  if (supports.length && strongSupportCount === 0 && weakSupportCount > 0) caps.push({ value: input.impact === "high" ? 57 : 64, note: "缺少 T0-T2 权威来源，现有支持主要来自低等级来源" });
  else if (input.impact === "high" && supports.length && strongSupportCount < 2) caps.push({ value: Math.min(hasOfficialOrPrimary ? 82 : 68, 82), note: "高影响信息需要至少两个 T0-T2 独立来源" });
  if (isOutcomeClaimRequiringConfirmation(input, localSignals) && !hasDirectOutcomeConfirmation) caps.push({ value: isSportsQualificationClaim(input.text) ? 42 : 52, note: "结果型短讯缺少官方 / 主流媒体直接确认" });
  if (localSignals.needsAcademicEvidence && !hasAcademicEvidence) caps.push({ value: input.impact === "high" ? 62 : 72, note: "科学/医疗类缺少学术或指南证据" });
  if (localSignals.extremePercent) caps.push({ value: 59, note: "统计异常需强证据" });
  if (mediaIntegrity?.criticalForgeryRisk && !hasOfficialOrPrimary) caps.push({ value: 58, note: "上传素材存在 PS/AI 造假高风险" });
  else if (mediaIntegrity?.forgeryConcern && !hasOfficialOrPrimary) caps.push({ value: 72, note: "上传素材存在媒介完整性疑点" });
  if (evidence.refuting.some((item) => item.tier === "T0")) caps.push({ value: 20, note: "权威来源反驳" });
  if (!caps.length) return { value: 100, note: "无" };
  return caps.sort((a, b) => a.value - b.value)[0];
}

function buildAnalysisSummary(input, localSignals, evidence, bundle, angleScores, finalScore, cap, verdict, evidenceRows = [], riskRows = []) {
  const supportCount = evidence.supporting.length;
  const refuteCount = evidence.refuting.length;
  const hitChannels = evidence.channels.filter((channel) => channel.status === "已命中");
  const strongChannels = hitChannels.filter((channel) => channel.score >= 75);
  const topAngles = Object.entries(angleScores)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 2)
    .map(([key, item]) => `${angleLabel(key)} ${item.score}%`);
  const weakAngles = Object.entries(angleScores)
    .sort((a, b) => a[1].score - b[1].score)
    .slice(0, 2)
    .map(([key, item]) => `${angleLabel(key)} ${item.score}%`);

  let lead = `本次验证给出 ${finalScore}%（${verdict.label}）。`;
  if (supportCount && !refuteCount) {
    lead += ` 系统找到 ${supportCount} 条支持证据，暂未发现强反证。`;
  } else if (supportCount && refuteCount) {
    lead += ` 系统同时找到 ${supportCount} 条支持证据和 ${refuteCount} 条反向线索，需要重点看时间、语义和来源链。`;
  } else if (!supportCount && refuteCount) {
    lead += ` 系统未找到可靠支持证据，但发现 ${refuteCount} 条反向线索。`;
  } else {
    lead += localSignals.specificNamedEvent
      ? " 这是一个具体人物 / 机构事件，但没有找到直接支持证据，因此被压到低可信区间。"
      : " 系统没有找到可以直接支撑原信息的独立证据，结论应保持谨慎。";
  }

  if (strongChannels.length) lead += ` 较强的渠道信号来自 ${strongChannels.slice(0, 3).map((channel) => channel.label).join("、")}。`;
  else if (hitChannels.length) lead += ` 目前命中的多为背景渠道，还不足以单独证明原信息。`;

  if (cap.value < 100) lead += ` 当前总分受到“${cap.note}”封顶限制。`;
  if (localSignals.mediaIntegrity?.hasMedia) lead += ` 上传素材的媒介完整性结论为：${localSignals.mediaIntegrity.status}。`;

  const points = [];
  points.push(`支持证据 ${supportCount} 条`);
  points.push(`反向线索 ${refuteCount} 条`);
  points.push(`命中渠道 ${hitChannels.length} 个`);
  if (bundle.retrievalPlan?.savedJobs) points.push(`节省检索 ${bundle.retrievalPlan.savedJobs} 项`);
  if (evidence.duplicateClusters?.length) points.push(`同源聚类 ${evidence.duplicateClusters.length} 组`);
  if (input.claimPlan?.activeClaims?.length) points.push(`关键判断点 ${input.claimPlan.activeClaims.length} 个`);
  if (topAngles.length) points.push(`强项：${topAngles.join(" / ")}`);
  if (weakAngles.length) points.push(`弱项：${weakAngles.join(" / ")}`);

  const riskText = riskRows
    .filter((row) => row?.[2] === "-")
    .slice(0, 2)
    .map((row) => row[1])
    .join("；");
  const recommendation = finalScore >= 75
    ? "整体可以作为较高可信线索使用，但仍建议保留关键证据链接。"
    : finalScore >= 60
      ? "整体可作为待确认信息参考，最好继续补充官方或原始来源。"
      : finalScore >= 45
        ? "整体证据不足或存在冲突，不建议作为确定事实传播。"
        : "整体偏低可信，除非后续出现原始文件、官方声明或多家独立报道，否则不建议采信。";

  return {
    score: finalScore,
    verdict: verdict.label,
    text: `${lead}${riskText ? ` 主要可疑点是：${riskText}。` : ""} ${recommendation}`,
    points: unique(points).slice(0, 8),
  };
}

function angleLabel(key) {
  return {
    web: "联网检索",
    logic: "逻辑",
    history: "历史",
    sourceChain: "来源链",
    realWorld: "现实旁证",
    stats: "统计",
    integrity: "媒介完整性",
  }[key] || key;
}

function buildEvidenceRows(input, localSignals, evidence) {
  const rows = [];
  if (localSignals.shortAtomicClaim) rows.push(["中性", "短句已识别为可直接核验的信息", "+"]);
  if (localSignals.englishNetworkEnabled) rows.push(["中性", `已启用英语信息网络交叉验证：${localSignals.englishConcepts.slice(0, 5).join(", ") || "通用英语检索"}`, "+"]);
  if (localSignals.analysisClaim && evidence.supporting.length) rows.push(["支持", "分析型报道：按同一事件链 / 政策背景做语义交叉支持", "+"]);
  if (localSignals.timeSensitiveNews) {
    const freshness = aggregateFreshnessSignal(evidence.supporting.length ? evidence.supporting : evidence.all);
    rows.push([freshness.supportive ? "支持" : "中性", `时间置信：${freshness.label} · ${freshness.note}`, `${freshness.score}`]);
  }
  const contextSignal = aggregateContextSignal(evidence.all);
  if (contextSignal.count) {
    const direction = evidence.supporting.length ? "支持" : "中性";
    const label = evidence.supporting.length ? "上下文深度匹配" : "背景上下文匹配";
    rows.push([direction, `${label}：${contextSignal.count} 条相关证据，${contextSignal.diversity} 个来源`, `${contextSignal.score}`]);
  }
  if (evidence.duplicateClusters?.length) {
    const duplicateCount = evidence.duplicateClusters.reduce((sum, cluster) => sum + cluster.count - 1, 0);
    rows.push(["中性", `同源转载已聚类：${evidence.duplicateClusters.length} 组，${duplicateCount} 条转载不计为独立支持`, "0"]);
  }
  const inputClusters = evidence.all.filter((item) => item.inputSourceCluster);
  if (inputClusters.length) {
    const inputClusterCount = inputClusters.reduce((sum, item) => sum + Math.max(1, item.duplicateCount || 1), 0);
    rows.push(["中性", `输入原文 / 同源分发已识别：${inputClusterCount} 条，仅用于来源链，不计为外部支持`, "0"]);
  }
  const directSupports = [...evidence.supporting].sort((a, b) => directClaimSignal(b, input.text) - directClaimSignal(a, input.text) || b.score - a.score);
  const titleDirect = directSupports.filter((item) => directTitleSignal(item, input.text) >= 60);
  const displaySupports = (titleDirect.length >= 3 ? titleDirect : directSupports).slice(0, 6);
  for (const item of displaySupports) rows.push(["支持", `${item.tier} · ${item.contextRole || "证据"} · ${item.title}${item.duplicateCount > 1 ? `（同源转载 ${item.duplicateCount} 条，按 1 条计）` : ""}`, `${item.score}`]);
  const hitChannels = evidence.channels.filter((channel) => channel.status === "已命中");
  if (hitChannels.length >= 2 && evidence.supporting.length) rows.push(["支持", `已命中 ${hitChannels.length} 个验证渠道`, "+"]);
  else if (hitChannels.length >= 2) rows.push(["中性", `命中 ${hitChannels.length} 个背景渠道，但未形成直接支持证据`, "0"]);
  const academicChannel = evidence.channels.find((channel) => channel.id === "academicEvidence");
  if (academicChannel?.status === "已命中") rows.push(["支持", `学术 / 期刊渠道命中 ${academicChannel.count || 1} 条`, "+"]);
  if (localSignals.mediaIntegrity?.hasMedia) {
    rows.push(["支持", `内容与媒介完整性：${localSignals.mediaIntegrity.status} · ${localSignals.mediaIntegrity.score}%`, `${localSignals.mediaIntegrity.score}`]);
    for (const item of localSignals.mediaIntegrity.positiveSignals.slice(0, 2)) rows.push(["支持", item, "+"]);
  }
  for (const item of evidence.refuting.slice(0, 3)) rows.push(["反驳", `${item.tier} · ${item.title}`, `-${item.score}`]);
  if (!rows.length) rows.push(["中性", "后端未找到可用证据", "0"]);
  return rows;
}

function buildRiskRows(input, localSignals, evidence, bundle) {
  const rows = [];
  const strongChannels = evidence.channels.filter((channel) => channel.status === "已命中" && channel.score >= 75);
  const externalEvidence = evidence.all.filter((item) => !item.inputSourceCluster);
  if (input.impact === "high" && strongChannels.length < 2) rows.push(["交叉", "高影响信息缺少两个强验证渠道", "-"]);
  if (evidence.supporting.length && !evidence.supporting.some((item) => ["T0", "T1", "T2"].includes(item.tier))) rows.push(["来源", "支持证据主要来自 T3/T4 来源，缺少权威来源确认", "-"]);
  if (!evidence.supporting.length) rows.push(["检索", localSignals.specificNamedEvent ? "具体人物 / 机构事件未找到直接支持，降为低可信" : "未找到支持证据，保持待验证", "-"]);
  const academicChannel = evidence.channels.find((channel) => channel.id === "academicEvidence");
  if (localSignals.needsAcademicEvidence && academicChannel?.status !== "已命中") rows.push(["学术", "该类信息需要学术论文、指南或注册试验辅助验证", "-"]);
  if (localSignals.timeSensitiveNews) {
    const staleSupports = evidence.all.filter((item) => item.stance === "支持" && item.freshness?.level === "stale");
    const unknownFreshness = evidence.all.filter((item) => item.stance === "支持" && item.freshness?.level === "unknown");
    if (staleSupports.length) rows.push(["时间", `发现 ${staleSupports.length} 条旧新闻支持线索，实时新闻中已降权`, "-"]);
    if (!evidence.supporting.length && unknownFreshness.length) rows.push(["时间", "部分网页缺少发布时间，不能作为实时新闻的直接支持", "-"]);
  }
  if (localSignals.analysisClaim && !externalEvidence.some((item) => item.contextScore >= 55)) rows.push(["上下文", "未找到足够的同主体 / 同事件链 / 同政策背景证据", "-"]);
  if (evidence.duplicateClusters?.length) rows.push(["同源", `发现 ${evidence.duplicateClusters.length} 组同源转载，已去重并只按代表来源计分`, "0"]);
  if (evidence.refuting.length) rows.push(["冲突", `发现 ${evidence.refuting.length} 条疑似反证或旧反证`, "-"]);
  if (localSignals.mediaIntegrity?.hasMedia) {
    for (const item of localSignals.mediaIntegrity.suspiciousSignals.slice(0, 5)) {
      rows.push(["媒介", item, "-"]);
    }
  }
  if (bundle.counterQueries?.length) rows.push(["反证", `已主动执行 ${bundle.counterQueries.length} 条证伪检索式`, "0"]);
  const errorSummary = bundle.errorSummary || summarizeSearchErrors(bundle.errors);
  if (errorSummary.length) rows.push(["连接器", `${errorSummary.length} 个检索连接器失败（${errorSummary.slice(0, 2).map((item) => `${item.connector}×${item.count}`).join("，")}）`, "-"]);
  if (localSignals.extremePercent) rows.push(["统计", "数字显著异常，需要硬证据", "-"]);
  if (!rows.length) rows.push(["低", "未触发主要风险项", "0"]);
  return rows;
}

function buildSourceRows(evidence) {
  const rows = [...evidence.all].sort((a, b) => (b.stance === "支持") - (a.stance === "支持") || directTitleSignal(b, "") - directTitleSignal(a, "") || directClaimSignal(b, "") - directClaimSignal(a, "") || b.score - a.score)
    .slice(0, 10)
    .map((item) => [hostname(item.url) || item.sourceName || item.connector, item.tier, item.score, item.duplicateCount > 1 ? `${item.stance} · 同源${item.duplicateCount}` : item.stance]);
  if (!rows.length) rows.push(["未找到", "T5", 18, "待补充"]);
  return rows;
}

function buildReportLinks(evidence) {
  const externalEvidence = evidence.all.filter((item) => !item.inputSourceCluster);
  const primaryEvidence = externalEvidence.filter((item) => item.stance === "支持" || item.tier === "T0" || item.channel === "primaryRecord" || item.channel === "authoritativeStatement");
  const suspiciousEvidence = evidence.all.filter((item) => item.stance === "反驳" || item.counterProbe || item.contradiction >= 45);
  const crossReports = externalEvidence.filter((item) => {
    const channels = inferredChannelsForResult(item);
    return channels.includes("newsMedia") || item.channel === "newsMedia";
  });
  const academicEvidence = externalEvidence.filter((item) => {
    return isAcademicEvidenceItem(item);
  });

  return {
    evidence: rankReportLinks([...evidence.supporting, ...primaryEvidence], "evidence").slice(0, 10),
    suspicious: rankReportLinks([...evidence.refuting, ...suspiciousEvidence], "suspicious").slice(0, 10),
    crossReports: rankReportLinks(crossReports, "crossReports").slice(0, 12),
    academic: rankReportLinks(academicEvidence, "academic").slice(0, 10),
  };
}

function buildMediaWorkflow(input, localSignals) {
  const media = Array.isArray(input.media) ? input.media : [];
  const integrity = localSignals.mediaIntegrity || {};
  if (!media.length) return { enabled: false, rows: [] };
  const detailRows = Array.isArray(integrity.details) ? integrity.details : [];
  const average = (pattern) => {
    const rows = detailRows.filter((row) => pattern.test(row.check || ""));
    return rows.length ? clamp(rows.reduce((sum, row) => sum + Number(row.score || 0), 0) / rows.length) : 50;
  };
  const keyframeCount = media.reduce((sum, item) => sum + (Array.isArray(item.videoKeyframes) ? item.videoKeyframes.length : 0), 0);
  const aiEnabled = media.some((item) => item.aiDetection?.enabled && !item.aiDetection?.unavailable);
  const aiUnavailable = media.some((item) => item.aiDetection?.unavailable);
  const workflow = [
    ["1", "上下文采集", input.url ? "已完成" : "部分完成", input.url ? 78 : 54, input.url ? "已保留原始 URL，可追踪来源链" : "未提供原始 URL，建议补充首发链接"],
    ["2", "元数据 / C2PA", integrity.c2paPresent ? "发现来源凭证" : detailRows.length ? "已扫描" : "待扫描", Math.max(average(/EXIF|C2PA/), integrity.c2paPresent ? 82 : 0), "读取 EXIF/XMP/ICC 与 C2PA/JUMBF 线索"],
    ["3", "关键帧 / 图片样本", keyframeCount ? "已抽帧" : media.some((item) => item.kind === "image") ? "已生成图片样本" : "待抽帧", keyframeCount ? 72 : 62, keyframeCount ? `${keyframeCount} 个关键帧进入取证` : "图片样本用于 ELA / AI 检测"],
    ["4", "反向搜索", "待外部检索", 50, "建议对原图和关键帧执行 Google / Yandex / Baidu / TinEye 反搜"],
    ["5", "取证滤镜", integrity.forgeryConcern ? "存在疑点" : "未见强异常", average(/压缩|ELA|JPEG/), "轻量 ELA、JPEG Ghost、压缩层、重采样代理指标"],
    ["6", "AI / Deepfake 检测", aiEnabled ? "已执行" : aiUnavailable ? "服务未响应" : "未启用", aiEnabled ? average(/AI 检测/) : 50, aiEnabled ? "本地服务已分析图片样本 / 视频关键帧" : "可设置 VERITE_MEDIA_AI=1 开启"],
    ["7", "地理定位 / 时间线", "待人工复核", 50, "需结合街景、天气、太阳角度、现场多视角和事件时间"],
  ];
  return {
    enabled: true,
    status: integrity.status || "待取证",
    rows: workflow,
  };
}

function rankReportLinks(items, group) {
  const uniqueItems = uniqueResultItems(items);
  return uniqueItems
    .sort((a, b) => {
      if (group === "suspicious") return b.contradiction - a.contradiction || b.score - a.score;
      if (group === "academic") return (b.academicQuality || 0) - (a.academicQuality || 0) || (b.sourceScore || 0) - (a.sourceScore || 0) || b.score - a.score;
      if (group === "crossReports") return (b.tier === "T1") - (a.tier === "T1") || (b.sourceScore || 0) - (a.sourceScore || 0) || b.score - a.score;
      return (b.tier === "T0") - (a.tier === "T0") || b.score - a.score || (b.sourceScore || 0) - (a.sourceScore || 0);
    })
    .map(toReportLink);
}

function isAcademicEvidenceItem(item) {
  const text = `${item.title || ""} ${item.snippet || ""} ${item.url || ""} ${item.sourceName || ""}`.toLowerCase();
  return /pubmed|crossref/.test(item.connector || "") || hasAcademicSourceSignal(text, hostname(item.url)) || /systematic review|meta.?analysis|randomi[sz]ed|clinical trial|peer.?review|journal article|practice guideline|doi:|doi\.org|临床试验|系统综述/.test(text);
}

function uniqueResultItems(items) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    if (!item?.url || !item?.title) continue;
    const key = item.storyClusterKey || `url:${canonicalUrl(item.url)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function toReportLink(item) {
  const channelIds = inferredChannelsForResult(item);
  return {
    title: safeText(item.title || item.url).slice(0, 180),
    url: item.url,
    source: hostname(item.url) || item.sourceName || item.connector || "unknown",
    tier: item.tier || "T3",
    score: item.score || 0,
    stance: item.stance || "背景",
    channel: channelLabels[channelIds[0]] || channelLabels[item.channel] || item.channel || "新闻媒体",
    match: item.contextRole || "",
    contextScore: item.contextScore || 0,
    duplicateCount: item.duplicateCount || 1,
    connector: item.connector || "",
    publishedAt: item.publishedAt || "",
  };
}

function buildAiCommitteeReview(input, localSignals, evidence, angleScores, finalScore, cap) {
  const supportCount = evidence.supporting.length;
  const refuteCount = evidence.refuting.length;
  const channelHits = evidence.channels.filter((channel) => channel.status === "已命中");
  const strongChannels = channelHits.filter((channel) => channel.score >= 75);
  const topSupport = evidence.supporting[0];
  const topRefute = evidence.refuting[0];
  const externalEvidence = evidence.all.filter((item) => !item.inputSourceCluster);
  const strongSources = externalEvidence.filter((item) => ["T0", "T1", "T2"].includes(item.tier));
  const hasPrimary = externalEvidence.some((item) => item.tier === "T0" || item.channel === "primaryRecord");
  const refuteStrength = topRefute ? Math.min(90, topRefute.score + refuteCount * 8) : 12;

  const agents = [
    committeeAgent({
      name: "支持证据 Agent",
      role: "验证正向证据",
      score: clamp(34 + (topSupport?.score || 0) * 0.46 + supportCount * 4 + strongChannels.length * 3 - refuteCount * 8),
      basis: topSupport ? `${topSupport.tier} · ${topSupport.title}` : "未找到直接支持证据",
      concern: supportCount >= 3 ? "支持证据数量足够，需继续看是否同源转载" : "支持证据偏少，需要更多独立来源",
      action: "保留最高质量原始链接和权威媒体快照",
    }),
    committeeAgent({
      name: "反证 Agent",
      role: "主动寻找否认 / 辟谣 / 更正",
      score: topRefute ? clamp(100 - refuteStrength) : clamp(74 + supportCount * 2 + strongSources.length * 2),
      basis: topRefute ? `${topRefute.tier} · ${topRefute.title}` : "未发现强反证或官方否认",
      concern: topRefute ? `存在 ${refuteCount} 条反向线索，需判定是否过期或语义相反` : "没有强反证不等于事实已完全定案",
      action: "继续保留否认、撤稿、更正类检索式",
    }),
    committeeAgent({
      name: "来源评级 Agent",
      role: "审查来源链和引用身份",
      score: clamp(42 + (hasPrimary ? 22 : 0) + strongSources.length * 6 + channelHits.length * 3 - (localSignals.anonymous ? 12 : 0)),
      basis: strongSources[0] ? `${strongSources.length} 个 T0-T2 来源，最高 ${strongSources[0].tier}` : "暂未命中 T0-T2 强来源",
      concern: hasPrimary ? "已出现原始或官方来源，仍需确认上下文是否支持原信息" : "来源链仍需追到原始发布者",
      action: "优先复核官方文件、原始公告、完整访谈文本",
    }),
    committeeAgent({
      name: "逻辑 / 反事实 Agent",
      role: "检查时间线和反事实冲突",
      score: angleScores.logic.score,
      basis: `逻辑角度 ${angleScores.logic.score} 分，封顶规则：${cap.note}`,
      concern: refuteCount ? "存在冲突线索，需要按时间和语义拆分" : "未发现主要逻辑冲突",
      action: "对照同期事件、制度流程和关键日期",
    }),
    committeeAgent({
      name: "历史 / 基准率 Agent",
      role: "比较历史模式和统计异常",
      score: clamp((angleScores.history.score + angleScores.stats.score) / 2),
      basis: `历史 ${angleScores.history.score} 分，基准率 ${angleScores.stats.score} 分`,
      concern: localSignals.extremePercent ? "数字异常明显，需要硬证据" : "未触发明显统计异常",
      action: "寻找过往相似案例和可量化基准",
    }),
    committeeAgent({
      name: "媒介取证 Agent",
      role: "图片 / 视频 / 截图完整性",
      score: input.media.length ? localSignals.mediaIntegrity.score : 58,
      basis: input.media.length ? `${input.media.length} 个上传素材 · ${localSignals.mediaIntegrity.status}` : "本次未上传图片或视频素材",
      concern: input.media.length ? (localSignals.mediaIntegrity.suspiciousSignals[0] || "仍需反向图片搜索、关键帧和地理定位") : "无媒介证据，无法进行 PS / AI 生成检测",
      action: input.media.length ? "补充 EXIF/C2PA、ELA、AI 检测、多引擎反搜和地理定位" : "如原信息依赖截图或视频，应补充原始素材",
    }),
  ];

  const consensusScore = clamp(agents.reduce((sum, agent) => sum + agent.score, 0) / agents.length);
  const adjustment = Math.max(-12, Math.min(12, Math.round((consensusScore - finalScore) * 0.35)));
  const disagreement = Math.max(...agents.map((agent) => agent.score)) - Math.min(...agents.map((agent) => agent.score));
  agents.push(committeeAgent({
    name: "裁判 Agent",
    role: "汇总多 Agent 结论",
    score: clamp(consensusScore * 0.7 + finalScore * 0.3),
    basis: `${agents.length} 个复核 Agent 的均值为 ${consensusScore}%`,
    concern: disagreement >= 28 ? "Agent 分歧较大，建议人工复核" : "Agent 分歧可控",
    action: adjustment ? `建议只作为解释层参考，评分偏差 ${adjustment > 0 ? "+" : ""}${adjustment}` : "与主评分一致，不调整总分",
  }));

  return {
    enabled: true,
    apiKeyConfigured: AI_API_KEY_CONFIGURED,
    externalAiUsed: false,
    mode: "本地多 Agent 证据推理",
    note: AI_API_KEY_CONFIGURED
      ? `已检测到 AI API Key；将尝试调用 ${AI_MODEL} 做外部复核，失败时保留本地多 Agent 结果。`
      : "不调用外部 LLM，不上传用户输入；只基于联网检索证据和七角度评分复核。",
    consensusScore,
    consensusVerdict: verdictFor(consensusScore).label,
    suggestedAdjustment: adjustment,
    disagreement,
    agents,
  };
}

async function enrichReportWithAiCommittee(input, localSignals, evidence, report) {
  if (!AI_COMMITTEE_ENABLED || !report.aiCommittee || !AI_API_KEY_CONFIGURED) return;
  const external = await runExternalAiReview(input, localSignals, evidence, report);
  if (!external) return;
  const agents = Array.isArray(report.aiCommittee.agents) ? [...report.aiCommittee.agents] : [];
  agents.unshift(committeeAgent({
    name: "外部 AI 复核 Agent",
    role: `${AI_MODEL} · 综合审阅证据与可疑点`,
    score: external.score,
    basis: external.basis,
    concern: external.concern,
    action: external.action,
  }));
  const localScores = agents.map((agent) => Number(agent.score)).filter(Number.isFinite);
  const consensusScore = clamp(localScores.reduce((sum, score) => sum + score, 0) / Math.max(1, localScores.length));
  const disagreement = Math.max(...localScores) - Math.min(...localScores);
  report.aiCommittee = {
    ...report.aiCommittee,
    externalAiUsed: true,
    externalAiModel: AI_MODEL,
    mode: `外部 AI + 本地多 Agent 复核`,
    note: external.summary || `已调用 ${AI_MODEL} 对联网证据、反证和评分进行复核。`,
    consensusScore,
    consensusVerdict: verdictFor(consensusScore).label,
    suggestedAdjustment: Math.max(-12, Math.min(12, Math.round((consensusScore - report.finalScore) * 0.35))),
    disagreement,
    agents,
  };
}

async function runExternalAiReview(input, localSignals, evidence, report) {
  const payload = {
    model: AI_MODEL,
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: "你是新闻真实性复核委员会中的外部审阅 Agent。只能基于用户输入、系统给出的证据摘要和可疑点判断，不要编造新证据。用 JSON 输出。",
      },
      {
        role: "user",
        content: JSON.stringify(buildExternalAiReviewPayload(input, localSignals, evidence, report)),
      },
    ],
  };
  try {
    const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(18000),
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`${response.status} ${response.statusText}${errorText ? ` · ${errorText.slice(0, 220)}` : ""}`);
    }
    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content || "";
    return parseExternalAiReview(content);
  } catch (error) {
    report.aiCommittee.note = `外部 AI 复核调用失败：${safeText(error.message || String(error))}。已保留本地多 Agent 复核结果。`;
    report.aiCommittee.externalAiUsed = false;
    return null;
  }
}

function buildExternalAiReviewPayload(input, localSignals, evidence, report) {
  return {
    instruction: "请返回 JSON：score(0-100), stance, basis, concern, action, summary。不要输出 Markdown。",
    userInput: {
      text: input.text,
      url: input.url,
      type: input.type,
      impact: input.impact,
      sourceName: input.sourceName,
    },
    finalScore: report.finalScore,
    verdict: report.verdict?.label,
    cap: report.cap,
    angleScores: Object.fromEntries(Object.entries(report.angleScores || {}).map(([key, value]) => [key, value.score])),
    evidence: (report.evidence || []).slice(0, 10),
    risks: (report.risks || []).slice(0, 8),
    channels: (report.channels || []).map((channel) => ({
      label: channel.label,
      status: channel.status,
      score: channel.score,
      role: channel.role,
      note: channel.note,
    })),
    topLinks: {
      evidence: (report.links?.evidence || []).slice(0, 5).map((item) => ({ title: item.title, source: item.source, tier: item.tier, score: item.score })),
      suspicious: (report.links?.suspicious || []).slice(0, 5).map((item) => ({ title: item.title, source: item.source, tier: item.tier, score: item.score })),
    },
    localSignals: {
      shortAtomicClaim: localSignals.shortAtomicClaim,
      specificNamedEvent: localSignals.specificNamedEvent,
      needsAcademicEvidence: localSignals.needsAcademicEvidence,
      mediaStatus: localSignals.mediaIntegrity?.status,
    },
  };
}

function parseExternalAiReview(content) {
  let parsed = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = String(content || "").match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
  }
  if (!parsed || typeof parsed !== "object") return null;
  const score = clamp(Number(parsed.score ?? parsed.confidence ?? 50));
  return {
    score,
    stance: safeText(parsed.stance || committeeStance(score)),
    basis: safeText(parsed.basis || parsed.reason || "外部 AI 已审阅证据摘要"),
    concern: safeText(parsed.concern || parsed.risk || "仍需人工确认关键来源链"),
    action: safeText(parsed.action || parsed.recommendation || "保留证据链接并追踪后续更新"),
    summary: safeText(parsed.summary || ""),
  };
}

function committeeAgent({ name, role, score, basis, concern, action }) {
  const normalizedScore = clamp(score);
  return {
    name,
    role,
    stance: committeeStance(normalizedScore),
    score: normalizedScore,
    confidence: normalizedScore,
    basis: safeText(basis),
    concern: safeText(concern),
    action: safeText(action),
  };
}

function committeeStance(score) {
  if (score >= 82) return "强支持";
  if (score >= 70) return "偏支持";
  if (score >= 55) return "待确认";
  if (score >= 40) return "偏怀疑";
  return "强怀疑";
}

function buildReviewPlan(input, localSignals, evidence) {
  const rows = [];
  if (evidence.supporting.length) rows.push(["即时", "保存证据快照 / 来源链", "已完成"]);
  else rows.push(["即时", "扩大检索式并重试", "待复核"]);
  if (input.impact === "high") {
    rows.push(["1h", "官方回应 / 平台处置", "待复核"]);
    rows.push(["24h", "权威媒体 / 原始文件", "待复核"]);
    rows.push(["72h", "反证 / 更正 / 撤稿", "待复核"]);
  } else {
    rows.push(["24h", "新证据 / 更正", "待复核"]);
    rows.push(["7d", "归档或更新评分", "待复核"]);
  }
  return rows.slice(0, 4);
}

function classifySource(url, sourceName = "", channelHint = "", connector = "") {
  const host = hostname(url);
  const haystack = `${host} ${sourceName}`.toLowerCase();
  for (const tier of sourceTiers) {
    if (tier.match.some((part) => haystack.includes(part))) return { tier: tier.tier, score: tier.score, channel: tier.channel };
  }
  if (channelHint === "official") return { tier: "T1", score: 82, channel: "primaryRecord" };
  if (channelHint === "real_world") return { tier: "T2", score: 72, channel: "realWorldTrace" };
  if (channelHint === "english_network") return { tier: "T3", score: 64, channel: "newsMedia" };
  if (channelHint === "academic") {
    const academicConnector = /pubmed|crossref/.test(connector);
    if (academicConnector || hasAcademicSourceSignal(haystack, host)) return { tier: "T2", score: 72, channel: "academicEvidence" };
    return { tier: "T3", score: 54, channel: "newsMedia" };
  }
  if (channelHint === "social") return { tier: "T4", score: 42, channel: "socialPlatform" };
  if (channelHint === "self_media") return { tier: "T4", score: 46, channel: "selfMedia" };
  if (/news|media|times|daily|post|journal|tribune|reuters|bloomberg|ap/.test(haystack)) return { tier: "T3", score: 62, channel: "newsMedia" };
  return { tier: "T3", score: 58, channel: channelHint === "direct" ? "newsMedia" : "newsMedia" };
}

function academicQualityScore(text, url, connector = "") {
  const host = hostname(url);
  if (/cochrane|systematic review|meta.?analysis|practice guideline|guideline|consensus/.test(text)) return 92;
  if (/randomi[sz]ed|controlled trial|clinical trial|phase 3|phase iii|double.?blind|placebo/.test(text)) return 84;
  if (/cohort|case-control|longitudinal|real-world|prospective/.test(text)) return 72;
  if (/review|journal article|pubmed|crossref/.test(text) || connector === "pubmed_search") return 68;
  if (/case report|case series|letter|editorial|commentary/.test(text)) return 46;
  if (/arxiv|medrxiv|biorxiv|preprint|research square|ssrn/.test(text) || /arxiv|medrxiv|biorxiv|researchsquare|preprints|osf|zenodo|ssrn/.test(host)) return 44;
  return 58;
}

function relevanceScore(text, terms, originalClaim) {
  if (!text) return 0;
  const compactClaim = originalClaim.replace(/\s+/g, "").toLowerCase();
  let hits = 0;
  for (const term of terms) {
    const normalized = term.toLowerCase();
    if (normalized.length > 1 && text.includes(normalized)) hits += normalized.length > 5 ? 2 : 1;
  }
  if (compactClaim.length > 4 && text.replace(/\s+/g, "").includes(compactClaim)) hits += 5;
  const semantic = semanticOverlapScore(text, originalClaim);
  return clamp(20 + hits * 9 + semantic * 0.35);
}

function supportScore(text, claim) {
  let score = 20;
  const entityPatterns = claimEntityPatterns(claim);
  const actionPatterns = claimActionPatterns(claim);
  const entityScore = entityOverlapScore(text, claim);
  const actionScore = actionOverlapScore(text, claim);
  const semantic = semanticOverlapScore(text, claim);
  score += Math.round(entityScore * 0.55);
  score += Math.round(actionScore * 0.5);
  score += Math.round(semantic * 0.32);
  if (/official|state media|wam|minister|spokesperson|filing|statement|官方|国有媒体|部长|发言人|文件/.test(text)) score += 12;
  if (/may 1|1 may|2026|5月1日/.test(text)) score += 7;
  if (entityPatterns.length && entityScore < 20) score -= 12;
  if (actionPatterns.length && actionScore < 20) score -= 22;
  if (!entityPatterns.length && !actionPatterns.length && semantic < 35) score -= 10;
  return clamp(score);
}

function directClaimSignal(item, claim) {
  const text = `${item.title || ""} ${item.snippet || ""}`.toLowerCase();
  let signal = Math.round(entityOverlapScore(text, claim) * 0.55 + actionOverlapScore(text, claim) * 0.7 + semanticOverlapScore(text, claim) * 0.35);
  if (/official|state media|wam|reuters|bloomberg|ap news|官方|国有媒体|声明/.test(text)) signal += 10;
  if (/nopec/.test(text) && !/uae|united arab emirates|阿联酋/.test(text)) signal -= 40;
  return signal;
}

function directTitleSignal(item, claim) {
  const text = `${item.title || ""}`.toLowerCase();
  let signal = Math.round(entityOverlapScore(text, claim) * 0.65 + actionOverlapScore(text, claim) * 0.8 + semanticOverlapScore(text, claim) * 0.25);
  if (/reuters|bloomberg|ap news|wam|emirates news agency|官方|声明/.test(text)) signal += 10;
  if (/nopec/.test(text) && !/uae|united arab emirates|阿联酋/.test(text)) signal -= 60;
  return signal;
}

function semanticOverlapScore(text, claim) {
  const groups = semanticConceptGroups(claim);
  if (!groups.length) return 0;
  const hits = groups.filter((group) => group.patterns.some((pattern) => pattern.test(text))).length;
  return clamp((hits / groups.length) * 82 + Math.min(18, hits * 3));
}

function semanticConceptGroups(claim) {
  const groups = matchedCrossLingualConcepts(claim).map((concept) => ({ id: concept.id, patterns: concept.patterns || [] })).filter((group) => group.patterns.length);
  const add = (trigger, patterns) => {
    if (trigger.test(claim)) groups.push({ patterns });
  };
  add(/鲍威尔|powell/i, [/powell|鲍威尔/]);
  add(/美联储|联邦储备|fed|federal reserve|fomc/i, [/federal reserve|\bfed\b|fomc|美联储|联邦储备/]);
  add(/主席|chair|chairman/i, [/chair|chairman|主席/]);
  add(/卸任|任期|交接|继任|接棒|接任|successor|succession|transition|term/i, [/term ends|term expires|chair term|successor|succession|succeed|replace|replacement|transition|handover|卸任|任期|交接|继任|接棒|接任/]);
  add(/沃什|warsh/i, [/warsh|沃什/]);
  add(/中国队|国足|中国男足|男足|中国足球/i, [/china national football team|chinese national football team|chinese men's football team|china soccer team|team china football|中国队|国足|中国男足|男足|中国足球/]);
  add(/世界杯|world cup|fifa world cup/i, [/fifa world cup|world cup|世界杯/]);
  add(/进世界杯|晋级|出线|入围|获得资格|qualified|qualify|qualification|advance/i, [/qualif(?:y|ied|ication)|advance|book(?:ed)?\s+(?:a\s+)?place|secure(?:d)?\s+(?:a\s+)?spot|晋级|出线|入围|获得资格|进世界杯/]);
  add(/利率|降息|加息|按兵不动|维持|会议|发布会|interest rate|rate cut|hold rates|press conference/i, [/interest rate|rates|rate cut|hold rates|keeps rates|unchanged|fomc|meeting|press conference|利率|降息|加息|维持|会议|发布会|按兵不动/]);
  add(/独立性|政治压力|特朗普|共和党|independence|political pressure|trump/i, [/independence|independent|political pressure|legal attack|trump|republican|独立性|政治压力|特朗普|共和党/]);
  add(/分歧|反对票|投票|dissent|split vote|vote/i, [/dissent|split vote|divided|division|vote|voted|反对票|投票|分歧|分裂/]);
  add(/理事|board|governor/i, [/board of governors|governor|fed board|理事/]);
  return groups.filter((group, index) => {
    const key = group.id || group.patterns.map((pattern) => pattern.source).join("|");
    return groups.findIndex((item) => (item.id || item.patterns.map((pattern) => pattern.source).join("|")) === key) === index;
  });
}

function entityOverlapScore(text, claim) {
  const patterns = claimEntityPatterns(claim);
  if (!patterns.length) return 0;
  const hits = patterns.filter((pattern) => pattern.test(text)).length;
  return clamp((hits / patterns.length) * 70 + hits * 8);
}

function actionOverlapScore(text, claim) {
  const patterns = claimActionPatterns(claim);
  if (!patterns.length) return 0;
  const hits = patterns.filter((pattern) => pattern.test(text)).length;
  return clamp((hits / patterns.length) * 70 + hits * 10);
}

function claimEntityPatterns(claim) {
  const patterns = matchedCrossLingualConcepts(claim).filter((concept) => concept.kind === "entity").flatMap((concept) => concept.patterns || []);
  if (/uae|阿联酋/i.test(claim)) patterns.push(/uae|united arab emirates|阿联酋/);
  if (/opec|欧佩克/i.test(claim)) patterns.push(/opec|欧佩克|organization of the petroleum exporting countries/);
  if (/查尔斯|charles/i.test(claim)) patterns.push(/charles|查尔斯/);
  if (/卡米拉|camilla/i.test(claim)) patterns.push(/camilla|卡米拉/);
  if (/英王|英国国王|英国君主|国王|british monarch|king/i.test(claim)) patterns.push(/king|monarch|国王|君主|英王/);
  if (/英国|英王|british|united kingdom|u\.?k\./i.test(claim)) patterns.push(/britain|british|united kingdom|u\.k\.|uk|英国/);
  if (/美国|访美|美方|白宫|华盛顿|united states|america|u\.?s\.?/i.test(claim)) patterns.push(/united states|\bu\.s\.\b|\bus\b|america|american|white house|washington|美国|美方|白宫|华盛顿/);
  if (/鲍威尔|powell/i.test(claim)) patterns.push(/powell|jerome powell|鲍威尔/);
  if (/美联储|联邦储备|fed|federal reserve|fomc/i.test(claim)) patterns.push(/federal reserve|\bfed\b|fomc|美联储|联邦储备/);
  if (/沃什|warsh/i.test(claim)) patterns.push(/warsh|kevin warsh|沃什/);
  if (/特朗普|trump/i.test(claim)) patterns.push(/trump|特朗普/);
  if (/中国队|国足|中国男足|男足|中国足球/i.test(claim)) patterns.push(/china national football team|chinese national football team|chinese men's football team|china soccer team|team china football|中国队|国足|中国男足|男足|中国足球/);
  if (/疫苗|vaccine/i.test(claim)) patterns.push(/vaccine|vaccination|疫苗|接种/);
  if (/自闭症|autism/i.test(claim)) patterns.push(/autism|autistic|自闭症/);
  if (/新冠|covid|冠状病毒/i.test(claim)) patterns.push(/covid|sars-cov-2|coronavirus|新冠|冠状病毒/);
  if (/癌症|肿瘤|cancer|tumou?r/i.test(claim)) patterns.push(/cancer|tumou?r|oncology|癌症|肿瘤/);
  if (/糖尿病|diabetes/i.test(claim)) patterns.push(/diabetes|糖尿病/);
  if (/高血压|hypertension/i.test(claim)) patterns.push(/hypertension|高血压/);
  if (/心脏|心血管|heart|cardio/i.test(claim)) patterns.push(/cardiovascular|heart disease|cardio|心脏|心血管/);
  if (/咖啡|coffee|caffeine/i.test(claim)) patterns.push(/coffee|caffeine|咖啡/);
  return uniquePatterns(patterns);
}

function claimActionPatterns(claim) {
  const patterns = matchedCrossLingualConcepts(claim).filter((concept) => concept.kind === "action" || concept.kind === "topic").flatMap((concept) => concept.patterns || []);
  if (/访美|访华|访中|来华|赴华|访问|国事访问|会见|会晤|抵达|visit|state visit|official visit|meet|arrive/i.test(claim)) patterns.push(/visit|visited|visiting|state visit|official visit|trip|arriv|welcome|host|meet|address congress|访问|访美|访华|访中|来华|赴华|国事访问|抵达|欢迎|会晤|会见|发表演讲|国会演讲/);
  if (/卸任|任期|交接|继任|接棒|接任|successor|succession|transition|term/i.test(claim)) patterns.push(/term ends|term expires|chair term|successor|succession|succeed|replace|replacement|transition|handover|卸任|任期|交接|继任|接棒|接任/);
  if (/利率|降息|加息|按兵不动|维持|会议|发布会|interest rate|rate cut|hold rates|press conference/i.test(claim)) patterns.push(/interest rate|rates|rate cut|hold rates|keeps rates|unchanged|fomc|meeting|press conference|利率|降息|加息|维持|会议|发布会|按兵不动/);
  if (/独立性|政治压力|independence|political pressure/i.test(claim)) patterns.push(/independence|independent|political pressure|legal attack|political attack|独立性|政治压力|法律攻势/);
  if (/分歧|反对票|投票|dissent|split vote|vote/i.test(claim)) patterns.push(/dissent|split vote|divided|division|vote|voted|反对票|投票|分歧|分裂/);
  if (/导致|引起|造成|增加|降低|风险|治疗|预防|有效|无效|cause|risk|increase|reduce|treat|prevent|effective/i.test(claim)) patterns.push(/cause|causal|associated|association|risk|increase|reduce|lower|treat|treatment|prevent|effective|efficacy|导致|引起|造成|相关|风险|增加|降低|治疗|预防|有效/);
  if (/退出|离开|撤出|withdraw|leave|exit|quit/i.test(claim)) patterns.push(/withdraw|leav|exit|quit|退出|离开|撤出/);
  if (/宣布|announcement|announce|声明|statement/i.test(claim)) patterns.push(/announc|statement|declare|official|宣布|声明|公告/);
  if (/制裁|sanction/i.test(claim)) patterns.push(/sanction|制裁/);
  if (/收购|acquire|acquisition/i.test(claim)) patterns.push(/acquir|acquisition|buy|merge|收购|并购/);
  if (/辞职|resign/i.test(claim)) patterns.push(/resign|step down|辞职/);
  if (/进世界杯|晋级|出线|入围|获得资格|qualified|qualify|qualification|advance/i.test(claim)) patterns.push(/qualif(?:y|ied|ication)|advance|book(?:ed)?\s+(?:a\s+)?place|secure(?:d)?\s+(?:a\s+)?spot|晋级|出线|入围|获得资格|进世界杯/);
  if (/世界杯|world cup|fifa world cup/i.test(claim)) patterns.push(/fifa world cup|world cup|世界杯/);
  return uniquePatterns(patterns);
}

function uniquePatterns(patterns) {
  const seen = new Set();
  const output = [];
  for (const pattern of patterns) {
    const key = pattern.source;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(pattern);
  }
  return output;
}

function contradictionScore(text, claim, channelHint = "") {
  let score = 0;
  if (/not leav|isn't leav|no plan|deny|denies|denied|false|hoax|fake|debunk|fact check|correction|retraction|no association|not associated|does not cause|did not cause|no evidence|lack of evidence|并未|没有计划|否认|不退出|假的|谣言|辟谣|更正|撤稿|无关|没有关联|不会导致|没有证据/.test(text)) score += 65;
  if (channelHint === "counter_evidence" && /deny|denied|false|hoax|fake|fact check|correction|retraction|否认|辟谣|更正|撤稿|不退出/.test(text)) score += 18;
  if (/2023|2022|2021|2020/.test(text) && /not leav|denied|no plan|不退出|否认/.test(text)) score -= 25;
  return clamp(score);
}

function currentRefutationEvidence(text) {
  if (/2026|2025|today|latest|current|now|当前|最新|今日|今天/.test(text)) return true;
  if (/correction|retraction|fact check|debunk|false|hoax|fake|no association|not associated|does not cause|no evidence|lack of evidence|更正|撤稿|事实核查|辟谣|假的|谣言|无关|没有关联|不会导致|没有证据/.test(text)) return true;
  if (/2023|2022|2021|2020/.test(text) && /not leav|denied|no plan|不退出|否认|没有计划/.test(text)) return false;
  return false;
}

function recencyScore(value) {
  if (!value) return 56;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 52;
  const days = Math.abs(CURRENT_DATE - parsed) / 86400000;
  if (days <= 2) return 95;
  if (days <= 14) return 85;
  if (days <= 90) return 72;
  if (days <= 365) return 58;
  return 36;
}

function evidenceFreshness(value, input, localSignals) {
  if (!localSignals?.timeSensitiveNews || hasHistoricalDateSignal(input.text)) {
    return { level: "not_required", score: recencyScore(value), penalty: 0, days: null, label: "不强制" };
  }
  if (!value) return { level: "unknown", score: 50, penalty: 10, days: null, label: "缺少时间" };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { level: "unknown", score: 48, penalty: 12, days: null, label: "时间不可读" };
  const days = Math.abs(CURRENT_DATE - parsed) / 86400000;
  if (days <= 14) return { level: "fresh", score: 96, penalty: 0, days, label: "新近" };
  if (days <= 60) return { level: "recent", score: 78, penalty: 2, days, label: "较新" };
  if (days <= 180) return { level: "aging", score: 58, penalty: 12, days, label: "偏旧" };
  return { level: "stale", score: 34, penalty: 28, days, label: "旧新闻" };
}

function aggregateFreshnessSignal(items = []) {
  const relevant = items.filter((item) => item && !item.inputSourceCluster).slice(0, 12);
  if (!relevant.length) return { score: 45, label: "证据不足", note: "没有可用于判断时间的新近证据", supportive: false };
  const levels = relevant.map((item) => item.freshness?.level || "unknown");
  const fresh = levels.filter((level) => level === "fresh").length;
  const recent = levels.filter((level) => level === "recent").length;
  const stale = levels.filter((level) => level === "stale" || level === "aging").length;
  const unknown = levels.filter((level) => level === "unknown").length;
  const avg = Math.round(relevant.reduce((sum, item) => sum + (item.freshness?.score ?? item.recency ?? 50), 0) / relevant.length);
  if (fresh || recent) return { score: clamp(avg + Math.min(12, (fresh + recent) * 3)), label: fresh ? "新近证据" : "较新证据", note: `${fresh + recent} 条新近 / 较新证据`, supportive: true };
  if (stale) return { score: clamp(avg - Math.min(18, stale * 4)), label: "证据偏旧", note: `${stale} 条偏旧或旧新闻，实时验证中已降权`, supportive: false };
  return { score: clamp(avg - 8), label: "时间不明", note: `${unknown || relevant.length} 条证据缺少明确发布时间`, supportive: false };
}

function hasHistoricalDateSignal(text) {
  const years = String(text || "").match(/\b(19\d{2}|20\d{2})\b|(?:19\d{2}|20\d{2})年/g) || [];
  if (!years.length) return false;
  const currentYear = CURRENT_DATE.getFullYear();
  return years.some((raw) => {
    const year = Number(String(raw).replace(/[^\d]/g, ""));
    return year && year <= currentYear - 2;
  });
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

    for (const tool of editTools) detectedTools.add(tool);
    for (const tool of aiTools) detectedAiTools.add(tool);

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
    suspiciousSignals: unique(suspicious).slice(0, 8),
    positiveSignals: unique(positives).slice(0, 6),
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

function extractLocalSignals(input) {
  const text = `${input.text} ${input.url} ${input.sourceName}`;
  const numberMatches = input.text.match(/(?:\d+(?:\.\d+)?)(?:\s?%|万|亿|万人|亿美元|美元|元|mw|gw|人|票|倍|x)?/gi) || [];
  const extremePercent = numberMatches.some((raw) => /%/.test(raw) && Number(raw.replace(/[^\d.]/g, "")) > 300);
  const academicNeed = detectAcademicNeed(input);
  const mediaIntegrity = analyzeMediaIntegrity(input.media);
  const englishContext = buildEnglishInformationContext(input);
  return {
    shortAtomicClaim: isShortAtomicClaim(input.text),
    negatedClaim: isNegatedClaim(input.text),
    hasNumbers: numberMatches.length > 0,
    numberMatches,
    extremePercent,
    hasMedia: mediaIntegrity.hasMedia,
    mediaIntegrity,
    specificNamedEvent: isSpecificNamedEvent(input),
    analysisClaim: /(观察|分析|评论|三重|主线|考验|影响|意味着|前景|why it matters|analysis|opinion|explainer|takeaway)/i.test(text),
    timeSensitiveNews: isTimeSensitiveNews(input),
    englishNetworkEnabled: englishContext.enabled,
    englishConcepts: englishContext.concepts.map((concept) => concept.id),
    needsAcademicEvidence: academicNeed.needed,
    academicReason: academicNeed.reason,
    academicCategory: academicNeed.category,
    anonymous: /(网传|据传|爆料|知情人士|消息人士|内部人士|相关人士|有人称|未经证实|rumou?r|sources said|people familiar)/i.test(text),
  };
}

function isTimeSensitiveNews(input) {
  const text = `${input.text || ""} ${input.sourceName || ""}`.trim();
  if (hasHistoricalDateSignal(text)) return false;
  if (detectAcademicNeed(input).needed) return false;
  if (/(最新|今日|今天|刚刚|突发|实时|目前|当地时间|北京时间|now|today|latest|breaking|current)/i.test(text)) return true;
  if (isSpecificNamedEvent(input)) return true;
  return input.type === "event" && input.impact === "high" && text.replace(/\s+/g, "").length <= 160;
}

function isSpecificNamedEvent(input) {
  const text = `${input.text || ""} ${input.sourceName || ""}`.trim();
  const hasConcreteAction = /宣布|确认|发布|退出|卸任|任命|签约|收购|制裁|起诉|调查|访问|到访|拜访|参访|考察|会见|晋级|出线|入围|获得资格|进世界杯|announce|confirm|release|withdraw|resign|appoint|sign|acquire|sanction|sue|probe|visit|visited|meet|met|qualified|qualify|advance/i.test(text);
  const hasNamedEntity = /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*|[\u4e00-\u9fa5]{2,}/.test(text);
  const isShortEnough = text.replace(/\s+/g, "").length <= 120;
  return Boolean(hasConcreteAction && hasNamedEntity && isShortEnough);
}

function stanceForEvidence({ support, contradiction, resultText, input, localSignals, contextMatch }) {
  if (isOutcomeClaimRequiringConfirmation(input, localSignals)) {
    const outcomeSignal = outcomeConfirmationSignal(resultText, input.text);
    if (outcomeSignal <= -45 || (contradiction > 55 && currentRefutationEvidence(resultText))) return "反驳";
    if (outcomeSignal >= 65 && contradiction < 55) return "支持";
    return "背景";
  }
  if (localSignals.negatedClaim) {
    const affirmativeEvidence = affirmativeClaimEvidence(resultText, input.text);
    const negativeEvidence = negativeClaimEvidence(resultText, input.text);
    if (affirmativeEvidence > 55) return "反驳";
    if (negativeEvidence > 55 || contradiction > 55) return "支持";
    return "背景";
  }
  if (contradiction > 55 && currentRefutationEvidence(resultText)) return "反驳";
  if (support > 55 && contradiction < 55) return "支持";
  if (contextMatch?.supportive && contradiction < 55) return "支持";
  return "背景";
}

function isOutcomeClaimRequiringConfirmation(input, localSignals) {
  const text = `${input.text || ""} ${input.sourceName || ""}`;
  if (localSignals.analysisClaim || localSignals.negatedClaim) return false;
  if (localSignals.needsAcademicEvidence) return false;
  if (isSportsQualificationClaim(text)) return true;
  const concreteAction = /宣布|确认|发布|退出|卸任|离任|辞职|任命|签约|收购|并购|制裁|起诉|调查|访问|到访|拜访|参访|考察|会见|抵达|达成|批准|通过|生效|启动|关闭|停产|召回|announce|confirm|release|withdraw|resign|step down|appoint|sign|acquire|merger|sanction|sue|probe|visit|visited|meet|met|arrive|approve|launch|shut down|recall/i.test(text);
  const shortConcrete = text.replace(/\s+/g, "").length <= 140;
  return Boolean(localSignals.specificNamedEvent && concreteAction && shortConcrete);
}

function isSportsQualificationClaim(text) {
  const value = String(text || "");
  const team = /中国队|国足|中国男足|男足|中国足球|china national football team|chinese national football team|china soccer team/i.test(value);
  const worldCup = /世界杯|world cup|fifa world cup/i.test(value);
  const qualification = /进世界杯|晋级|出线|入围|获得资格|qualified|qualify|qualification|advance/i.test(value);
  return team && worldCup && qualification;
}

function sportsQualificationEvidenceSignal(text) {
  const value = String(text || "").toLowerCase();
  const hasTeam = /china national football team|chinese national football team|chinese men's football team|china soccer team|team china football|中国队|国足|中国男足|男足|中国足球/.test(value);
  const hasWorldCup = /fifa world cup|world cup|世界杯/.test(value);
  const hasConfirmedQualification = /qualified\s+for|qualifies\s+for|qualification\s+(?:secured|confirmed)|book(?:ed)?\s+(?:a\s+)?(?:place|spot).*world cup|secure(?:d)?\s+(?:a\s+)?spot.*world cup|advance(?:d)?\s+to.*world cup|晋级|出线|入围|获得资格|进世界杯/.test(value);
  const hasCurrentContext = /\b20(?:25|26)\b|2025年|2026年|latest|current|today|最新|目前|当地时间|北京时间|本届|预选赛|qualifiers?/.test(value);
  const negative = /failed\s+to\s+qualify|miss(?:es|ed)?\s+(?:out\s+on\s+)?(?:the\s+)?world cup|eliminated|out\s+of\s+contention|无缘世界杯|无缘|出局|未能出线|未晋级/.test(value);
  const speculative = /could|may|might|expected|aim|hope|goal|target|prediction|rumou?r|beyond qualifying|dead-rubber|\bif\b|as long as|保送|下一场|目标|有望|可能|预测|争取|冲击|若|如果|能进吗|凭什么|形势|备战|分析/.test(value);
  let score = 0;
  if (hasTeam) score += 24;
  if (hasWorldCup) score += 24;
  if (hasConfirmedQualification) score += 36;
  if (/official|fifa|afc|reuters|ap news|bbc|cctv|足协|官方|宣布|确认|声明/.test(value)) score += 12;
  if (!hasCurrentContext) score = Math.min(score, 52);
  if (speculative) score = Math.min(score - 36, 44);
  if (negative) score -= 80;
  return clamp(score);
}

function outcomeConfirmationSignal(text, claim) {
  if (isSportsQualificationClaim(claim)) return sportsQualificationEvidenceSignal(text);
  const value = String(text || "").toLowerCase();
  const entity = entityOverlapScore(value, claim);
  const action = actionOverlapScore(value, claim);
  const semantic = semanticOverlapScore(value, claim);
  const hasConfirmLanguage = /official|confirm|confirmed|announce|announced|statement|press release|filing|effective|said on|according to|reported|官方|确认|证实|宣布|声明|公告|文件|生效|据.*报道/.test(value);
  const hasCurrentContext = /\b20(?:25|26)\b|2025年|2026年|latest|current|today|now|最新|目前|今日|今天|当地时间|北京时间|本周|本月/.test(value) || !/\b20\d{2}\b|20\d{2}年/.test(claim);
  const speculative = /could|may|might|expected|reportedly|rumou?r|unconfirmed|source said|people familiar|if\b|plan to|consider|aim|hope|target|prediction|或将|可能|预计|据传|网传|消息人士|知情人士|未经证实|若|如果|计划|考虑|目标|有望|预测/.test(value);
  const denial = /deny|denied|no plan|not true|false|fake|hoax|debunk|correction|retraction|否认|没有计划|不实|假的|谣言|辟谣|更正|撤稿/.test(value);
  let score = Math.round(entity * 0.42 + action * 0.5 + semantic * 0.2);
  if (hasConfirmLanguage) score += 16;
  if (hasCurrentContext) score += 8;
  if (speculative) score = Math.min(score - 28, 48);
  if (denial) score -= 75;
  return clamp(score);
}

function isNegatedClaim(text) {
  return /(没有计划|并未|不会|不退出|否认|假的|谣言|no plan|not leaving|will not|won't|denied|false|hoax|fake)/i.test(text);
}

function affirmativeClaimEvidence(text, claim) {
  let score = 0;
  if (/uae|united arab emirates|阿联酋/.test(text)) score += 20;
  if (/opec|欧佩克/.test(text)) score += 20;
  if (/withdraw|leav|exit|quit|退出|离开|撤出/.test(text)) score += 35;
  if (/will|to leave|announc|decision|effective|宣布|决定|生效/.test(text)) score += 15;
  if (/not leav|no plan|denied|不退出|没有计划|否认/.test(text)) score -= 45;
  return clamp(score);
}

function negativeClaimEvidence(text, claim) {
  let score = 0;
  if (/uae|united arab emirates|阿联酋/.test(text)) score += 20;
  if (/opec|欧佩克/.test(text)) score += 20;
  if (/not leav|no plan|denied|denies|false|hoax|fake|debunk|不退出|没有计划|否认|辟谣|假的|谣言/.test(text)) score += 45;
  return clamp(score);
}

function isShortAtomicClaim(text) {
  const compact = text.replace(/\s/g, "");
  if (compact.length < 4 || compact.length > 80) return false;
  const upperEntities = text.match(/\b[A-Z][A-Z0-9]{1,}\b/g) || [];
  const hasEntitySignal = upperEntities.length >= 2 || /(阿联酋|美国|中国|俄罗斯|欧盟|沙特|以色列|伊朗|乌克兰|英国|英王|国王|查尔斯|卡米拉|白宫|华盛顿|opec|欧佩克|openai|anthropic|tesla|nvidia|apple|microsoft|google|meta|uae|charles)/i.test(text);
  const hasAction = /(退出|加入|宣布|离开|撤出|访问|访美|访华|访中|来华|赴华|国事访问|会见|会晤|抵达|欢迎|制裁|起诉|收购|合并|关闭|发布|辞职|死亡|爆炸|袭击|停火|增产|减产|破产|上市|下架|withdraw|leave|exit|quit|visit|arrive|meet|host|join|announce|sanction|sue|acquire|merge|resign|bankrupt|launch)/i.test(text);
  return hasEntitySignal && hasAction;
}

function defaultRole(id) {
  return {
    newsMedia: "交叉报道",
    socialPlatform: "传播 / 现场信号",
    selfMedia: "线索 / 观点",
    authoritativeStatement: "权威确认",
    primaryRecord: "原始证据",
    realWorldTrace: "外部旁证",
    academicEvidence: "论文 / 指南",
    uploadedMedia: "待取证素材",
  }[id] || "证据";
}

function inferredChannelsForResult(result) {
  const text = `${result.title} ${result.snippet} ${result.url}`.toLowerCase();
  const ids = new Set([result.channel || "newsMedia"]);
  if (isAcademicEvidenceItem(result) || /systematic review|meta.?analysis|randomi[sz]ed|clinical trial|peer.?review|临床试验|系统综述/.test(text)) ids.add("academicEvidence");
  if (/official|state media|statement|minister|spokesperson|president|ceo|cfo|wam|white house|royal|buckingham|官方|国有媒体|声明|部长|发言人|总统|白宫|王室|白金汉宫/.test(text)) ids.add("authoritativeStatement");
  if (/filing|database|court|regulator|gazette|document|permit|annual report|prospectus|congress|parliament|文件|公告|数据库|法院|监管|许可|国会/.test(text) || result.tier === "T0") ids.add("primaryRecord");
  if (/effective|market|price|brent|stock|capacity|production|quota|permit|tender|shipment|registry|arrival|state visit|white house|congress|生效|市场|价格|产能|产量|配额|招标|工商|航运|抵达|国事访问|白宫|国会/.test(text)) ids.add("realWorldTrace");
  if (/reddit|x.com|twitter|weibo|facebook|instagram|youtube|tiktok|telegram/.test(text)) ids.add("socialPlatform");
  if (/substack|medium|newsletter|podcast|blog|kol|expert|analysis|专家|自媒体|博客/.test(text)) ids.add("selfMedia");
  return [...ids];
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.text();
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json,text/plain,*/*", ...headers } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms)),
  ]);
}

function normalizeResult({ title = "", url = "", snippet = "", publishedAt = "", sourceName = "", connector = "", channelHint = "", query = "" }) {
  return {
    title: safeText(stripHtml(String(title || "")).trim()),
    url: String(url || "").trim(),
    snippet: safeText(stripHtml(String(snippet || "")).trim()).slice(0, 700),
    publishedAt: normalizeDate(publishedAt),
    sourceName: sourceName || hostname(url),
    connector,
    channelHint,
    query,
  };
}

function safeText(value) {
  return String(value || "").replace(/[<>]/g, "");
}

function dedupeResults(results) {
  const seen = new Set();
  const output = [];
  for (const result of results) {
    if (!result.url || !result.title) continue;
    const key = canonicalUrl(result.url);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(result);
  }
  return output;
}

function canonicalUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid)/i.test(key)) parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function sameArticleUrl(left, right) {
  if (!left || !right) return false;
  if (canonicalUrl(left) === canonicalUrl(right)) return true;
  try {
    const a = new URL(left);
    const b = new URL(right);
    const hostA = a.hostname.toLowerCase().replace(/^(www|m)\./, "");
    const hostB = b.hostname.toLowerCase().replace(/^(www|m)\./, "");
    const pathA = decodeURIComponent(a.pathname).replace(/\/+$/, "").toLowerCase();
    const pathB = decodeURIComponent(b.pathname).replace(/\/+$/, "").toLowerCase();
    return hostA === hostB && pathA.length > 8 && pathA === pathB;
  } catch {
    return false;
  }
}

function unwrapDuckDuckGoUrl(url) {
  try {
    const parsed = new URL(url.startsWith("//") ? `https:${url}` : url);
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : parsed.toString();
  } catch {
    return url;
  }
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function normalizeDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function pickTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1] : "";
}

function extractTitle(html) {
  return stripHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
}

function extractMetaDescription(html) {
  return stripHtml((html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i) || [])[1] || "");
}

function cleanText(html) {
  return stripHtml(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " "));
}

function stripHtml(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeXml(value) {
  return decodeHtml(String(value || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function unique(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function signalLabel(score) {
  if (score >= 80) return "强";
  if (score >= 60) return "中";
  if (score >= 45) return "弱";
  return "风险";
}

function verdictFor(score) {
  if (score >= 90) return { label: "已确认" };
  if (score >= 75) return { label: "高可信" };
  if (score >= 60) return { label: "中等可信" };
  if (score >= 45) return { label: "证据不足 / 冲突" };
  if (score >= 25) return { label: "低可信" };
  return { label: "基本不实 / 已反证" };
}

async function serveStatic(req, res) {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const target = normalize(join(__dirname, requested));
  if (!target.startsWith(normalize(__dirname))) return sendText(res, "Forbidden", 403);
  try {
    const info = await stat(target);
    if (!info.isFile()) return sendText(res, "Not found", 404);
    const body = await readFile(target);
    const type = mimeTypes[extname(target).toLowerCase()] || "application/octet-stream";
    return sendRaw(res, 200, body, type);
  } catch {
    return sendText(res, "Not found", 404);
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendCors(res, status, body) {
  res.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(body);
}

function sendJson(res, data, status = 200) {
  return sendRaw(res, status, Buffer.from(JSON.stringify(data)), "application/json; charset=utf-8");
}

function sendText(res, text, status = 200) {
  return sendRaw(res, status, Buffer.from(text), "text/plain; charset=utf-8");
}

function sendRaw(res, status, body, contentType) {
  res.writeHead(status, {
    "content-type": contentType,
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
  });
  res.end(body);
}
