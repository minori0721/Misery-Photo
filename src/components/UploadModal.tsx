'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowUp,
  FileImage,
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
  totalBytes: number;
  loadedBytes: number;
  progress: number;
  speedBps: number;
  status: 'queued' | 'running' | 'success' | 'error';
};

const KB = 1024;
const MB = 1024 * 1024;

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
    if (e.target.files) setFiles(Array.from(e.target.files));
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

  const uploadToS3 = async (task: UploadTask) => {
    const contentType = (task.blob as File).type || 'application/octet-stream';
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

  async function buildUploadTasksFromZip(zip: JSZip, zipName: string): Promise<Array<{ blob: Blob; name: string; path: string }>> {
    const isMedia = (n: string) => /\.(jpg|jpeg|png|webp|gif|mp4|webm|mov|m4v)$/i.test(n);

    const folderChildren = new Map<string, Set<string>>();
    const folderFiles = new Map<string, string[]>();
    folderChildren.set('', new Set());
    folderFiles.set('', []);

    for (const entryName of Object.keys(zip.files)) {
      const entry = zip.files[entryName];
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
        } else if (isMedia(entryName)) {
          folderFiles.get(parent)?.push(entryName);
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
    setStatus(`发现 ${albums.length} 个画集，共 ${totalAssets} 个文件，准备上传...`);

    const tasks: Array<{ blob: Blob; name: string; path: string }> = [];
    for (const { album, filePaths } of albums) {
      for (const mediaPath of filePaths) {
        const blob = await zip.files[mediaPath].async('blob');
        tasks.push({
          blob,
          name: mediaPath.split('/').pop() || mediaPath,
          path: `${currentPath}${album}/`,
        });
      }
    }
    return tasks;
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

    loadedBytesRef.current.clear();
    speedBytesRef.current.clear();

    try {
      let preparedTasks: Array<{ blob: Blob | File; name: string; path: string }> = [];

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
          const zipTasks = await buildUploadTasksFromZip(zip, zipName);
          preparedTasks = [...preparedTasks, ...zipTasks];
        } else {
          preparedTasks.push({ blob: file, name: file.name, path: currentPath });
        }
      }

      const tasks: UploadTask[] = preparedTasks.map((task, idx) => ({
        id: `${Date.now()}-${idx}-${task.name}`,
        name: task.name,
        path: task.path,
        blob: task.blob,
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
        throw new Error('没有可上传的文件');
      }

      let completed = 0;
      const parallel = 4;

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
      setError(getErrorMessage(err, '上传过程中发生错误'));
      setUploading(false);
      setAggregateSpeed(0);
      setStatus('上传失败');
      setUploadTasks((prev) => prev.map((task) => (task.status === 'running' ? { ...task, status: 'error' } : task)));
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
                accept="image/*,video/*,.zip"
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
