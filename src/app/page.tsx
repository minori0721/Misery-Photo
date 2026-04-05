'use client';

import { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder,
  Image as ImageIcon,
  ChevronRight,
  Upload,
  Download,
  LogOut,
  Loader2,
  HardDrive,
  Trash2,
  LayoutGrid,
  Rows,
  ArrowUp,
  Settings2,
  CheckSquare,
  Square,
  Scissors,
  Copy,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X as XIcon,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import UploadModal from '@/components/UploadModal';
import SettingsModal from '@/components/SettingsModal';
import TargetPickerModal from '@/components/TargetPickerModal';
import JSZip from 'jszip';
import { useSettings, ISettings } from '@/lib/useSettings';

// Toast 消息类型
type Toast = { id: number; message: string; type: 'info' | 'success' | 'error' };

// 视图模式：网格 或 漫画模式（纵向平铺）
type ViewMode = 'grid' | 'manga';

type GalleryFolder = { name: string; path: string; type: 'folder'; previews: string[] };
type GalleryFile = {
  name: string;
  path: string;
  url: string;
  size: number;
  lastModified: string;
  type: 'image';
};
type GalleryData = { folders: GalleryFolder[]; files: GalleryFile[]; currentPath: string };
type FileToDownload = { name: string; url: string; zipPath: string };

const IMAGE_EXT_RE = /\.(jpg|jpeg|png|webp|gif)$/i;
const naturalSort = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

const textContent = (el: Element, tagName: string) => el.getElementsByTagName(tagName)[0]?.textContent || '';

function parseS3ListXml(xmlString: string, path: string) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlString, 'application/xml');
  const parseError = xml.getElementsByTagName('parsererror')[0];
  if (parseError) {
    throw new Error('解析 S3 XML 失败');
  }

  const prefixes = Array.from(xml.getElementsByTagName('CommonPrefixes'));
  const folders: GalleryFolder[] = [];
  for (const cp of prefixes) {
    const folderPath = textContent(cp, 'Prefix');
    const folderName = folderPath.replace(path, '').replace(/\/$/, '');
    if (!folderPath || !folderName) continue;
    folders.push({
      name: folderName,
      path: folderPath,
      type: 'folder',
      previews: [],
    });
  }

  const contents = Array.from(xml.getElementsByTagName('Contents'));
  const filesMeta = contents
    .map((item) => {
      const key = textContent(item, 'Key');
      if (!key || key === path || !IMAGE_EXT_RE.test(key)) return null;
      return {
        key,
        size: Number(textContent(item, 'Size') || '0'),
        lastModified: textContent(item, 'LastModified') || '',
      };
    })
    .filter((f): f is { key: string; size: number; lastModified: string } => Boolean(f));

  const isTruncated = textContent(xml.documentElement, 'IsTruncated') === 'true';
  const nextContinuationToken = textContent(xml.documentElement, 'NextContinuationToken') || null;

  return { folders, filesMeta, isTruncated, nextContinuationToken };
}

// Framer Motion 动画变体：用于交错入场
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1 }
};

function GalleryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPath = searchParams.get('path') || '';

  const [data, setData] = useState<GalleryData>({ folders: [], files: [], currentPath: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [noBucketConfigured, setNoBucketConfigured] = useState(false);
  const [bucketRefreshTick, setBucketRefreshTick] = useState(0);
  const [activeAbortController, setActiveAbortController] = useState<AbortController | null>(null);

  const toastIdRef = useRef(0);
  const galleryReqIdRef = useRef(0);
  const galleryAbortRef = useRef<AbortController | null>(null);
  const previewCacheRef = useRef<Map<string, string[]>>(new Map());
  const previewInFlightRef = useRef<Map<string, Promise<string[]>>>(new Map());
  const previewActiveCountRef = useRef(0);
  const previewWaitersRef = useRef<Array<() => void>>([]);

  // 多选模式
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<'move' | 'copy' | null>(null);

  // Toast 系统
  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const handleAuthExpired = useCallback((message?: string) => {
    addToast(message || '登录已过期，请重新登录', 'error');
    router.push('/login');
  }, [addToast, router]);

  const fetchApiJson = useCallback(async <T = any>(input: RequestInfo | URL, init?: RequestInit): Promise<T> => {
    const res = await fetch(input, init);
    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const payload = isJson ? await res.json() : null;

    if (res.status === 401) {
      handleAuthExpired(payload?.message);
      throw new Error('UNAUTHORIZED');
    }

    if (!res.ok) {
      const err = new Error(payload?.message || `请求失败（${res.status}）`) as Error & { code?: string };
      err.code = payload?.code;
      throw err;
    }

    return payload as T;
  }, [handleAuthExpired]);

  const { settings, updateSettings, mounted } = useSettings();

  // 监听滚动条以显示/隐藏回顶按钮
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const acquirePreviewSlot = useCallback(async () => {
    const maxConcurrent = 4;
    if (previewActiveCountRef.current < maxConcurrent) {
      previewActiveCountRef.current += 1;
      return;
    }
    await new Promise<void>((resolve) => previewWaitersRef.current.push(resolve));
    previewActiveCountRef.current += 1;
  }, []);

  const releasePreviewSlot = useCallback(() => {
    previewActiveCountRef.current = Math.max(0, previewActiveCountRef.current - 1);
    const next = previewWaitersRef.current.shift();
    if (next) next();
  }, []);

  // 获取文件列表（Signer Mode）：后端仅签名，前端直连 S3 拉 XML 并解析
  const fetchGallery = async (path: string) => {
    const reqId = ++galleryReqIdRef.current;
    galleryAbortRef.current?.abort();
    const controller = new AbortController();
    galleryAbortRef.current = controller;
    const signal = controller.signal;

    setLoading(true);
    setError('');
    setNoBucketConfigured(false);
    try {
      const foldersMap = new Map<string, GalleryFolder>();
      const filesMetaMap = new Map<string, { key: string; size: number; lastModified: string }>();
      let continuationToken: string | null = null;

      do {
        const tokenPart = continuationToken ? `&continuationToken=${encodeURIComponent(continuationToken)}` : '';
        const signerJson = await fetchApiJson<any>(`/api/gallery?path=${encodeURIComponent(path)}${tokenPart}`, { signal });
        if (!signerJson.success) {
          throw new Error(signerJson.message || '获取列表签名失败');
        }

        const listRes = await fetch(signerJson.data.listUrl, { signal });
        if (!listRes.ok) {
          throw new Error(`S3 列表请求失败: ${listRes.status}`);
        }

        const xmlText = await listRes.text();
        const parsed = parseS3ListXml(xmlText, path);

        parsed.folders.forEach((folder) => foldersMap.set(folder.path, folder));
        parsed.filesMeta.forEach((fileMeta) => filesMetaMap.set(fileMeta.key, fileMeta));
        continuationToken = parsed.isTruncated ? parsed.nextContinuationToken : null;
      } while (continuationToken);

      const sortedFileKeys = Array.from(filesMetaMap.keys()).sort((a, b) => naturalSort(a, b));

      const signedUrlMap: Record<string, string> = {};
      for (let i = 0; i < sortedFileKeys.length; i += 200) {
        const chunkKeys = sortedFileKeys.slice(i, i + 200);
        const signJson = await fetchApiJson<any>('/api/gallery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'sign-get-objects', keys: chunkKeys }),
          signal,
        });
        if (!signJson.success) {
          throw new Error(signJson.message || '文件签名失败');
        }
        Object.assign(signedUrlMap, signJson.data || {});
      }

      const files: GalleryFile[] = sortedFileKeys
        .map((key) => {
          const meta = filesMetaMap.get(key);
          const url = signedUrlMap[key];
          if (!meta || !url) return null;
          return {
            name: key.replace(path, '') || key,
            path: key,
            url,
            size: meta.size,
            lastModified: meta.lastModified,
            type: 'image' as const,
          };
        })
        .filter((f): f is GalleryFile => Boolean(f));

      const folders = Array.from(foldersMap.values()).sort((a, b) => naturalSort(a.name, b.name));
      if (!signal.aborted && reqId === galleryReqIdRef.current) {
        setData({ folders, files, currentPath: path });
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') {
        return;
      }
      const errCode = (err as { code?: string })?.code;
      if (errCode === 'NO_BUCKET_CONFIG') {
        if (reqId === galleryReqIdRef.current) {
          setNoBucketConfigured(true);
          setData({ folders: [], files: [], currentPath: path });
          setError('');
        }
        return;
      }
      const msg = err instanceof Error ? err.message : '获取数据失败';
      if (reqId === galleryReqIdRef.current) {
        setError(msg);
      }
    } finally {
      if (reqId === galleryReqIdRef.current) {
        setLoading(false);
      }
    }
  };

  // 文件夹缩略图也走直连：前端自己拿签名列表 + 解析 + 批量签图
  const fetchFolderPreviewDirect = useCallback(async (path: string): Promise<string[]> => {
    const cached = previewCacheRef.current.get(path);
    if (cached) return cached;

    const inFlight = previewInFlightRef.current.get(path);
    if (inFlight) return inFlight;

    const run = (async () => {
      await acquirePreviewSlot();
      try {
        const signerJson = await fetchApiJson<any>(`/api/gallery?path=${encodeURIComponent(path)}&maxKeys=12`);
        if (!signerJson.success) return [];

        const listRes = await fetch(signerJson.data.listUrl);
        if (!listRes.ok) return [];

        const xmlText = await listRes.text();
        const parsed = parseS3ListXml(xmlText, path);
        const previewKeys = parsed.filesMeta.map((m) => m.key).slice(0, 3);
        if (previewKeys.length === 0) {
          previewCacheRef.current.set(path, []);
          return [];
        }

        const signJson = await fetchApiJson<any>('/api/gallery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'sign-get-objects', keys: previewKeys }),
        });
        if (!signJson.success) return [];

        const urls = previewKeys.map((k) => signJson.data?.[k]).filter((u): u is string => Boolean(u));
        previewCacheRef.current.set(path, urls);
        return urls;
      } finally {
        previewInFlightRef.current.delete(path);
        releasePreviewSlot();
      }
    })();

    previewInFlightRef.current.set(path, run);
    return run;
  }, [acquirePreviewSlot, releasePreviewSlot]);

  useEffect(() => {
    fetchGallery(currentPath);
    setViewMode(currentPath ? 'manga' : 'grid');
  }, [currentPath, bucketRefreshTick]);

  useEffect(() => {
    return () => {
      galleryAbortRef.current?.abort();
    };
  }, []);

  // 页面卸载或路径切换时，自动取消正在进行的下载请求
  useEffect(() => {
    return () => {
      if (activeAbortController) {
        activeAbortController.abort();
      }
    };
  }, [activeAbortController]);

  // 处理文件夹点击
  const handleFolderClick = (folderPath: string) => {
    router.push(`/?path=${encodeURIComponent(folderPath)}`);
  };

  // 处理返回上级
  const handleGoBack = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const newPath = parts.length > 0 ? parts.join('/') + '/' : '';
    router.push(`/?path=${encodeURIComponent(newPath)}`);
  };

  // 多选 helpers
  const toggleSelection = (key: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };
  const toggleSelectAll = () => {
    const allKeys = [
      ...data.folders.map((f: any) => f.path),
      ...data.files.map((f: any) => f.path),
    ];
    if (selectedItems.size === allKeys.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(allKeys));
    }
  };
  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedItems(new Set());
  };

  // 取消下载
  const cancelDownload = () => {
    if (activeAbortController) {
      activeAbortController.abort();
      setActiveAbortController(null);
      setDownloading(false);
      addToast('下载已取消', 'info');
    }
  };

  const collectFolderFilesForZip = useCallback(async (folder: GalleryFolder, signal: AbortSignal): Promise<FileToDownload[]> => {
    const collectedKeys: string[] = [];
    const queue: string[] = [folder.path];

    while (queue.length > 0) {
      if (signal.aborted) return [];
      const walkPath = queue.shift()!;
      let continuationToken: string | null = null;

      do {
        const tokenPart = continuationToken ? `&continuationToken=${encodeURIComponent(continuationToken)}` : '';
        const signerJson = await fetchApiJson<any>(`/api/gallery?path=${encodeURIComponent(walkPath)}${tokenPart}`, { signal });
        if (!signerJson.success) {
          throw new Error(signerJson.message || '获取下载列表签名失败');
        }

        const listRes = await fetch(signerJson.data.listUrl, { signal });
        if (!listRes.ok) {
          throw new Error(`S3 列表请求失败: ${listRes.status}`);
        }

        const xmlText = await listRes.text();
        const parsed = parseS3ListXml(xmlText, walkPath);
        parsed.filesMeta.forEach((m) => collectedKeys.push(m.key));
        parsed.folders.forEach((f) => queue.push(f.path));
        continuationToken = parsed.isTruncated ? parsed.nextContinuationToken : null;
      } while (continuationToken);
    }

    const uniqKeys = Array.from(new Set(collectedKeys));
    if (uniqKeys.length === 0) return [];

    const signedUrlMap: Record<string, string> = {};
    for (let i = 0; i < uniqKeys.length; i += 200) {
      const chunkKeys = uniqKeys.slice(i, i + 200);
      const signJson = await fetchApiJson<any>('/api/gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sign-get-objects', keys: chunkKeys }),
        signal,
      });
      if (!signJson.success) {
        throw new Error(signJson.message || '下载对象签名失败');
      }
      Object.assign(signedUrlMap, signJson.data || {});
    }

    return uniqKeys
      .map((key) => {
        const relativePath = key.startsWith(folder.path) ? key.slice(folder.path.length) : key;
        const cleanRelativePath = relativePath.replace(/^\/+/, '');
        const url = signedUrlMap[key];
        if (!cleanRelativePath || !url) return null;
        return {
          name: cleanRelativePath.split('/').pop() || cleanRelativePath,
          url,
          zipPath: `${folder.name}/${cleanRelativePath}`,
        };
      })
      .filter((f): f is FileToDownload => Boolean(f));
  }, []);

  // 智能下载：支持子目录结构感知 + 可选只下载选中项
  const handleDownloadZip = async (options?: { files?: GalleryFile[]; folders?: GalleryFolder[]; zipName?: string }) => {
    const controller = new AbortController();
    setActiveAbortController(controller);
    setDownloading(true);
    setDownloadProgress(0);
    
    // 如果是多选触发，立即退出多选模式
    if (options?.files || options?.folders) {
      exitSelectionMode();
    }

    const zip = new JSZip();
    const folderName = options?.zipName || currentPath.split('/').filter(Boolean).pop() || 'gallery-export';

    try {
      const signal = controller.signal;

      // 若当前路径下有子画集，递归获取结构
      const hasSubFolders = data.folders.length > 0 && !options?.files && !options?.folders;
      let filesToDownload: FileToDownload[] = [];

      if (options?.files || options?.folders) {
        const selectedFiles = options.files || [];
        const selectedFolders = options.folders || [];

        const fromFiles = selectedFiles.map((f) => ({ name: f.name, url: f.url, zipPath: f.name }));
        const fromFolders = (await Promise.all(selectedFolders.map((folder) => collectFolderFilesForZip(folder, signal)))).flat();
        filesToDownload = [...fromFiles, ...fromFolders];
      } else if (hasSubFolders) {
        // 保留子目录结构
        const subFetchTasks = data.folders.map((folder: GalleryFolder) => collectFolderFilesForZip(folder, signal));
        // 当前路径下的直接文件
        const directFiles = data.files.map((f) => ({ name: f.name, url: f.url, zipPath: f.name }));
        const nested = (await Promise.all(subFetchTasks)).flat();
        filesToDownload = [...directFiles, ...nested];
      } else {
        // 纯图集，扁平打包
        filesToDownload = data.files.map((f) => ({ name: f.name, url: f.url, zipPath: f.name }));
      }

      if (filesToDownload.length === 0) { 
        setDownloading(false); 
        setActiveAbortController(null);
        return; 
      }

      let completed = 0;
      const total = filesToDownload.length;
      
      // 并发下载逻辑 (v0.6.0 支持 AbortSignal)
      for (let i = 0; i < filesToDownload.length; i += 5) {
        if (signal.aborted) break;
        const chunk = filesToDownload.slice(i, i + 5);
        await Promise.all(chunk.map(async (file) => {
          try {
            const res = await fetch(file.url, { signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            zip.file(file.zipPath, blob);
            completed++;
            setDownloadProgress(Math.round((completed / total) * 100));
          } catch (err: any) {
            if (err.name === 'AbortError') throw err;
            console.error(`Failed to download ${file.name}`, err);
          }
        }));
      }

      if (signal.aborted) return;

      setDownloadProgress(100);
      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      const objectUrl = URL.createObjectURL(content);
      link.href = objectUrl;
      link.download = `${folderName}.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
      addToast('打包下载成功', 'success');
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Download aborted by user');
      } else {
        console.error('Download error:', err);
        addToast('打包下载失败', 'error');
      }
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
      setActiveAbortController(null);
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    const count = selectedItems.size;
    if (!confirm(`确认删除选中的 ${count} 个项目？此操作不可撤销。`)) return;
    try {
      const paths = Array.from(selectedItems);
      await fetchApiJson('/api/gallery/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', paths }),
      });
      addToast(`已删除 ${count} 个文件`, 'success');
      exitSelectionMode();
      fetchGallery(currentPath);
    } catch {
      addToast('删除失败，请重试', 'error');
    }
  };

  // 批量下载（只含选中文件）
  const handleBatchDownload = () => {
    const selectedFiles = data.files.filter((f) => selectedItems.has(f.path));
    const selectedFolders = data.folders.filter((f) => selectedItems.has(f.path));
    if (selectedFiles.length === 0 && selectedFolders.length === 0) return;
    handleDownloadZip({ files: selectedFiles, folders: selectedFolders, zipName: 'all' });
  };

  // 后台执行移动/复制
  const handleTargetConfirm = async (dest: string) => {
    const action = pendingAction!;
    const paths = Array.from(selectedItems);
    const label = action === 'move' ? '移动' : '复制';
    addToast(`⏳ 正在后台${label} ${paths.length} 个文件，完成后自动刷新…`, 'info');
    setPendingAction(null);
    exitSelectionMode();
    try {
      const json = await fetchApiJson<any>('/api/gallery/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, paths, dest: dest ? `${dest}` : '' }),
      });
      if (json.success) {
        addToast(`✓ ${label}完成，已刷新画廊`, 'success');
        fetchGallery(currentPath);
      } else {
        addToast(`${label}失败：${json.message}`, 'error');
      }
    } catch {
      addToast(`${label}失败，请重试`, 'error');
    }
  };

  const handleLogout = async () => {
    try {
      await fetchApiJson('/api/logout', { method: 'POST' });
    } catch {
      // Ignore logout response errors and still redirect to login.
    } finally {
      router.push('/login');
    }
  };

  const handleDelete = async (path: string, type: 'image' | 'folder') => {
    const confirmMsg = type === 'folder' ? '⚠ 警告：这将导致该画集及其中所有数据永久删除！确认吗？' : '确认删除这张照片吗？';
    if (!confirm(confirmMsg)) return;

    try {
      const json = await fetchApiJson<any>('/api/gallery/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, type }),
      });
      if (json.success) {
        fetchGallery(currentPath);
      } else {
        alert(json.message);
      }
    } catch (err) {
      alert('操作失败');
    }
  };

  if (!mounted) return null;

  const allKeys = [...data.folders.map((f: any) => f.path), ...data.files.map((f: any) => f.path)];

  return (
    <div className={`min-h-screen selection:bg-purple-500/30 transition-colors duration-1000 ${settings.theme === 'miku'
        ? (viewMode === 'manga' ? 'bg-[#f0f4f8] text-slate-800 bg-fixed' : 'bg-[#fafcff] text-slate-800')
        : (viewMode === 'manga' ? 'bg-gradient-to-br from-[#1b1429] via-[#050505] to-[#0c1838] bg-fixed text-white' : 'bg-[#050505] text-white')
      }`}>
      {/* Toast 通知层 */}
      <div className="fixed top-6 right-6 z-[200] space-y-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 60, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.9 }}
              className={`flex items-center space-x-2 px-4 py-3 rounded-2xl shadow-2xl text-sm font-bold pointer-events-auto backdrop-blur-xl border ${t.type === 'success'
                  ? (settings.theme === 'miku' ? 'bg-[#39C5BB]/10 border-[#39C5BB]/30 text-[#2a9a92]' : 'bg-green-500/10 border-green-500/30 text-green-400')
                  : t.type === 'error'
                    ? 'bg-red-500/10 border-red-500/30 text-red-400'
                    : (settings.theme === 'miku' ? 'bg-white/90 border-slate-200 text-slate-700' : 'bg-white/10 border-white/20 text-white')
                }`}
            >
              {t.type === 'success' ? <CheckCircle2 size={14} /> : t.type === 'error' ? <XCircle size={14} /> : <Loader2 size={14} className="animate-spin" />}
              <span>{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        updateSettings={updateSettings}
        onBucketsChanged={() => setBucketRefreshTick((v) => v + 1)}
      />

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        currentPath={currentPath}
        onRefresh={() => fetchGallery(currentPath)}
      />

      <TargetPickerModal
        isOpen={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        onConfirm={handleTargetConfirm}
        title={pendingAction === 'move' ? '移动到' : '复制到'}
        settings={settings}
        currentPath={currentPath}
      />

      {/* 下载进度条 - v0.6.0 重构支持取消与主题适配 */}
      <AnimatePresence>
        {downloading && (
          <motion.div
            initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm"
          >
            <div className={`mx-4 border backdrop-blur-3xl p-4 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center space-x-4 ${
              settings.theme === 'miku' ? 'bg-white/90 border-[#39C5BB]/20' : 'bg-[#111]/90 border-white/10'
            }`}>
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                settings.theme === 'miku' ? 'bg-[#39C5BB]/10 text-[#39C5BB]' : 'bg-purple-500/10 text-purple-500'
              }`}>
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
              
              <div className="flex-1">
                <div className="flex justify-between items-end mb-1.5">
                  <p className={`text-[10px] uppercase tracking-widest font-black ${
                    settings.theme === 'miku' ? 'text-slate-400' : 'text-white/40'
                  }`}>正在下载图集...</p>
                  <span className={`text-xs font-bold font-mono ${
                    settings.theme === 'miku' ? 'text-[#39C5BB]' : 'text-white'
                  }`}>{downloadProgress}%</span>
                </div>
                <div className={`h-1.5 w-full rounded-full overflow-hidden ${
                  settings.theme === 'miku' ? 'bg-slate-100' : 'bg-white/5'
                }`}>
                  <motion.div 
                    initial={{ width: 0 }} 
                    animate={{ width: `${downloadProgress}%` }} 
                    className={`h-full ${settings.theme === 'miku' ? 'bg-[#39C5BB]' : 'bg-gradient-to-r from-purple-600 to-blue-600'}`} 
                  />
                </div>
              </div>

              <button 
                onClick={cancelDownload}
                className={`p-2 rounded-xl transition-all hover:scale-110 active:scale-95 ${
                  settings.theme === 'miku' ? 'bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500' : 'bg-white/5 hover:bg-red-500/10 text-white/30 hover:text-red-400'
                }`}
              >
                <XIcon size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 回顶悬浮按钮 */}
      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            onClick={scrollToTop}
            className={`fixed bottom-8 right-8 z-[60] w-12 h-12 backdrop-blur-xl rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-90 ${settings.theme === 'miku' ? 'bg-white/80 border border-slate-200 text-[#39C5BB] hover:bg-white' : 'bg-white/10 hover:bg-white/20 border border-white/10 text-white'}`}
          >
            <ArrowUp size={20} />
          </motion.button>
        )}
      </AnimatePresence>

      <header className={`sticky top-0 z-50 border-b backdrop-blur-2xl ${settings.theme === 'miku' ? 'bg-white/80 border-[#39C5BB]/20' : 'bg-[#050505]/70 border-white/10'}`}>
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${settings.theme === 'miku' ? 'bg-gradient-to-tr from-[#39C5BB] to-[#7be9e1] shadow-[0_0_20px_rgba(57,197,187,0.4)]' : 'bg-gradient-to-tr from-purple-600 to-blue-600 shadow-[0_0_20px_rgba(147,51,234,0.3)]'}`}>
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-black text-sm tracking-tighter uppercase italic">Misery <span className={settings.theme === 'miku' ? 'text-[#39C5BB]' : 'text-purple-500'}>Photo</span></h1>
              <p className={`text-[10px] uppercase tracking-[2px] ${settings.theme === 'miku' ? 'text-slate-400' : 'text-white/30'}`}>私人云相册</p>
            </div>
          </div>

          <div className="flex items-center space-x-3 md:space-x-4">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className={`p-2 rounded-xl transition-colors ${settings.theme === 'miku' ? 'hover:bg-[#39C5BB]/10 text-slate-500' : 'hover:bg-white/10 text-white/50'}`}
            >
              <Settings2 size={20} />
            </button>
            <button
              onClick={() => setIsUploadOpen(true)}
              className={`px-3 md:px-5 py-2 rounded-xl transition-all flex items-center space-x-2 text-xs font-black uppercase ${settings.theme === 'miku' ? 'bg-[#39C5BB] text-white hover:bg-[#2eaa9e]' : 'bg-white text-black hover:bg-white/90'}`}
            >
              <Upload size={14} />
              <span className="hidden sm:inline">上传照片</span>
            </button>
            <button onClick={handleLogout} className={`p-2 transition-colors ${settings.theme === 'miku' ? 'text-slate-400 hover:text-red-500' : 'text-white/20 hover:text-red-400'}`}>
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 space-y-6 sm:space-y-0">
          <nav className="flex items-center space-x-2 text-sm overflow-x-auto pb-2 sm:pb-0 scrollbar-hide">
            <button onClick={() => router.push('/')} className={`px-2 py-1 rounded-lg transition-colors shrink-0 ${settings.theme === 'miku' ? 'text-slate-500 hover:text-[#39C5BB] hover:bg-[#39C5BB]/10' : 'text-white/50 hover:text-white hover:bg-white/5'}`}>总览</button>
            {currentPath.split('/').filter(Boolean).map((part, idx, arr) => (
              <div key={idx} className="flex items-center space-x-2 shrink-0">
                <ChevronRight size={14} className="opacity-30" />
                <button onClick={() => router.push(`/?path=${encodeURIComponent(arr.slice(0, idx + 1).join('/') + '/')}`)} className={`px-2 py-1 rounded-lg transition-colors ${idx === arr.length - 1 ? (settings.theme === 'miku' ? 'text-[#39C5BB] font-bold' : 'text-white font-bold') : (settings.theme === 'miku' ? 'text-slate-500 hover:bg-[#39C5BB]/10' : 'text-white/50 hover:text-white hover:bg-white/5')}`}>
                  {part}
                </button>
              </div>
            ))}
          </nav>

          <div className={`flex items-center space-x-2 p-1 rounded-2xl border ${settings.theme === 'miku' ? 'bg-white border-[#39C5BB]/20 shadow-sm' : 'bg-white/5 border-white/5'}`}>
            {!selectionMode ? (
              <>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-xl transition-all ${viewMode === 'grid' ? (settings.theme === 'miku' ? 'bg-[#39C5BB]/10 text-[#39C5BB]' : 'bg-white/10 text-white shadow-xl') : (settings.theme === 'miku' ? 'text-slate-400 hover:text-slate-600' : 'text-white/30 hover:text-white/60')}`}
                >
                  <LayoutGrid size={18} />
                </button>
                <button
                  onClick={() => setViewMode('manga')}
                  className={`p-2 rounded-xl transition-all ${viewMode === 'manga' ? (settings.theme === 'miku' ? 'bg-[#39C5BB]/10 text-[#39C5BB]' : 'bg-white/10 text-white shadow-xl') : (settings.theme === 'miku' ? 'text-slate-400 hover:text-slate-600' : 'text-white/30 hover:text-white/60')}`}
                >
                  <Rows size={18} />
                </button>
                <div className={`w-[1px] h-4 mx-1 ${settings.theme === 'miku' ? 'bg-slate-200' : 'bg-white/10'}`} />
                <button onClick={() => handleDownloadZip()} title="下载所有内容" className={`p-2 transition-colors ${settings.theme === 'miku' ? 'text-slate-400 hover:text-[#39C5BB]' : 'text-white/30 hover:text-blue-400'}`}><Download size={18} /></button>
                <div className={`w-[1px] h-4 mx-1 ${settings.theme === 'miku' ? 'bg-slate-200' : 'bg-white/10'}`} />
                <button
                  onClick={() => setSelectionMode(true)}
                  title="多选模式"
                  className={`p-2 rounded-xl transition-all ${settings.theme === 'miku' ? 'text-slate-400 hover:text-[#39C5BB] hover:bg-[#39C5BB]/10' : 'text-white/30 hover:text-white/70 hover:bg-white/10'}`}
                >
                  <CheckSquare size={18} />
                </button>
              </>
            ) : (
              <>
                <button onClick={toggleSelectAll} className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${settings.theme === 'miku' ? 'text-[#39C5BB] hover:bg-[#39C5BB]/10' : 'text-purple-400 hover:bg-purple-500/10'
                  }`}>
                  {selectedItems.size === allKeys.length ? '取消全选' : '全选'}
                </button>
                <div className={`w-[1px] h-4 ${settings.theme === 'miku' ? 'bg-slate-200' : 'bg-white/10'}`} />
                <button onClick={exitSelectionMode} className={`p-2 rounded-xl transition-all ${settings.theme === 'miku' ? 'text-slate-500 hover:text-red-500 hover:bg-red-50' : 'text-white/40 hover:text-red-400 hover:bg-red-500/10'
                  }`}><XIcon size={18} /></button>
              </>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-40">
            <Loader2 className={`w-10 h-10 animate-spin mb-4 ${settings.theme === 'miku' ? 'text-[#39C5BB]' : 'text-purple-600'}`} />
            <p className={`text-xs font-black uppercase tracking-[4px] ${settings.theme === 'miku' ? 'text-slate-400' : 'text-white/20'}`}>正在同步云端数据...</p>
          </div>
        ) : noBucketConfigured ? (
          <div className={`max-w-2xl mx-auto mt-14 p-8 rounded-3xl border text-center ${settings.theme === 'miku' ? 'bg-white border-[#39C5BB]/20' : 'bg-white/5 border-white/10'}`}>
            <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-5 ${settings.theme === 'miku' ? 'bg-[#39C5BB]/10 text-[#39C5BB]' : 'bg-purple-500/10 text-purple-400'}`}>
              <HardDrive size={28} />
            </div>
            <h2 className="text-xl font-black tracking-wider mb-2">暂无可用存储桶</h2>
            <p className={`text-sm mb-6 ${settings.theme === 'miku' ? 'text-slate-500' : 'text-white/60'}`}>
              登录成功，但当前没有可用桶配置。请前往设置添加并激活一个存储桶。
            </p>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className={`px-6 py-3 rounded-xl text-sm font-black uppercase tracking-widest ${settings.theme === 'miku' ? 'bg-[#39C5BB] text-white' : 'bg-purple-600 text-white'}`}
            >
              打开设置
            </button>
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className={viewMode === 'grid' ? `grid ${settings.mobileCols === 2 ? 'grid-cols-2' : 'grid-cols-1'} md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-6` : `max-w-4xl mx-auto space-y-0 shadow-2xl rounded-2xl overflow-hidden backdrop-blur-3xl border ${settings.theme === 'miku' ? 'bg-white/40 border-[#39C5BB]/20' : 'bg-black/40 border-white/5'}`}
          >
            <AnimatePresence mode="popLayout">
              {/* 错误提示区域 */}
              {error && (
                <div className="col-span-full py-32 text-center flex flex-col items-center justify-center space-y-4">
                   <div className="w-16 h-16 rounded-3xl bg-red-500/10 flex items-center justify-center text-red-500 mb-2">
                      <AlertCircle size={32} />
                   </div>
                   <p className="text-sm font-black uppercase tracking-[2px] text-red-400">连接 OSS 服务器失败</p>
                   <p className={`text-xs opacity-40 max-w-md mx-auto font-mono px-4 ${settings.theme === 'miku' ? 'text-slate-900' : 'text-white'}`}>{error}</p>
                   <button 
                    onClick={() => fetchGallery(currentPath)}
                    className={`mt-4 px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg ${
                      settings.theme === 'miku' ? 'bg-[#39C5BB] text-white shadow-[#39C5BB]/30' : 'bg-white text-black hover:bg-white/90 shadow-white/10'
                    }`}
                   >
                    重试连接
                   </button>
                </div>
              )}

              {/* 文件夹显示区域 (v0.5.0: 已取消预览数量限制) */}
              {!error && viewMode === 'grid' && data.folders.map((folder: any) => (
                <FolderCard
                  key={folder.path}
                  folder={folder}
                  onClick={() => selectionMode ? toggleSelection(folder.path) : handleFolderClick(folder.path)}
                  onDelete={() => handleDelete(folder.path, 'folder')}
                  settings={settings}
                  selectionMode={selectionMode}
                  isSelected={selectedItems.has(folder.path)}
                  fetchPreviewUrls={fetchFolderPreviewDirect}
                />
              ))}

              {/* 文件显示区域 */}
              {!error && data.files.map((file: any) => (
                <motion.div
                  key={file.path}
                  variants={itemVariants}
                  layout
                  onClick={() => { if (selectionMode) toggleSelection(file.path); }}
                  className={viewMode === 'grid' ?
                    `group relative rounded-3xl overflow-hidden transition-all duration-500 border aspect-[3/4] ${selectionMode && selectedItems.has(file.path)
                      ? (settings.theme === 'miku' ? 'border-[#39C5BB] shadow-[0_0_0_3px_rgba(57,197,187,0.3)] bg-white' : 'border-purple-500 shadow-[0_0_0_3px_rgba(168,85,247,0.3)] bg-[#090909]')
                      : settings.theme === 'miku'
                        ? 'bg-white border-[#39C5BB]/20 hover:border-[#39C5BB] hover:shadow-[0_10px_30px_rgba(57,197,187,0.15)]'
                        : 'bg-[#090909] border-white/10 hover:border-purple-500/50 hover:shadow-[0_0_30px_rgba(147,51,234,0.15)]'
                    }` :
                    "w-full bg-transparent flex flex-col items-center relative group"
                  }
                >
                  {/* 多选 Checkbox */}
                  {selectionMode && viewMode === 'grid' && (
                    <div className="absolute top-3 left-3 z-20">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedItems.has(file.path)
                          ? (settings.theme === 'miku' ? 'bg-[#39C5BB] border-[#39C5BB]' : 'bg-purple-500 border-purple-500')
                          : 'bg-black/30 border-white/60 backdrop-blur-sm'
                        }`}>
                        {selectedItems.has(file.path) && <CheckSquare size={12} className="text-white" />}
                      </div>
                    </div>
                  )}
                  <div className={`${viewMode === 'grid' ? "w-full h-full relative overflow-hidden" : "w-full"} min-h-[300px] overflow-hidden flex items-center justify-center transition-all duration-300 relative`}>
                    <div className={`absolute inset-0 animate-pulse ${settings.theme === 'miku' ? 'bg-slate-100' : 'bg-white/5'}`} />

                    <img
                      src={file.url}
                      alt={file.name}
                      loading="lazy"
                      className={viewMode === 'grid'
                        ? "w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 font-medium relative z-10"
                        : "w-full h-auto select-none relative z-10"}
                      onLoad={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.parentElement?.style.setProperty('min-height', 'auto');
                        const skeleton = target.parentElement?.querySelector('.animate-pulse');
                        if (skeleton) (skeleton as HTMLElement).style.opacity = '0';
                      }}
                    />

                    {/* 网格模式下的操作层 */}
                    {viewMode === 'grid' && (
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-between p-4 z-20">
                        <div className="flex justify-end">
                          <button onClick={() => handleDelete(file.path, 'image')} className="p-2 bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all shadow-xl">
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <a href={file.url} download={file.name} className="w-full py-2 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-widest text-center">下载原图</a>
                      </div>
                    )}

                    {/* 漫画模式下的悬停管理 */}
                    {viewMode === 'manga' && (
                      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                        <button onClick={() => handleDelete(file.path, 'image')} className="p-3 bg-black/60 backdrop-blur-md rounded-full text-red-500 border border-white/10 shadow-2xl">
                          <Trash2 size={24} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 网格模式下的信息盖板(悬浮透明风格) */}
                  {viewMode === 'grid' && (
                    <div className="absolute inset-x-0 bottom-0 p-3 pt-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none">
                      <div className="backdrop-blur-md bg-black/20 border border-white/10 rounded-xl p-2 px-3 flex items-center justify-between pointer-events-auto">
                        <p className="text-[11px] font-black tracking-tight truncate transition-colors text-white/90 group-hover:text-white max-w-[70%]">{file.name}</p>
                        <div className="flex items-center space-x-2">
                          <p className="text-[9px] font-bold uppercase text-white/50">{(file.size / 1024 / 1024).toFixed(1)}M</p>
                          <div className={`w-1 h-1 rounded-full transition-colors ${settings.theme === 'miku' ? 'bg-[#39C5BB] group-hover:bg-[#39C5BB]' : 'bg-purple-500 group-hover:bg-purple-400'}`} />
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {!loading && !error && data.folders.length === 0 && data.files.length === 0 && (
              <div className="col-span-full py-40 text-center opacity-40">
                <p className="text-sm font-black uppercase tracking-[4px]">内容仓库空空如也</p>
              </div>
            )}
          </motion.div>
        )}
      </main>

      {/* 多选批量操作底栏 */}
      <AnimatePresence>
        {selectionMode && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-0 left-0 right-0 z-[80] p-4"
          >
            <div className={`max-w-lg mx-auto rounded-3xl border p-4 shadow-2xl backdrop-blur-xl flex items-center justify-between gap-3 ${settings.theme === 'miku' ? 'bg-white/90 border-[#39C5BB]/30' : 'bg-[#111]/90 border-white/10'
              }`}>
              <span className={`text-sm font-black shrink-0 ${settings.theme === 'miku' ? 'text-slate-700' : 'text-white'
                }`}>
                已选 <span style={{ color: settings.theme === 'miku' ? '#39C5BB' : '#a855f7' }}>{selectedItems.size}</span> 项
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBatchDownload}
                  disabled={selectedItems.size === 0}
                  title="下载选中"
                  className={`p-2.5 rounded-2xl transition-all disabled:opacity-30 ${settings.theme === 'miku' ? 'bg-slate-100 hover:bg-[#39C5BB]/10 text-slate-500 hover:text-[#39C5BB]' : 'bg-white/5 hover:bg-white/10 text-white/50 hover:text-white'
                    }`}
                >
                  <Download size={17} />
                </button>
                <button
                  onClick={() => setPendingAction('copy')}
                  disabled={selectedItems.size === 0}
                  title="复制到"
                  className={`p-2.5 rounded-2xl transition-all disabled:opacity-30 ${settings.theme === 'miku' ? 'bg-slate-100 hover:bg-[#39C5BB]/10 text-slate-500 hover:text-[#39C5BB]' : 'bg-white/5 hover:bg-white/10 text-white/50 hover:text-white'
                    }`}
                >
                  <Copy size={17} />
                </button>
                <button
                  onClick={() => setPendingAction('move')}
                  disabled={selectedItems.size === 0}
                  title="移动到"
                  className={`p-2.5 rounded-2xl transition-all disabled:opacity-30 ${settings.theme === 'miku' ? 'bg-slate-100 hover:bg-[#39C5BB]/10 text-slate-500 hover:text-[#39C5BB]' : 'bg-white/5 hover:bg-white/10 text-white/50 hover:text-white'
                    }`}
                >
                  <Scissors size={17} />
                </button>
                <button
                  onClick={handleBatchDelete}
                  disabled={selectedItems.size === 0}
                  title="删除选中"
                  className="p-2.5 rounded-2xl transition-all disabled:opacity-30 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-500"
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

export default function GalleryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-white/20" /></div>}>
      <GalleryContent />
    </Suspense>
  );
}

// 文件夹卡片组件：v0.5.0 重构支持异步封面加载
function FolderCard({ folder, onClick, onDelete, settings, selectionMode, isSelected, fetchPreviewUrls }: {
  folder: any; onClick: () => void; onDelete: () => void; settings: ISettings;
  selectionMode?: boolean; isSelected?: boolean;
  fetchPreviewUrls: (path: string) => Promise<string[]>;
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);

  // v0.5.0 异步加载预览图逻辑
  useEffect(() => {
    let isMounted = true;
    const fetchPreviews = async () => {
      setFetching(true);
      try {
        const urls = await fetchPreviewUrls(folder.path);
        if (isMounted) {
          setPreviews(urls);
        }
      } catch (err) {
        console.error("Fetch previews failed:", err);
      } finally {
        if (isMounted) setFetching(false);
      }
    };

    fetchPreviews();
    return () => { isMounted = false; };
  }, [folder.path, fetchPreviewUrls]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isHovered && previews.length > 1) {
      timer = setInterval(() => {
        setCurrentIdx((prev) => (prev + 1) % previews.length);
      }, 3000);
    }
    return () => clearInterval(timer);
  }, [isHovered, previews]);

  return (
    <motion.div
      whileHover={{ y: selectionMode ? 0 : -6 }}
      className={`group relative rounded-3xl overflow-hidden transition-all duration-300 border aspect-[3/4] ${isSelected
          ? (settings.theme === 'miku' ? 'border-[#39C5BB] shadow-[0_0_0_3px_rgba(57,197,187,0.3)] bg-white' : 'border-purple-500 shadow-[0_0_0_3px_rgba(168,85,247,0.3)] bg-[#090909]')
          : settings.theme === 'miku'
            ? 'bg-white border-[#39C5BB]/20 hover:border-[#39C5BB] hover:shadow-[0_10px_40px_rgba(57,197,187,0.2)]'
            : 'bg-[#090909] border-white/10 hover:border-purple-500/50 hover:shadow-[0_10px_40px_rgba(147,51,234,0.15)]'
        }`}
    >
      {selectionMode && (
        <div className="absolute top-3 left-3 z-20">
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected
              ? (settings.theme === 'miku' ? 'bg-[#39C5BB] border-[#39C5BB]' : 'bg-purple-500 border-purple-500')
              : 'bg-black/30 border-white/60 backdrop-blur-sm'
            }`}>
            {isSelected && <CheckSquare size={12} className="text-white" />}
          </div>
        </div>
      )}
      <div
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { setIsHovered(false); setCurrentIdx(0); }}
        className={`w-full h-full relative cursor-pointer overflow-hidden ${settings.theme === 'miku' ? 'bg-slate-50' : 'bg-white/5'}`}
      >
        <AnimatePresence mode="wait">
          {fetching && previews.length === 0 ? (
            <div key="loading" className="w-full h-full flex items-center justify-center animate-pulse bg-white/5">
               <Loader2 className={`w-6 h-6 animate-spin ${settings.theme === 'miku' ? 'text-[#39C5BB]' : 'text-white/20'}`} />
            </div>
          ) : (
            <motion.img
              key={previews[currentIdx] || 'empty'}
              src={previews[currentIdx] || '/folder-placeholder.png'}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[3s]"
              onError={(e) => { (e.target as any).src = "https://placehold.co/400x300/111/555?text=Album"; }}
            />
          )}
        </AnimatePresence>

        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex space-x-1 pointer-events-none">
          {previews.map((_: any, i: number) => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${i === currentIdx ? (settings.theme === 'miku' ? 'w-4 bg-[#39C5BB] shadow-[0_0_10px_#39C5BB]' : 'w-4 bg-purple-500 shadow-[0_0_10px_#A855F7]') : 'w-1.5 bg-white/50'}`} />
          ))}
        </div>

        <div className={`absolute inset-x-0 bottom-0 pointer-events-none p-3 pt-10 ${settings.theme === 'miku' ? 'bg-gradient-to-t from-black/60 via-black/20 to-transparent' : 'bg-gradient-to-t from-black/90 via-black/40 to-transparent'}`}>
          <div className={`backdrop-blur-xl border rounded-2xl p-3 flex flex-col justify-end transition-all select-none pointer-events-auto ${settings.theme === 'miku' ? 'bg-white/10 border-white/20' : 'bg-black/40 border-white/10'}`}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[14px] font-black tracking-tight truncate text-white uppercase" title={folder.name}>{folder.name}</p>
              <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1.5 text-white/50 hover:text-red-400 hover:bg-black/40 rounded-lg transition-all opacity-0 group-hover:opacity-100 z-10">
                <Trash2 size={14} />
              </button>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`w-1.5 h-1.5 rounded-full ${fetching ? 'animate-bounce' : 'animate-pulse'} ${settings.theme === 'miku' ? 'bg-[#39C5BB]' : 'bg-purple-500'}`} />
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/60">画册合集</p>
            </div>
          </div>
        </div>
      </div>

      {settings.glow && (
        <div className={`absolute -bottom-10 left-1/2 -translate-x-1/2 w-2/3 h-10 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none ${settings.theme === 'miku' ? 'bg-[#39C5BB]/40' : 'bg-purple-500/30'}`} />
      )}
    </motion.div>
  );
}
