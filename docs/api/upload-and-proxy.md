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

### 媒体类型与兼容性说明

- 前端当前识别的视频后缀包括：
  - `mp4`, `webm`, `mov`, `m4v`, `m3u8`, `ts`, `mkv`, `avi`, `wmv`, `flv`, `mpeg`, `mpg`, `3gp`, `ogv`
- 识别成功不等于浏览器必定可播放。
- 播放能力取决于容器与编解码组合，以及浏览器/系统/硬件能力。
- 若需要更高跨端稳定性，建议提供 `MP4(H.264)+AAC` 兼容版本。

## POST /api/upload/multipart

分片上传控制接口（创建会话、签名分片、完成合并、中止上传、查询已上传分片）。

### action=create

创建分片上传会话。

请求体示例：

```json
{
  "action": "create",
  "filename": "big-video.mp4",
  "path": "album/",
  "contentType": "video/mp4",
  "size": 6442450944,
  "partSize": 33554432
}
```

响应示例：

```json
{
  "success": true,
  "data": {
    "uploadId": "...",
    "key": "album/big-video.mp4",
    "partSize": 33554432
  }
}
```

### action=sign-part

获取指定分片上传 URL。

请求体示例：

```json
{
  "action": "sign-part",
  "uploadId": "...",
  "key": "album/big-video.mp4",
  "partNumber": 7
}
```

### action=complete

完成分片合并。

请求体示例：

```json
{
  "action": "complete",
  "uploadId": "...",
  "key": "album/big-video.mp4",
  "parts": [
    { "partNumber": 1, "etag": "\"etag-1\"" },
    { "partNumber": 2, "etag": "\"etag-2\"" }
  ]
}
```

### action=abort

放弃上传并清理未完成分片。

请求体示例：

```json
{
  "action": "abort",
  "uploadId": "...",
  "key": "album/big-video.mp4"
}
```

### action=list-parts

查询当前会话下已成功上传的分片。

请求体示例：

```json
{
  "action": "list-parts",
  "uploadId": "...",
  "key": "album/big-video.mp4"
}
```

### 分片上传建议

1. 单文件大于等于 64MB 时启用分片上传。
2. 默认分片大小建议 32MB。
3. 分片并发建议 3，大文件场景文件并发建议 1。
4. 每片失败最多重试 3 次，并采用指数退避。
5. 若全部重试后仍失败，允许用户继续失败分片或直接 abort。
6. 对象存储 CORS 需暴露 `ETag`，否则无法 complete。

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
