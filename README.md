# Misery Photo

一个基于 Next.js 的私有图册系统，支持 S3 兼容对象存储、批量管理、预签名直连下载和多桶切换。

## 快速部署

1. Fork 仓库并在 Vercel 创建项目。
2. 配置管理员与安全环境变量：`ADMIN_USER`、`ADMIN_PASS`、`AUTH_SECRET`、`BUCKET_ENCRYPTION_KEY`。
3. 选择 KV 方案：
 - `BUCKET_STORE_PROVIDER=vercel`：可直接使用 Upstash 自动注入变量（`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`），也支持显式配置 `KV_REST_API_URL` / `KV_REST_API_TOKEN`。
 - `BUCKET_STORE_PROVIDER=cloudflare`：配置 `CF_ACCOUNT_ID`、`CF_KV_NAMESPACE_ID`、`CF_API_TOKEN`。
4. 部署完成后，登录后台，在设置中心新增并激活存储桶。

说明：项目不绑定 Vercel，可部署在自建服务器。自建场景推荐继续使用 Upstash/Cloudflare 作为外部 KV；若你有自建 Redis，请提供 REST 网关后通过 `KV_REST_API_URL` / `KV_REST_API_TOKEN` 接入。

## 环境变量

示例见 `.env.example`。说明如下：

- 必填：`ADMIN_USER`、`ADMIN_PASS`、`AUTH_SECRET`、`BUCKET_ENCRYPTION_KEY`
- KV 二选一：
  - Vercel/Upstash REST：`KV_REST_API_URL`、`KV_REST_API_TOKEN`（或直接用 `UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`）
  - Cloudflare KV：`CF_ACCOUNT_ID`、`CF_KV_NAMESPACE_ID`、`CF_API_TOKEN`
- 可选后备桶：`S3_ENDPOINT`、`S3_REGION`、`S3_BUCKET`、`S3_ACCESS_KEY`、`S3_SECRET_KEY`
- 可选代理域名白名单：`PROXY_ALLOWED_HOSTS`

## 版本 1.0.0 变更摘要

- 存储桶配置从客户端 Cookie 迁移到服务端 KV 持久化。
- Access Key 与 Secret Key 均在服务端加密后再落盘。
- 保留管理员账号走环境变量，不引入多用户模型。
- 本次按你要求不做旧 Cookie 自动迁移，需手动重新添加桶。

## 完整部署文档

完整步骤（含创建 Vercel KV / Cloudflare KV）见：

- `docs/deployment.md`

## 本地开发

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
npm run start
```
