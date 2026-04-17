# 常见问题

## 1. 为什么登录后看不到桶配置？

优先检查 KV 连接与环境变量是否完整，尤其是 BUCKET_STORE_PROVIDER 与对应 Token。

## 2. 为什么部署后历史桶解密失败？

通常是 BUCKET_ENCRYPTION_KEY 变更导致，旧密文无法被新密钥解密。

## 3. 项目是否只能部署到 Vercel？

不是。只要运行环境支持 Next.js 服务端并可访问外部 KV，也可以自建部署。
