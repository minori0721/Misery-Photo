const VERCEL_PROVIDER = 'vercel';
const CLOUDFLARE_PROVIDER = 'cloudflare';

export type KvProvider = typeof VERCEL_PROVIDER | typeof CLOUDFLARE_PROVIDER;

function getProvider(): KvProvider {
  const raw = (process.env.BUCKET_STORE_PROVIDER || VERCEL_PROVIDER).trim().toLowerCase();
  if (raw === CLOUDFLARE_PROVIDER) return CLOUDFLARE_PROVIDER;
  return VERCEL_PROVIDER;
}

function firstDefined(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

function getVercelKvConfig() {
  const url = firstDefined(process.env.KV_REST_API_URL, process.env.UPSTASH_REDIS_REST_URL);
  const writeToken = firstDefined(process.env.KV_REST_API_TOKEN, process.env.UPSTASH_REDIS_REST_TOKEN);
  const readOnlyToken = firstDefined(process.env.KV_REST_API_READ_ONLY_TOKEN);

  if (!url) {
    throw new Error('KV REST URL 未配置：请设置 KV_REST_API_URL 或 UPSTASH_REDIS_REST_URL');
  }

  if (!writeToken && !readOnlyToken) {
    throw new Error('KV REST Token 未配置：请设置 KV_REST_API_TOKEN 或 UPSTASH_REDIS_REST_TOKEN');
  }

  return {
    url: url.replace(/\/$/, ''),
    writeToken,
    readToken: readOnlyToken || writeToken || '',
  };
}

function getCloudflareKvConfig() {
  const accountId = process.env.CF_ACCOUNT_ID?.trim();
  const namespaceId = process.env.CF_KV_NAMESPACE_ID?.trim();
  const token = process.env.CF_API_TOKEN?.trim();

  if (!accountId || !namespaceId || !token) {
    throw new Error('Cloudflare KV 未配置：请设置 CF_ACCOUNT_ID、CF_KV_NAMESPACE_ID、CF_API_TOKEN');
  }

  return { accountId, namespaceId, token };
}

async function vercelKvGet(key: string): Promise<string | null> {
  const { url, readToken } = getVercelKvConfig();
  const response = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${readToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Vercel KV 读取失败: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as { result?: string | null };
  return typeof payload.result === 'string' ? payload.result : null;
}

async function vercelKvSet(key: string, value: string): Promise<void> {
  const { url, writeToken } = getVercelKvConfig();
  if (!writeToken) {
    throw new Error('当前仅配置了只读 Token，无法写入 KV。请设置 KV_REST_API_TOKEN 或 UPSTASH_REDIS_REST_TOKEN');
  }

  const response = await fetch(`${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${writeToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Vercel KV 写入失败: HTTP ${response.status}`);
  }
}

async function cloudflareKvGet(key: string): Promise<string | null> {
  const { accountId, namespaceId, token } = getCloudflareKvConfig();
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Cloudflare KV 读取失败: HTTP ${response.status}`);
  }

  return response.text();
}

async function cloudflareKvSet(key: string, value: string): Promise<void> {
  const { accountId, namespaceId, token } = getCloudflareKvConfig();
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/plain;charset=UTF-8',
    },
    body: value,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Cloudflare KV 写入失败: HTTP ${response.status}`);
  }
}

export async function kvGetString(key: string): Promise<string | null> {
  const provider = getProvider();
  if (provider === CLOUDFLARE_PROVIDER) {
    return cloudflareKvGet(key);
  }
  return vercelKvGet(key);
}

export async function kvSetString(key: string, value: string): Promise<void> {
  const provider = getProvider();
  if (provider === CLOUDFLARE_PROVIDER) {
    await cloudflareKvSet(key, value);
    return;
  }
  await vercelKvSet(key, value);
}
