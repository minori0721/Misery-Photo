import { S3Client } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "auto",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "",
    secretAccessKey: process.env.S3_SECRET_KEY || "",
  },
  // 某些 S3 兼容服务需要强制使用 path style
  forcePathStyle: true,
});

export { s3Client };
export const BUCKET_NAME = process.env.S3_BUCKET;
