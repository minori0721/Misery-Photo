# Misery Photo 🌿

![Misery Photo](https://img.shields.io/badge/Next.js-16-black?style=flat&logo=next.js) ![TailwindCSS](https://img.shields.io/badge/Tailwind-V4-38B2AC?style=flat&logo=tailwind-css) ![AWS SDK](https://img.shields.io/badge/S3_R2_OSS-Ready-FF9900?style=flat&logo=amazon-aws) 

一个拥有顶级二次元感官的**全栈私有云图册系统**。抛弃臃肿传统的企业级网盘，拥抱为插画、摄影师及画集收藏者专属定制沉浸式视觉体验。原生支持任意兼容 S3 协议的云存储 (如 AWS S3, Cloudflare R2, 阿里/腾讯 OSS 等)。

## ✨ 核心特性 / Features

*   **智能“画集/漫画”视口切换**：根目录总览采用 3:4 比例长款网格封面展示，一旦进入合集，系统感知自动切换到无缝瀑布长图“漫画模式”。
*   **极简操作 & 一键全选沉浸式下载**：内建代理 API 穿透云存储 CORS 限制，支持在浏览器端将整个文件夹高速打包为 `.zip` 进行离线收藏。
*   **自动拦截的私有画廊**：内置加密凭据，保障数据不被公有网盘爬虫非法窃取，只有您拥有该领域的全权访问许可。
*   **Miku 青空初音定制主题**：引入精美的半透明磨砂盖板与全卡片环境呼吸光效，兼顾优雅与二次元纯粹美学。
*   **原生云存储架构 (Serverless Ready)**：上传媒体数据直通 OSS/R2，不占用自身服务器带宽资源，最高支持 ZIP 包内部结构的一键云端解压并自动归类功能。

## 🚀 部署指南 / Deployment

本项目强依赖 Next.js 的 SSR 渲染与 API Routes，因此 **无法** 部署于纯静态网页面板 (如 GitHub Pages / Gitee Pages)。

### 方案 A: 平台级一键部署 (推荐)
最适合毫无服务器折腾经验的用户，点击即达：
1. Fork 此仓库到你的个人 GitHub 中。
2. 登录平台 [Vercel](https://vercel.com/)。
3. 点击 `New Project`，选择你的仓库，并将下方的『必要环境变量』在 Vercel 的 Environment Variables 面板中全部对应填好即可一键起飞。

### 方案 B: 传统的 Node.js 或自建 VPS 部署
在您的云服务器终端中依次执行拉取及启动命令：
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
默认会在您的服务器 `http://localhost:3000` 掀开这层神秘面纱。

## 🔐 必须填写的环境变量 (Environment Variables)

无论使用哪一种搭建环境，务必注入以下配置方可生效（详见 `.env.example`）：

```env
S3_ENDPOINT="https://xxxx.r2.cloudflarestorage.com"
S3_REGION="auto"
S3_BUCKET="你的存储桶名"
S3_ACCESS_KEY="云存公钥"
S3_SECRET_KEY="云存密匙"

ADMIN_USER="管理员用户名"
ADMIN_PASS="管理员密码"
AUTH_SECRET="用作登录令牌防篡改的随机哈希密钥（随便打一长串字符即可）"
```
