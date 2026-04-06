import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { NextResponse } from 'next/server';
import { kvGetString, kvSetString } from '@/lib/kv-store';
import { decryptSecret, encryptSecret } from '@/lib/secret-crypto';
import { readCookieFromHeader } from '@/lib/auth';

const MAX_BUCKETS = 5;
const MAX_BUCKET_NAME_LENGTH = 64;
const STATE_KEY_PREFIX = 'nebula:bucket-config:';
const BUCKET_STATE_CACHE_TTL_MS = 60_000;
export const BUCKET_RUNTIME_CACHE_COOKIE_NAME = 'nebula_bucket_runtime_cache';
export const ENV_DEFAULT_BUCKET_ID = '__env_default__';

type BucketStateCacheEntry = {
  state: BucketConfigState;
  expiresAt: number;
};

const stateCache = new Map<string, BucketStateCacheEntry>();
const stateReadInFlight = new Map<string, Promise<BucketConfigState>>();

export type BucketConfigInput = {
  id?: string;
  name: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
};

type StoredBucketConfig = {
  id: string;
  name: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

type PersistedBucketConfig = {
  id: string;
  name: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyIdEncrypted: string;
  secretAccessKeyEncrypted: string;
  forcePathStyle: boolean;
};

type PersistedBucketConfigState = {
  activeId: string | null;
  buckets: PersistedBucketConfig[];
};

export type BucketConfigState = {
  activeId: string | null;
  buckets: StoredBucketConfig[];
};

export type BucketPublicView = {
  id: string;
  name: string;
  endpoint: string;
  region: string;
  bucket: string;
  forcePathStyle: boolean;
  active: boolean;
  source: 'state' | 'env';
  editable: boolean;
};

export type BucketRuntime = {
  client: S3Client;
  bucketName: string;
  endpoint: string;
  region: string;
  source: 'state' | 'env';
};

function getOwnerKey(): string {
  return process.env.ADMIN_USER?.trim() || 'admin';
}

function stateKeyForOwner(owner: string): string {
  return `${STATE_KEY_PREFIX}${owner}`;
}

function isBucketRuntimeCacheEnabled(request?: Request): boolean {
  if (!request) return true;
  const flag = readCookieFromHeader(request.headers.get('cookie'), BUCKET_RUNTIME_CACHE_COOKIE_NAME);
  if (typeof flag === 'undefined') return true;
  return flag !== '0';
}

function getCachedState(owner: string): BucketConfigState | null {
  const entry = stateCache.get(owner);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    stateCache.delete(owner);
    return null;
  }
  return entry.state;
}

function setCachedState(owner: string, state: BucketConfigState) {
  stateCache.set(owner, {
    state,
    expiresAt: Date.now() + BUCKET_STATE_CACHE_TTL_MS,
  });
}

function invalidateStateCache(owner: string) {
  stateCache.delete(owner);
  stateReadInFlight.delete(owner);
}

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function normalizeBucketConfig(input: BucketConfigInput): StoredBucketConfig | null {
  const endpoint = normalizeEndpoint(input.endpoint);
  const name = input.name?.trim();
  const region = input.region?.trim() || 'auto';
  const bucket = input.bucket?.trim();
  const accessKeyId = input.accessKeyId?.trim();
  const secretAccessKey = input.secretAccessKey?.trim();

  if (!endpoint || !name || !bucket || !accessKeyId || !secretAccessKey) return null;
  if (name.length > MAX_BUCKET_NAME_LENGTH) return null;
  if (bucket.includes('/') || bucket.length > 128) return null;

  return {
    id: input.id?.trim() || crypto.randomUUID(),
    name,
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: Boolean(input.forcePathStyle ?? true),
  };
}

function normalizeState(rawState: BucketConfigState): BucketConfigState {
  const buckets = Array.isArray(rawState.buckets) ? rawState.buckets.slice(0, MAX_BUCKETS) : [];
  const normalized = buckets
    .map((bucket) =>
      normalizeBucketConfig({
        ...bucket,
      })
    )
    .filter((b): b is StoredBucketConfig => Boolean(b));

  const activeId = rawState.activeId === ENV_DEFAULT_BUCKET_ID
    ? ENV_DEFAULT_BUCKET_ID
    : normalized.some((b) => b.id === rawState.activeId)
      ? rawState.activeId
      : normalized[0]?.id || null;
  return { activeId, buckets: normalized };
}

function toPersistedState(state: BucketConfigState): PersistedBucketConfigState {
  const normalized = normalizeState(state);
  return {
    activeId: normalized.activeId,
    buckets: normalized.buckets.map((bucket) => ({
      id: bucket.id,
      name: bucket.name,
      endpoint: bucket.endpoint,
      region: bucket.region,
      bucket: bucket.bucket,
      accessKeyIdEncrypted: encryptSecret(bucket.accessKeyId),
      secretAccessKeyEncrypted: encryptSecret(bucket.secretAccessKey),
      forcePathStyle: bucket.forcePathStyle,
    })),
  };
}

