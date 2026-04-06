# 完整部署文档

本文档覆盖从零开始部署 Misery Photo 1.0.0，包括：

- 选择并创建 KV（Vercel KV 或 Cloudflare KV）
- 配置环境变量
- 首次上线与验证
- 常见故障排查

## 1. 部署前准备

你需要准备：

1. 一个代码仓库（GitHub）
2. 一个 Vercel 账号
3. 一套 S3 兼容存储参数（endpoint、bucket、access key、secret key）
4. 一组强随机字符串：
   - `AUTH_SECRET`（建议 32 位）
   - `BUCKET_ENCRYPTION_KEY`（建议 32 位）

## 2. 关键架构说明

1. 登录账号：仍使用环境变量 `ADMIN_USER` 和 `ADMIN_PASS`。
2. 存储桶配置：持久化到 KV，不再放浏览器 Cookie。
3. 密钥安全：`accessKeyId` 和 `secretAccessKey` 都会在服务端加密后写入 KV。
4. 本版本不做旧 Cookie 自动迁移：升级后请手动在设置中心重新添加存储桶。

## 3. 创建 KV（方案 A：Vercel KV）

推荐优先使用此方案，步骤最少。

1. 打开 Vercel 控制台。
2. 进入 Storage 页面，点击 Create Database。
3. 选择 KV，创建一个实例（例如 `misery-photo-kv`）。
4. 创建完成后，进入该 KV 的 Connect/Environment Variables 面板。
5. 记录以下变量：
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
6. 在你的项目环境变量中设置：
   - `BUCKET_STORE_PROVIDER=vercel`
   - `KV_REST_API_URL=<上一步值>`
   - `KV_REST_API_TOKEN=<上一步值>`

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
ADMIN_USER=admin
ADMIN_PASS=your_password
AUTH_SECRET=your_32_chars_random_secret
BUCKET_ENCRYPTION_KEY=your_32_chars_random_key

BUCKET_STORE_PROVIDER=vercel
KV_REST_API_URL=...
KV_REST_API_TOKEN=...

# 或使用 Cloudflare KV：
# BUCKET_STORE_PROVIDER=cloudflare
# CF_ACCOUNT_ID=...
# CF_KV_NAMESPACE_ID=...
# CF_API_TOKEN=...

# 可选后备桶（KV 无桶时可作为兜底）
S3_ENDPOINT=
S3_REGION=auto
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=

PROXY_ALLOWED_HOSTS=
```

注意：

1. `AUTH_SECRET` 与 `BUCKET_ENCRYPTION_KEY` 不要复用，不要太短。
2. 生产环境必须使用 HTTPS（Vercel 默认满足）。
3. 如果换了加密密钥，旧桶密文会无法解密。

## 6. 部署流程

1. 在仓库推送代码到目标分支（例如 `dev`）。
2. 在 Vercel 中选择该分支部署。
3. 等待构建完成。
4. 打开站点，访问登录页。
5. 使用 `ADMIN_USER` / `ADMIN_PASS` 登录。
6. 打开设置中心，新增存储桶并点击“测试连接”。
7. 保存并激活后，返回首页验证列表、上传、下载、批量操作是否正常。

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

## 9. 回滚建议

若 1.0.0 发布后出现问题：

1. 先在 Vercel 回滚到上一稳定部署
2. 保留当前 KV 数据，不要先删除
3. 修复后再重新部署

## 10. 安全建议

1. 定期轮换 `ADMIN_PASS`、`AUTH_SECRET`、`BUCKET_ENCRYPTION_KEY`
2. 给 Cloudflare Token 最小权限
3. 仅在受信任网络进行管理员操作
4. 使用强密码并启用代码仓库 2FA
