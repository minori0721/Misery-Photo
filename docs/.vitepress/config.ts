import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Misery-photo Docs',
  description: 'Misery-photo 使用、部署与接口文档',
  lang: 'zh-CN',
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: '首页', link: '/' },
      { text: '指南', link: '/guide/introduction' },
      { text: '功能', link: '/features/overview' },
      { text: '部署', link: '/deploy/vercel' },
      { text: 'API', link: '/api/index' },
      { text: '常见问题', link: '/faq/' }
    ],
    sidebar: {
      '/guide/': [
        {
          text: '指南',
          items: [
            { text: '介绍', link: '/guide/introduction' },
            { text: '快速开始', link: '/guide/quick-start' },
            { text: '系统架构', link: '/guide/architecture' },
            { text: '环境变量与配置', link: '/guide/configuration' }
          ]
        }
      ],
      '/features/': [
        {
          text: '功能',
          items: [
            { text: '功能概览', link: '/features/overview' },
            { text: '媒体管理', link: '/features/media-management' },
            { text: '批量操作', link: '/features/batch-operations' },
            { text: '桶与安全', link: '/features/buckets-and-security' }
          ]
        }
      ],
      '/deploy/': [
        {
          text: '部署',
          items: [
            { text: 'Vercel 部署', link: '/deploy/vercel' },
            { text: '自建部署', link: '/deploy/self-hosted' }
          ]
        }
      ],
      '/api/': [
        {
          text: 'API',
          items: [
            { text: '接口总览', link: '/api/index' },
            { text: '认证接口', link: '/api/auth' },
            { text: '图库接口', link: '/api/gallery' },
            { text: '桶配置接口', link: '/api/buckets' },
            { text: '上传与代理接口', link: '/api/upload-and-proxy' }
          ]
        }
      ],
      '/faq/': [
        {
          text: '常见问题',
          items: [{ text: '问题排查', link: '/faq/' }]
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
