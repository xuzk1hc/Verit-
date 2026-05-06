# Verité

Verité 是一个面向用户上传新闻链接、信息文字、截图、图片和视频的新闻真实性验证项目。

当前版本包含前端界面和本地联网后端。后端会跨新闻媒体、通用网页、官方/原始文件、社交平台、自媒体线索和现实世界旁证做检索，并按七个角度输出数据化报告：

1. 联网交叉检索验证：新闻媒体、互联网平台、自媒体、权威发言、原始文件、现实世界旁证和上传素材之间交叉验证
2. 逻辑一致性与反事实检查
3. 历史复盘
4. 来源链溯源
5. 现实世界旁证
6. 统计异常与基准率
7. 内容与媒介完整性

后验证复核机制作为独立模块，用于在新闻发布后继续追踪官方回应、撤稿、更正、平台处置和新证据。

所有非英语输入都会启用英语信息网络检索层：系统会把主体、动作、时间、机构、国家和领域词映射到英文概念，并把这些英文检索式同步用于新闻、官方、现实旁证、社交、自媒体、主动证伪和学术渠道。

当前验证流程借鉴了三类开源机制：

- Loki 风格拆分：先把长文本拆成多个 atomic claims，评估 check-worthiness，再为高优先级 claim 生成检索式。
- FIRE 风格动态检索：检索分为快速定位、标准交叉验证、扩展反证 / 专项渠道三阶段；如果证据已经收敛，会停止后续检索以节省成本。
- InVID 风格媒介工作流：图片 / 视频素材按上下文、元数据、关键帧、反向搜索、取证滤镜、AI 检测、地理定位 / 时间线分步展示。

## 文件

- `index.html`: 前端入口。
- `src/styles.css`: 界面样式。
- `src/app.js`: 本地分析与报告渲染逻辑。
- `server.js`: 联网检索、证据归一化、来源评级和评分重算后端。
- `tools/media_ai_service.py`: 可选本地媒介 AI / ELA 微服务，用于图片样本和视频关键帧的轻量取证。
- `docs/mechanism.md`: Verité 验证机制说明。
- `rules/fact_check_rules.yaml`: 机器可读评分规则。
- `package.json`: 后端启动脚本。

## 使用

推荐启动后端后访问：

```powershell
npm start
```

然后打开：

```text
http://127.0.0.1:8787
```

如果直接打开 `index.html`，前端也会尝试调用 `http://127.0.0.1:8787/api/check`；后端不可用时自动回退到本地预检。

## 公网部署

项目已准备 Docker 和 Render Blueprint：

- `Dockerfile`
- `scripts/start-web.sh`
- `render.yaml`
- `.env.example`
- `docs/deployment.md`

最简单的公网部署路径是把项目推到 GitHub，然后在 Render 使用 Blueprint 创建 Web Service。详细步骤见 `docs/deployment.md`。

## 可选媒介取证服务

图片 / 视频素材会先在浏览器端生成轻量取证摘要：EXIF/XMP/C2PA 快速扫描、编辑软件与 AI 生成工具痕迹、压缩异常、ELA/JPEG Ghost 代理指标，以及视频关键帧。

如需启用本地 AI/ELA 微服务，先启动：

```powershell
python tools/media_ai_service.py
```

再启动主后端：

```powershell
$env:VERITE_MEDIA_AI='1'
npm start
```

当前微服务默认使用 Pillow 时执行 ELA + 频率启发式分析；未来可以把 CLIP-based synthetic detector、UniversalFakeDetect 或其他模型接到同一个 `/analyze` 接口。

## 后端连接器

- 直接 URL 抓取
- Google News RSS
- GDELT News API
- DuckDuckGo 通用网页检索
- 官方 / 原始文件定向检索
- 现实世界旁证定向检索
- Reddit 社交线索检索
- 自媒体 / KOL 线索检索
- 主动证伪检索：否认、虚假、辟谣、事实核查、更正、撤稿、官方反驳

当前社交平台检索受公开网页和平台限制影响；X、微博、Facebook、Instagram 等平台的完整数据需要后续接入正式 API 或合规数据供应商。
