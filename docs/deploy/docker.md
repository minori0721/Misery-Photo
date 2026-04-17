# Docker 部署

本页适用于希望通过镜像快速部署 Misery-photo 的场景。

## 1. 两种部署方式

### 方式 A：使用已发布镜像（推荐给普通用户）

优点：

- 不需要本地构建。
- 只需修改 docker-compose.yml 即可上线。

前提：

- 维护者已经将镜像发布到 Docker Hub/GHCR。

### 方式 B：本地构建镜像

优点：

- 不依赖外部镜像仓库。
- 适合开发调试或私有环境。

缺点：

- 每次更新都要重新构建镜像。

## 2. 使用已发布镜像部署

创建 `docker-compose.yml`：

```yaml
services:
  misery-photo:
    image: yourname/misery-photo:latest
    container_name: misery-photo
    restart: always
    ports:
      - "3000:3000"
    env_file:
      - .env
```

在同目录创建 `.env`，至少填写：

```bash
ADMIN_USER=admin
ADMIN_PASS=your-password
AUTH_SECRET=your-random-secret
BUCKET_ENCRYPTION_KEY=your-random-key
BUCKET_STORE_PROVIDER=vercel
```

启动命令：

```bash
docker compose pull
docker compose up -d
```

访问：`http://服务器IP:3000`

## 3. 本地构建镜像部署

在项目根目录执行：

```bash
docker build -t misery-photo:latest .
```

然后创建 `docker-compose.yml`：

```yaml
services:
  misery-photo:
    image: misery-photo:latest
    container_name: misery-photo
    restart: always
    ports:
      - "3000:3000"
    env_file:
      - .env
```

启动命令：

```bash
docker compose up -d
```

## 4. 升级策略

如果使用已发布镜像：

```bash
docker compose pull
docker compose up -d
```

如果使用本地构建镜像：

```bash
git pull
docker build -t misery-photo:latest .
docker compose up -d
```

## 5. 常见问题

### 1) 容器启动后接口 500

优先检查 `.env` 是否配置完整，尤其是：

- AUTH_SECRET
- BUCKET_ENCRYPTION_KEY
- BUCKET_STORE_PROVIDER

### 2) 无法连接对象存储

检查：

- endpoint 和 region 是否正确
- 容器网络是否可出网
- 防火墙/安全组是否拦截

### 3) 更新后不生效

- 已发布镜像请执行 `docker compose pull`
- 本地构建请确认重新执行了 `docker build`
