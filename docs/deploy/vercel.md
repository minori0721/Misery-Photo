# Vercel 部署

本文档覆盖 Misery-photo 项目（Next.js）的部署。

## 1. 部署前准备

1. GitHub 仓库已可访问。
2. (不强制要求)准备 KV（推荐 Upstash，或 Cloudflare KV）。
3. 准备 S3 兼容桶参数。
4. 准备两个随机字符串：AUTH_SECRET、BUCKET_ENCRYPTION_KEY。

## 2. 应用部署（Next.js）

### 2.1 新建项目

1. 在 Vercel 选择你fork好的本仓库并创建项目。
2. 除环境变量外的设置都不需要调整，默认即可。
3. 检查一下 Framework Preset 是否是 Next.js 如果不是需要调成这个。

### 2.2 配置环境变量

```bash
ADMIN_USER=用户名
ADMIN_PASS=密码
AUTH_SECRET=随机字符串，越长越好（变更后现有登录会话会失效）
AUTH_ALLOW_HTTP_LOGIN=false
BUCKET_ENCRYPTION_KEY=随机字符串，越长越好（变更后历史桶密文可能无法解密）
BUCKET_STORE_PROVIDER=vercel

# 下面的请根据你的选择来挑选着填
# 1.我需要配置多个桶，并且打算使用 Vercel 中可免费获取的 Upstash 存储空间。那么请跳到 PROXY_ALLOWED_HOSTS。
# 2.我需要配置多个桶，并且有别的 KV 空间：
#   - 如果你用的是 Cloudflare KV，请将 BUCKET_STORE_PROVIDER 改为 cloudflare。
#   - 如果你用的是其他 REST 兼容 KV，请保持 BUCKET_STORE_PROVIDER=vercel，并填可选显式配置。
# 3.我只需要部署一个桶，而且没有添加新桶的需求，请将这个需要管理的桶的配置填入： 可选后备桶

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

# 可选：允许代理访问的额外域名，逗号分隔
PROXY_ALLOWED_HOSTS=example.com,cdn.example.com
```
### 2.3 Upstash 获取

1. 打开 Vercel，选中本项目。
2. 点击左侧栏的“storage”
3. 点击“Marketplace Database Providers”中的“Upstash”，在展开栏中点击“Upstash for Redis”右侧的 Create。
4. 在右侧“Install Integration”的窗口中，点击右侧黑色的“Accept and Create”。
5. 在“Primary Region”中选择距离你较近的地区，或者保持默认。
6. Installation Plans 选择 Free。
7. 按页面提示依次点击 Confirm / Create 完成创建（按钮文案可能随版本变化）。
8. 完成啦！环境变量会自动绑定到本项目！

### 2.4 首次验证

1. 登录后台。
2. 新增并测试桶连接。
3. 激活桶后验证列表、上传、下载、批量操作。

## 3. 推荐域名策略

- 生产环境建议使用独立域名并启用 HTTPS。
- 如需多环境，建议 `preview` 与 `production` 分域名管理。
- 若你临时只能用 HTTP 访问，可将 `AUTH_ALLOW_HTTP_LOGIN=true` 作为排障开关；恢复 HTTPS 后请改回 `false`。

## 4. 故障排查

### 4.1 登录后无可用存储桶

- 检查 BUCKET_STORE_PROVIDER 与 KV 变量。
- 检查 BUCKET_ENCRYPTION_KEY 是否变更。

### 4.2 重部署后配置丢失

- 检查是否切换了 Vercel 环境（Preview/Production）。
- 检查环境变量是否在对应环境完整配置。

### 4.3 上传或代理请求频繁超时

- 检查对象存储 endpoint 连通性与区域设置。
- 检查 `PROXY_ALLOWED_HOSTS` 是否包含目标域名。

### 4.4 登录成功但立刻回到登录页

- 常见原因是 HTTP 下浏览器不接受安全会话 Cookie。
- 优先方案：改为 HTTPS 访问。
- 临时方案：设置 `AUTH_ALLOW_HTTP_LOGIN=true` 后重新部署。
