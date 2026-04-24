'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowUp,
  FileImage,
  FileVideo,
  Loader2,
  Minimize2,
  Package,
  Upload,
  X,
} from 'lucide-react';
import type JSZip from 'jszip';
import { useSettings } from '@/lib/useSettings';
import { getErrorMessage, isRecord } from '@/lib/error-utils';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string;
  onRefresh: () => void;
}

type UploadTask = {
  id: string;
  name: string;
  path: string;
  blob: Blob | File;
  contentType?: string;
  totalBytes: number;
  loadedBytes: number;
  progress: number;
  speedBps: number;
  status: 'queued' | 'running' | 'success' | 'error';
};

type MultipartCompletedPart = {
  partNumber: number;
  etag: string;
};

type MultipartSession = {
  uploadId: string;
  key: string;
  filename: string;
  path: string;
  contentType: string;
  fileSize: number;
  partSize: number;
  completedParts: MultipartCompletedPart[];
  failedParts: number[];
  fingerprint: string;
};

type MultipartCreateResponse = {
  success: boolean;
  message?: string;
  data?: {
    uploadId: string;
    key: string;
    partSize: number;
  };
};

type MultipartSignPartResponse = {
  success: boolean;
  message?: string;
  data?: {
    url: string;
  };
};

type MultipartCompleteResponse = {
  success: boolean;
  message?: string;
};

type MultipartFailedError = Error & {
  code: 'MULTIPART_PARTIAL_FAILED';
  session: MultipartSession;
};

const KB = 1024;
const MB = 1024 * 1024;
const MULTIPART_THRESHOLD_BYTES = 64 * MB;
const MULTIPART_PART_SIZE = 32 * MB;
const MULTIPART_PART_CONCURRENCY = 3;
const LARGE_FILE_CONCURRENCY = 1;
const SMALL_FILE_CONCURRENCY = 4;
const MULTIPART_MAX_RETRIES = 3;
const MULTIPART_SESSION_STORAGE_KEY = 'misery_photo_multipart_sessions_v1';

function formatSpeed(speedBps: number): string {
  if (!Number.isFinite(speedBps) || speedBps <= 0) return '0.0 KB/s';
  if (speedBps >= MB) return `${(speedBps / MB).toFixed(2)} MB/s`;
  return `${(speedBps / KB).toFixed(1)} KB/s`;
}

function formatSize(size: number): string {
  if (size >= MB) return `${(size / MB).toFixed(2)} MB`;
  return `${(size / KB).toFixed(1)} KB`;
}

function getRingDash(progress: number, radius = 23): string {
  const normalized = Math.max(0, Math.min(progress, 100));
  const circumference = 2 * Math.PI * radius;
  const filled = (normalized / 100) * circumference;
  return `${filled} ${circumference - filled}`;
}

