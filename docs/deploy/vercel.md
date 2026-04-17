# Vercel 部署

本文档覆盖 Misery-photo 在 Vercel 的推荐部署流程。

## 1. 部署前准备

需要准备：

1. GitHub 代码仓库。
2. 一个可用 KV（推荐 Upstash，或 Cloudflare KV）。
3. 一组 S3 兼容存储参数。
4. 强随机字符串：AUTH_SECRET 与 BUCKET_ENCRYPTION_KEY。

## 2. 关键环境变量

至少需要以下变量：

```bash
ADMIN_USER=用户名
ADMIN_PASS=密码
AUTH_SECRET=随机字符串
BUCKET_ENCRYPTION_KEY=随机字符串

BUCKET_STORE_PROVIDER=vercel

# 可选：显式填写 Upstash REST
KV_REST_API_URL=
KV_REST_API_TOKEN=
KV_REST_API_READ_ONLY_TOKEN=
```

可选后备桶：

```bash
S3_ENDPOINT=
S3_REGION=auto
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
PROXY_ALLOWED_HOSTS=
```

## 3. 标准流程

1. 在 Vercel 导入仓库。
2. 配置环境变量并触发部署。
3. 部署完成后访问站点并登录。
4. 在设置中新增并测试桶连接。
5. 激活桶后回到首页验证列表、上传、下载与批量操作。

## 4. 验证清单

- 新设备登录后能读取已保存桶配置。
- 切换桶后列表立即变化。
- 上传图片/视频后可见。
- 下载与批量操作可用。

## 5. 常见故障

### 登录后提示无可用存储桶

- 可能是 KV 未连通，或环境变量未配置完整。

### 设置保存失败

- 重点检查 Token 权限、Endpoint 格式、桶参数正确性。

### 重部署后桶配置丢失

- 检查是否切换了 Vercel 环境，或修改了 BUCKET_ENCRYPTION_KEY。
