'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Upload, 
  File, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Package,
  FileImage,
  ArrowUp
} from 'lucide-react';
import JSZip from 'jszip';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string;
  onRefresh: () => void;
}

export default function UploadModal({ isOpen, onClose, currentPath, onRefresh }: UploadModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const uploadToS3 = async (file: Blob | File, filename: string, path: string) => {
    // 1. 获取预签名 URL
    const presignRes = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, path, contentType: (file as File).type || 'image/jpeg' }),
    });

    const { url } = await presignRes.json();

    // 2. 直接上传到 S3
    await fetch(url, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': (file as File).type || 'image/jpeg' },
    });
  };

  const handleUpload = async () => {
    setUploading(true);
    setProgress(0);
    setError('');

    try {
      let totalToUpload = files.length;
      let completed = 0;

      for (const file of files) {
        // 如果是 ZIP 文件且为“自动解压”模式 (逻辑上我们针对 zip 进行探测)
        if (file.name.toLowerCase().endsWith('.zip')) {
          const zipName = file.name.replace(/\.zip$/i, '');
          const newPath = `${currentPath}${zipName}/`;
          
          setStatus(`正在解析压缩包: ${file.name}...`);
          const zip = await JSZip.loadAsync(file);
          const entries = Object.keys(zip.files).filter(name => !zip.files[name].dir);
          const imageEntries = entries.filter(name => 
            name.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)$/)
          );

          totalToUpload = totalToUpload - 1 + imageEntries.length;
          
          // 并行上传压缩包内文件 (限制并发数为 5)
          const chunks = [];
          for (let i = 0; i < imageEntries.length; i += 5) {
             chunks.push(imageEntries.slice(i, i + 5));
          }

          for (const chunk of chunks) {
            await Promise.all(chunk.map(async (name) => {
              const zipFile = zip.files[name];
              const blob = await zipFile.async('blob');
              setStatus(`正在上传: ${name}`);
              // 注意：这里将文件存入以压缩包命名的子目录
              await uploadToS3(blob, name, newPath);
              completed++;
              setProgress(Math.round((completed / totalToUpload) * 100));
            }));
          }
        } else {
          // 普通单文件上传
          setStatus(`正在上传: ${file.name}`);
          await uploadToS3(file, file.name, currentPath);
          completed++;
          setProgress(Math.round((completed / totalToUpload) * 100));
        }
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-lg bg-[#0d0d0d] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
      >
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
             <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-400">
                <Upload size={20} />
             </div>
             <div>
                <h2 className="text-lg font-bold">上传媒体资产</h2>
                <p className="text-xs text-white/40">上传至: <span className="text-white/60">{currentPath || '根目录'}</span></p>
             </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-full text-white/40 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-8">
          {files.length === 0 ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-white/10 rounded-3xl p-12 flex flex-col items-center justify-center space-y-4 hover:border-purple-500/40 hover:bg-purple-500/5 transition-all cursor-pointer group"
            >
               <input 
                 type="file" 
                 ref={fileInputRef} 
                 onChange={handleFileChange} 
                 multiple 
                 className="hidden" 
                 accept="image/*,.zip"
               />
               <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-white/20 group-hover:text-purple-400 group-hover:scale-110 transition-all duration-300">
                  <ArrowUp size={32} />
               </div>
               <div className="text-center">
                  <p className="font-semibold text-white/80">点击或拖拽文件到这里</p>
                  <p className="text-xs text-white/30 mt-1">支持多图上传或单个 ZIP 压缩包自动解压</p>
               </div>
            </div>
          ) : (
            <div className="space-y-4">
               {!uploading ? (
                 <div className="max-h-48 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-white/10">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                        <div className="flex items-center space-x-3 truncate">
                           {f.name.endsWith('.zip') ? <Package className="text-blue-400 shrink-0" size={18} /> : <FileImage className="text-purple-400 shrink-0" size={18} />}
                           <span className="text-sm truncate text-white/70">{f.name}</span>
                        </div>
                        <span className="text-[10px] text-white/20 shrink-0">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                    ))}
                 </div>
               ) : (
                 <div className="py-8 space-y-6">
                    <div className="relative h-2 w-full bg-white/5 rounded-full overflow-hidden">
                       <motion.div 
                         initial={{ width: 0 }}
                         animate={{ width: `${progress}%` }}
                         className="absolute top-0 left-0 h-full bg-gradient-to-r from-purple-500 to-blue-500"
                       />
                    </div>
                    <div className="flex items-center justify-between">
                       <div className="flex items-center space-x-3 text-sm text-white/60">
                          <Loader2 size={16} className="animate-spin text-purple-400" />
                          <span className="truncate max-w-[200px]">{status}</span>
                       </div>
                       <span className="text-sm font-bold text-white/90">{progress}%</span>
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
                      className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-medium transition-colors"
                    >
                      重新选择
                    </button>
                    <button 
                      onClick={handleUpload}
                      className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 shadow-lg shadow-purple-500/20 rounded-xl text-sm font-bold transition-all active:scale-95"
                    >
                      开始上传
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
