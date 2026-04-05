'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Folder, Loader2, ArrowRight } from 'lucide-react';
import { ISettings } from '@/lib/useSettings';

interface TargetPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (destPath: string) => void;
  title: string; // "移动到" 或 "复制到"
  settings: ISettings;
  currentPath: string; // 排除当前路径自身
}

export default function TargetPickerModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  settings,
  currentPath,
}: TargetPickerModalProps) {
  const [folders, setFolders] = useState<{ name: string; path: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string>('');

  const isMiku = settings.theme === 'miku';
  const accent = isMiku ? '#39C5BB' : '#a855f7';

  useEffect(() => {
    if (!isOpen) return;
    setSelected('');
    setLoading(true);
    fetch('/api/gallery?path=&json=1&foldersOnly=1')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          // 排除当前所在目录，避免移动到自己
          const all = (data.data.folders as { name: string; path: string }[])
            .filter(f => f.path !== currentPath);
          // 也允许选择"根目录"
          setFolders([{ name: '📁 根目录', path: '' }, ...all]);
        }
      })
      .finally(() => setLoading(false));
  }, [isOpen, currentPath]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        className={`relative w-full max-w-sm rounded-3xl border shadow-2xl overflow-hidden ${
          isMiku ? 'bg-white border-[#39C5BB]/20' : 'bg-[#111] border-white/10'
        }`}
      >
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          isMiku ? 'border-[#39C5BB]/10 bg-slate-50' : 'border-white/5'
        }`}>
          <div className="flex items-center space-x-2">
            <ArrowRight size={16} style={{ color: accent }} />
            <h2 className={`font-black text-sm uppercase tracking-widest ${isMiku ? 'text-slate-700' : 'text-white'}`}>
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-full transition-colors ${isMiku ? 'hover:bg-slate-200 text-slate-400' : 'hover:bg-white/10 text-white/40'}`}
          >
            <X size={16} />
          </button>
        </div>

        {/* Folder List */}
        <div className="p-4 max-h-72 overflow-y-auto space-y-1.5">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 size={20} className="animate-spin" style={{ color: accent }} />
            </div>
          ) : folders.length === 0 ? (
            <p className={`text-center text-xs py-10 ${isMiku ? 'text-slate-400' : 'text-white/30'}`}>
              没有可用的目标画集
            </p>
          ) : (
            folders.map((f) => {
              const isActive = selected === f.path;
              return (
                <button
                  key={f.path || '__root__'}
                  onClick={() => setSelected(f.path)}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all text-left ${
                    isActive
                      ? isMiku
                        ? 'bg-[#39C5BB]/10 border border-[#39C5BB]/40 text-[#39C5BB]'
                        : 'bg-purple-500/10 border border-purple-500/40 text-purple-400'
                      : isMiku
                      ? 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-transparent'
                      : 'bg-white/5 hover:bg-white/10 text-white/70 border border-transparent'
                  }`}
                >
                  <Folder size={15} />
                  <span className="text-sm font-bold truncate">{f.name || f.path}</span>
                </button>
              );
            })
          )}
        </div>

        {/* Confirm */}
        <div className={`px-4 py-4 border-t ${isMiku ? 'border-[#39C5BB]/10' : 'border-white/5'}`}>
          <button
            disabled={selected === '' && selected !== ''}  // allow root ('')
            onClick={() => {
              onConfirm(selected);
              onClose();
            }}
            className={`w-full py-3 rounded-2xl font-black text-sm uppercase tracking-widest text-white transition-all active:scale-95 ${
              isMiku
                ? 'bg-[#39C5BB] hover:bg-[#32b5ab] shadow-[0_4px_15px_rgba(57,197,187,0.3)]'
                : 'bg-purple-600 hover:bg-purple-500 shadow-[0_4px_15px_rgba(168,85,247,0.3)]'
            }`}
          >
            确认{title}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