export default function UploadModal({ isOpen, onClose, currentPath, onRefresh }: UploadModalProps) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [minimized, setMinimized] = useState(false);
  const [currentTaskName, setCurrentTaskName] = useState('');
  const [completedFiles, setCompletedFiles] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [aggregateSpeed, setAggregateSpeed] = useState(0);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [multipartPending, setMultipartPending] = useState<MultipartSession | null>(null);
  const [multipartActionBusy, setMultipartActionBusy] = useState(false);

  const IMAGE_EXT_RE = /\.(jpg|jpeg|png|webp|gif)$/i;
  const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|m3u8|ts|mkv|avi|wmv|flv|mpeg|mpg|3gp|ogv)$/i;

  const getContentTypeByName = (filename: string) => {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.mp4') || lower.endsWith('.m4v')) return 'video/mp4';
    if (lower.endsWith('.webm')) return 'video/webm';
    if (lower.endsWith('.mov')) return 'video/quicktime';
    if (lower.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
    if (lower.endsWith('.ts')) return 'video/mp2t';
    if (lower.endsWith('.mkv')) return 'video/x-matroska';
    if (lower.endsWith('.avi')) return 'video/x-msvideo';
    if (lower.endsWith('.wmv')) return 'video/x-ms-wmv';
    if (lower.endsWith('.flv')) return 'video/x-flv';
    if (lower.endsWith('.mpeg') || lower.endsWith('.mpg')) return 'video/mpeg';
    if (lower.endsWith('.3gp')) return 'video/3gpp';
    if (lower.endsWith('.ogv')) return 'video/ogg';
    return 'application/octet-stream';
  };

  const isMediaFileName = (name: string) => IMAGE_EXT_RE.test(name) || VIDEO_EXT_RE.test(name);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadedBytesRef = useRef<Map<string, number>>(new Map());
  const speedBytesRef = useRef<Map<string, number>>(new Map());
  const totalBytesRef = useRef(0);

  const { settings } = useSettings();
  const isMiku = settings.theme === 'miku';

  const activeTask = useMemo(() => {
    if (!uploadTasks.length) return null;
    return uploadTasks.find((item) => item.status === 'running') || uploadTasks[uploadTasks.length - 1];
  }, [uploadTasks]);

  const getTaskFingerprint = (task: UploadTask): string => {
    const file = task.blob as File;
    const lastModified = typeof file.lastModified === 'number' ? file.lastModified : 0;
    return `${task.path}|${task.name}|${task.totalBytes}|${lastModified}`;
  };

  const readMultipartSessionStore = (): Record<string, MultipartSession> => {
    try {
      const raw = localStorage.getItem(MULTIPART_SESSION_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, MultipartSession>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };

  const writeMultipartSessionStore = (store: Record<string, MultipartSession>) => {
    try {
      localStorage.setItem(MULTIPART_SESSION_STORAGE_KEY, JSON.stringify(store));
    } catch {
      // 忽略持久化失败，上传流程仍可继续
    }
  };

  const saveMultipartSession = (session: MultipartSession) => {
    const store = readMultipartSessionStore();
    store[session.fingerprint] = session;
    writeMultipartSessionStore(store);
  };

  const getSavedMultipartSession = (fingerprint: string): MultipartSession | null => {
    const store = readMultipartSessionStore();
    return store[fingerprint] || null;
  };

  const removeMultipartSession = (fingerprint: string) => {
    const store = readMultipartSessionStore();
    if (!store[fingerprint]) return;
    delete store[fingerprint];
    writeMultipartSessionStore(store);
  };

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const getBackoffDelay = (attempt: number): number => {
    const jitter = Math.floor(Math.random() * 300);
    return Math.min(1000 * (2 ** (attempt - 1)) + jitter, 15000);
  };

  const fetchApiJson = async <T,>(input: RequestInfo | URL, init?: RequestInit): Promise<T> => {
    const res = await fetch(input, init);
    const contentType = res.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? (await res.json()) as unknown : null;
    const payloadRecord = isRecord(payload) ? payload : undefined;
    if (res.status === 401) {
      router.push('/login');
      const authMsg = typeof payloadRecord?.message === 'string' ? payloadRecord.message : '登录已过期，请重新登录';
      throw new Error(authMsg);
    }
    if (!res.ok) {
      const errMsg = typeof payloadRecord?.message === 'string' ? payloadRecord.message : `请求失败（${res.status}）`;
      throw new Error(errMsg);
    }
    return payload as T;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setError('');
      setStatus('');
      setMultipartPending(null);
    }
  };

  if (!isOpen) return null;

  const updateTaskState = (taskId: string, updater: (task: UploadTask) => UploadTask) => {
    setUploadTasks((prev) => prev.map((task) => (task.id === taskId ? updater(task) : task)));
  };

  const updateOverallProgress = () => {
    const sumLoaded = Array.from(loadedBytesRef.current.values()).reduce((acc, val) => acc + val, 0);
    const nextProgress = totalBytesRef.current > 0 ? Math.round((sumLoaded / totalBytesRef.current) * 100) : 0;
    setProgress(Math.max(0, Math.min(100, nextProgress)));

    const speed = Array.from(speedBytesRef.current.values()).reduce((acc, val) => acc + val, 0);
    setAggregateSpeed(speed);
  };

  const putWithProgress = (url: string, file: Blob | File, contentType: string, onProgress: (loaded: number, total: number, speedBps: number) => void) => {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let lastLoaded = 0;
      let lastTs = Date.now();

      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', contentType || 'application/octet-stream');

      xhr.upload.onprogress = (event) => {
        const loaded = event.loaded;
        const total = event.total || file.size || loaded;
        const now = Date.now();
        const deltaTime = Math.max(1, now - lastTs) / 1000;
        const deltaBytes = Math.max(0, loaded - lastLoaded);
        const speedBps = deltaBytes / deltaTime;
        lastLoaded = loaded;
        lastTs = now;
        onProgress(loaded, total, speedBps);
      };

      xhr.onerror = () => reject(new Error('上传请求失败'));
      xhr.onabort = () => reject(new Error('上传已取消'));
      xhr.onreadystatechange = () => {
        if (xhr.readyState !== XMLHttpRequest.DONE) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`上传失败（${xhr.status}）`));
        }
      };

      xhr.send(file);
    });
  };

  const putMultipartPartWithProgress = (
    url: string,
    partBlob: Blob,
    onProgress: (loaded: number, total: number, speedBps: number) => void
  ) => {
    return new Promise<{ etag: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let lastLoaded = 0;
      let lastTs = Date.now();

      xhr.open('PUT', url, true);

      xhr.upload.onprogress = (event) => {
        const loaded = event.loaded;
        const total = event.total || partBlob.size || loaded;
        const now = Date.now();
        const deltaTime = Math.max(1, now - lastTs) / 1000;
        const deltaBytes = Math.max(0, loaded - lastLoaded);
        const speedBps = deltaBytes / deltaTime;
        lastLoaded = loaded;
        lastTs = now;
        onProgress(loaded, total, speedBps);
      };

      xhr.onerror = () => reject(new Error('分片上传请求失败'));
      xhr.onabort = () => reject(new Error('分片上传已取消'));
      xhr.onreadystatechange = () => {
        if (xhr.readyState !== XMLHttpRequest.DONE) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          const etag = xhr.getResponseHeader('ETag') || xhr.getResponseHeader('etag');
          if (!etag) {
            reject(new Error('分片上传成功但未返回 ETag，请检查对象存储 CORS ExposeHeaders'));
            return;
          }
          resolve({ etag });
        } else {
          reject(new Error(`分片上传失败（${xhr.status}）`));
        }
      };

      xhr.send(partBlob);
    });
  };

  const createMultipartSession = async (task: UploadTask, partSize = MULTIPART_PART_SIZE): Promise<MultipartSession> => {
    const contentType = task.contentType || (task.blob as File).type || 'application/octet-stream';
    const fingerprint = getTaskFingerprint(task);
    const createJson = await fetchApiJson<MultipartCreateResponse>('/api/upload/multipart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        filename: task.name,
        path: task.path,
        contentType,
        size: task.totalBytes,
        partSize,
      }),
    });

    if (!createJson.success || !createJson.data?.uploadId || !createJson.data.key) {
      throw new Error(createJson.message || '创建分片上传会话失败');
    }

    return {
      uploadId: createJson.data.uploadId,
      key: createJson.data.key,
      filename: task.name,
      path: task.path,
      contentType,
      fileSize: task.totalBytes,
      partSize: createJson.data.partSize || partSize,
      completedParts: [],
      failedParts: [],
      fingerprint,
    };
  };

  const signMultipartPart = async (session: MultipartSession, partNumber: number): Promise<string> => {
    const signJson = await fetchApiJson<MultipartSignPartResponse>('/api/upload/multipart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sign-part',
        uploadId: session.uploadId,
        key: session.key,
        partNumber,
      }),
    });

    if (!signJson.success || !signJson.data?.url) {
      throw new Error(signJson.message || `获取分片 ${partNumber} 上传签名失败`);
    }
    return signJson.data.url;
  };

  const completeMultipartSession = async (session: MultipartSession) => {
    const completeJson = await fetchApiJson<MultipartCompleteResponse>('/api/upload/multipart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'complete',
        uploadId: session.uploadId,
        key: session.key,
        parts: [...session.completedParts].sort((a, b) => a.partNumber - b.partNumber),
      }),
    });

    if (!completeJson.success) {
      throw new Error(completeJson.message || '完成分片上传失败');
    }
  };

  const abortMultipartSession = async (session: MultipartSession) => {
    await fetchApiJson<{ success: boolean; message?: string }>('/api/upload/multipart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'abort',
        uploadId: session.uploadId,
        key: session.key,
      }),
    });
  };

  const uploadTaskWithMultipart = async (task: UploadTask, resumeSession?: MultipartSession) => {
    const blob = task.blob;
    const fileSize = task.totalBytes;
    let session = resumeSession || getSavedMultipartSession(getTaskFingerprint(task)) || null;

    if (!session) {
      session = await createMultipartSession(task);
      saveMultipartSession(session);
    }

    const totalParts = Math.ceil(fileSize / session.partSize);
    const completedPartMap = new Map<number, string>(session.completedParts.map((p) => [p.partNumber, p.etag]));
    const remainingPartNumbers: number[] = [];
    for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
      if (!completedPartMap.has(partNumber)) {
        remainingPartNumbers.push(partNumber);
      }
    }

    const partSizeFor = (partNumber: number) => {
      const start = (partNumber - 1) * session.partSize;
      const end = Math.min(start + session.partSize, fileSize);
      return Math.max(0, end - start);
    };

    const activePartLoaded = new Map<number, number>();
    const activePartSpeed = new Map<number, number>();
    const failedPartSet = new Set<number>();
    let completedBytes = Array.from(completedPartMap.keys()).reduce((sum, partNumber) => sum + partSizeFor(partNumber), 0);

    const syncTaskProgress = () => {
      const inFlightLoaded = Array.from(activePartLoaded.values()).reduce((sum, value) => sum + value, 0);
      const totalLoaded = Math.min(fileSize, completedBytes + inFlightLoaded);
      const speed = Array.from(activePartSpeed.values()).reduce((sum, value) => sum + value, 0);
      loadedBytesRef.current.set(task.id, totalLoaded);
      speedBytesRef.current.set(task.id, speed);

      updateTaskState(task.id, (item) => ({
        ...item,
        loadedBytes: totalLoaded,
        totalBytes: fileSize,
        progress: fileSize > 0 ? Math.round((totalLoaded / fileSize) * 100) : 0,
        speedBps: speed,
        status: 'running',
      }));
      updateOverallProgress();
    };

    syncTaskProgress();

    let cursor = 0;
    const worker = async () => {
      while (cursor < remainingPartNumbers.length) {
        const partNumber = remainingPartNumbers[cursor];
        cursor += 1;

        const start = (partNumber - 1) * session.partSize;
        const end = Math.min(start + session.partSize, fileSize);
        const partBlob = blob.slice(start, end);

        setCurrentTaskName(`${task.name} (分片 ${partNumber}/${totalParts})`);
        setStatus(`正在上传分片 ${partNumber}/${totalParts}`);

        let success = false;
        for (let attempt = 1; attempt <= MULTIPART_MAX_RETRIES; attempt += 1) {
          try {
            const signedUrl = await signMultipartPart(session, partNumber);
            const result = await putMultipartPartWithProgress(signedUrl, partBlob, (loaded, _total, speedBps) => {
              activePartLoaded.set(partNumber, loaded);
              activePartSpeed.set(partNumber, speedBps);
              syncTaskProgress();
            });

            activePartLoaded.delete(partNumber);
            activePartSpeed.delete(partNumber);
            completedPartMap.set(partNumber, result.etag);
            completedBytes += partBlob.size;
            session.completedParts = Array.from(completedPartMap.entries())
              .map(([pn, etag]) => ({ partNumber: pn, etag }))
              .sort((a, b) => a.partNumber - b.partNumber);
            session.failedParts = Array.from(failedPartSet.values()).sort((a, b) => a - b);
            saveMultipartSession(session);
            syncTaskProgress();
            success = true;
            break;
          } catch (partErr) {
            activePartLoaded.delete(partNumber);
            activePartSpeed.delete(partNumber);
            syncTaskProgress();
            if (attempt >= MULTIPART_MAX_RETRIES) {
              failedPartSet.add(partNumber);
            } else {
              await sleep(getBackoffDelay(attempt));
            }
            if (partErr instanceof Error && partErr.message.includes('Abort')) {
              throw partErr;
            }
          }
        }

        if (!success) {
          setStatus(`分片 ${partNumber} 上传失败，等待处理`);
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(MULTIPART_PART_CONCURRENCY, Math.max(1, remainingPartNumbers.length)) },
      () => worker()
    );
    await Promise.all(workers);

    const failedParts = Array.from(failedPartSet.values()).sort((a, b) => a - b);
    if (failedParts.length > 0) {
      session.failedParts = failedParts;
      session.completedParts = Array.from(completedPartMap.entries())
        .map(([partNumber, etag]) => ({ partNumber, etag }))
        .sort((a, b) => a.partNumber - b.partNumber);
      saveMultipartSession(session);
      setMultipartPending(session);

      const failedError = new Error(`存在 ${failedParts.length} 个失败分片`) as MultipartFailedError;
      failedError.code = 'MULTIPART_PARTIAL_FAILED';
      failedError.session = session;
      throw failedError;
    }

    session.completedParts = Array.from(completedPartMap.entries())
      .map(([partNumber, etag]) => ({ partNumber, etag }))
      .sort((a, b) => a.partNumber - b.partNumber);

    setStatus('正在合并分片...');
    await completeMultipartSession(session);
    removeMultipartSession(session.fingerprint);
    setMultipartPending(null);
  };

  const uploadToS3 = async (task: UploadTask, resumeSession?: MultipartSession) => {
    if (task.totalBytes >= MULTIPART_THRESHOLD_BYTES) {
      await uploadTaskWithMultipart(task, resumeSession);
      return;
    }

    const contentType = task.contentType || (task.blob as File).type || 'application/octet-stream';
    const presignJson = await fetchApiJson<{ url: string }>('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: task.name, path: task.path, contentType }),
    });

    await putWithProgress(presignJson.url, task.blob, contentType, (loaded, total, speedBps) => {
      loadedBytesRef.current.set(task.id, loaded);
      speedBytesRef.current.set(task.id, speedBps);
      updateTaskState(task.id, (item) => ({
        ...item,
        loadedBytes: loaded,
        totalBytes: total || item.totalBytes,
        progress: total > 0 ? Math.round((loaded / total) * 100) : item.progress,
        speedBps,
        status: 'running',
      }));
      updateOverallProgress();
    });
  };

  async function buildUploadTasksFromZip(
    zip: JSZip,
    zipName: string
  ): Promise<{
    tasks: Array<{ blob: Blob; name: string; path: string; contentType: string }>;
    totalFiles: number;
    mediaFiles: number;
    ignoredFiles: number;
    imageCount: number;
    videoCount: number;
  }> {

    const folderChildren = new Map<string, Set<string>>();
    const folderFiles = new Map<string, string[]>();
    folderChildren.set('', new Set());
    folderFiles.set('', []);
    let totalFiles = 0;
    let mediaFiles = 0;
    let imageCount = 0;
    let videoCount = 0;

    for (const entryName of Object.keys(zip.files)) {
      const entry = zip.files[entryName];
      if (!entry.dir) totalFiles += 1;
      const segs = entryName.split('/').filter(Boolean);
      for (let d = 0; d < segs.length; d += 1) {
        const parent = d === 0 ? '' : `${segs.slice(0, d).join('/')}/`;
        const isDir = entry.dir || d < segs.length - 1;
        const self = `${segs.slice(0, d + 1).join('/')}${isDir ? '/' : ''}`;
        if (!folderChildren.has(parent)) {
          folderChildren.set(parent, new Set());
          folderFiles.set(parent, []);
        }
        if (isDir) {
          folderChildren.get(parent)?.add(self);
          if (!folderChildren.has(self)) {
            folderChildren.set(self, new Set());
            folderFiles.set(self, []);
          }
        } else if (isMediaFileName(entryName)) {
          folderFiles.get(parent)?.push(entryName);
          mediaFiles += 1;
          if (IMAGE_EXT_RE.test(entryName)) imageCount += 1;
          if (VIDEO_EXT_RE.test(entryName)) videoCount += 1;
        }
      }
    }

    type Leaf = { album: string; filePaths: string[] };
    function collectLeaves(folderPath: string): Leaf[] {
      const children = folderChildren.get(folderPath) || new Set<string>();
      const media = folderFiles.get(folderPath) || [];
      const albumName = folderPath ? folderPath.replace(/\/$/, '').split('/').pop() || zipName : zipName;
      if (children.size === 0 && media.length > 0) return [{ album: albumName, filePaths: media }];

      const output: Leaf[] = [];
      for (const child of Array.from(children)) {
        output.push(...collectLeaves(child));
      }
      if (media.length > 0) output.push({ album: albumName, filePaths: media });
      return output;
    }

    const albums = collectLeaves('');
    const totalAssets = albums.reduce((sum, item) => sum + item.filePaths.length, 0);
    setStatus(`发现 ${albums.length} 个画集，共 ${totalAssets} 个媒体文件（图 ${imageCount} / 视频 ${videoCount}），准备上传...`);

    const tasks: Array<{ blob: Blob; name: string; path: string; contentType: string }> = [];
    for (const { album, filePaths } of albums) {
      for (const mediaPath of filePaths) {
        const blob = await zip.files[mediaPath].async('blob');
        const name = mediaPath.split('/').pop() || mediaPath;
        tasks.push({
          blob,
          name,
          path: `${currentPath}${album}/`,
          contentType: getContentTypeByName(name),
        });
      }
    }
    return {
      tasks,
      totalFiles,
      mediaFiles,
      ignoredFiles: Math.max(0, totalFiles - mediaFiles),
      imageCount,
      videoCount,
    };
  }

  const handleUpload = async () => {
    setUploading(true);
    setError('');
    setStatus('准备上传...');
    setProgress(0);
    setCompletedFiles(0);
    setCurrentTaskName('');
    setAggregateSpeed(0);
    setMinimized(false);
    setMultipartPending(null);

    loadedBytesRef.current.clear();
    speedBytesRef.current.clear();

    try {
      let preparedTasks: Array<{ blob: Blob | File; name: string; path: string; contentType?: string }> = [];
      let ignoredFiles = 0;

      for (const file of files) {
        if (file.name.toLowerCase().endsWith('.zip')) {
          setStatus(`正在解析压缩包: ${file.name}`);
          const { default: JSZip } = await import('jszip');
          const zip = await JSZip.loadAsync(file, {
            decodeFileName: (bytes) => {
              const buffer = bytes instanceof Uint8Array
                ? bytes
                : new Uint8Array(bytes.map((value) => (typeof value === 'string' ? value.charCodeAt(0) : value)));
              try {
                return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
              } catch {
                return new TextDecoder('gbk').decode(buffer);
              }
            },
          });
          const zipName = file.name.replace(/\.zip$/i, '');
          const zipResult = await buildUploadTasksFromZip(zip, zipName);
          preparedTasks = [...preparedTasks, ...zipResult.tasks];
          ignoredFiles += zipResult.ignoredFiles;
        } else {
          if (isMediaFileName(file.name) || file.type.startsWith('video/') || file.type.startsWith('image/')) {
            preparedTasks.push({
              blob: file,
              name: file.name,
              path: currentPath,
              contentType: file.type || getContentTypeByName(file.name),
            });
          } else {
            ignoredFiles += 1;
          }
        }
      }

      const tasks: UploadTask[] = preparedTasks.map((task, idx) => ({
        id: `${Date.now()}-${idx}-${task.name}`,
        name: task.name,
        path: task.path,
        blob: task.blob,
        contentType: task.contentType,
        totalBytes: task.blob.size || 0,
        loadedBytes: 0,
        progress: 0,
        speedBps: 0,
        status: 'queued',
      }));

      setUploadTasks(tasks);
      setTotalFiles(tasks.length);

      totalBytesRef.current = tasks.reduce((acc, item) => acc + item.totalBytes, 0);
      for (const task of tasks) {
        loadedBytesRef.current.set(task.id, 0);
        speedBytesRef.current.set(task.id, 0);
      }

      if (tasks.length === 0) {
        throw new Error('没有可上传的媒体文件，请选择图片、视频或包含媒体文件的 ZIP。');
      }

      let completed = 0;
      const hasLargeFile = tasks.some((task) => task.totalBytes >= MULTIPART_THRESHOLD_BYTES);
      const parallel = hasLargeFile ? LARGE_FILE_CONCURRENCY : SMALL_FILE_CONCURRENCY;

      for (let i = 0; i < tasks.length; i += parallel) {
        const chunk = tasks.slice(i, i + parallel);
        await Promise.all(
          chunk.map(async (task) => {
            setCurrentTaskName(task.name);
            setStatus(`正在上传 ${task.name}`);
            updateTaskState(task.id, (item) => ({ ...item, status: 'running' }));

            await uploadToS3(task);

            completed += 1;
            setCompletedFiles(completed);
            loadedBytesRef.current.set(task.id, task.totalBytes);
            speedBytesRef.current.set(task.id, 0);
            updateTaskState(task.id, (item) => ({
              ...item,
              loadedBytes: item.totalBytes,
              progress: 100,
              speedBps: 0,
              status: 'success',
            }));
            updateOverallProgress();
          })
        );
      }

      setStatus('全部上传完成');
      if (ignoredFiles > 0) {
        setStatus(`全部上传完成，已忽略 ${ignoredFiles} 个非媒体文件`);
      }
      setCurrentTaskName('上传完成');
      setAggregateSpeed(0);
      setTimeout(() => {
        onRefresh();
        onClose();
        setFiles([]);
        setUploading(false);
        setProgress(0);
        setStatus('');
        setUploadTasks([]);
        setCompletedFiles(0);
        setTotalFiles(0);
      }, 1000);
    } catch (err: unknown) {
      console.error(err);
      const multipartErr = err as Partial<MultipartFailedError>;
      if (multipartErr.code === 'MULTIPART_PARTIAL_FAILED' && multipartErr.session) {
        setMultipartPending(multipartErr.session);
        setError('部分分片上传失败，你可以继续重试失败分片、保存会话稍后继续，或放弃并清理本次上传。');
        setStatus('分片上传中断，等待你选择后续操作');
      } else {
        setError(getErrorMessage(err, '上传过程中发生错误'));
        setStatus('上传失败');
      }
      setUploading(false);
      setAggregateSpeed(0);
      setUploadTasks((prev) => prev.map((task) => (task.status === 'running' ? { ...task, status: 'error' } : task)));
    }
  };

  const handleRetryFailedParts = async () => {
    if (!multipartPending) return;

    const targetTask = uploadTasks.find((task) => getTaskFingerprint(task) === multipartPending.fingerprint);
    if (!targetTask) {
      setError('未找到对应文件，请重新选择相同文件后再继续失败分片上传。');
      return;
    }

    setMultipartActionBusy(true);
    setUploading(true);
    setError('');
    setStatus('继续重试失败分片...');

    try {
      await uploadToS3(targetTask, multipartPending);
      loadedBytesRef.current.set(targetTask.id, targetTask.totalBytes);
      speedBytesRef.current.set(targetTask.id, 0);
      updateTaskState(targetTask.id, (item) => ({
        ...item,
        loadedBytes: item.totalBytes,
        progress: 100,
        speedBps: 0,
        status: 'success',
      }));
      updateOverallProgress();
      setCompletedFiles((prev) => Math.min(totalFiles, prev + 1));
      setStatus('失败分片已补传完成');
      setCurrentTaskName('上传完成');
      setMultipartPending(null);
      setAggregateSpeed(0);
      onRefresh();
    } catch (err: unknown) {
      const multipartErr = err as Partial<MultipartFailedError>;
      if (multipartErr.code === 'MULTIPART_PARTIAL_FAILED' && multipartErr.session) {
        setMultipartPending(multipartErr.session);
        setError('仍有分片上传失败，请继续重试、保存会话或放弃清理。');
        setStatus('分片上传再次中断');
      } else {
        setError(getErrorMessage(err, '继续上传失败分片时发生错误'));
      }
    } finally {
      setUploading(false);
      setMultipartActionBusy(false);
    }
  };

  const handleSaveMultipartSession = () => {
    if (!multipartPending) return;
    saveMultipartSession(multipartPending);
    setStatus('已保存上传会话，可稍后重新选择同一文件继续');
    setError('');
  };

  const handleAbortMultipartSession = async () => {
    if (!multipartPending) return;

    setMultipartActionBusy(true);
    try {
      await abortMultipartSession(multipartPending);
      removeMultipartSession(multipartPending.fingerprint);
      setMultipartPending(null);
      setError('');
      setStatus('已放弃并清理未完成分片');
      setAggregateSpeed(0);
      setCurrentTaskName('已取消上传');
    } catch (err: unknown) {
      setError(getErrorMessage(err, '放弃上传失败，请重试'));
    } finally {
      setMultipartActionBusy(false);
      setUploading(false);
    }
  };

  const handleTopRightAction = () => {
    if (uploading) {
      setMinimized(true);
      return;
    }
    onClose();
  };

  if (minimized) {
    return (
      <motion.button
        type="button"
        onClick={() => setMinimized(false)}
        className={`fixed bottom-8 right-8 z-[130] h-16 w-16 rounded-full border backdrop-blur-2xl shadow-2xl flex items-center justify-center ${
          isMiku ? 'bg-white/70 border-[#39C5BB]/30 text-[#39C5BB]' : 'bg-white/10 border-white/20 text-white'
        }`}
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: 20 }}
        whileTap={{ scale: 0.95 }}
        title="展开上传面板"
      >
        <svg viewBox="0 0 56 56" className="absolute inset-1.5">
          <circle cx="28" cy="28" r="23" fill="none" stroke={isMiku ? 'rgba(57,197,187,0.2)' : 'rgba(255,255,255,0.2)'} strokeWidth="4" />
          <motion.circle
            cx="28"
            cy="28"
            r="23"
            fill="none"
            stroke={isMiku ? '#39C5BB' : '#60a5fa'}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={getRingDash(progress)}
            transform="rotate(-90 28 28)"
          />
        </svg>
        <div className="relative flex flex-col items-center justify-center">
          <Upload size={18} />
          <span className="text-[9px] font-black leading-none mt-0.5">{progress}%</span>
        </div>
      </motion.button>
    );
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={uploading ? () => setMinimized(true) : onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 18 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        className={`relative w-full max-w-2xl rounded-3xl border overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-2xl ${
          isMiku ? 'bg-white/75 border-[#39C5BB]/25' : 'bg-[#111111]/70 border-white/15'
        }`}
      >
        <div className={`px-6 py-5 border-b flex items-center justify-between ${isMiku ? 'border-[#39C5BB]/15' : 'border-white/10'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isMiku ? 'bg-[#39C5BB]/10 text-[#39C5BB]' : 'bg-blue-500/15 text-blue-400'}`}>
              <Upload size={20} />
            </div>
            <div>
              <h2 className={`text-lg font-black uppercase tracking-wider ${isMiku ? 'text-slate-800' : 'text-white'}`}>上传传输中心</h2>
              <p className={`text-xs ${isMiku ? 'text-slate-500' : 'text-white/50'}`}>目标目录: {currentPath || '根目录'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMinimized(true)}
              className={`p-2 rounded-xl transition-colors ${isMiku ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-white/10 text-white/60'}`}
              title="收起"
            >
              <Minimize2 size={16} />
            </button>
            <button
              type="button"
              onClick={handleTopRightAction}
              className={`p-2 rounded-xl transition-colors ${isMiku ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-white/10 text-white/60'}`}
              title={uploading ? '收起' : '关闭'}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-6">
          {files.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center gap-4 transition-all cursor-pointer group ${
                isMiku
                  ? 'border-slate-200 hover:border-[#39C5BB]/60 hover:bg-[#39C5BB]/5 bg-white/70'
                  : 'border-white/15 hover:border-blue-500/40 hover:bg-blue-500/5'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                multiple
                className="hidden"
                accept="image/*,video/*,.zip,.m3u8,.ts,.mkv,.avi,.wmv,.flv,.mpeg,.mpg,.3gp,.ogv"
              />
              <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 ${
                isMiku ? 'bg-slate-100 text-slate-400 group-hover:text-[#39C5BB]' : 'bg-white/10 text-white/30 group-hover:text-blue-400'
              }`}>
                <ArrowUp size={30} />
              </div>
              <div className="text-center">
                <p className={`font-black tracking-widest ${isMiku ? 'text-slate-700' : 'text-white/85'}`}>点击或拖拽文件到这里</p>
                <p className={`text-xs mt-1 ${isMiku ? 'text-slate-500' : 'text-white/45'}`}>支持图片、视频、ZIP 智能解析并并行上传</p>
              </div>
            </div>
          ) : !uploading ? (
            <div className="space-y-4">
              <div className="max-h-64 overflow-y-auto pr-1 space-y-2">
                {files.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${
                      isMiku ? 'bg-white/70 border-slate-200' : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {file.name.toLowerCase().endsWith('.zip') ? (
                        <Package className={isMiku ? 'text-blue-500 shrink-0' : 'text-blue-400 shrink-0'} size={16} />
                      ) : (VIDEO_EXT_RE.test(file.name) || file.type.startsWith('video/')) ? (
                        <FileVideo className={isMiku ? 'text-orange-500 shrink-0' : 'text-orange-400 shrink-0'} size={16} />
                      ) : (
                        <FileImage className={isMiku ? 'text-[#39C5BB] shrink-0' : 'text-blue-400 shrink-0'} size={16} />
                      )}
                      <span className={`text-sm font-medium truncate ${isMiku ? 'text-slate-700' : 'text-white/80'}`}>{file.name}</span>
                    </div>
                    <span className={`text-[11px] font-bold shrink-0 ${isMiku ? 'text-slate-500' : 'text-white/40'}`}>{formatSize(file.size)}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setFiles([])}
                  className={`flex-1 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-colors ${
                    isMiku ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-white/10 hover:bg-white/15 text-white'
                  }`}
                >
                  重新选择
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  className={`flex-1 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-all active:scale-95 ${
                    isMiku ? 'bg-[#39C5BB] hover:bg-[#30b3a9] text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'
                  }`}
                >
                  开始上传
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className={`rounded-2xl border p-4 ${isMiku ? 'bg-white/70 border-slate-200' : 'bg-white/5 border-white/10'}`}>
                <div className="flex items-end justify-between gap-3 mb-2">
                  <div>
                    <p className={`text-xs uppercase tracking-widest font-black ${isMiku ? 'text-slate-500' : 'text-white/50'}`}>总体进度</p>
                    <p className={`text-sm font-black ${isMiku ? 'text-slate-700' : 'text-white/90'}`}>{completedFiles}/{totalFiles} 文件</p>
                  </div>
                  <p className={`text-lg font-black tracking-wider ${isMiku ? 'text-[#39C5BB]' : 'text-blue-400'}`}>{progress}%</p>
                </div>
                <div className={`h-2 rounded-full overflow-hidden ${isMiku ? 'bg-slate-200' : 'bg-white/10'}`}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    className={`h-full ${isMiku ? 'bg-[#39C5BB]' : 'bg-gradient-to-r from-blue-500 to-cyan-400'}`}
                  />
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className={isMiku ? 'text-slate-400' : 'text-white/45'}>当前处理</p>
                    <p className={`font-bold truncate ${isMiku ? 'text-slate-700' : 'text-white/85'}`}>{currentTaskName || activeTask?.name || '-'}</p>
                  </div>
                  <div>
                    <p className={isMiku ? 'text-slate-400' : 'text-white/45'}>当前状态</p>
                    <p className={`font-bold truncate ${isMiku ? 'text-slate-700' : 'text-white/85'}`}>{status || '上传中'}</p>
                  </div>
                  <div>
                    <p className={isMiku ? 'text-slate-400' : 'text-white/45'}>传输速度</p>
                    <p className={`font-bold ${isMiku ? 'text-slate-700' : 'text-white/85'}`}>{formatSpeed(aggregateSpeed)}</p>
                  </div>
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto pr-1 space-y-2">
                {uploadTasks.map((task) => (
                  <div key={task.id} className={`rounded-xl border p-3 ${isMiku ? 'bg-white/70 border-slate-200' : 'bg-white/5 border-white/10'}`}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <p className={`text-xs font-bold truncate ${isMiku ? 'text-slate-700' : 'text-white/80'}`}>{task.name}</p>
                      <span className={`text-[11px] font-black ${isMiku ? 'text-[#39C5BB]' : 'text-blue-400'}`}>{task.progress}%</span>
                    </div>
                    <div className={`h-1.5 rounded-full overflow-hidden ${isMiku ? 'bg-slate-200' : 'bg-white/10'}`}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${task.progress}%` }}
                        className={`h-full ${task.status === 'error' ? 'bg-red-500' : isMiku ? 'bg-[#39C5BB]' : 'bg-gradient-to-r from-blue-500 to-cyan-400'}`}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px]">
                      <span className={isMiku ? 'text-slate-500' : 'text-white/45'}>{formatSize(task.loadedBytes)} / {formatSize(task.totalBytes || 1)}</span>
                      <span className={isMiku ? 'text-slate-500' : 'text-white/45'}>{task.status === 'success' ? '完成' : task.status === 'error' ? '失败' : formatSpeed(task.speedBps)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-red-400 text-xs">
              <AlertCircle size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {multipartPending && !uploading && (
            <div className={`mt-4 rounded-xl border p-3 ${isMiku ? 'bg-white/70 border-slate-200' : 'bg-white/5 border-white/10'}`}>
              <p className={`text-xs mb-3 ${isMiku ? 'text-slate-600' : 'text-white/75'}`}>
                当前失败分片：{multipartPending.failedParts.join(', ') || '-'}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleRetryFailedParts}
                  disabled={multipartActionBusy}
                  className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-50 ${
                    isMiku ? 'bg-[#39C5BB] hover:bg-[#30b3a9] text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'
                  }`}
                >
                  继续失败分片
                </button>
                <button
                  type="button"
                  onClick={handleSaveMultipartSession}
                  disabled={multipartActionBusy}
                  className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-50 ${
                    isMiku ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-white/10 hover:bg-white/15 text-white'
                  }`}
                >
                  保存会话
                </button>
                <button
                  type="button"
                  onClick={handleAbortMultipartSession}
                  disabled={multipartActionBusy}
                  className="px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-50 bg-red-500/15 hover:bg-red-500/25 text-red-400"
                >
                  放弃并清理
                </button>
              </div>
            </div>
          )}

          {uploading && (
            <div className="mt-4 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setMinimized(true)}
                className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-2 ${
                  isMiku ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-white/10 hover:bg-white/15 text-white/85'
                }`}
              >
                <Loader2 size={14} className="animate-spin" />
                收起后台继续
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
