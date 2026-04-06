# Misery Photo 🌿

![Misery Photo](https://img.shields.io/badge/Next.js-16-black?style=flat&logo=next.js) ![TailwindCSS](https://img.shields.io/badge/Tailwind-V4-38B2AC?style=flat&logo=tailwind-css) ![AWS SDK](https://img.shields.io/badge/S3_R2_OSS-Ready-FF9900?style=flat&logo=amazon-aws) ![Sharp](https://img.shields.io/badge/Sharp-Optimized-blue?style=flat&logo=sharp)

Misery Photo 是一个基于 Next.js 的私有图册系统，面向 S3 兼容存储场景，支持画集浏览、上传下载、批量管理和多桶切换。

## 这个项目能做什么

- 支持 S3 / R2 / OSS 等兼容存储
- 支持多存储桶管理与切换（需要部署KV空间存储）
- 支持无KV空间存储（需要将桶的各项数据填入环境变量）
- 支持预签名直连下载与批量操作（复制、移动、删除、打包下载）
- 支持图片卡片浏览与漫画模式浏览
- 支持服务端会话鉴权与桶密钥加密存储

## 快速开始

### 1) 本地运行

```bash
npm install
npm run dev
```

访问 `http://localhost:3000`。

### 2) 生产构建

```bash
npm run build
npm run start
```

## 快速部署（简版）

1. 部署到支持 Next.js 服务端的环境（Vercel 或自建 Node.js 服务器均可）。
2. 配置管理员与安全变量：`ADMIN_USER`、`ADMIN_PASS`、`AUTH_SECRET`、`BUCKET_ENCRYPTION_KEY`。
3. 配置桶状态存储（推荐 Upstash/Cloudflare KV）。
4. 登录后台后，在设置中心添加并激活存储桶。

完整部署细节（含创建存储、环境变量示例、Vercel 与自建说明）请看：

- [docs/deployment.md](docs/deployment.md)

## 环境变量（速览）

请参考 [.env.example](.env.example)。这里仅列关键分组：

- 必填：`ADMIN_USER`、`ADMIN_PASS`、`AUTH_SECRET`、`BUCKET_ENCRYPTION_KEY`
- 存储状态后端（二选一）：
  - Vercel/Upstash REST：`KV_REST_API_URL`、`KV_REST_API_TOKEN`（可自动回退读取 `UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`）
  - Cloudflare KV：`CF_ACCOUNT_ID`、`CF_KV_NAMESPACE_ID`、`CF_API_TOKEN`
- 可选后备桶：`S3_ENDPOINT`、`S3_REGION`、`S3_BUCKET`、`S3_ACCESS_KEY`、`S3_SECRET_KEY`
- 可选代理白名单：`PROXY_ALLOWED_HOSTS`

## 当前版本说明

- 当前版本：`1.0.0`
- 桶配置已迁移到服务端 KV 持久化
- Access Key / Secret Key 在服务端加密存储
- 默认桶可由环境变量提供，并在设置中心可见

## 常见问题

### 为什么换设备后看不到桶？

如果使用了服务端 KV 配置并且环境一致，桶配置会跨设备可见。

### 为什么看到“默认桶”？

这是来自环境变量的只读桶配置，用于兜底和快速恢复。

### 本项目只能部署在 Vercel 吗？

不是。只要能运行 Next.js 服务端并可访问外部 KV，都可以部署。
