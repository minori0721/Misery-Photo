---
layout: home

hero:
  name: Misery-photo
  text: 私有媒体管理系统
  tagline: 面向 S3 兼容存储的一站式图片/视频管理项目
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/introduction
    - theme: alt
      text: 部署上线
      link: /deploy/vercel

features:
  - icon: 🗂️
    title: 多桶多云兼容
    details: 统一管理 S3、R2、OSS 等兼容对象存储，按需切换与扩展。
  - icon: 🔐
    title: 私有与安全优先
    details: 管理员鉴权、服务端会话校验、密钥加密存储，默认面向私有场景。
  - icon: ⚡
    title: 一站式媒体闭环
    details: 覆盖上传、浏览、下载和批量操作，含视频能力与 ZIP 媒体导入。
---

## 项目简介

Misery-photo 是一个面向私有场景的媒体管理项目，重点解决以下问题：

- 统一管理 S3/R2/OSS 兼容存储中的图片与视频。
- 用最小部署复杂度提供登录鉴权、桶切换与批量操作能力。
- 在保障安全的前提下提供可扩展的接口与配置体系。

## 你可以用它做什么

- 搭建私有图床或素材库。
- 管理按画集组织的图片与视频内容。
- 为小团队提供可部署、可维护的媒体后台。

## 推荐阅读路径

1. 首次使用： [快速开始](/guide/quick-start)
2. 准备上线： [Vercel 部署](/deploy/vercel)
3. 日常管理： [媒体管理](/features/media-management)
4. 二次开发： [API 接口总览](/api/index)
5. 故障排查： [常见问题](/faq/)

## 版本说明

- 当前文档与仓库 `main` 分支同步。
- 版本变更和兼容性说明见 [版本迁移指南](/migration/index)。
