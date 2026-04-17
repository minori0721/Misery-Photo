# Vercel 部署

本文档只覆盖 Misery-photo 主项目（Next.js）的生产部署。

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

## 3. 推荐域名策略

- 生产环境建议使用独立域名并启用 HTTPS。
- 如需多环境，建议 `preview` 与 `production` 分域名管理。

## 4. 故障排查

### 5.1 登录后无可用存储桶

- 检查 BUCKET_STORE_PROVIDER 与 KV 变量。
- 检查 BUCKET_ENCRYPTION_KEY 是否变更。

### 4.2 重部署后配置丢失

- 检查是否切换了 Vercel 环境（Preview/Production）。
- 检查环境变量是否在对应环境完整配置。

### 4.3 上传或代理请求频繁超时

- 检查对象存储 endpoint 连通性与区域设置。
- 检查 `PROXY_ALLOWED_HOSTS` 是否包含目标域名。
