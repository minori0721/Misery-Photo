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
import { useSettings } from '@/lib/useSettings';

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
  const { settings } = useSettings();

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
      let uploadTasks: { blob: Blob | File, name: string, path: string }[] = [];

      for (const file of files) {
        if (file.name.toLowerCase().endsWith('.zip')) {
          const zipName = file.name.replace(/\.zip$/i, '');
          
          setStatus(`正在解析压缩包: ${file.name}...`);
          const zip = await JSZip.loadAsync(file, {
            decodeFileName: function(bytes: Uint8Array) {
              try {
                return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
              } catch (e) {
                // 如果遭遇 Windows 等自带的非 UTF-8 压缩名，直接降频采用 GBK 中文标准解码避免乱码 
                return new TextDecoder('gbk').decode(bytes);
              }
            }
          } as any);
          
          const entries = Object.keys(zip.files).filter(name => !zip.files[name].dir);
          const imageEntries = entries.filter(name => 
            name.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)$/)
          );

          for (const name of imageEntries) {
            const blob = await zip.files[name].async('blob');
            
            // 智能打平：只取最后子目录（或者用 zip 本身名字挂载底单）而不嵌套任何中间路径
            const segments = name.split('/');
            const fileName = segments.pop() || 'unknown.jpg';
            const parentFolder = segments.length > 0 ? segments[segments.length - 1] : zipName;
            
            const targetPath = `${currentPath}${parentFolder}/`;
            uploadTasks.push({ blob, name: fileName, path: targetPath });
          }
        } else {
          uploadTasks.push({ blob: file, name: file.name, path: currentPath });
        }
      }

      const totalToUpload = uploadTasks.length;
      let completed = 0;

      // 根据 5 队列并发控制上传并行度
      const chunks = [];
      for (let i = 0; i < uploadTasks.length; i += 5) {
         chunks.push(uploadTasks.slice(i, i + 5));
      }

      for (const chunk of chunks) {
        await Promise.all(chunk.map(async (task) => {
          await uploadToS3(task.blob, task.name, task.path);
          completed++;
          
          // 更新总进度和当前处理的文件名提示
          setStatus(`正在高速并行上传: ${task.name}`);
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
        className={`relative w-full max-w-lg border rounded-3xl overflow-hidden shadow-2xl ${
          settings.theme === 'miku' ? 'bg-white border-[#39C5BB]/20' : 'bg-[#0d0d0d] border-white/10'
        }`}
      >
        <div className={`p-6 border-b flex items-center justify-between ${settings.theme === 'miku' ? 'border-[#39C5BB]/10 bg-slate-50' : 'border-white/5'}`}>
          <div className="flex items-center space-x-3">
             <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${settings.theme === 'miku' ? 'bg-[#39C5BB]/10 text-[#39C5BB]' : 'bg-purple-500/10 text-purple-400'}`}>
                <Upload size={20} />
             </div>
             <div>
                <h2 className={`text-lg font-black uppercase tracking-widest ${settings.theme === 'miku' ? 'text-slate-800' : 'text-white'}`}>上传媒体资产</h2>
                <p className={`text-xs ${settings.theme === 'miku' ? 'text-slate-400' : 'text-white/40'}`}>上传至: <span className={settings.theme === 'miku' ? 'text-slate-600 font-bold' : 'text-white/60'}>{currentPath || '根目录'}</span></p>
             </div>
          </div>
          <button 
            onClick={onClose}
            className={`p-2 rounded-full transition-colors ${settings.theme === 'miku' ? 'hover:bg-slate-200 text-slate-400 hover:text-slate-600' : 'hover:bg-white/5 text-white/40 hover:text-white'}`}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-8">
          {files.length === 0 ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center space-y-4 transition-all cursor-pointer group ${
                settings.theme === 'miku' 
                  ? 'border-slate-200 hover:border-[#39C5BB]/60 hover:bg-[#39C5BB]/5 bg-white' 
                  : 'border-white/10 hover:border-purple-500/40 hover:bg-purple-500/5'
              }`}
            >
               <input 
                 type="file" 
                 ref={fileInputRef} 
                 onChange={handleFileChange} 
                 multiple 
                 className="hidden" 
                 accept="image/*,.zip"
               />
               <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 ${
                 settings.theme === 'miku'
                   ? 'bg-slate-100 text-slate-300 group-hover:text-[#39C5BB]'
                   : 'bg-white/5 text-white/20 group-hover:text-purple-400'
               }`}>
                  <ArrowUp size={32} />
               </div>
               <div className="text-center">
                  <p className={`font-black tracking-widest ${settings.theme === 'miku' ? 'text-slate-600' : 'text-white/80'}`}>点击或拖拽文件到这里</p>
                  <p className={`text-xs mt-1 ${settings.theme === 'miku' ? 'text-slate-400' : 'text-white/30'}`}>支持极速多图并行上传，或导入原主 ZIP 自动归类压缩包</p>
               </div>
            </div>
          ) : (
            <div className="space-y-4">
               {!uploading ? (
                 <div className="max-h-48 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-white/10">
                    {files.map((f, i) => (
                      <div key={i} className={`flex items-center justify-between p-3 rounded-xl border ${settings.theme === 'miku' ? 'bg-slate-50 border-slate-100' : 'bg-white/5 border-white/5'}`}>
                        <div className="flex items-center space-x-3 truncate">
                           {f.name.endsWith('.zip') 
                             ? <Package className={settings.theme === 'miku' ? 'text-blue-500 shrink-0' : 'text-blue-400 shrink-0'} size={18} /> 
                             : <FileImage className={settings.theme === 'miku' ? 'text-[#39C5BB] shrink-0' : 'text-purple-400 shrink-0'} size={18} />}
                           <span className={`text-sm tracking-tight truncate ${settings.theme === 'miku' ? 'text-slate-700 font-bold' : 'text-white/70'}`}>{f.name}</span>
                        </div>
                        <span className={`text-[10px] shrink-0 ${settings.theme === 'miku' ? 'text-slate-400 font-bold' : 'text-white/20'}`}>{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                    ))}
                 </div>
               ) : (
                 <div className="py-8 space-y-6">
                    <div className={`relative h-2 w-full rounded-full overflow-hidden ${settings.theme === 'miku' ? 'bg-slate-100' : 'bg-white/5'}`}>
                       <motion.div 
                         initial={{ width: 0 }}
                         animate={{ width: `${progress}%` }}
                         className={`absolute top-0 left-0 h-full ${settings.theme === 'miku' ? 'bg-[#39C5BB]' : 'bg-gradient-to-r from-purple-500 to-blue-500'}`}
                       />
                    </div>
                    <div className="flex items-center justify-between">
                       <div className={`flex items-center space-x-3 text-sm ${settings.theme === 'miku' ? 'text-slate-500 font-bold' : 'text-white/60'}`}>
                          <Loader2 size={16} className={`animate-spin ${settings.theme === 'miku' ? 'text-[#39C5BB]' : 'text-purple-400'}`} />
                          <span className="truncate max-w-[200px]">{status}</span>
                       </div>
                       <span className={`text-sm font-black tracking-widest ${settings.theme === 'miku' ? 'text-[#39C5BB]' : 'text-white/90'}`}>{progress}%</span>
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
                        settings.theme === 'miku' ? 'bg-slate-100 hover:bg-slate-200 text-slate-500' : 'bg-white/5 hover:bg-white/10 text-white'
                      }`}
                    >
                      重新选择
                    </button>
                    <button 
                      onClick={handleUpload}
                      className={`flex-1 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg ${
                        settings.theme === 'miku' 
                          ? 'bg-[#39C5BB] hover:bg-[#32b5ab] text-white shadow-[#39C5BB]/30' 
                          : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-500/20'
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
