import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Settings2, Sparkles, Palette, LayoutGrid, Database, Check, Trash2, PlugZap, Info } from 'lucide-react';
import { ISettings } from '@/lib/useSettings';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: ISettings;
  updateSettings: (updates: Partial<ISettings>) => void;
  onBucketsChanged?: () => void;
}

type BucketView = {
  id: string;
  name: string;
  endpoint: string;
  region: string;
  bucket: string;
  forcePathStyle: boolean;
  active: boolean;
};

type BucketForm = {
  id?: string;
  name: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

const EMPTY_BUCKET_FORM: BucketForm = {
  name: '',
  endpoint: '',
  region: 'auto',
  bucket: '',
  accessKeyId: '',
  secretAccessKey: '',
  forcePathStyle: true,
};

export default function SettingsModal({ isOpen, onClose, settings, updateSettings, onBucketsChanged }: Props) {
  const [buckets, setBuckets] = useState<BucketView[]>([]);
  const [loadingBuckets, setLoadingBuckets] = useState(false);
  const [bucketMessage, setBucketMessage] = useState('');
  const [bucketError, setBucketError] = useState('');
  const [savingBucket, setSavingBucket] = useState(false);
  const [testingBucket, setTestingBucket] = useState(false);
  const [bucketForm, setBucketForm] = useState<BucketForm>(EMPTY_BUCKET_FORM);

  const activeBucketName = useMemo(() => buckets.find((bucket) => bucket.active)?.name || '未设置', [buckets]);

  const fetchBucketData = async () => {
    setLoadingBuckets(true);
    setBucketError('');
    try {
      const res = await fetch('/api/settings/buckets');
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || '获取存储桶配置失败');
      }
      setBuckets(data.data?.buckets || []);
    } catch (error: any) {
      setBucketError(error?.message || '读取存储桶失败');
    } finally {
      setLoadingBuckets(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchBucketData();
  }, [isOpen]);

  const updateBucketForm = (key: keyof BucketForm, value: string | boolean) => {
    setBucketForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleBucketAction = async (payload: any, successMessage?: string) => {
    setSavingBucket(true);
    setBucketError('');
    setBucketMessage('');
    try {
      const res = await fetch('/api/settings/buckets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || '操作失败');
      }

      if (Array.isArray(data.data?.buckets)) {
        setBuckets(data.data.buckets);
      }
      if (successMessage) {
        setBucketMessage(successMessage);
      }
      onBucketsChanged?.();
    } catch (error: any) {
      setBucketError(error?.message || '操作失败');
    } finally {
      setSavingBucket(false);
    }
  };

  const handleTestBucket = async () => {
    setTestingBucket(true);
    setBucketError('');
    setBucketMessage('');
    try {
      const res = await fetch('/api/settings/buckets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          bucket: bucketForm,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || '连接失败');
      }
      setBucketMessage(data.message || '连接成功');
    } catch (error: any) {
      setBucketError(error?.message || '连接失败');
    } finally {
      setTestingBucket(false);
    }
  };

  const handleSaveBucket = async () => {
    await handleBucketAction(
      {
        action: 'save',
        bucket: bucketForm,
        setActive: true,
      },
      '存储桶已保存并激活'
    );
    setBucketForm(EMPTY_BUCKET_FORM);
  };

  const handleSwitchBucket = async (id: string) => {
    await handleBucketAction({ action: 'set-active', id }, '已切换当前存储桶');
  };

  const handleDeleteBucket = async (id: string) => {
    if (!confirm('确认删除这个存储桶配置吗？')) return;
    await handleBucketAction({ action: 'remove', id }, '存储桶配置已删除');
  };

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
            <div className="p-6 space-y-8 max-h-[78vh] overflow-y-auto">
              
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

              {/* Runtime Cache Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <Database size={14} className={settings.theme === 'miku' ? 'text-[#39C5BB]' : 'text-blue-400'} />
                    <h3 className="text-xs font-bold uppercase tracking-wider opacity-60">桶配置性能缓存</h3>
                    <span
                      title="开启后服务端会在内存中缓存桶配置 60 秒，减少每次请求读取 KV 的延迟。关闭后每次都直读 KV。"
                      className={`inline-flex items-center ${settings.theme === 'miku' ? 'text-slate-400' : 'text-white/40'}`}
                    >
                      <Info size={12} />
                    </span>
                  </div>
                  <p className="text-[10px] opacity-40 mt-1">默认开启，TTL = 60s。修改后立即生效。</p>
                </div>
                <button
                  onClick={() => updateSettings({ bucketRuntimeCache: !settings.bucketRuntimeCache })}
                  className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-1 ${
                    settings.bucketRuntimeCache
                      ? (settings.theme === 'miku' ? 'bg-[#39C5BB]' : 'bg-blue-600')
                      : (settings.theme === 'miku' ? 'bg-slate-200' : 'bg-white/10')
                  }`}
                >
                  <motion.div
                    layout
                    className="w-4 h-4 rounded-full shadow-md bg-white"
                    style={{ marginLeft: settings.bucketRuntimeCache ? 'auto' : '0' }}
                  />
                </button>
              </div>

              {/* Bucket Manager */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Database size={14} className={settings.theme === 'miku' ? 'text-[#39C5BB]' : 'text-blue-400'} />
                    <h3 className="text-xs font-bold uppercase tracking-wider opacity-60">存储桶管理</h3>
                  </div>
                  <span className={`text-[10px] px-2 py-1 rounded-full ${settings.theme === 'miku' ? 'bg-slate-100 text-slate-500' : 'bg-white/10 text-white/60'}`}>
                    当前: {activeBucketName}
                  </span>
                </div>

                {loadingBuckets ? (
                  <div className={`text-xs p-3 rounded-xl ${settings.theme === 'miku' ? 'bg-slate-50 text-slate-500' : 'bg-white/5 text-white/60'}`}>
                    正在加载存储桶配置...
                  </div>
                ) : (
                  <div className="space-y-2">
                    {buckets.length === 0 && (
                      <div className={`text-xs p-3 rounded-xl border ${settings.theme === 'miku' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300'}`}>
                        当前没有可用存储桶，请在下方新增并激活。
                      </div>
                    )}

                    {buckets.map((bucket) => (
                      <div
                        key={bucket.id}
                        className={`p-3 rounded-xl border ${bucket.active
                          ? (settings.theme === 'miku' ? 'bg-[#39C5BB]/8 border-[#39C5BB]/40' : 'bg-purple-500/10 border-purple-500/40')
                          : (settings.theme === 'miku' ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10')
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-bold truncate">{bucket.name}</p>
                            <p className="text-[11px] opacity-60 truncate">{bucket.bucket} @ {bucket.endpoint}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {!bucket.active && (
                              <button
                                onClick={() => handleSwitchBucket(bucket.id)}
                                disabled={savingBucket}
                                className={`px-2 py-1 rounded-md text-[10px] font-bold ${settings.theme === 'miku' ? 'bg-white border border-slate-200 text-slate-600' : 'bg-white/10 text-white/80'}`}
                              >
                                设为当前
                              </button>
                            )}
                            {bucket.active && (
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold ${settings.theme === 'miku' ? 'bg-white text-[#39C5BB]' : 'bg-purple-500/20 text-purple-300'}`}>
                                <Check size={10} /> 当前
                              </span>
                            )}
                            <button
                              onClick={() => handleDeleteBucket(bucket.id)}
                              disabled={savingBucket}
                              className={`p-1.5 rounded-md ${settings.theme === 'miku' ? 'text-red-500 hover:bg-red-50' : 'text-red-300 hover:bg-red-500/10'}`}
                              title="删除"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className={`p-3 rounded-xl border space-y-3 ${settings.theme === 'miku' ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'}`}>
                  <p className="text-xs font-bold uppercase tracking-wider opacity-70">新增 / 更新存储桶</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={bucketForm.name}
                      onChange={(e) => updateBucketForm('name', e.target.value)}
                      placeholder="显示名称"
                      className={`px-3 py-2 rounded-lg text-xs border ${settings.theme === 'miku' ? 'bg-white border-slate-200' : 'bg-black/30 border-white/10'}`}
                    />
                    <input
                      value={bucketForm.bucket}
                      onChange={(e) => updateBucketForm('bucket', e.target.value)}
                      placeholder="Bucket 名"
                      className={`px-3 py-2 rounded-lg text-xs border ${settings.theme === 'miku' ? 'bg-white border-slate-200' : 'bg-black/30 border-white/10'}`}
                    />
                    <input
                      value={bucketForm.endpoint}
                      onChange={(e) => updateBucketForm('endpoint', e.target.value)}
                      placeholder="Endpoint (https://...)"
                      className={`px-3 py-2 rounded-lg text-xs border col-span-2 ${settings.theme === 'miku' ? 'bg-white border-slate-200' : 'bg-black/30 border-white/10'}`}
                    />
                    <input
                      value={bucketForm.region}
                      onChange={(e) => updateBucketForm('region', e.target.value)}
                      placeholder="Region (默认 auto)"
                      className={`px-3 py-2 rounded-lg text-xs border ${settings.theme === 'miku' ? 'bg-white border-slate-200' : 'bg-black/30 border-white/10'}`}
                    />
                    <label className="flex items-center gap-2 text-xs opacity-80">
                      <input
                        type="checkbox"
                        checked={bucketForm.forcePathStyle}
                        onChange={(e) => updateBucketForm('forcePathStyle', e.target.checked)}
                      />
                      强制 path-style
                    </label>
                    <input
                      value={bucketForm.accessKeyId}
                      onChange={(e) => updateBucketForm('accessKeyId', e.target.value)}
                      placeholder="Access Key"
                      className={`px-3 py-2 rounded-lg text-xs border col-span-2 ${settings.theme === 'miku' ? 'bg-white border-slate-200' : 'bg-black/30 border-white/10'}`}
                    />
                    <input
                      type="password"
                      value={bucketForm.secretAccessKey}
                      onChange={(e) => updateBucketForm('secretAccessKey', e.target.value)}
                      placeholder="Secret Key"
                      className={`px-3 py-2 rounded-lg text-xs border col-span-2 ${settings.theme === 'miku' ? 'bg-white border-slate-200' : 'bg-black/30 border-white/10'}`}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleTestBucket}
                      disabled={testingBucket || savingBucket}
                      className={`px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1 ${settings.theme === 'miku' ? 'bg-white border border-slate-200 text-slate-700' : 'bg-white/10 text-white'}`}
                    >
                      <PlugZap size={12} /> {testingBucket ? '测试中...' : '测试连接'}
                    </button>
                    <button
                      onClick={handleSaveBucket}
                      disabled={savingBucket}
                      className={`px-3 py-2 rounded-lg text-xs font-bold ${settings.theme === 'miku' ? 'bg-[#39C5BB] text-white' : 'bg-purple-600 text-white'}`}
                    >
                      {savingBucket ? '保存中...' : '保存并激活'}
                    </button>
                  </div>

                  {bucketMessage && (
                    <p className={`text-xs ${settings.theme === 'miku' ? 'text-emerald-600' : 'text-emerald-300'}`}>{bucketMessage}</p>
                  )}
                  {bucketError && (
                    <p className={`text-xs ${settings.theme === 'miku' ? 'text-red-600' : 'text-red-300'}`}>{bucketError}</p>
                  )}
                </div>
              </div>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
