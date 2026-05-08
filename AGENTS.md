# La vérité Agent Notes

## Project Shape

La vérité is a Node 20 web service with a static frontend and optional Python media-forensics helper.

- Frontend: `index.html`, `src/app.js`, `src/styles.css`
- Backend: `server.js`
- Media helper: `tools/media_ai_service.py`
- Deployment: `Dockerfile`, `render.yaml`, `scripts/start-web.sh`
- Public docs: `README.md`, `docs/deployment.md`, `docs/mechanism.md`

## Runtime

Default local command:

```powershell
npm start
```

Default local URL:

```text
http://127.0.0.1:8787
```

Syntax check:

```powershell
npm run check
```

## API Routes

- `GET /api/health` returns backend status, AI committee configuration status, model name, and current server time.
- `POST /api/check` accepts a verification payload and returns the scored report.
- `GET /api/search?q=...` runs search diagnostics for a query.
- Static files are served from the project root and `src/`.

## Environment Variables

Keep the existing `VERITE_*` names for compatibility with local `.env` and Render settings, even though the product display name is La vérité.

- `HOST`, `PORT`
- `VERITE_MEDIA_AI`, `VERITE_MEDIA_AI_URL`, `VERITE_MEDIA_AI_PORT`
- `VERITE_AI_COMMITTEE`, `VERITE_AI_API_KEY`, `VERITE_AI_BASE_URL`, `VERITE_AI_MODEL`
- `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`
- `BING_SEARCH_API_KEY`
- `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_ID`
- `SERPAPI_KEY`
- `NEWSAPI_KEY`
- `TAVILY_API_KEY`
- `VERITE_GOOGLE_NEWS_RSS`
- `VERITE_SEARCH_CACHE_TTL_MS`, `VERITE_SEARCH_MAX_CONCURRENCY`, `VERITE_CONNECTOR_BACKOFF_MS`

Do not commit `.env`; it may contain search and AI API keys.

## Current Product Behavior

- Google News RSS is disabled by default. Enable only with `VERITE_GOOGLE_NEWS_RSS=1`.
- SerpAPI is the preferred Google-backed connector when `SERPAPI_KEY` is configured.
- Tavily is used as an optional search/news connector when `TAVILY_API_KEY` is configured.
- Claim splitting now includes structured frames and question-style verification prompts inspired by ClaimDecomp / AVeriTeC.
- Evidence rows now carry FEVER / AVeriTeC-style labels: `SUPPORTS`, `REFUTES`, `BACKGROUND`, `CONFLICTING`, `NOT_ENOUGH_INFO`.
- Retrieval uses FIRE-style staged search plus in-memory query caching, connector failure backoff, and bounded concurrency.
- Real-time and result-style claims apply evidence freshness constraints. Old or undated pages are downgraded or treated as background unless they are direct authoritative confirmation.
- Support evidence for high-impact claims is capped when it lacks T0-T2 sources.
- The AI Review Committee is displayed below the seven-angle scoring section when enabled, but it is explanatory and does not directly overwrite the final score.
- The old post-verification queue is not rendered in the UI. Backend still returns a `review` array for compatibility.

## Git / Deployment

The current tracked repository has moved to `https://github.com/xuzk1hc/La-verite`.

Render public URL:

```text
https://verit.onrender.com
```

After pushing changes, Render may need `Manual Deploy -> Deploy latest commit` if auto-deploy does not update the visible frontend.
