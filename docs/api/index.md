# API 接口总览

本文档基于当前代码实现整理，接口前缀均为 `/api/*`。

## 通用约定

- 大多数接口要求登录会话，未登录返回 401。
- 返回 JSON 结构通常包含 `success` 与 `message` 或 `data`。
- 路径参数会做校验，非法输入通常返回 400。

## 接口分组

### 认证

- POST /api/login
- POST /api/logout

详见 [认证接口](/api/auth)。

### 图库与文件

- GET /api/gallery
- POST /api/gallery
- POST /api/gallery/delete
- POST /api/gallery/batch
- GET /api/gallery/folder-preview（已废弃，返回 410）

详见 [图库接口](/api/gallery)。

### 桶配置

- GET /api/settings/buckets
- POST /api/settings/buckets

详见 [桶配置接口](/api/buckets)。

### 上传与代理

- POST /api/upload
- GET /api/proxy

详见 [上传与代理接口](/api/upload-and-proxy)。

## 错误码参考

- 200: 成功
- 400: 请求参数不合法
- 401: 未登录或会话失效
- 403: 代理目标域名不允许
- 404: 资源不存在
- 410: 接口已废弃
- 429: 登录尝试过多
- 500: 服务端错误
- 504: 上游超时
