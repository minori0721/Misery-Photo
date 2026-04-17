# 快速开始

## 环境要求

- Node.js 18+
- npm 9+
- 一个可用的 S3 兼容存储桶（S3/R2/OSS 皆可）

## 本地运行主项目

在仓库根目录执行：

```bash
npm install
npm run dev
```

访问 `http://localhost:3000`。

## 最小环境变量

首次启动前，建议在根目录创建 `.env.local` 并至少填写：

```bash
ADMIN_USER=admin
ADMIN_PASS=your-password
AUTH_SECRET=your-random-secret
BUCKET_ENCRYPTION_KEY=your-random-key
BUCKET_STORE_PROVIDER=vercel
```

完整变量说明见 [环境变量与配置](/guide/configuration)。

## 首次登录与初始化

1. 打开登录页并使用 `ADMIN_USER`/`ADMIN_PASS` 登录。
2. 进入设置中心，新增一个存储桶配置。
3. 点击测试连接通过后保存并激活。
4. 返回首页，确认文件列表可读。

## 本地运行文档站

在 `docs` 目录执行：

```bash
npm install
npm run docs:dev
```

默认访问地址为 `http://localhost:5173`。

## 快速验证清单

- 登录成功且不报 401。
- 桶测试连接成功。
- 上传一张图或一段视频后可在首页看到。
- 下载、删除、批量操作至少验证一项。
