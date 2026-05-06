# Verité

Verité 是一个面向新闻链接、文字信息、截图、图片和视频的真实性验证工具。它会把用户输入拆成可核验的 claim，联网检索多渠道证据，识别同源转载和反证，并用数据表格输出真伪分析报告。

当前版本适合做新闻核验、传闻初筛、截图/图片/视频素材完整性检查，以及高影响信息的证据链整理。

网页：https://verit.onrender.com

## 核心能力

- Claim 拆分：借鉴 Loki 思路，把长文本拆成 atomic claims，并给出可核验价值和优先级。
- 动态检索预算：借鉴 FIRE 思路，分阶段检索；证据收敛时停止扩展，证据不足或冲突时继续搜索。
- 全球英文信息网络：无论输入中文还是其他语言，都会生成英文主体、动作、机构和领域检索式。
- 多渠道交叉验证：新闻媒体、官方来源、原始文件、现实世界旁证、社交平台、自媒体/KOL、学术/期刊渠道。
- 主动证伪：自动搜索否认、辟谣、撤稿、更正、fact check、correction、retraction 等反向线索。
- 来源链识别：区分原始来源、同源转载、聚合页和独立报道；用户输入的原文不计为支持证据。
- 媒介取证：借鉴 InVID 工作流，检查 EXIF/XMP/C2PA、关键帧、压缩异常、ELA/JPEG Ghost、AI 生成痕迹。
- 数据化报告：七角度评分、证据表、可疑点、来源评级、相关链接、后验证复核队列。

## 评分角度

1. 联网交叉检索验证
2. 逻辑一致性与反事实检查
3. 历史复盘
4. 来源链溯源
5. 现实世界旁证
6. 统计异常与基准率
7. 内容与媒介完整性

后验证复核机制作为独立模块，用于在 1 小时、24 小时、72 小时、7 天等节点继续追踪官方回应、撤稿、更正、平台处置和新证据。

## 本地运行

```powershell
cd "C:\Users\Admin\Documents\New project\Chek"
npm start
```

然后打开：

```text
http://127.0.0.1:8787
```

如果要启用本地媒介 AI/ELA 微服务：

```powershell
python tools/media_ai_service.py
```

另开一个 PowerShell：

```powershell
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

推荐路径：

1. 把项目 push 到 GitHub。
2. 打开 Render。
3. 选择 `New` -> `Blueprint`。
4. 连接 GitHub 仓库。
5. Render 会自动读取 `render.yaml` 并部署。

部署完成后会得到一个公网地址，例如：

```text
https://verite-xxxx.onrender.com
```

详细部署说明见 [docs/deployment.md](docs/deployment.md)。

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
- Google News RSS
- GDELT News API
- DuckDuckGo 通用网页检索
- 官方 / 原始文件定向检索
- 现实世界旁证定向检索
- Reddit 社交线索检索
- 自媒体 / KOL 线索检索
- PubMed / Crossref 学术检索
- 主动证伪检索

当前社交平台检索受公开网页和平台限制影响。X、微博、Facebook、Instagram 等平台的完整数据需要后续接入正式 API 或合规数据供应商。

## 注意

Verité 的输出是证据辅助判断，不是法律、医疗、投资或公共安全领域的最终结论。高影响信息仍应保留原始证据、人工复核来源链，并持续跟踪后续更正或官方回应。
