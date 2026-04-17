# 桶配置接口

## 通用说明

- 所有接口都需要登录会话。
- POST 通过 `action` 分发不同操作。
- 保存成功后返回的是公共视图（敏感字段脱敏）。

## GET /api/settings/buckets

获取桶列表与当前运行时摘要。

### 响应示例

```json
{
  "success": true,
  "data": {
    "buckets": [],
    "runtime": {
      "provider": "vercel",
      "activeBucketId": "xxx"
    }
  }
}
```

### 状态码

- 200: 成功
- 401: 未授权

## POST /api/settings/buckets

通过 action 执行不同桶配置操作。

### action: test

测试桶连接可用性。

```json
{
  "action": "test",
  "bucket": {
    "name": "my-bucket",
    "endpoint": "https://...",
    "region": "auto",
    "accessKeyId": "...",
    "secretAccessKey": "..."
  }
}
```

返回 `success=true/false` 与 `message`，失败通常是连接或参数问题。

### action: save

新增或更新桶配置。

```json
{
  "action": "save",
  "bucket": {
    "id": "optional-id",
    "name": "my-bucket"
  },
  "setActive": true
}
```

说明：

- `id` 为空时新增，存在时更新。
- `setActive=true` 时保存后立即激活。

### action: set-active

切换当前激活桶。

```json
{
  "action": "set-active",
  "id": "bucket-id"
}
```

### action: remove

删除指定桶配置。

```json
{
  "action": "remove",
  "id": "bucket-id"
}
```

### action: get-bucket

获取可编辑桶详情。

```json
{
  "action": "get-bucket",
  "id": "bucket-id"
}
```

## 说明

- 默认环境桶通常不可编辑或删除。
- 保存、切换、删除操作都会持久化到 KV。

## 常见状态码

- 200: 成功
- 400: action 或参数不合法
- 401: 未授权
- 404: 目标桶不存在
- 500: 服务端处理失败