function fromPersistedState(persisted: PersistedBucketConfigState): BucketConfigState {
  const buckets = Array.isArray(persisted.buckets) ? persisted.buckets : [];

  const decryptedBuckets: StoredBucketConfig[] = [];
  for (const bucket of buckets) {
    try {
      const accessKeyId = decryptSecret(bucket.accessKeyIdEncrypted);
      const secretAccessKey = decryptSecret(bucket.secretAccessKeyEncrypted);
      const normalized = normalizeBucketConfig({
        id: bucket.id,
        name: bucket.name,
        endpoint: bucket.endpoint,
        region: bucket.region,
        bucket: bucket.bucket,
        accessKeyId,
        secretAccessKey,
        forcePathStyle: bucket.forcePathStyle,
      });
      if (normalized) decryptedBuckets.push(normalized);
    } catch {
      // Skip broken entries to avoid total outage from a single invalid record.
    }
  }

  return normalizeState({
    activeId: persisted.activeId,
    buckets: decryptedBuckets,
  });
}

async function readBucketStateFromKv(owner = getOwnerKey(), useCache = true): Promise<BucketConfigState> {
  if (useCache) {
    const cached = getCachedState(owner);
    if (cached) return cached;

    const inFlight = stateReadInFlight.get(owner);
    if (inFlight) return inFlight;
  }

  const loadPromise = (async () => {
    const raw = await kvGetString(stateKeyForOwner(owner));
    const state = raw
      ? fromPersistedState(safeJsonParse<PersistedBucketConfigState>(raw, { activeId: null, buckets: [] }))
      : { activeId: null, buckets: [] };

    if (useCache) {
      setCachedState(owner, state);
    }
    return state;
  })();

  if (!useCache) return loadPromise;

  stateReadInFlight.set(owner, loadPromise);
  return loadPromise.finally(() => {
    if (stateReadInFlight.get(owner) === loadPromise) {
      stateReadInFlight.delete(owner);
    }
  });
}

async function writeBucketStateToKv(state: BucketConfigState, owner = getOwnerKey()): Promise<void> {
  const payload = JSON.stringify(toPersistedState(state));
  await kvSetString(stateKeyForOwner(owner), payload);
  setCachedState(owner, normalizeState(state));
}

function buildS3ClientFromStored(config: StoredBucketConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region || 'auto',
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    requestHandler: new NodeHttpHandler({
      connectionTimeout: 30000,
      socketTimeout: 30000,
    }),
    forcePathStyle: config.forcePathStyle,
  });
}

function getEnvBucketRuntime(): BucketRuntime | null {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const region = process.env.S3_REGION?.trim() || 'auto';
  const bucketName = process.env.S3_BUCKET?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY?.trim();
  const secretAccessKey = process.env.S3_SECRET_KEY?.trim();

  if (!endpoint || !bucketName || !accessKeyId || !secretAccessKey) return null;

  const client = new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    requestHandler: new NodeHttpHandler({
      connectionTimeout: 30000,
      socketTimeout: 30000,
    }),
    forcePathStyle: true,
  });

  return {
    client,
    bucketName,
    endpoint,
    region,
    source: 'env',
  };
}

function getEnvBucketPublicView(active: boolean): BucketPublicView | null {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const region = process.env.S3_REGION?.trim() || 'auto';
  const bucket = process.env.S3_BUCKET?.trim();
  if (!endpoint || !bucket) return null;

  return {
    id: ENV_DEFAULT_BUCKET_ID,
    name: '默认桶',
    endpoint,
    region,
    bucket,
    forcePathStyle: true,
    active,
    source: 'env',
    editable: false,
  };
}

function getActiveStoredBucket(state: BucketConfigState): StoredBucketConfig | null {
  if (!state.buckets.length) return null;
  if (state.activeId === ENV_DEFAULT_BUCKET_ID) return null;
  const active = state.buckets.find((bucket) => bucket.id === state.activeId);
  return active || state.buckets[0] || null;
}

export async function getBucketRuntimeFromRequest(request?: Request): Promise<BucketRuntime | null> {
  try {
    const state = await readBucketStateFromKv(getOwnerKey(), isBucketRuntimeCacheEnabled(request));

    if (state.activeId === ENV_DEFAULT_BUCKET_ID) {
      const envRuntime = getEnvBucketRuntime();
      if (envRuntime) return envRuntime;
    }

    const active = getActiveStoredBucket(state);

    if (active) {
      return {
        client: buildS3ClientFromStored(active),
        bucketName: active.bucket,
        endpoint: active.endpoint,
        region: active.region,
        source: 'state',
      };
    }
  } catch {
    // Fall back to env runtime when KV is unavailable.
  }

  return getEnvBucketRuntime();
}

