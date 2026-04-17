# Vercel 部署

本文档覆盖两个项目：

- 主应用：Misery-photo（Next.js）
- 文档站：Misery-photo Docs（VitePress）

## 1. 部署前准备

1. GitHub 仓库已可访问。
2. 准备 KV（推荐 Upstash，或 Cloudflare KV）。
3. 准备 S3 兼容桶参数。
4. 准备两个随机字符串：AUTH_SECRET、BUCKET_ENCRYPTION_KEY。

## 2. 主应用部署（Next.js）

### 2.1 新建项目

1. 在 Vercel 选择仓库并创建项目。
2. Root Directory 设为仓库根目录。
3. Framework Preset 选择 Next.js。

### 2.2 配置环境变量

```bash
ADMIN_USER=用户名
ADMIN_PASS=密码
AUTH_SECRET=随机字符串
BUCKET_ENCRYPTION_KEY=随机字符串
BUCKET_STORE_PROVIDER=vercel

# 可选显式配置
KV_REST_API_URL=
KV_REST_API_TOKEN=
KV_REST_API_READ_ONLY_TOKEN=

# 可选后备桶
S3_ENDPOINT=
S3_REGION=auto
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=

PROXY_ALLOWED_HOSTS=
```

### 2.3 首次验证

1. 登录后台。
2. 新增并测试桶连接。
3. 激活桶后验证列表、上传、下载、批量操作。

## 3. 文档站部署（VitePress）

文档站建议作为同仓库第二个 Vercel 项目独立部署。

### 3.1 新建 docs 项目

在 Vercel 新建项目后使用以下配置：

- Root Directory: docs
- Framework Preset: VitePress
- Install Command: npm install
- Build Command: npm run docs:build
- Output Directory: .vitepress/dist

文档站通常不需要额外环境变量。

### 3.2 部署后检查

1. 首页和侧栏能正常打开。
2. 本地搜索可用。
3. 页面链接无 404。

## 4. 推荐域名策略

- 主应用：your-domain.com
- 文档站：docs.your-domain.com

两个项目独立部署可降低互相影响。

## 5. 故障排查

### 5.1 登录后无可用存储桶

- 检查 BUCKET_STORE_PROVIDER 与 KV 变量。
- 检查 BUCKET_ENCRYPTION_KEY 是否变更。

### 5.2 文档站构建报 PostCSS/Tailwind 错误

- 确认 docs 目录存在独立 PostCSS 配置。
- 确认 docs 项目的 Root Directory 指向 docs。

### 5.3 重部署后配置丢失

- 检查是否切换了 Vercel 环境（Preview/Production）。
- 检查环境变量是否在对应环境完整配置。
