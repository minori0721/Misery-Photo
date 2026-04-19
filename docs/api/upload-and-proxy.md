# 上传与代理接口

## POST /api/upload

生成对象上传预签名 URL。

### 请求体

```json
{
  "filename": "a.jpg",
  "path": "album/",
  "contentType": "image/jpeg"
}
```

### 响应示例

```json
{
  "success": true,
  "url": "https://...",
  "key": "album/a.jpg"
}
```

### 说明

- 签名有效期约 15 分钟。
- filename、path、contentType 都会做长度和格式校验。

### 状态码

- 200: 成功
- 400: 参数不合法
- 401: 未授权
- 500: 获取签名失败

### 上传流程建议

1. 调用 `/api/upload` 获取签名 URL。
2. 浏览器直接 PUT 到签名 URL。
3. 上传完成后刷新列表。

## GET /api/proxy

代理拉取媒体资源，可选缩略图压缩。

### 查询参数

- url: 目标资源地址（必须 https）
- thumbnail: true/false，true 时启用缩略图模式

### 安全限制

- 只允许 https 协议。
- 目标域名必须在白名单（endpoint 域名 + PROXY_ALLOWED_HOSTS）。
- 上游请求超时会返回 504。

### 缓存行为

- 常规代理响应默认 `max-age=3600`。
- 缩略图模式会返回更长缓存头。

### 状态码

- 200: 成功
- 400: url 缺失/格式错误/非 https
- 401: 未授权
- 403: 域名不在白名单
- 504: 上游请求超时
- 500: 代理失败

### 调用示例

```bash
curl "https://your-domain.com/api/proxy?url=https%3A%2F%2Fexample.com%2Fa.jpg&thumbnail=true" \
  -H "Cookie: your-session-cookie"
```
