# La vérité 公网部署

La vérité 是一个后端渲染静态前端的 Node 服务，并可选启动本地 Python 媒介取证服务。公网部署建议使用 Docker，这样主站和媒介取证服务可以在同一个容器内运行。

## 推荐方案：Render

1. 把 `La vérité` 项目目录推到 GitHub 仓库。
2. 打开 Render，选择 `New` -> `Blueprint`。
3. 选择仓库，Render 会读取 `render.yaml`。
4. 创建服务后等待构建完成。
5. 访问 Render 分配的公网 URL。

Render 会自动使用：

- `Dockerfile`
- `scripts/start-web.sh`
- `/api/health` 健康检查
- `HOST=0.0.0.0`
- `VERITE_MEDIA_AI=1`

默认 `render.yaml` 使用 `free` 实例，适合试用和小范围分享，但可能冷启动较慢。正式长期使用可以在 Render 控制台升级实例。

## 可选：配置正式搜索 API

Render 云端 IP 访问公开搜索网页时，可能遇到 403、超时或结果不稳定。建议在 Render 的 `Environment` 页面添加一个或多个正式搜索 API Key：

```text
BING_SEARCH_API_KEY=...
BRAVE_SEARCH_API_KEY=...
GOOGLE_CSE_API_KEY=...
GOOGLE_CSE_ID=...
NEWSAPI_KEY=...
TAVILY_API_KEY=...
WIKIMEDIA_API_TOKEN=...
VERITE_GOOGLE_NEWS_RSS=0
VERITE_CONNECTOR_BACKOFF_MS=60000
VERITE_AI_COMMITTEE=0
VERITE_AI_API_KEY=...
VERITE_AI_BASE_URL=https://coding.dashscope.aliyuncs.com/v1
VERITE_AI_MODEL=qwen3-coder-plus
OPENAI_API_KEY=...
OPENAI_BASE_URL=...
OPENAI_MODEL=...
```

这些变量都可以留空。只要配置其中任意一个，La vérité 后端就会在 GDELT、DuckDuckGo、Mojeek、PubMed、Crossref、arXiv 等公开连接器之外，额外调用对应正式 API，并把结果纳入同一套交叉验证评分。

`VERITE_GOOGLE_NEWS_RSS` 默认等同于 `0`。Render 等云端环境经常被 Google News RSS 限流或封锁，建议保持关闭；只有在本地或可稳定访问的服务器上，才设置为 `1`。

`VERITE_CONNECTOR_BACKOFF_MS` 控制公开连接器失败后的退避时间。Mojeek 这类公开网页源如果返回 403 / 429，后端会临时跳过同组请求，避免失败数量在同一轮验证中被放大。

推荐优先级：

1. `BING_SEARCH_API_KEY`：通用网页覆盖面较稳。
2. `BRAVE_SEARCH_API_KEY`：补充独立网页和新闻检索，适合替代部分 Google 结果。
3. `GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_ID`：适合自定义搜索范围。
4. `NEWSAPI_KEY`：适合补充英文新闻源。
5. `TAVILY_API_KEY`：适合补充通用网页和新闻语义搜索。

后端证据时间置信使用服务器当前时间自动计算，不再硬编码日期。实时新闻会优先采纳新近证据，旧新闻和缺少发布时间的页面会降权。

## Docker / VPS

在服务器上执行：

```bash
docker build -t la-verite .
docker run -d --name la-verite -p 8787:8787 \
  -e HOST=0.0.0.0 \
  -e VERITE_MEDIA_AI=1 \
  la-verite
```

然后访问：

```text
http://服务器公网IP:8787
```

正式分享建议再接一层域名和 HTTPS，例如 Nginx / Caddy / Cloudflare。

## Railway / Fly.io

这两个平台也可以直接使用 Dockerfile。需要设置：

```text
HOST=0.0.0.0
VERITE_MEDIA_AI=1
VERITE_MEDIA_AI_URL=http://127.0.0.1:8790/analyze
VERITE_AI_COMMITTEE=1
VERITE_AI_API_KEY=可选
VERITE_AI_BASE_URL=https://coding.dashscope.aliyuncs.com/v1
VERITE_AI_MODEL=qwen3-coder-plus
BING_SEARCH_API_KEY=可选
BRAVE_SEARCH_API_KEY=可选
GOOGLE_CSE_API_KEY=可选
GOOGLE_CSE_ID=可选
NEWSAPI_KEY=可选
TAVILY_API_KEY=可选
WIKIMEDIA_API_TOKEN=可选
VERITE_GOOGLE_NEWS_RSS=0
VERITE_CONNECTOR_BACKOFF_MS=60000
```

如果使用普通百炼通义千问模型，可以改成：

```text
VERITE_AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
VERITE_AI_MODEL=qwen-plus
```

平台会提供自己的 `PORT`，La vérité 会自动读取。

## 注意事项

- 当前联网检索使用 GDELT、DuckDuckGo、Mojeek、PubMed、Crossref、arXiv、Wikimedia 等公开入口，并可选启用 Google News RSS。多人高频使用时，建议接入正式搜索 API，避免被限流。
- Wikimedia Search 可不带 token 使用；如果后续接入 Wikimedia access token，可填 `WIKIMEDIA_API_TOKEN`，用于提升官方配额与规范接入。
- 媒介 AI 服务默认只在容器内部 `127.0.0.1:8790` 监听，不直接暴露给公网。
- 上传的图片 / 视频会在前端生成缩略样本和结构化摘要；公网部署前仍建议在隐私政策中说明素材处理方式。
