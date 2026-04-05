'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Upload, 
  AlertCircle, 
  Loader2,
  Package,
  FileImage,
  ArrowUp
} from 'lucide-react';
import JSZip from 'jszip';
import { useSettings } from '@/lib/useSettings';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string;
  onRefresh: () => void;
}

export default function UploadModal({ isOpen, onClose, currentPath, onRefresh }: UploadModalProps) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { settings } = useSettings();

  const fetchApiJson = async <T = any>(input: RequestInfo | URL, init?: RequestInit): Promise<T> => {
    const res = await fetch(input, init);
    const contentType = res.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await res.json() : null;
    if (res.status === 401) {
      router.push('/login');
      throw new Error(payload?.message || '登录已过期，请重新登录');
    }
    if (!res.ok) {
      throw new Error(payload?.message || `请求失败（${res.status}）`);
    }
    return payload as T;
  };

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(Array.from(e.target.files));
  };

  const uploadToS3 = async (file: Blob | File, filename: string, path: string) => {
    const presignJson = await fetchApiJson<{ url: string }>('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, path, contentType: (file as File).type || 'image/jpeg' }),
    });
    const { url } = presignJson;
    await fetch(url, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': (file as File).type || 'image/jpeg' },
    });
  };

  /** Recursively find leaf album nodes in a ZIP directory tree */
  async function buildUploadTasksFromZip(
    zip: JSZip,
    zipName: string
  ): Promise<{ blob: Blob; name: string; path: string }[]> {
    const isImg = (n: string) => /\.(jpg|jpeg|png|webp|gif)$/i.test(n);

    // Build: folderPath -> Set<childFolderPaths> and folderPath -> string[] image paths
    const folderChildren = new Map<string, Set<string>>();
    const folderImages = new Map<string, string[]>();
    folderChildren.set('', new Set());
    folderImages.set('', []);

    for (const entryName of Object.keys(zip.files)) {
      const entry = zip.files[entryName];
      const segs = entryName.split('/').filter(Boolean);
      for (let d = 0; d < segs.length; d++) {
        const parent = d === 0 ? '' : segs.slice(0, d).join('/') + '/';
        const isDir = entry.dir || d < segs.length - 1;
        const self = segs.slice(0, d + 1).join('/') + (isDir ? '/' : '');
        if (!folderChildren.has(parent)) { folderChildren.set(parent, new Set()); folderImages.set(parent, []); }
        if (isDir) {
          folderChildren.get(parent)!.add(self);
          if (!folderChildren.has(self)) { folderChildren.set(self, new Set()); folderImages.set(self, []); }
        } else if (isImg(entryName)) {
          folderImages.get(parent)!.push(entryName);
        }
      }
    }

    // Collect leaf nodes (deepest folders containing images)
    type Leaf = { album: string; imagePaths: string[] };
    function collectLeaves(fp: string): Leaf[] {
      const ch = folderChildren.get(fp) || new Set<string>();
      const imgs = folderImages.get(fp) || [];
      const albumName = fp ? fp.replace(/\/$/, '').split('/').pop()! : zipName;
      // Leaf: no sub-folders but has images
      if (ch.size === 0 && imgs.length > 0) return [{ album: albumName, imagePaths: imgs }];
      const out: Leaf[] = [];
      for (const c of Array.from(ch)) out.push(...collectLeaves(c));
      // Mixed: this folder has both sub-folders and direct images
      if (imgs.length > 0) out.push({ album: albumName, imagePaths: imgs });
      return out;
    }

    const albums = collectLeaves('');
    const totalImgs = albums.reduce((s, a) => s + a.imagePaths.length, 0);
    setStatus(`发现 ${albums.length} 个画集，共 ${totalImgs} 张图片，准备上传...`);

    const tasks: { blob: Blob; name: string; path: string }[] = [];
    for (const { album, imagePaths } of albums) {
      for (const imgPath of imagePaths) {
        const blob = await zip.files[imgPath].async('blob');
        tasks.push({ blob, name: imgPath.split('/').pop() || imgPath, path: `${currentPath}${album}/` });
      }
    }
    return tasks;
  }

  const handleUpload = async () => {
    setUploading(true);
    setProgress(0);
    setError('');

    try {
      let uploadTasks: { blob: Blob | File; name: string; path: string }[] = [];

      for (const file of files) {
        if (file.name.toLowerCase().endsWith('.zip')) {
          setStatus(`正在解析压缩包结构: ${file.name}...`);
          const zip = await JSZip.loadAsync(file, {
            decodeFileName: (bytes: Uint8Array) => {
              try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
              catch { return new TextDecoder('gbk').decode(bytes); }
            }
          } as any);
          const zipName = file.name.replace(/\.zip$/i, '');
          const zipTasks = await buildUploadTasksFromZip(zip, zipName);
          uploadTasks.push(...zipTasks);
        } else {
          uploadTasks.push({ blob: file, name: file.name, path: currentPath });
        }
      }

      const totalToUpload = uploadTasks.length;
      let completed = 0;

      for (let i = 0; i < uploadTasks.length; i += 5) {
        const chunk = uploadTasks.slice(i, i + 5);
        await Promise.all(chunk.map(async (task) => {
          await uploadToS3(task.blob, task.name, task.path);
          completed++;
          setStatus(`并行上传中: ${task.name}`);
          setProgress(Math.round((completed / totalToUpload) * 100));
        }));
      }

      setStatus('全部上传完成！');
      setTimeout(() => {
        onRefresh();
        onClose();
        setFiles([]);
        setUploading(false);
        setProgress(0);
        setStatus('');
      }, 1500);

    } catch (err: any) {
      console.error(err);
      setError(err.message || '上传过程中发生错误');
      setUploading(false);
    }
  };

  const isMiku = settings.theme === 'miku';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className={`relative w-full max-w-lg border rounded-3xl overflow-hidden shadow-2xl ${
          isMiku ? 'bg-white border-[#39C5BB]/20' : 'bg-[#0d0d0d] border-white/10'
        }`}
      >
        <div className={`p-6 border-b flex items-center justify-between ${isMiku ? 'border-[#39C5BB]/10 bg-slate-50' : 'border-white/5'}`}>
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isMiku ? 'bg-[#39C5BB]/10 text-[#39C5BB]' : 'bg-purple-500/10 text-purple-400'}`}>
              <Upload size={20} />
            </div>
            <div>
              <h2 className={`text-lg font-black uppercase tracking-widest ${isMiku ? 'text-slate-800' : 'text-white'}`}>上传媒体资产</h2>
              <p className={`text-xs ${isMiku ? 'text-slate-400' : 'text-white/40'}`}>上传至: <span className={isMiku ? 'text-slate-600 font-bold' : 'text-white/60'}>{currentPath || '根目录'}</span></p>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-full transition-colors ${isMiku ? 'hover:bg-slate-200 text-slate-400 hover:text-slate-600' : 'hover:bg-white/5 text-white/40 hover:text-white'}`}>
            <X size={20} />
          </button>
        </div>

        <div className="p-8">
          {files.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center space-y-4 transition-all cursor-pointer group ${
                isMiku ? 'border-slate-200 hover:border-[#39C5BB]/60 hover:bg-[#39C5BB]/5 bg-white' : 'border-white/10 hover:border-purple-500/40 hover:bg-purple-500/5'
              }`}
            >
              <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple className="hidden" accept="image/*,.zip" />
              <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 ${
                isMiku ? 'bg-slate-100 text-slate-300 group-hover:text-[#39C5BB]' : 'bg-white/5 text-white/20 group-hover:text-purple-400'
              }`}>
                <ArrowUp size={32} />
              </div>
              <div className="text-center">
                <p className={`font-black tracking-widest ${isMiku ? 'text-slate-600' : 'text-white/80'}`}>点击或拖拽文件到这里</p>
                <p className={`text-xs mt-1 ${isMiku ? 'text-slate-400' : 'text-white/30'}`}>支持多图并行上传，或 ZIP 智能结构分析并自动归类画集</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {!uploading ? (
                <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                  {files.map((f, i) => (
                    <div key={i} className={`flex items-center justify-between p-3 rounded-xl border ${isMiku ? 'bg-slate-50 border-slate-100' : 'bg-white/5 border-white/5'}`}>
                      <div className="flex items-center space-x-3 truncate">
                        {f.name.endsWith('.zip')
                          ? <Package className={isMiku ? 'text-blue-500 shrink-0' : 'text-blue-400 shrink-0'} size={18} />
                          : <FileImage className={isMiku ? 'text-[#39C5BB] shrink-0' : 'text-purple-400 shrink-0'} size={18} />}
                        <span className={`text-sm tracking-tight truncate ${isMiku ? 'text-slate-700 font-bold' : 'text-white/70'}`}>{f.name}</span>
                      </div>
                      <span className={`text-[10px] shrink-0 ${isMiku ? 'text-slate-400 font-bold' : 'text-white/20'}`}>{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 space-y-6">
                  <div className={`relative h-2 w-full rounded-full overflow-hidden ${isMiku ? 'bg-slate-100' : 'bg-white/5'}`}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      className={`absolute top-0 left-0 h-full ${isMiku ? 'bg-[#39C5BB]' : 'bg-gradient-to-r from-purple-500 to-blue-500'}`}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className={`flex items-center space-x-3 text-sm ${isMiku ? 'text-slate-500 font-bold' : 'text-white/60'}`}>
                      <Loader2 size={16} className={`animate-spin ${isMiku ? 'text-[#39C5BB]' : 'text-purple-400'}`} />
                      <span className="truncate max-w-[200px]">{status}</span>
                    </div>
                    <span className={`text-sm font-black tracking-widest ${isMiku ? 'text-[#39C5BB]' : 'text-white/90'}`}>{progress}%</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center space-x-3 text-red-400 text-xs">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {!uploading && (
                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={() => setFiles([])}
                    className={`flex-1 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-colors ${
                      isMiku ? 'bg-slate-100 hover:bg-slate-200 text-slate-500' : 'bg-white/5 hover:bg-white/10 text-white'
                    }`}
                  >
                    重新选择
                  </button>
                  <button
                    onClick={handleUpload}
                    className={`flex-1 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg ${
                      isMiku ? 'bg-[#39C5BB] hover:bg-[#32b5ab] text-white shadow-[#39C5BB]/30' : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-500/20'
                    }`}
                  >
                    并发传输
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
