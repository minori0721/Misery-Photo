import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Misery-photo',
  description: 'Misery-photo 项目介绍、使用指南、部署与接口文档',
  lang: 'zh-CN',
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: '首页', link: '/' },
      { text: '新手上手', link: '/guide/quick-start' },
      { text: '部署上线', link: '/deploy/vercel' },
      { text: '日常使用', link: '/features/media-management' },
      { text: '开发联调', link: '/api/index' },
      { text: '问题排查', link: '/faq/' },
      { text: '版本迁移', link: '/migration/index' }
    ],
    sidebar: {
      '/': [
        {
          text: '01 新手上手',
          items: [
            { text: '介绍', link: '/guide/introduction' },
            { text: '快速开始', link: '/guide/quick-start' },
            { text: '系统架构', link: '/guide/architecture' },
            { text: '环境变量与配置', link: '/guide/configuration' }
          ]
        },
        {
          text: '02 日常使用',
          items: [
            { text: '功能概览', link: '/features/overview' },
            { text: '媒体管理', link: '/features/media-management' },
            { text: '批量操作', link: '/features/batch-operations' },
            { text: '桶与安全', link: '/features/buckets-and-security' }
          ]
        },
        {
          text: '03 部署上线',
          items: [
            { text: 'Vercel 部署', link: '/deploy/vercel' },
            { text: '自建部署', link: '/deploy/self-hosted' }
          ]
        },
        {
          text: '04 开发联调',
          items: [
            { text: '接口总览', link: '/api/index' },
            { text: '认证接口', link: '/api/auth' },
            { text: '图库接口', link: '/api/gallery' },
            { text: '桶配置接口', link: '/api/buckets' },
            { text: '上传与代理接口', link: '/api/upload-and-proxy' }
          ]
        },
        {
          text: '05 问题排查',
          items: [{ text: '问题排查', link: '/faq/' }]
        },
        {
          text: '06 版本迁移',
          items: [{ text: '版本迁移指南', link: '/migration/index' }]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/minori0721/Misery-Photo' }
    ],
    outline: {
      level: [2, 3],
      label: '本页目录'
    },
    docFooter: {
      prev: '上一页',
      next: '下一页'
    },
    search: {
      provider: 'local'
    }
  }
});
