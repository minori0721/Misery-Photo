# 认证接口

## POST /api/login

用于登录并写入会话 Cookie。

### 请求体

```json
{
  "username": "admin",
  "password": "your-password"
}
```

### 成功响应

```json
{
  "success": true
}
```

### 失败响应示例

```json
{
  "success": false,
  "message": "用户名或密码错误"
}
```

### 说明

- 登录有失败延迟，降低暴力破解效率。
- 同一来源+用户名在窗口期内超过阈值会触发 429。

## POST /api/logout

清理会话 Cookie 并退出。

### 成功响应

```json
{
  "success": true
}
```
