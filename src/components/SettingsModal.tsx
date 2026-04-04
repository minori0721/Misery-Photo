import { motion, AnimatePresence } from 'framer-motion';
import { X, Settings2, Sparkles, Palette, LayoutGrid } from 'lucide-react';
import { ISettings } from '@/lib/useSettings';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: ISettings;
  updateSettings: (updates: Partial<ISettings>) => void;
}

export default function SettingsModal({ isOpen, onClose, settings, updateSettings }: Props) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={`fixed inset-0 z-[100] backdrop-blur-sm ${settings.theme === 'miku' ? 'bg-white/40' : 'bg-black/80'}`}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[90%] max-w-md rounded-3xl shadow-2xl overflow-hidden border ${
              settings.theme === 'miku' 
                ? 'bg-white/95 border-[#e0e5ff] text-slate-800' 
                : 'bg-[#0f0f0f]/90 border-white/10 text-white'
            }`}
          >
            {/* Header */}
            <div className={`flex items-center justify-between p-6 border-b ${settings.theme === 'miku' ? 'border-slate-100' : 'border-white/5'}`}>
              <div className="flex items-center space-x-3">
                 <div className={`p-2 rounded-xl ${settings.theme === 'miku' ? 'bg-[#39C5BB]/20 text-[#39C5BB]' : 'bg-white/10'}`}>
                   <Settings2 size={18} />
                 </div>
                 <h2 className="text-lg font-black tracking-widest uppercase">配置中心</h2>
              </div>
              <button 
                onClick={onClose} 
                className={`p-2 rounded-xl transition-colors ${settings.theme === 'miku' ? 'hover:bg-slate-100 text-slate-400' : 'hover:bg-white/10 text-white/50'}`}
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-8">
              
              {/* Theme Selection */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                   <Palette size={14} className={settings.theme === 'miku' ? 'text-[#39C5BB]' : 'text-purple-400'} />
                   <h3 className="text-xs font-bold uppercase tracking-wider opacity-60">视觉主题</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                   <button 
                    onClick={() => updateSettings({ theme: 'miku' })}
                    className={`relative overflow-hidden rounded-xl p-3 border text-left transition-all ${
                      settings.theme === 'miku' 
                        ? 'border-[#39C5BB] bg-[#39C5BB]/10 shadow-sm' 
                        : 'border-white/10 hover:border-white/20'
                    }`}
                   >
                     <p className={`text-sm font-bold ${settings.theme === 'miku' ? 'text-[#39C5BB]' : 'text-white'}`}>初音苍青 (Miku)</p>
                     <p className="text-[10px] opacity-50 mt-1">乳白色彩与葱绿高亮</p>
                     <div className="absolute right-0 bottom-0 w-16 h-16 bg-[#39C5BB] blur-[30px] opacity-30 pointer-events-none" />
                   </button>
                   <button 
                    onClick={() => updateSettings({ theme: 'abyss' })}
                    className={`relative overflow-hidden rounded-xl p-3 border text-left transition-all ${
                      settings.theme === 'abyss' 
                        ? 'border-purple-500 bg-purple-500/10' 
                        : settings.theme === 'miku' ? 'border-slate-200 hover:border-slate-300' : 'border-white/10 hover:border-white/20'
                    }`}
                   >
                     <p className={`text-sm font-bold flex items-center space-x-1 ${settings.theme === 'abyss' ? 'text-purple-400' : ''}`}><span>深渊紫暗 (Abyss)</span></p>
                     <p className="text-[10px] opacity-50 mt-1">极致黑夜与暗紫幻光</p>
                     <div className="absolute right-0 bottom-0 w-16 h-16 bg-purple-500 blur-[30px] opacity-20 pointer-events-none" />
                   </button>
                </div>
              </div>

              {/* Ambient Glow */}
              <div className="flex items-center justify-between">
                <div>
                   <div className="flex items-center space-x-2">
                     <Sparkles size={14} className={settings.theme === 'miku' ? 'text-[#39C5BB]' : 'text-yellow-400'} />
                     <h3 className="text-xs font-bold uppercase tracking-wider opacity-60">环境光晕特效</h3>
                   </div>
                   <p className="text-[10px] opacity-40 mt-1">开启卡片悬浮的呼吸辉光映射</p>
                </div>
                <button
                  onClick={() => updateSettings({ glow: !settings.glow })}
                  className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-1 ${
                    settings.glow 
                      ? (settings.theme === 'miku' ? 'bg-[#39C5BB]' : 'bg-purple-600') 
                      : (settings.theme === 'miku' ? 'bg-slate-200' : 'bg-white/10')
                  }`}
                >
                  <motion.div 
                    layout
                    className={`w-4 h-4 rounded-full shadow-md ${settings.theme === 'miku' ? 'bg-white' : 'bg-white'}`}
                    style={{ marginLeft: settings.glow ? 'auto' : '0' }}
                  />
                </button>
              </div>

              {/* Mobile Grid Layout */}
              <div className="flex items-center justify-between">
                <div>
                   <div className="flex items-center space-x-2">
                     <LayoutGrid size={14} className={settings.theme === 'miku' ? 'text-slate-500' : 'text-white/50'} />
                     <h3 className="text-xs font-bold uppercase tracking-wider opacity-60">竖屏照片网格</h3>
                   </div>
                   <p className="text-[10px] opacity-40 mt-1">默认的手机端布局列数</p>
                </div>
                <div className={`flex items-center p-1 rounded-xl border ${settings.theme === 'miku' ? 'bg-slate-100 border-slate-200' : 'bg-black/50 border-white/10'}`}>
                  <button
                    onClick={() => updateSettings({ mobileCols: 1 })}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                      settings.mobileCols === 1 
                        ? (settings.theme === 'miku' ? 'bg-white shadow-sm text-[#39C5BB]' : 'bg-white/20 text-white') 
                        : 'opacity-50'
                    }`}
                  >
                    1 列展示
                  </button>
                  <button
                    onClick={() => updateSettings({ mobileCols: 2 })}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                      settings.mobileCols === 2 
                        ? (settings.theme === 'miku' ? 'bg-white shadow-sm text-[#39C5BB]' : 'bg-white/20 text-white') 
                        : 'opacity-50'
                    }`}
                  >
                    2 列展示
                  </button>
                </div>
              </div>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
