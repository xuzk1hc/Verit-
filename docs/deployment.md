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
```

平台会提供自己的 `PORT`，Verité 会自动读取。

## 注意事项

- 当前联网检索使用公开网页、Google News RSS、GDELT、DuckDuckGo、PubMed、Crossref 等公开入口。多人高频使用时，建议后续接入正式搜索 API，避免被限流。
- 媒介 AI 服务默认只在容器内部 `127.0.0.1:8790` 监听，不直接暴露给公网。
- 上传的图片 / 视频会在前端生成缩略样本和结构化摘要；公网部署前仍建议在隐私政策中说明素材处理方式。
