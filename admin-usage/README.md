# Admin Usage 数据平台（独立，不改原项目代码）

这个目录提供一个“旁路式”的产品数据平台 + 监控看板：

- `proxy.js`：反向代理到 La vérité 主服务，并把每次请求记录为 NDJSON 事件
- `dashboard.js`：增量读取事件文件，提供聚合分析 API + 可视化管理端页面

默认不保存用户输入全文，只记录长度、媒体数量等摘要；对 `/api/check` 会解析上游 JSON 响应并记录结果摘要（最终分数、verdict、封顶原因、渠道命中、连接器错误等），用于产品分析与系统监控。

## 1. 启动顺序（本地）

1) 启动 La vérité（原项目不变）：

```bash
npm start
```

2) 启动代理（对外入口）：

```bash
node admin-usage/proxy.js
```

3) 启动后台：

```bash
node admin-usage/dashboard.js
```

## 2. 访问地址

- 业务入口（经过代理）：`http://127.0.0.1:8788`
- 数据平台后台：`http://127.0.0.1:8799`

## 3. 主要 API

- `GET /api/dashboard`：看板聚合数据（趋势、分布、Top、预警）
- `GET /api/events/query`：明细事件表（支持筛选/排序/分页）

## 4. 环境变量

代理 `proxy.js`（采集与隐私控制）：

```text
USAGE_UPSTREAM=http://127.0.0.1:8787
USAGE_PROXY_PORT=8788
USAGE_PROXY_HOST=0.0.0.0
USAGE_DATA_FILE=./admin-usage/data/events.ndjson
USAGE_SALT=change-me
USAGE_STORE_UA=0
USAGE_STORE_IP=0
USAGE_MAX_BODY_BYTES=524288
USAGE_MAX_RESPONSE_BYTES=2097152
USAGE_LOG_STATIC=0
```

后台 `dashboard.js`（安全默认与性能）：

```text
USAGE_ADMIN_PORT=8799
USAGE_ADMIN_HOST=127.0.0.1
USAGE_DATA_FILE=./admin-usage/data/events.ndjson
USAGE_MAX_EVENTS=200000
ADMIN_USER=
ADMIN_PASS=
```

安全规则：

- 默认只监听 `127.0.0.1`，避免公网裸奔。
- 如果把 `USAGE_ADMIN_HOST` 改为非本机地址，必须设置 `ADMIN_USER` / `ADMIN_PASS`，否则后台会拒绝启动。

## 5. 数据文件与备份建议

- 事件文件：`admin-usage/data/events.ndjson`
- 建议定期把该文件复制到对象存储或备份目录；或在容器环境把 `admin-usage/data` 挂载到持久化卷

中期建议：

- 当事件量较大、需要更复杂的聚合和维度分析时，把事件落到 SQLite 或 DuckDB（独立库文件）会更稳；当前版本先保留 NDJSON + 后台增量读取，便于快速验证
