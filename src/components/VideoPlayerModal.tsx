'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Copy, Cpu, Info, RefreshCw, X } from 'lucide-react';

type DecodeMode = 'auto' | 'native' | 'compat';
type PlaybackEngine = 'none' | 'native' | 'hls-js';
type PlayerStatus = 'idle' | 'probing' | 'playing' | 'error';
type FailureCode =
  | 'HLS_NOT_SUPPORTED'
  | 'UNSUPPORTED_BY_BROWSER'
  | 'SOFT_DECODE_UNAVAILABLE'
  | 'NETWORK_OR_CORS'
  | 'DECODE_FAILED'
  | 'SRC_NOT_SUPPORTED'
  | 'SIGNED_URL_EXPIRED'
  | 'AUTOPLAY_BLOCKED'
  | 'UNKNOWN';

type PlayerFailure = {
  code: FailureCode;
  message: string;
  details: string;
  suggestions: string[];
};

type CapabilitySnapshot = {
  extension: string;
  container: string;
  guessedMime: string;
  nativeSupport: '' | 'maybe' | 'probably';
  nativeHlsSupport: '' | 'maybe' | 'probably';
  hlsJsSupport: boolean;
  mediaCapabilitiesApi: boolean;
};

type VideoStats = {
  width: number;
  height: number;
  duration: number;
};

type VideoMeta = {
  path?: string;
  size?: number;
  lastModified?: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  title: string;
  meta?: VideoMeta;
};

const HLS_RE = /\.m3u8(\?|$)/i;

function extractExtension(input: string): string {
  const trimmed = input.split('?')[0] || '';
  const seg = trimmed.split('/').pop() || '';
  const dot = seg.lastIndexOf('.');
  if (dot < 0 || dot === seg.length - 1) return '';
  return seg.slice(dot + 1).toLowerCase();
}

function guessMimeByExtension(ext: string): string {
  if (ext === 'm3u8') return 'application/vnd.apple.mpegurl';
  if (ext === 'mp4' || ext === 'm4v') return 'video/mp4';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'ts') return 'video/mp2t';
  if (ext === 'mkv') return 'video/x-matroska';
  if (ext === 'avi') return 'video/x-msvideo';
  if (ext === 'wmv') return 'video/x-ms-wmv';
  if (ext === 'flv') return 'video/x-flv';
  if (ext === 'mpeg' || ext === 'mpg') return 'video/mpeg';
  if (ext === '3gp') return 'video/3gpp';
  if (ext === 'ogv') return 'video/ogg';
  return 'application/octet-stream';
}

