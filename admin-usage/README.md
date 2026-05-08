# 使用情况后台（独立，不改原项目代码）

这个目录提供一个“旁路式”的使用情况后台：

- `proxy.js`：反向代理到 La vérité 主服务，并把每次请求记录为 NDJSON 事件
- `dashboard.js`：读取事件文件，提供统计 API + 管理端页面

默认不保存用户输入全文，只记录长度、媒体数量等摘要，访客以哈希后的 `visitorId` 统计。

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
- 使用情况后台：`http://127.0.0.1:8799`

## 3. 环境变量

代理 `proxy.js`：

```text
USAGE_UPSTREAM=http://127.0.0.1:8787
USAGE_PROXY_PORT=8788
USAGE_DATA_FILE=./admin-usage/data/events.ndjson
USAGE_SALT=change-me
USAGE_STORE_UA=0
USAGE_STORE_IP=0
USAGE_MAX_BODY_BYTES=524288
```

后台 `dashboard.js`：

```text
USAGE_ADMIN_PORT=8799
USAGE_DATA_FILE=./admin-usage/data/events.ndjson
ADMIN_USER=
ADMIN_PASS=
```

设置 `ADMIN_USER` / `ADMIN_PASS` 后，后台会启用 HTTP Basic Auth。

