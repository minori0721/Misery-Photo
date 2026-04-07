'use client';

import { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  title: string;
};

export default function VideoPlayerModal({ isOpen, onClose, url, title }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    if (!isOpen || !videoRef.current) return;

    const video = videoRef.current;
    const isHlsSource = /\.m3u8(\?|$)/i.test(url);

    if (isHlsSource && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      hlsRef.current = hls;
    } else {
      video.src = url;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
    };
  }, [isOpen, url]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

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

          <div className="absolute inset-0 p-4 md:p-10 flex items-center justify-center" onClick={onClose}>
            <div className="w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
              <video
                ref={videoRef}
                controls
                autoPlay
                playsInline
                preload="metadata"
                className="w-full max-h-[78vh] rounded-2xl bg-black shadow-2xl"
              />
              <div className="mt-3 px-2 text-white/90 text-sm font-bold truncate">{title}</div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
