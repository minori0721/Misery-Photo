# Misery Photo.dev 🌿

![Misery Photo](https://img.shields.io/badge/Next.js-16-black?style=flat&logo=next.js) ![TailwindCSS](https://img.shields.io/badge/Tailwind-V4-38B2AC?style=flat&logo=tailwind-css) ![AWS SDK](https://img.shields.io/badge/S3_R2_OSS-Ready-FF9900?style=flat&logo=amazon-aws) ![Sharp](https://img.shields.io/badge/Sharp-Optimized-blue?style=flat&logo=sharp)

一个拥有顶级二次元感官的**全栈私有云图册系统**。抛弃臃肿传统的企业级网盘，拥抱为插画、摄影师及画集收藏者专属定制沉浸式视觉体验。原生支持任意兼容 S3 协议的云存储 (如 AWS S3, Cloudflare R2, 阿里/腾讯 OSS 等)。

## ✨ 核心特性 / Features

*   **智能“画集/漫画”视口切换**：根目录总览采用 3:4 比例长款网格封面展示，一旦进入合集，系统感知自动切换到无缝瀑布长图“漫画模式”。
*   **性能飞跃 (Sharp Optimized)**：独家引入服务端动态图片压缩代理。当单张封面或预览图超过 2MB 时，系统自动进行智能下采样与画质平稳压缩，加载速度提升 500% 以上。
*   **漫画模式无缝加载 (Layout Stability)**：引入骨架屏占位与加载优先级策略，彻底解决长图模式下因图片异步加载导致的“页面跳动”与“布局偏移”痛点，阅读体验丝滑如丝。
*   **极简操作 & 一键全选沉浸式下载**：内建代理 API 穿透云存储 CORS 限制，支持在浏览器端将整个文件夹高速打包为 `.zip` 进行离线收藏。
*   **多选批量管理模式**：支持一键进入多权管理，对海量图片执行批量移动、复制、删除与定向下载。
*   **Miku 青空初音定制主题**：引入精美的半透明磨砂盖板与全卡片环境呼吸光效，兼顾优雅与纯粹美学。
*   **原生云存储架构 (Serverless Ready)**：上传媒体数据直通 OSS/R2，不占用自身服务器带宽资源，最高支持 ZIP 包内部结构的一键云端解压并自动归类功能。

## 🚀 部署指南 / Deployment

本项目强依赖 Next.js 的 SSR 渲染与 API Routes，因此 **无法** 部署于纯静态网页面板 (如 GitHub Pages / Gitee Pages)。

### 方案 A: 平台级一键部署 (推荐)
1. Fork 此仓库到你的个人 GitHub 中。
2. 登录平台 [Vercel](https://vercel.com/)。
3. 点击 `New Project`，选择你的仓库，并将下方的『必要环境变量』在 Vercel 的 Environment Variables 面板中全部对应填好即可一键起飞。

### 方案 B: 传统的 Node.js 或自建 VPS 部署
```bash
# 1. 安装依赖 
npm install 

# 2. 复制环境变量配置文件并参照编辑
cp .env.example .env.local 
nano .env.local

# 3. 构建生产项目包
npm run build 

# 4. 驱动运行 
npm run start 
```

## 🔐 环境变量与运行时存储桶配置

务必注入管理员与会话密钥配置。S3 配置既可使用环境变量，也可在登录后通过设置中心新增多个存储桶并切换：

```env
S3_ENDPOINT="可选：S3 后备 endpoint"
S3_REGION="可选：默认 auto"
S3_BUCKET="可选：后备桶名"
S3_ACCESS_KEY="可选：后备 access key"
S3_SECRET_KEY="可选：后备 secret key"

ADMIN_USER="管理员用户名"
ADMIN_PASS="管理员密码"
AUTH_SECRET="至少16位随机字符串，用作登录令牌防篡改密钥（必填）"
PROXY_ALLOWED_HOSTS="可选，逗号分隔的代理白名单域名"
```

说明：
1. 当 AUTH_SECRET 缺失或过短时，服务端会拒绝鉴权相关接口请求，避免带病运行。
2. PROXY_ALLOWED_HOSTS 未设置时，代理仅放行 S3_ENDPOINT 对应域名。
3. 若既没有环境变量 S3 配置，也没有在设置中心激活任何存储桶，首页会显示“无可用存储桶”并引导配置。
