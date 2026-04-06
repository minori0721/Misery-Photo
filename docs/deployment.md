# 完整部署文档

本文档覆盖从零开始部署 Misery Photo，包括：

- 选择并创建 KV（Vercel + Upstash Redis 或 Cloudflare KV）
- 配置环境变量
- 首次上线与验证
- 常见故障排查

## 1. 部署前准备

你需要准备：

1. 一个代码仓库（GitHub）
2. 一个KV空间（本文可教你准备，如果没有的话就需要将s3的参数填写进环境变量，且只能绑定一个桶）
3. 一套 S3 兼容存储参数（endpoint、bucket、access key、secret key）
4. 一组强随机字符串：
   - `AUTH_SECRET`（建议 32 位，随便打）
   - `BUCKET_ENCRYPTION_KEY`（建议 32 位，随便打）

## 2. 关键架构说明

1. 登录账号：使用环境变量 `ADMIN_USER` 和 `ADMIN_PASS`。
2. 存储桶配置：持久化到 KV。
3. 密钥安全：`accessKeyId` 和 `secretAccessKey` 都会在服务端加密后写入 KV。

## 3. 创建 KV（方案 A：Vercel + Upstash Redis）（推荐）

 Vercel 账号在 Storage 页面不再直接显示 KV，而是显示 Upstash。此时按下面步骤即可。

1. 打开 Vercel 控制台。
2. 进入 Storage 页面，点击 Create Database。
3. 选择 Upstash，创建 Redis 实例（例如 misery-photo-kv）。
4. 在 Integration/Connect 中把它连接到当前 Vercel 项目。
5. Vercel 会自动注入变量（名称通常如下）：
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
6. 在项目环境变量中设置：
   - `BUCKET_STORE_PROVIDER=vercel`
7. 其余变量无需手工映射，代码会自动读取：
   - URL：`KV_REST_API_URL`，若为空则回退 `UPSTASH_REDIS_REST_URL`
   - 读 Token：`KV_REST_API_READ_ONLY_TOKEN`，若为空则回退 `KV_REST_API_TOKEN` / `UPSTASH_REDIS_REST_TOKEN`
   - 写 Token：`KV_REST_API_TOKEN`，若为空则回退 `UPSTASH_REDIS_REST_TOKEN`

说明：本项目把 Upstash REST 作为 Vercel 路径下的 KV 兼容接口使用。你也可以显式填写 `KV_REST_API_URL`/`KV_REST_API_TOKEN` 覆盖自动注入。

## 4. 创建 KV（方案 B：Cloudflare KV）

如果你更偏向 Cloudflare 生态，可用此方案。

1. 登录 Cloudflare Dashboard。
2. 进入 Workers & Pages -> KV，创建 Namespace（例如 `misery-photo`）。
3. 记录 Namespace ID。
4. 进入 My Profile -> API Tokens，创建一个 Token，至少赋予该 Namespace 的读写权限。
5. 在 Cloudflare 面板记录 Account ID。
6. 在 Vercel 项目环境变量中设置：
   - `BUCKET_STORE_PROVIDER=cloudflare`
   - `CF_ACCOUNT_ID=<Cloudflare Account ID>`
   - `CF_KV_NAMESPACE_ID=<Namespace ID>`
   - `CF_API_TOKEN=<API Token>`

## 5. 在 Vercel 配置环境变量

至少设置以下变量：

```env
ADMIN_USER=用户名
ADMIN_PASS=密码
AUTH_SECRET=一组强随机字符串
BUCKET_ENCRYPTION_KEY=一组强随机字符串

BUCKET_STORE_PROVIDER=vercel

#如果用vercel部署，并将Upstash Redis并绑定到了你在vercel上的本项目，下面的都可以不写！

KV_REST_API_URL=... # 可选，未配置时自动读取 UPSTASH_REDIS_REST_URL
KV_REST_API_TOKEN=... # 可选，未配置时自动读取 UPSTASH_REDIS_REST_TOKEN
KV_REST_API_READ_ONLY_TOKEN=... # 可选，仅用于读

# 或使用 Cloudflare KV：
# BUCKET_STORE_PROVIDER=cloudflare
# CF_ACCOUNT_ID=...
# CF_KV_NAMESPACE_ID=...
# CF_API_TOKEN=...

# 可选后备桶（无KV 时可作为兜底）
S3_ENDPOINT=
S3_REGION=auto
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=

PROXY_ALLOWED_HOSTS=
```

注意：

1. `AUTH_SECRET` 与 `BUCKET_ENCRYPTION_KEY` 最好不要复用，不要太短。
2. 生产环境必须使用 HTTPS（Vercel 默认满足）。
3. 如果换了加密密钥，旧桶密文会无法解密。

## 6. 部署流程

1. fork本仓库。
2. 在 Vercel 或者别的serverless部署服务中选择该项目部署，注意填入环境变量。
3. 等待构建完成。
4. 打开站点，访问登录页。
5. 使用 `ADMIN_USER` / `ADMIN_PASS` 登录。
6. 打开设置中心，新增存储桶并点击“测试连接”。
7. 保存并激活后，返回首页验证列表、上传、下载、批量操作是否正常。

## 6.1 自建服务器部署（VPS / Docker / 裸机）

本项目并不依赖 Vercel，可以部署在任意可运行 Next.js 的 Node.js 环境。

推荐做法：

1. 应用部署在自建服务器。
2. 桶配置存储仍使用外部 KV（Upstash 或 Cloudflare KV），减少自建状态服务复杂度。
3. 在服务器环境变量中设置与 Vercel 相同的变量名。

若你坚持使用自建 Redis：

1. 本项目当前走 REST 协议，不直接使用 Redis TCP 协议。
2. 需要先提供一个 Redis REST 网关，然后把网关地址填到 `KV_REST_API_URL`，并配置对应 Token。
3. 仅设置 `REDIS_URL` / `KV_URL` 不足以直接驱动当前实现。

## 7. 验证清单

发布后建议按顺序验证：

1. 新设备登录后可看到已保存桶（跨设备同步）
2. 切换当前桶后列表立即变化
3. 上传文件后可在对应目录看到
4. 下载和批量操作正常
5. 登出后重新登录，桶配置依旧存在

## 8. 故障排查

### 8.1 登录后显示无可用存储桶

可能原因：

1. 你还没在设置里保存桶
2. KV 没连上（环境变量缺失）
3. `BUCKET_ENCRYPTION_KEY` 缺失或变更，导致历史密文无法解密

排查建议：

1. 检查 Vercel 环境变量是否完整
2. 查看部署日志中的 KV 或解密报错
3. 用设置中心重新添加桶并测试连接

### 8.2 设置保存失败

可能原因：

1. KV Token 权限不足
2. Endpoint 格式非法
3. Bucket 名或 Access/Secret Key 错误

排查建议：

1. 先用“测试连接”验证
2. 确认 token 对应命名空间具备读写权限
3. 检查 endpoint 是否为完整 `https://` 地址

### 8.3 重部署后桶配置不见了

可能原因：

1. 切到了另一个环境（Preview 与 Production 变量不同）
2. KV 变量没配置到当前环境（仅配置了其中一个环境）
3. 修改了 `BUCKET_ENCRYPTION_KEY`，导致旧数据不可解密



## 9. 安全建议

1. 定期轮换 `ADMIN_PASS`、`AUTH_SECRET`、`BUCKET_ENCRYPTION_KEY`
2. 给 Cloudflare Token 最小权限
3. 仅在受信任网络进行管理员操作
4. 使用强密码并启用代码仓库 2FA
