# 自建部署

本页说明在非 Vercel 环境中部署 Misery-photo 的建议方式。

## 1. 运行环境

- Node.js 18+
- Docker / Docker Compose（若使用容器方式）
- 具备公网 HTTPS 入口（建议通过反向代理）
- 可访问对象存储与 KV 服务

## 2. 推荐拓扑

- 应用服务运行在自建服务器（VPS / Docker / 裸机）。
- 桶状态存储继续使用 Upstash 或 Cloudflare KV。
- 对象存储由 S3/R2/OSS 提供。

## 3. 基础部署步骤

### 3.1 直接 Node.js 运行

1. 拉取代码并安装依赖。
2. 配置生产环境变量。
3. 执行构建并启动服务。
4. 反向代理到 3000 端口并启用 HTTPS。

```bash
npm install
npm run build
npm run start
```

### 3.2 Docker 运行（推荐给小白）

如果你想通过一个 compose 文件快速部署，建议直接使用 Docker 方案：

- [Docker 部署教程](/deploy/docker)

这套方案支持“拉镜像即部署”与“本地构建部署”两种模式。

## 4. systemd 示例

```bash
[Unit]
Description=Misery-photo
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/misery-photo
ExecStart=/usr/bin/npm run start
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## 5. 自建注意点

- 本项目 KV 走 REST 兼容路径，不直接使用 Redis TCP 协议。
- 若使用自建 Redis，需要提供 REST 网关并配置 KV_REST_API_URL/KV_REST_API_TOKEN。
- 建议启用日志采集与告警，重点监控 4xx/5xx 与上游超时。

## 6. 升级策略

- 建议蓝绿或滚动发布，避免在高峰期直接替换。
- 升级前备份环境变量和配置模板。
- 升级后优先回归登录、桶切换、上传、批量操作。
