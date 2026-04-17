# 图库接口

## GET /api/gallery

获取目录内容或签名模式列表入口。

### 查询参数

- path: 目录前缀，可为空
- json: 1 表示返回 JSON 列表模式
- foldersOnly: 1 表示仅返回文件夹（仅 json=1 有效）
- continuationToken: 分页 token（签名模式）
- maxKeys: 1-1000

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

### 说明

- paths 数量上限 1000。
- move 采用先 copy 后 delete。
- 目标路径不允许位于源文件夹内部。

## GET /api/gallery/folder-preview

该接口已废弃，当前返回 410。
