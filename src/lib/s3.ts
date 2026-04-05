import { S3Client } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";

const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "auto",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "",
    secretAccessKey: process.env.S3_SECRET_KEY || "",
  },
  // 针对跨国网络不稳定（美国->中国），大幅延长连接超时限制至 30 秒
  requestHandler: new NodeHttpHandler({
    connectionTimeout: 30000,
    socketTimeout: 30000,
  }),
  // 某些 S3 兼容服务需要强制使用 path style
  forcePathStyle: true,
});

export { s3Client };
export const BUCKET_NAME = process.env.S3_BUCKET;
