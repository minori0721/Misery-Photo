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
