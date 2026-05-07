# Verité 公网部署

Verité 是一个后端渲染静态前端的 Node 服务，并可选启动本地 Python 媒介取证服务。公网部署建议使用 Docker，这样主站和媒介取证服务可以在同一个容器内运行。

## 推荐方案：Render

1. 把 `Verite` 目录推到 GitHub 仓库。
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
GOOGLE_CSE_API_KEY=...
GOOGLE_CSE_ID=...
SERPAPI_KEY=...
NEWSAPI_KEY=...
```

这些变量都可以留空。只要配置其中任意一个，Verité 后端就会在原有 Google News RSS、GDELT、DuckDuckGo、PubMed、Crossref 之外，额外调用对应正式 API，并把结果纳入同一套交叉验证评分。

推荐优先级：

1. `BING_SEARCH_API_KEY`：通用网页覆盖面较稳。
2. `SERPAPI_KEY`：Google / Google News 结果质量较好，但通常是付费服务。
3. `GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_ID`：适合自定义搜索范围。
4. `NEWSAPI_KEY`：适合补充英文新闻源。

## Docker / VPS

在服务器上执行：

```bash
docker build -t verite .
docker run -d --name verite -p 8787:8787 \
  -e HOST=0.0.0.0 \
  -e VERITE_MEDIA_AI=1 \
  verite
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
BING_SEARCH_API_KEY=可选
GOOGLE_CSE_API_KEY=可选
GOOGLE_CSE_ID=可选
SERPAPI_KEY=可选
NEWSAPI_KEY=可选
```

平台会提供自己的 `PORT`，Verité 会自动读取。

## 注意事项

- 当前联网检索使用公开网页、Google News RSS、GDELT、DuckDuckGo、PubMed、Crossref 等公开入口。多人高频使用时，建议后续接入正式搜索 API，避免被限流。
- 媒介 AI 服务默认只在容器内部 `127.0.0.1:8790` 监听，不直接暴露给公网。
- 上传的图片 / 视频会在前端生成缩略样本和结构化摘要；公网部署前仍建议在隐私政策中说明素材处理方式。
