# 环境变量与配置

本页按用途说明关键环境变量，完整样例可参考仓库根目录的 `.env.example`。

## 最小可用模板（推荐起步）

```bash
ADMIN_USER=admin
ADMIN_PASS=your-password
AUTH_SECRET=replace-with-random-string
BUCKET_ENCRYPTION_KEY=replace-with-random-string
BUCKET_STORE_PROVIDER=vercel
```

满足以上配置后即可登录并在设置页添加桶。

## 必填安全变量

```bash
ADMIN_USER=admin
ADMIN_PASS=your-password
AUTH_SECRET=at-least-16-chars
BUCKET_ENCRYPTION_KEY=at-least-16-chars
```

说明：

- AUTH_SECRET 用于会话签名，缺失会导致鉴权接口不可用。
- BUCKET_ENCRYPTION_KEY 用于桶密钥加密，变更后旧密文可能无法解密。

## 桶状态存储后端

```bash
BUCKET_STORE_PROVIDER=vercel
```

可选值：

- vercel：使用 Upstash REST 兼容路径。
- cloudflare：使用 Cloudflare KV。

## 存储后端选择建议

- 个人快速上线：优先 `vercel`（搭配 Upstash）。
- Cloudflare 生态：使用 `cloudflare`。
- 需要自建但不想接 TCP Redis：提供 REST 网关后接入 `KV_REST_API_URL`。

## Vercel/Upstash 变量（推荐）

```bash
KV_REST_API_URL=
KV_REST_API_TOKEN=
KV_REST_API_READ_ONLY_TOKEN=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

读取优先级：

- URL: KV_REST_API_URL -> UPSTASH_REDIS_REST_URL
- 读 Token: KV_REST_API_READ_ONLY_TOKEN -> KV_REST_API_TOKEN -> UPSTASH_REDIS_REST_TOKEN
- 写 Token: KV_REST_API_TOKEN -> UPSTASH_REDIS_REST_TOKEN

当你在 Vercel 已绑定 Upstash 时，通常只需配置 `BUCKET_STORE_PROVIDER=vercel`，其余可由自动注入变量兜底。

## Cloudflare KV 变量

```bash
CF_ACCOUNT_ID=
CF_KV_NAMESPACE_ID=
CF_API_TOKEN=
```

当 `BUCKET_STORE_PROVIDER=cloudflare` 时生效。

## 可选后备桶

## 可选后备桶

当 KV 不可用或你只想维护一个桶时，可提供后备桶环境变量：

```bash
S3_ENDPOINT=
S3_REGION=auto
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
```

说明：

- 后备桶适合单桶场景或临时恢复。
- 多桶场景仍建议使用 KV 持久化。

## 代理白名单

```bash
PROXY_ALLOWED_HOSTS=example.com,cdn.example.com
```

- 未配置时默认只允许当前激活桶 endpoint 对应域名。
- 建议仅放可信域名，避免代理被滥用。

## 配置建议

- 生产环境务必启用 HTTPS。
- 不要复用 AUTH_SECRET 与 BUCKET_ENCRYPTION_KEY。
- 不要将真实密钥提交到仓库。
- Preview 与 Production 环境变量建议分别配置并标记。

## 常见配置错误

### 1) 登录接口 500

- 常见原因：`AUTH_SECRET` 缺失。

### 2) 保存桶失败

- 常见原因：`BUCKET_ENCRYPTION_KEY` 缺失，或 KV Token 权限不足。

### 3) 上传成功但列表为空

- 常见原因：激活桶不是目标桶，或 endpoint/region 配错。

### 4) 代理接口 403

- 常见原因：目标域名不在白名单（`PROXY_ALLOWED_HOSTS`）。
