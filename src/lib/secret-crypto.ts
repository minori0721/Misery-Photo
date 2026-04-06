import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';

function toBase64Url(input: Buffer): string {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64');
}

function getKey(): Buffer {
  const raw = process.env.BUCKET_ENCRYPTION_KEY?.trim();
  if (!raw || raw.length < 16) {
    throw new Error('BUCKET_ENCRYPTION_KEY 未配置或长度过短（至少 16 位）');
  }
  return createHash('sha256').update(raw).digest();
}

export function encryptSecret(plainText: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const cipherText = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${toBase64Url(iv)}.${toBase64Url(authTag)}.${toBase64Url(cipherText)}`;
}

export function decryptSecret(payload: string): string {
  const [ivRaw, authTagRaw, cipherRaw] = payload.split('.');
  if (!ivRaw || !authTagRaw || !cipherRaw) {
    throw new Error('密文格式不合法');
  }

  const key = getKey();
  const iv = fromBase64Url(ivRaw);
  const authTag = fromBase64Url(authTagRaw);
  const cipherText = fromBase64Url(cipherRaw);

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(cipherText), decipher.final()]);
  return plain.toString('utf8');
}
