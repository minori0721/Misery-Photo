# 认证接口

## 通用说明

- Content-Type: `application/json`
- 登录成功后服务端通过 Set-Cookie 写入会话。
- 后续请求需携带会话 Cookie。

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

### 状态码

- 200: 登录成功
- 400: 用户名或密码格式不正确
- 401: 用户名或密码错误
- 429: 尝试次数过多
- 500: 服务端配置异常

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

### cURL 示例

```bash
curl -X POST "https://your-domain.com/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'
```

## POST /api/logout

清理会话 Cookie 并退出。

### 成功响应

```json
{
  "success": true
}
```

### cURL 示例

```bash
curl -X POST "https://your-domain.com/api/logout" \
  -H "Cookie: your-session-cookie"
```
