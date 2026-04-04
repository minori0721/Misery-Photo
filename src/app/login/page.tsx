'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Lock, User, Loader2, Sparkles, HardDrive } from 'lucide-react';
import { useSettings } from '@/lib/useSettings';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { settings, mounted } = useSettings();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (data.success) {
        router.refresh();
        router.push('/');
      } else {
        setError(data.message || '登录失败');
      }
    } catch (err) {
      setError('网络繁忙，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className={`min-h-screen text-slate-800 flex items-center justify-center p-4 transition-colors duration-1000 ${
      settings.theme === 'miku' 
        ? 'bg-[#fafcff] selection:bg-[#39C5BB]/30' 
        : 'bg-[#050505] text-white selection:bg-purple-500/30'
    }`}>
      {/* 背景光晕 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute top-[-10%] left-[-10%] w-[40%] h-[40%] blur-[120px] rounded-full animate-pulse ${
          settings.theme === 'miku' ? 'bg-[#39C5BB]/20' : 'bg-purple-600/10'
        }`} />
        <div className={`absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] blur-[120px] rounded-full animate-pulse ${
          settings.theme === 'miku' ? 'bg-[#7be9e1]/20' : 'bg-blue-600/10'
        }`} style={{ animationDelay: '1s' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <div className={`relative glass p-8 rounded-3xl border backdrop-blur-xl shadow-2xl ${
          settings.theme === 'miku' 
            ? 'bg-white/40 border-[#39C5BB]/20 shadow-[0_20px_50px_rgba(57,197,187,0.1)]' 
            : 'bg-white/5 border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]'
        }`}>
          <div className="mb-8 text-center">
            <motion.div
              initial={{ scale: 0.8, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: 'spring' }}
              className={`w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg ${
                settings.theme === 'miku'
                  ? 'bg-gradient-to-tr from-[#39C5BB] to-[#7be9e1] shadow-[0_0_20px_rgba(57,197,187,0.4)]'
                  : 'bg-gradient-to-tr from-purple-500 to-blue-500 shadow-[0_0_20px_rgba(147,51,234,0.3)]'
              }`}
            >
              <HardDrive className="w-8 h-8 text-white" />
            </motion.div>
            <h1 className="text-3xl font-black tracking-tight mb-2 uppercase italic">Misery <span className={settings.theme === 'miku' ? 'text-[#39C5BB]' : 'text-purple-500'}>Photo</span></h1>
            <p className={settings.theme === 'miku' ? 'text-slate-500 text-sm font-bold tracking-widest' : 'text-gray-400 text-sm font-bold tracking-widest'}>私有云图集控制台</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className={`text-xs font-medium uppercase tracking-wider ml-1 ${settings.theme === 'miku' ? 'text-slate-500' : 'text-gray-400'}`}>用户名</label>
              <div className="relative group">
                <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors ${
                  settings.theme === 'miku' ? 'text-slate-400 group-focus-within:text-[#39C5BB]' : 'text-gray-500 group-focus-within:text-purple-400'
                }`}>
                  <User size={18} />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={`w-full pl-11 pr-4 py-3 border rounded-xl outline-none transition-all ${
                    settings.theme === 'miku'
                      ? 'bg-white/60 border-slate-200 focus:ring-2 focus:ring-[#39C5BB]/30 focus:border-[#39C5BB] placeholder:text-slate-400'
                      : 'bg-white/5 border-white/10 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 placeholder:text-gray-600'
                  }`}
                  placeholder="输入管理员账号"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className={`text-xs font-medium uppercase tracking-wider ml-1 ${settings.theme === 'miku' ? 'text-slate-500' : 'text-gray-400'}`}>密码</label>
              <div className="relative group">
                <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors ${
                  settings.theme === 'miku' ? 'text-slate-400 group-focus-within:text-[#39C5BB]' : 'text-gray-500 group-focus-within:text-purple-400'
                }`}>
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full pl-11 pr-4 py-3 border rounded-xl outline-none transition-all ${
                    settings.theme === 'miku'
                      ? 'bg-white/60 border-slate-200 focus:ring-2 focus:ring-[#39C5BB]/30 focus:border-[#39C5BB] placeholder:text-slate-400'
                      : 'bg-white/5 border-white/10 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 placeholder:text-gray-600'
                  }`}
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-red-500/10 border border-red-500/50 text-red-400 text-xs py-2 px-4 rounded-lg text-center"
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-4 text-white font-black uppercase tracking-widest rounded-xl shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center ${
                settings.theme === 'miku'
                  ? 'bg-[#39C5BB] hover:bg-[#32b5ab] shadow-[#39C5BB]/30'
                  : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 shadow-purple-500/20'
              }`}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                '立即进入'
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <p className="text-xs text-gray-500">
              提示：账号密码请在 .env 环境变量中设置
            </p>
          </div>
        </div>
      </motion.div>

      <style jsx global>{`
        .glass {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
        }
      `}</style>
    </div>
  );
}
