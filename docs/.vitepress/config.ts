import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Misery-photo Docs',
  description: 'Misery-photo 文档中心',
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
      { text: 'API', link: '/api/' },
      { text: '常见问题', link: '/faq/' }
    ],
    sidebar: {
      '/guide/': [
        {
          text: '指南',
          items: [
            { text: '介绍', link: '/guide/introduction' },
            { text: '快速开始', link: '/guide/quick-start' }
          ]
        }
      ],
      '/features/': [
        {
          text: '功能',
          items: [
            { text: '功能概览', link: '/features/overview' }
          ]
        }
      ],
      '/deploy/': [
        {
          text: '部署',
          items: [
            { text: 'Vercel 部署', link: '/deploy/vercel' }
          ]
        }
      ],
      '/api/': [
        {
          text: 'API',
          items: [{ text: '接口总览', link: '/api/' }]
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
