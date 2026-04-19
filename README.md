# Misery-photo

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat&logo=next.js) ![TailwindCSS](https://img.shields.io/badge/Tailwind-V4-38B2AC?style=flat&logo=tailwind-css) ![AWS SDK](https://img.shields.io/badge/S3_R2_OSS-Ready-FF9900?style=flat&logo=amazon-aws) ![Sharp](https://img.shields.io/badge/Sharp-Optimized-blue?style=flat&logo=sharp)

Misery-photo 是一个面向私有场景的媒体管理项目，支持 S3/R2/OSS 等兼容对象存储，覆盖图片/视频上传、浏览、下载与批量操作。

完整文档请访问：[https://docs.photo.minori.eu.cc](https://docs.photo.minori.eu.cc)

## 项目亮点

- 多桶多云兼容：统一管理 S3、R2、OSS 等兼容对象存储
- 私有与安全优先：管理员鉴权、会话校验、密钥加密存储
- 一站式媒体闭环：上传、浏览、下载、批量操作，含视频与 ZIP 媒体导入

## 快速开始

### 1. 本地运行

```bash
npm install
npm run dev
```

默认访问地址：`http://localhost:3000`

### 2. 最小环境变量

请在本地环境中至少配置以下变量：

```bash
ADMIN_USER=admin
ADMIN_PASS=your-password
AUTH_SECRET=your-random-secret
BUCKET_ENCRYPTION_KEY=your-random-key
BUCKET_STORE_PROVIDER=vercel
```

完整变量说明见：[https://docs.photo.minori.eu.cc/guide/configuration](https://docs.photo.minori.eu.cc/guide/configuration)

### 3. 生产构建

```bash
npm run build
npm run start
```

## 文档导航

- 新手上手：[https://docs.photo.minori.eu.cc/guide/quick-start](https://docs.photo.minori.eu.cc/guide/quick-start)
- 部署上线：[https://docs.photo.minori.eu.cc/deploy/vercel](https://docs.photo.minori.eu.cc/deploy/vercel)
- Docker 部署：[https://docs.photo.minori.eu.cc/deploy/docker](https://docs.photo.minori.eu.cc/deploy/docker)
- 日常使用：[https://docs.photo.minori.eu.cc/features/media-management](https://docs.photo.minori.eu.cc/features/media-management)
- 开发联调：[https://docs.photo.minori.eu.cc/api/index](https://docs.photo.minori.eu.cc/api/index)
- 问题排查：[https://docs.photo.minori.eu.cc/faq/](https://docs.photo.minori.eu.cc/faq/)
- 版本迁移：[https://docs.photo.minori.eu.cc/migration/index](https://docs.photo.minori.eu.cc/migration/index)

## 部署说明

- 推荐部署平台：Vercel
- 也支持自建 Node.js 环境（可访问外部 KV 即可）

详细步骤：

- [https://docs.photo.minori.eu.cc/deploy/vercel](https://docs.photo.minori.eu.cc/deploy/vercel)
- [https://docs.photo.minori.eu.cc/deploy/self-hosted](https://docs.photo.minori.eu.cc/deploy/self-hosted)
- [https://docs.photo.minori.eu.cc/deploy/docker](https://docs.photo.minori.eu.cc/deploy/docker)
