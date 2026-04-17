# Docker 部署

本页适用于希望通过已发布镜像快速部署 Misery-photo 的场景。

## 1. 部署方式

本项目 Docker 推荐方式：拉取已发布镜像并运行。


## 2. 标准部署（compose + .env）

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

环境变量完整说明见：

- [环境变量与配置](/guide/configuration)

启动命令：

```bash
docker compose pull
docker compose up -d
```

访问：`http://服务器IP:3000`

## 3. 单文件部署（环境变量写在 yaml 内）

如果你希望只维护一个文件，可以把环境变量直接写到 compose 里。

创建 `docker-compose.yml`：

```yaml
services:
  misery-photo:
    image: yourname/misery-photo:latest
    container_name: misery-photo
    restart: always
    ports:
      - "3000:3000"
    environment:
      - ADMIN_USER=admin
      - ADMIN_PASS=your-password
      - AUTH_SECRET=your-random-secret
      - BUCKET_ENCRYPTION_KEY=your-random-key
      - BUCKET_STORE_PROVIDER=vercel
      # 多桶（Upstash/Cloudflare）或后备桶变量按需添加
      # 参考: https://docs.photo.minori.eu.cc/guide/configuration
```

启动命令：

```bash
docker compose pull
docker compose up -d
```

## 4. 升级策略

```bash
docker compose pull
docker compose up -d
```

建议：

- 生产环境优先使用固定版本 tag（例如 `v1.0.0`），不要长期使用 `latest`。
- 升级前备份关键环境变量。

## 5. 常见问题

### 1) 容器启动后接口 500

优先检查环境变量是否配置完整，尤其是：

- AUTH_SECRET
- BUCKET_ENCRYPTION_KEY
- BUCKET_STORE_PROVIDER

完整变量说明：

- [环境变量与配置](/guide/configuration)

### 2) 无法连接对象存储

检查：

- endpoint 和 region 是否正确
- 容器网络是否可出网
- 防火墙/安全组是否拦截

### 3) 更新后不生效

- 是否执行了 `docker compose pull`
- compose 中是否仍指向旧 tag

### 4) 我不知道变量该怎么填

请先看：

- [环境变量与配置](/guide/configuration)
