'use client';

import { useState, useEffect, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Folder, 
  Image as ImageIcon, 
  ChevronRight, 
  Upload, 
  Download, 
  Search,
  LogOut,
  Plus,
  MoreVertical,
  ArrowLeft,
  Loader2,
  HardDrive,
  Trash2,
  LayoutGrid,
  Rows,
  AlertTriangle,
  ArrowUp,
  Settings2
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import UploadModal from '@/components/UploadModal';
import SettingsModal from '@/components/SettingsModal';
import JSZip from 'jszip';
import { BUCKET_NAME } from '@/lib/s3';
import { useSettings, ISettings } from '@/lib/useSettings';

// 视图模式：网格 或 漫画模式（纵向平铺）
type ViewMode = 'grid' | 'manga';

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
  
  const [data, setData] = useState<any>({ folders: [], files: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
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

  // 获取文件列表
  const fetchGallery = async (path: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/gallery?path=${encodeURIComponent(path)}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.message);
      }
    } catch (err) {
      setError('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGallery(currentPath);
    setViewMode(currentPath ? 'manga' : 'grid');
  }, [currentPath]);

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

  // 打包下载当前图集 (Client-side)
  const handleDownloadZip = async () => {
    if (data.files.length === 0) return;
    setDownloading(true);
    setDownloadProgress(0);
    
    try {
      const zip = new JSZip();
      const folderName = currentPath.split('/').filter(Boolean).pop() || 'gallery-export';
      
      let completed = 0;
      const total = data.files.length;

      const fetchInChunks = async (files: any[]) => {
        for (let i = 0; i < files.length; i += 5) {
          const chunk = files.slice(i, i + 5);
          await Promise.all(chunk.map(async (file) => {
            // 通过后端代理绕过 CORS 限制
            const response = await fetch(`/api/proxy?url=${encodeURIComponent(file.url)}`);
            const blob = await response.blob();
            zip.file(file.name, blob);
            completed++;
            setDownloadProgress(Math.round((completed / total) * 100));
          }));
        }
      };

      await fetchInChunks(data.files);
      setDownloadProgress(100);
      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `${folderName}.zip`;
      link.click();
    } catch (err) {
      console.error('Download error:', err);
      alert('打包下载失败');
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
    }
  };

  const handleLogout = () => {
     document.cookie = "nebula_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
     router.push('/login');
  };

  const handleDelete = async (path: string, type: 'image' | 'folder') => {
    const confirmMsg = type === 'folder' ? '⚠ 警告：这将导致该画集及其中所有数据永久删除！确认吗？' : '确认删除这张照片吗？';
    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch('/api/gallery/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, type }),
      });
      const json = await res.json();
      if (json.success) {
        fetchGallery(currentPath);
      } else {
        alert(json.message);
      }
    } catch (err) {
      alert('操作失败');
    }
  };

  const handleCreateFolder = () => {
    const name = prompt('输入新图集名称');
    if (name) {
      alert('图集将会在你上传第一张图后自动创建');
    }
  };

  // 避免服务端水合不匹配
  if (!mounted) return null;

  return (
    <div className={`min-h-screen selection:bg-purple-500/30 transition-colors duration-1000 ${
      settings.theme === 'miku' 
        ? (viewMode === 'manga' ? 'bg-[#f0f4f8] text-slate-800 bg-fixed' : 'bg-[#fafcff] text-slate-800')
        : (viewMode === 'manga' ? 'bg-gradient-to-br from-[#1b1429] via-[#050505] to-[#0c1838] bg-fixed text-white' : 'bg-[#050505] text-white')
    }`}>
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        settings={settings}
        updateSettings={updateSettings}
      />

      <UploadModal 
        isOpen={isUploadOpen} 
        onClose={() => setIsUploadOpen(false)} 
        currentPath={currentPath}
        onRefresh={() => fetchGallery(currentPath)}
      />

      {/* 下载进度条 */}
      <AnimatePresence>
        {downloading && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] w-full max-w-sm"
          >
              <div className="mx-4 bg-[#111] border border-white/10 backdrop-blur-xl p-4 rounded-2xl shadow-2xl flex items-center space-x-4">
                 <Loader2 className={`w-5 h-5 animate-spin ${settings.theme === 'miku' ? 'text-[#39C5BB]' : 'text-purple-500'}`} />
                 <div className="flex-1">
                    <p className="text-[10px] uppercase tracking-widest font-black text-white/40 mb-1">正在打包图集...</p>
                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                       <motion.div initial={{ width: 0 }} animate={{ width: `${downloadProgress}%` }} className={`h-full ${settings.theme === 'miku' ? 'bg-[#39C5BB]' : 'bg-purple-500'}`} />
                    </div>
                </div>
                <span className="text-xs font-bold w-8 text-right font-mono">{downloadProgress}%</span>
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

          <div className={`flex items-center space-x-3 p-1 rounded-2xl border ${settings.theme === 'miku' ? 'bg-white border-[#39C5BB]/20 shadow-sm' : 'bg-white/5 border-white/5'}`}>
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
             <button onClick={handleDownloadZip} title="下载所有内容" className={`p-2 transition-colors ${settings.theme === 'miku' ? 'text-slate-400 hover:text-[#39C5BB]' : 'text-white/30 hover:text-blue-400'}`}><Download size={18} /></button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-40">
            <Loader2 className={`w-10 h-10 animate-spin mb-4 ${settings.theme === 'miku' ? 'text-[#39C5BB]' : 'text-purple-600'}`} />
            <p className={`text-xs font-black uppercase tracking-[4px] ${settings.theme === 'miku' ? 'text-slate-400' : 'text-white/20'}`}>正在同步云端数据...</p>
          </div>
        ) : (
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className={viewMode === 'grid' ? `grid ${settings.mobileCols === 2 ? 'grid-cols-2' : 'grid-cols-1'} md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-6` : `max-w-4xl mx-auto space-y-0 shadow-2xl rounded-2xl overflow-hidden backdrop-blur-3xl border ${settings.theme === 'miku' ? 'bg-white/40 border-[#39C5BB]/20' : 'bg-black/40 border-white/5'}`}
          >
            <AnimatePresence mode="popLayout">
              {/* 文件夹显示区域 */}
              {viewMode === 'grid' && data.folders.map((folder: any) => (
                <FolderCard 
                  key={folder.path} 
                  folder={folder} 
                  onClick={() => handleFolderClick(folder.path)} 
                  onDelete={() => handleDelete(folder.path, 'folder')}
                  settings={settings}
                />
              ))}

              {/* 文件显示区域 */}
              {data.files.map((file: any) => (
                <motion.div
                  key={file.path} 
                  variants={itemVariants}
                  layout 
                  className={viewMode === 'grid' ? 
                    `group relative rounded-3xl overflow-hidden transition-all duration-500 border aspect-[3/4] ${
                      settings.theme === 'miku'
                        ? 'bg-white border-[#39C5BB]/20 hover:border-[#39C5BB] hover:shadow-[0_10px_30px_rgba(57,197,187,0.15)]'
                        : 'bg-[#090909] border-white/10 hover:border-purple-500/50 hover:shadow-[0_0_30px_rgba(147,51,234,0.15)]'
                    }` :
                    "w-full bg-transparent flex flex-col items-center relative group"
                  }
                >
                  <div className={viewMode === 'grid' ? "w-full h-full relative overflow-hidden" : "w-full"}>
                    <img src={file.url} alt={file.name} loading="lazy" className={viewMode === 'grid' ? "w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 font-medium" : "w-full h-auto select-none"} />
                    
                    {/* 网格模式下的操作层 */}
                    {viewMode === 'grid' && (
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-between p-4">
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
                       <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
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

            {!loading && data.folders.length === 0 && data.files.length === 0 && (
              <div className="col-span-full py-40 text-center opacity-40">
                 <p className="text-sm font-black uppercase tracking-[4px]">内容仓库空空如也</p>
              </div>
            )}
          </motion.div>
        )}
      </main>

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

// 文件夹卡片组件：支持悬停幻灯片
function FolderCard({ folder, onClick, onDelete, settings }: { folder: any; onClick: () => void; onDelete: () => void; settings: ISettings }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isHovered && folder.previews?.length > 1) {
      timer = setInterval(() => {
        setCurrentIdx((prev) => (prev + 1) % folder.previews.length);
      }, 3000); // 用户要求 3 秒一次
    }
    return () => clearInterval(timer);
  }, [isHovered, folder.previews]);

  return (
    <motion.div
      whileHover={{ y: -6 }}
      className={`group relative rounded-3xl overflow-hidden transition-all duration-300 border aspect-[3/4] ${
        settings.theme === 'miku' 
          ? 'bg-white border-[#39C5BB]/20 hover:border-[#39C5BB] hover:shadow-[0_10px_40px_rgba(57,197,187,0.2)]'
          : 'bg-[#090909] border-white/10 hover:border-purple-500/50 hover:shadow-[0_10px_40px_rgba(147,51,234,0.15)]'
      }`}
    >
      <div 
        onClick={onClick} 
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { setIsHovered(false); setCurrentIdx(0); }}
        className={`w-full h-full relative cursor-pointer overflow-hidden ${settings.theme === 'miku' ? 'bg-slate-50' : 'bg-white/5'}`}
      >
        <AnimatePresence mode="wait">
          <motion.img
            key={folder.previews?.[currentIdx] || 'empty'}
            src={folder.previews?.[currentIdx] || '/folder-placeholder.png'}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[3s]"
            onError={(e) => { (e.target as any).src = "https://placehold.co/400x300/111/555?text=Empty+Album"; }}
          />
        </AnimatePresence>
        
        {/* 指示器 */}
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex space-x-1 pointer-events-none">
          {folder.previews?.map((_: any, i: number) => (
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
                 <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${settings.theme === 'miku' ? 'bg-[#39C5BB]' : 'bg-purple-500'}`} />
                 <p className="text-[9px] font-bold uppercase tracking-widest text-white/60">画册合集</p>
              </div>
           </div>
        </div>
      </div>
      
      {/* 底部光晕 (由设置项控制开关) */}
      {settings.glow && (
        <div className={`absolute -bottom-10 left-1/2 -translate-x-1/2 w-2/3 h-10 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none ${settings.theme === 'miku' ? 'bg-[#39C5BB]/40' : 'bg-purple-500/30'}`} />
      )}
    </motion.div>
  );
}