export function noBucketConfiguredResponse() {
  return NextResponse.json(
    { success: false, code: 'NO_BUCKET_CONFIG', message: '无可用存储桶，请先在设置中添加并激活存储桶' },
    { status: 400 }
  );
}

export async function listBucketPublicViews(request?: Request): Promise<BucketPublicView[]> {
  const state = await readBucketStateFromKv(getOwnerKey(), isBucketRuntimeCacheEnabled(request));
  const stateViews = state.buckets.map((bucket) => ({
    id: bucket.id,
    name: bucket.name,
    endpoint: bucket.endpoint,
    region: bucket.region,
    bucket: bucket.bucket,
    forcePathStyle: bucket.forcePathStyle,
    active: bucket.id === state.activeId,
    source: 'state' as const,
    editable: true,
  }));

  const envActive = state.activeId === ENV_DEFAULT_BUCKET_ID || stateViews.length === 0;
  const envView = getEnvBucketPublicView(envActive);
  return envView ? [envView, ...stateViews] : stateViews;
}

export async function getEditableBucketById(id: string, request?: Request): Promise<BucketConfigInput | null> {
  const state = await readBucketStateFromKv(getOwnerKey(), isBucketRuntimeCacheEnabled(request));
  const bucket = state.buckets.find((item) => item.id === id);
  if (!bucket) return null;
  return {
    id: bucket.id,
    name: bucket.name,
    endpoint: bucket.endpoint,
    region: bucket.region,
    bucket: bucket.bucket,
    accessKeyId: bucket.accessKeyId,
    secretAccessKey: bucket.secretAccessKey,
    forcePathStyle: bucket.forcePathStyle,
  };
}

export function applySaveBucket(state: BucketConfigState, bucketInput: BucketConfigInput, setActive: boolean) {
  const normalized = normalizeBucketConfig(bucketInput);
  if (!normalized) {
    return { state, error: '存储桶配置不合法，请检查 endpoint/bucket/access key/secret key' };
  }

  const buckets = [...state.buckets];
  const existingIndex = buckets.findIndex((item) => item.id === normalized.id);
  if (existingIndex >= 0) {
    buckets[existingIndex] = normalized;
  } else {
    if (buckets.length >= MAX_BUCKETS) {
      return { state, error: `最多仅支持 ${MAX_BUCKETS} 个存储桶` };
    }
    buckets.push(normalized);
  }

  const activeId = setActive || !state.activeId ? normalized.id : state.activeId;
  return { state: normalizeState({ buckets, activeId }), error: null as string | null };
}

export function applyRemoveBucket(state: BucketConfigState, id: string) {
  const buckets = state.buckets.filter((bucket) => bucket.id !== id);
  const activeId = buckets.some((bucket) => bucket.id === state.activeId) ? state.activeId : buckets[0]?.id || null;
  return normalizeState({ buckets, activeId });
}

export function applySetActiveBucket(state: BucketConfigState, id: string) {
  if (id === ENV_DEFAULT_BUCKET_ID) {
    return normalizeState({ buckets: state.buckets, activeId: ENV_DEFAULT_BUCKET_ID });
  }
  if (!state.buckets.some((bucket) => bucket.id === id)) {
    return null;
  }
  return normalizeState({ buckets: state.buckets, activeId: id });
}

export async function persistBucketState(state: BucketConfigState) {
  invalidateStateCache(getOwnerKey());
  await writeBucketStateToKv(state);
}

export async function readBucketState(request?: Request) {
  return readBucketStateFromKv(getOwnerKey(), isBucketRuntimeCacheEnabled(request));
}

export function clearLegacyBucketStateCookie(response: NextResponse) {
  response.cookies.set('nebula_bucket_configs', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(0),
    path: '/',
  });
}

export async function testBucketConnectivity(bucketInput: BucketConfigInput) {
  const normalized = normalizeBucketConfig(bucketInput);
  if (!normalized) {
    return { ok: false, message: '配置格式不正确' };
  }

  try {
    const client = buildS3ClientFromStored(normalized);
    await client.send(
      new ListObjectsV2Command({
        Bucket: normalized.bucket,
        MaxKeys: 1,
      })
    );
    return { ok: true, message: '连接成功' };
  } catch (error: any) {
    return { ok: false, message: error?.message || '连接失败' };
  }
}

export async function getBucketStateSummary(request?: Request) {
  const runtime = await getBucketRuntimeFromRequest(request);
  return {
    hasActiveBucket: Boolean(runtime),
    source: runtime?.source || null,
    endpoint: runtime?.endpoint || null,
    bucketName: runtime?.bucketName || null,
  };
}