function getContainerLabel(ext: string): string {
  if (!ext) return '未知';
  if (ext === 'm3u8') return 'HLS 清单';
  return ext.toUpperCase();
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '-';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatBytes(size?: number): string {
  if (!Number.isFinite(size) || !size || size <= 0) return '-';
  const kb = 1024;
  const mb = kb * 1024;
  const gb = mb * 1024;
  if (size >= gb) return `${(size / gb).toFixed(2)} GB`;
  if (size >= mb) return `${(size / mb).toFixed(2)} MB`;
  return `${(size / kb).toFixed(1)} KB`;
}

function formatDateTime(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function buildFailure(code: FailureCode, message: string, details: string, suggestions: string[]): PlayerFailure {
  return { code, message, details, suggestions };
}

export default function VideoPlayerModal({ isOpen, onClose, url, title, meta }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<import('hls.js').default | null>(null);
  const recoverAttemptsRef = useRef({ network: 0, media: 0 });

  const [decodeMode, setDecodeMode] = useState<DecodeMode>('auto');
  const [engine, setEngine] = useState<PlaybackEngine>('none');
  const [status, setStatus] = useState<PlayerStatus>('idle');
  const [failure, setFailure] = useState<PlayerFailure | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilitySnapshot | null>(null);
  const [stats, setStats] = useState<VideoStats>({ width: 0, height: 0, duration: 0 });
  const [showInfo, setShowInfo] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const extension = useMemo(() => extractExtension(title || url), [title, url]);
  const guessedMime = useMemo(() => guessMimeByExtension(extension), [extension]);
  const container = useMemo(() => getContainerLabel(extension), [extension]);

  const resetMediaElement = useCallback((video: HTMLVideoElement) => {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }, []);

  const applyFailure = useCallback((next: PlayerFailure) => {
    setFailure(next);
    setStatus('error');
  }, []);

  const handleRetry = useCallback(() => {
    setReloadToken((prev) => prev + 1);
  }, []);

  const handleCopyDiagnostics = useCallback(async () => {
    const payload = {
      title,
      url,
      decodeMode,
      engine,
      status,
      extension,
      guessedMime,
      capabilities,
      failure,
      stats,
      meta,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      time: new Date().toISOString(),
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    } catch {
      // 忽略复制失败
    }
  }, [capabilities, decodeMode, engine, extension, failure, guessedMime, meta, stats, status, title, url]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !videoRef.current || !url) return;

    let disposed = false;
    const video = videoRef.current;
    let currentHls: import('hls.js').default | null = null;

    recoverAttemptsRef.current = { network: 0, media: 0 };
    setFailure(null);
    setStatus('probing');
    setEngine('none');
    setStats({ width: 0, height: 0, duration: 0 });

    const onLoadedMetadata = () => {
      if (disposed) return;
      setStats({
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        duration: video.duration || 0,
      });
    };

    const onPlaying = () => {
      if (disposed) return;
      setStatus('playing');
      setFailure(null);
    };

    const onVideoError = () => {
      if (disposed) return;
      const mediaError = video.error;
      if (!mediaError) return;

      if (mediaError.code === MediaError.MEDIA_ERR_NETWORK) {
        applyFailure(buildFailure(
          'NETWORK_OR_CORS',
          '视频请求失败',
          '网络中断、跨域配置异常、Range 请求不被支持或链接已失效都可能触发该错误。',
          [
            '检查对象存储是否允许 Range 请求并返回 206。',
            '确认签名 URL 是否仍有效。',
            '确认 CORS 允许当前站点访问。',
          ]
        ));
        return;
      }

      if (mediaError.code === MediaError.MEDIA_ERR_DECODE) {
        applyFailure(buildFailure(
          'DECODE_FAILED',
          '解码失败',
          '浏览器无法解码当前视频或音频轨，常见于容器支持但编码组合不支持。',
          [
            '尝试切换到“兼容模式（实验）”。',
            '建议转码为 MP4(H.264)+AAC 以获得最佳兼容性。',
            '如为 MKV/HEVC/AV1，请在旧设备上准备兼容转码版本。',
          ]
        ));
        return;
      }

      if (mediaError.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        applyFailure(buildFailure(
          'SRC_NOT_SUPPORTED',
          '当前浏览器不支持该媒体源',
          '当前容器或编解码组合超出浏览器支持范围。',
          [
            '尝试切换到“兼容模式（实验）”。',
            '检查视频后缀与真实编码是否一致。',
            '建议转码为 MP4(H.264)+AAC。',
          ]
        ));
        return;
      }

      applyFailure(buildFailure(
        'UNKNOWN',
        '视频播放失败',
        `浏览器返回未知错误码：${mediaError.code}`,
        ['点击重试，或导出诊断信息用于排查。']
      ));
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('error', onVideoError);

    const setup = async () => {
      const nativeSupport = guessedMime.startsWith('video/') ? (video.canPlayType(guessedMime) as '' | 'maybe' | 'probably') : '';
      const nativeHlsSupport = (video.canPlayType('application/vnd.apple.mpegurl') || video.canPlayType('application/x-mpegURL')) as '' | 'maybe' | 'probably';
      const mediaCapabilitiesApi = typeof navigator !== 'undefined' && 'mediaCapabilities' in navigator;
      const isHlsSource = HLS_RE.test(url);

      let hlsJsSupport = false;
      let HlsCtor: typeof import('hls.js').default | null = null;

      if (isHlsSource || decodeMode === 'compat') {
        try {
          const mod = await import('hls.js');
          HlsCtor = mod.default;
          hlsJsSupport = mod.default.isSupported();
        } catch {
          hlsJsSupport = false;
        }
      }

      if (disposed) return;

      setCapabilities({
        extension,
        container,
        guessedMime,
        nativeSupport,
        nativeHlsSupport,
        hlsJsSupport,
        mediaCapabilitiesApi,
      });

      const startNativePlayback = async () => {
        setEngine('native');
        video.src = url;
        video.load();
        try {
          await video.play();
        } catch (err) {
          const text = err instanceof Error ? err.message : String(err);
          if (/user didn't interact|notallowederror|play\(\) failed/i.test(text)) {
            applyFailure(buildFailure(
              'AUTOPLAY_BLOCKED',
              '自动播放被浏览器拦截',
              '这不是格式问题，属于浏览器自动播放策略限制。',
              ['点击播放器控制条中的播放按钮即可继续。']
            ));
            return;
          }
          applyFailure(buildFailure(
            'UNKNOWN',
            '播放启动失败',
            text,
            ['点击重试，或切换兼容模式再试。']
          ));
        }
      };

      const startHlsPlayback = async (Ctor: typeof import('hls.js').default) => {
        setEngine('hls-js');
        const hls = new Ctor({
          enableWorker: decodeMode !== 'compat',
          lowLatencyMode: decodeMode !== 'compat',
          backBufferLength: decodeMode === 'compat' ? 180 : 90,
          maxBufferLength: decodeMode === 'compat' ? 60 : 30,
        });

        currentHls = hls;
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(video);

        hls.on(Ctor.Events.MANIFEST_PARSED, async () => {
          try {
            await video.play();
          } catch {
            // 自动播放被策略拦截时交给用户手动播放
          }
        });

        hls.on(Ctor.Events.ERROR, (_event, data) => {
          if (disposed || !data?.fatal) return;

          if (data.type === Ctor.ErrorTypes.NETWORK_ERROR) {
            if (recoverAttemptsRef.current.network < 1) {
              recoverAttemptsRef.current.network += 1;
              hls.startLoad();
              return;
            }

            applyFailure(buildFailure(
              /403|401/.test(String(data?.response?.code || '')) ? 'SIGNED_URL_EXPIRED' : 'NETWORK_OR_CORS',
              'HLS 网络错误',
              '清单或分片拉取失败，可能是链接过期、跨域限制或网络波动。',
              [
                '重试播放，重新获取签名链接。',
                '确认对象存储 CORS 已放行当前站点。',
                '确认分片请求支持并返回正确状态码。',
              ]
            ));
            return;
          }

          if (data.type === Ctor.ErrorTypes.MEDIA_ERROR) {
            if (recoverAttemptsRef.current.media < 1) {
              recoverAttemptsRef.current.media += 1;
              hls.recoverMediaError();
              return;
            }

            applyFailure(buildFailure(
              'DECODE_FAILED',
              'HLS 媒体解码失败',
              '浏览器无法稳定解码当前流媒体编码。',
              [
                '切换到兼容模式（实验）再试。',
                '准备兼容转码版本（H.264 + AAC）。',
              ]
            ));
            return;
          }

          applyFailure(buildFailure(
            'UNKNOWN',
            'HLS 播放失败',
            `错误类型：${String(data.type)}，详情：${String(data.details || '-')}`,
            ['点击重试，或导出诊断信息排查。']
          ));
        });
      };

      if (isHlsSource) {
        if (decodeMode === 'native') {
          if (nativeHlsSupport) {
            await startNativePlayback();
            return;
          }
          applyFailure(buildFailure(
            'HLS_NOT_SUPPORTED',
            '当前浏览器不支持原生 HLS',
            '你选择了原生策略，但该浏览器没有原生 HLS 能力。',
            ['切换到自动或兼容模式，让播放器尝试 hls.js。']
          ));
          return;
        }

        if (HlsCtor && hlsJsSupport) {
          await startHlsPlayback(HlsCtor);
          return;
        }

        if (nativeHlsSupport) {
          await startNativePlayback();
          return;
        }

        applyFailure(buildFailure(
          'HLS_NOT_SUPPORTED',
          '当前环境不支持 HLS 播放',
          '既没有原生 HLS 能力，也无法使用 hls.js。',
          ['更换浏览器，或在服务端提供 MP4 回源。']
        ));
        return;
      }

      if (nativeSupport) {
        await startNativePlayback();
        return;
      }

      if (decodeMode === 'compat') {
        applyFailure(buildFailure(
          'SOFT_DECODE_UNAVAILABLE',
          '浏览器无法强制切到纯软解',
          '兼容模式会尽量使用更保守的播放路径，但对普通文件仍受浏览器解码器限制。',
          [
            '建议转码为 MP4(H.264)+AAC。',
            '如需更广兼容，建议在服务端做转码分发。',
          ]
        ));
        return;
      }

      applyFailure(buildFailure(
        'UNSUPPORTED_BY_BROWSER',
        '当前浏览器不支持该视频格式',
        `容器 ${container} 仅被识别，但浏览器返回 canPlayType=${nativeSupport || '空'}。`,
        [
          '切换到兼容模式（实验）再尝试。',
          '建议转码为 MP4(H.264)+AAC。',
        ]
      ));
    };

    setup();

    return () => {
      disposed = true;
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onVideoError);

      if (currentHls) {
        currentHls.destroy();
      }
      hlsRef.current = null;
      resetMediaElement(video);
      setEngine('none');
      setStatus('idle');
    };
  }, [applyFailure, container, decodeMode, guessedMime, isOpen, reloadToken, resetMediaElement, title, url, extension]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[190] bg-black/90 backdrop-blur-sm"
          onClick={onClose}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="absolute top-5 right-5 z-[191] p-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="关闭视频"
          >
            <X size={20} />
          </button>

          <div className="absolute inset-0 p-4 md:p-8 flex items-center justify-center" onClick={onClose}>
            <div className="w-full max-w-6xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 p-3 md:p-4 rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl text-white">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-black truncate">{title}</p>
                    <p className="text-xs text-white/60 truncate">{meta?.path || '-'}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`px-2 py-1 rounded-lg border ${status === 'playing' ? 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10' : status === 'error' ? 'text-red-300 border-red-400/40 bg-red-400/10' : 'text-white/70 border-white/20 bg-white/5'}`}>
                      状态：{status === 'playing' ? '播放中' : status === 'error' ? '失败' : status === 'probing' ? '探测中' : '待机'}
                    </span>
                    <span className="px-2 py-1 rounded-lg border border-white/20 bg-white/5">引擎：{engine}</span>
                    <button
                      type="button"
                      onClick={() => setShowInfo((v) => !v)}
                      className="px-2 py-1 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-1"
                    >
                      <Info size={14} /> 信息
                    </button>
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="px-2 py-1 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-1"
                    >
                      <RefreshCw size={14} /> 重试
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setDecodeMode('auto')}
                    className={`px-2 py-1 rounded-lg border transition-colors ${decodeMode === 'auto' ? 'bg-blue-500/20 text-blue-300 border-blue-400/40' : 'bg-white/5 border-white/20 hover:bg-white/10'}`}
                  >
                    自动
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecodeMode('native')}
                    className={`px-2 py-1 rounded-lg border transition-colors ${decodeMode === 'native' ? 'bg-blue-500/20 text-blue-300 border-blue-400/40' : 'bg-white/5 border-white/20 hover:bg-white/10'}`}
                  >
                    硬解优先
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecodeMode('compat')}
                    className={`px-2 py-1 rounded-lg border transition-colors flex items-center gap-1 ${decodeMode === 'compat' ? 'bg-amber-500/20 text-amber-300 border-amber-400/40' : 'bg-white/5 border-white/20 hover:bg-white/10'}`}
                  >
                    <Cpu size={13} /> 兼容模式（实验）
                  </button>
                </div>
              </div>

              <video
                ref={videoRef}
                controls
                autoPlay
                playsInline
                preload="metadata"
                className="w-full max-h-[72vh] rounded-2xl bg-black shadow-2xl"
              />

              {failure && (
                <div className="mt-3 p-3 rounded-2xl border border-red-400/35 bg-red-500/10 text-red-100">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black flex items-center gap-2"><AlertCircle size={15} /> {failure.message}</p>
                      <p className="text-xs mt-1 text-red-100/90">{failure.details}</p>
                      <p className="text-[11px] mt-1 text-red-200/80">错误码：{failure.code}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyDiagnostics}
                      className="px-2 py-1 rounded-lg border border-red-200/30 bg-red-100/10 hover:bg-red-100/20 transition-colors text-xs flex items-center gap-1"
                    >
                      <Copy size={13} /> 复制诊断
                    </button>
                  </div>
                  <ul className="mt-2 text-xs list-disc list-inside space-y-1 text-red-100/90">
                    {failure.suggestions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {showInfo && (
                <div className="mt-3 p-3 rounded-2xl border border-white/15 bg-black/40 backdrop-blur-xl text-xs text-white/90 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <p>容器：{container}</p>
                  <p>后缀：{extension || '-'}</p>
                  <p>MIME 估计：{guessedMime}</p>
                  <p>解码策略：{decodeMode}</p>
                  <p>文件大小：{formatBytes(meta?.size)}</p>
                  <p>修改时间：{formatDateTime(meta?.lastModified)}</p>
                  <p>分辨率：{stats.width > 0 && stats.height > 0 ? `${stats.width} x ${stats.height}` : '-'}</p>
                  <p>时长：{formatDuration(stats.duration)}</p>
                  <p>native canPlayType：{capabilities?.nativeSupport || '-'}</p>
                  <p>native HLS：{capabilities?.nativeHlsSupport || '-'}</p>
                  <p>hls.js 支持：{capabilities?.hlsJsSupport ? '是' : '否'}</p>
                  <p>MediaCapabilities API：{capabilities?.mediaCapabilitiesApi ? '可用' : '不可用'}</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
