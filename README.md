# Verité

Verité 是一个面向新闻链接、文字信息、截图、图片和视频的真实性验证工具。它会把输入内容拆成可核验的关键信息，联网检索多渠道证据，识别同源转载、反证和媒介造假风险，并用数据表格输出真伪分析报告。

Verité 适合用于新闻核验、传闻初筛、截图/图片/视频完整性检查，以及高影响信息的证据链整理。

## 在线网页

https://verit.onrender.com

## 功能亮点

- 信息拆解：把长文本拆成可核验的关键信息，并评估验证价值和优先级。
- 动态检索预算：分阶段检索；证据收敛时停止扩展，证据不足或冲突时继续搜索。
- 英文信息网络：无论输入中文还是其他语言，都会同步生成英文检索式。
- 多渠道交叉验证：新闻媒体、官方来源、原始文件、现实世界旁证、社交平台、自媒体/KOL、学术/期刊渠道。
- 主动证伪：自动搜索否认、辟谣、撤稿、更正、fact check、correction、retraction 等反向线索。
- 来源链识别：区分原始来源、同源转载、聚合页和独立报道；用户输入的原文不计为支持证据。
- 媒介取证：检查 EXIF/XMP/C2PA、关键帧、压缩异常、ELA/JPEG Ghost、AI 生成痕迹。
- 分析总结：用简短自然语言概括评分、证据、反证、封顶原因和主要可疑点，帮助用户快速判断。
- 数据化报告：七角度评分、渠道交叉验证、信息拆解、证据表、可疑点、来源评级和相关链接。
- AI 复核委员会：位于七角度评分下方，可合并本地多 Agent 和外部 AI 复核结果。
- 响应式界面：报告面板会根据屏幕宽度自动换行，表格在卡片内部滚动，避免内容被裁切。

## 评分框架

Verité 从七个角度计算最终可信度：

1. 联网交叉检索验证
2. 逻辑一致性与反事实检查
3. 历史复盘
4. 来源链溯源
5. 现实世界旁证
6. 统计异常与基准率
7. 内容与媒介完整性

## 本地运行

先进入你本地保存 Verite 项目的文件夹：

```powershell
cd "你保存 Verite 文件夹的本地路径"
```

例如：

```powershell
cd "D:\Projects\Verite"
```

启动主服务：

```powershell
npm start
```

然后打开：

```text
http://127.0.0.1:8787
```

## 启用媒介 AI/ELA 服务

如果需要启用本地图片/视频取证微服务，先在一个 PowerShell 窗口运行：

```powershell
cd "你保存 Verite 文件夹的本地路径"
python tools/media_ai_service.py
```

再打开另一个 PowerShell 窗口运行主服务：

```powershell
cd "你保存 Verite 文件夹的本地路径"
$env:VERITE_MEDIA_AI='1'
$env:VERITE_MEDIA_AI_URL='http://127.0.0.1:8790/analyze'
npm start
```

## 公网部署

项目已经准备好 Docker 和 Render Blueprint：

- `Dockerfile`
- `render.yaml`
- `scripts/start-web.sh`
- `.env.example`
- `docs/deployment.md`

推荐部署路径：

1. 把项目 push 到 GitHub。
2. 打开 Render。
3. 选择 `New` -> `Blueprint`。
4. 连接 GitHub 仓库。
5. Render 会自动读取 `render.yaml` 并部署。

部署完成后会得到公网地址，例如：

```text
https://verite-xxxx.onrender.com
```

详细部署说明见 [docs/deployment.md](docs/deployment.md)。

后续更新只需要把本地修改提交并 push 到 GitHub；如果 Render 已连接该仓库，会自动拉取最新提交并重新部署。

## 项目结构

```text
.
├── index.html                 # 前端入口
├── server.js                  # Node 后端：检索、评分、报告生成
├── src/
│   ├── app.js                 # 前端交互、文件取证摘要、报告渲染
│   └── styles.css             # 样式
├── tools/
│   └── media_ai_service.py    # 可选媒介 AI / ELA 微服务
├── docs/
│   ├── deployment.md          # 公网部署说明
│   └── mechanism.md           # 验证机制文档
├── rules/
│   └── fact_check_rules.yaml  # 机器可读评分规则
├── Dockerfile
├── render.yaml
└── package.json
```

## 后端连接器

- 直接 URL 抓取
- Bing Web Search API（可选，需 `BING_SEARCH_API_KEY`）
- Google Custom Search API（可选，需 `GOOGLE_CSE_API_KEY` 和 `GOOGLE_CSE_ID`）
- SerpAPI Google / Google News（可选，需 `SERPAPI_KEY`）
- NewsAPI Everything（可选，需 `NEWSAPI_KEY`）
- Google News RSS（默认关闭；需 `VERITE_GOOGLE_NEWS_RSS=1` 手动启用）
- GDELT News API
- DuckDuckGo 通用网页检索
- 官方 / 原始文件定向检索
- 现实世界旁证定向检索
- Reddit 社交线索检索
- 自媒体 / KOL 线索检索
- PubMed / Crossref 学术检索
- 主动证伪检索

正式搜索 API 都是可选增强项。未配置 Key 时，Verité 会自动使用公开连接器；配置 Key 后，联网后端会把正式 API 结果加入同一套证据评分流程，适合 Render / VPS 等云端环境降低 403、超时和地区差异。Google News RSS 在云端容易被限流或封锁，因此默认关闭，避免同一连接器失败被大量 query 放大。

可在本地 `.env` 或 Render Environment 中配置：

```text
BING_SEARCH_API_KEY=
GOOGLE_CSE_API_KEY=
GOOGLE_CSE_ID=
SERPAPI_KEY=
NEWSAPI_KEY=
VERITE_GOOGLE_NEWS_RSS=0
```

后端使用服务器当前时间计算证据时间置信，不再硬编码日期。实时 / 结果型新闻会优先采纳新近证据；旧新闻、缺少发布时间的网页会被降权或只作为背景。

当前社交平台检索受公开网页和平台限制影响。X、微博、Facebook、Instagram 等平台的完整数据需要后续接入正式 API 或合规数据供应商。

## AI 复核委员会

AI 复核委员会默认关闭。开启后，后端会先生成本地多 Agent 复核；如果配置了 OpenAI-compatible API Key，会再调用外部模型生成一个“外部 AI 复核 Agent”，并与本地复核结果合并展示。

报告中该板块显示在“七角度评分”下面，用于解释、复核和提示可疑点；它目前不直接改写最终分数。

```text
VERITE_AI_COMMITTEE=1
VERITE_AI_API_KEY=
VERITE_AI_BASE_URL=https://coding.dashscope.aliyuncs.com/v1
VERITE_AI_MODEL=qwen3-coder-plus
```

Key 只在服务端读取，不会发送到浏览器。Render 部署时请在 Environment 页面配置这些变量，不要写进公开仓库。

如果使用普通百炼通义千问模型，可改为：

```text
VERITE_AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
VERITE_AI_MODEL=qwen-plus
```

## 免责声明

Verité 的输出是证据辅助判断，不是法律、医疗、投资或公共安全领域的最终结论。高影响信息仍应保留原始证据、人工复核来源链，并持续跟踪后续更正或官方回应。
