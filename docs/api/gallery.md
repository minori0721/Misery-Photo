# 图库接口

## 通用约束

- 需要登录会话。
- 路径字段最大长度通常为 1024。
- 批量 keys 上限为 2000，批量 paths 上限为 1000。

## GET /api/gallery

获取目录内容或签名模式列表入口。

### 查询参数

- path: 目录前缀，可为空
- json: 1 表示返回 JSON 列表模式
- foldersOnly: 1 表示仅返回文件夹（仅 json=1 有效）
- continuationToken: 分页 token（签名模式）
- maxKeys: 1-1000

### 状态码

- 200: 成功
- 400: 参数不合法
- 401: 未授权
- 500: 服务端异常

### JSON 模式响应示例

```json
{
  "success": true,
  "mode": "json",
  "data": {
    "folders": [],
    "files": [],
    "currentPath": ""
  }
}
```

### 签名模式响应示例

```json
{
  "success": true,
  "mode": "signer",
  "data": {
    "currentPath": "",
    "listUrl": "https://..."
  }
}
```

## POST /api/gallery

批量签名下载 URL。

### 请求体

```json
{
  "action": "sign-get-objects",
  "keys": ["folder/a.jpg", "folder/b.mp4"]
}
```

### 状态码

- 200: 成功
- 400: action/keys 不合法
- 401: 未授权
- 500: 签名失败

### 响应示例

```json
{
  "success": true,
  "data": {
    "folder/a.jpg": "https://...",
    "folder/b.mp4": "https://..."
  }
}
```

## POST /api/gallery/delete

删除单个文件或整个文件夹。

### 请求体

```json
{
  "path": "album/a.jpg",
  "type": "image"
}
```

type 可选值：

- image
- folder

### 状态码

- 200: 删除成功
- 400: 参数不合法
- 401: 未授权
- 500: 删除失败

## POST /api/gallery/batch

执行批量删除、复制、移动。

### 请求体

```json
{
  "action": "copy",
  "paths": ["album/a.jpg", "album2/"],
  "dest": "target/"
}
```

action 可选值：

- delete
- copy
- move

### 成功响应示例

```json
{
  "success": true,
  "message": "已复制 12 个对象到 target/"
}
```

### 状态码

- 200: 操作成功
- 400: 参数不合法或目标路径冲突
- 401: 未授权
- 500: 批量操作失败

### 说明

- paths 数量上限 1000。
- move 采用先 copy 后 delete。
- 目标路径不允许位于源文件夹内部。

## GET /api/gallery/folder-preview

该接口已废弃，当前返回 410。

## 调用示例

### 列出根目录（签名模式）

```bash
curl "https://your-domain.com/api/gallery?path=" \
  -H "Cookie: your-session-cookie"
```

### 仅获取文件夹（JSON 模式）

```bash
curl "https://your-domain.com/api/gallery?path=album/&json=1&foldersOnly=1" \
  -H "Cookie: your-session-cookie"
```
