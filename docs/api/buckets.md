# 桶配置接口

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
