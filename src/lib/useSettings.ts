'use client';

import { useState, useEffect } from 'react';

export type ThemeType = 'abyss' | 'miku';

export interface ISettings {
  theme: ThemeType;
  glow: boolean;
  mobileCols: 1 | 2;
  bucketRuntimeCache: boolean;
}

const DEFAULT_SETTINGS: ISettings = {
  theme: 'miku',
  glow: true,
  mobileCols: 2,
  bucketRuntimeCache: true,
};

const SETTINGS_STORAGE_KEY = 'misery_settings';
const BUCKET_RUNTIME_CACHE_COOKIE_NAME = 'nebula_bucket_runtime_cache';

function syncBucketCacheCookie(enabled: boolean) {
  if (typeof document === 'undefined') return;
  const secureAttr = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${BUCKET_RUNTIME_CACHE_COOKIE_NAME}=${enabled ? '1' : '0'}; Path=/; Max-Age=31536000; SameSite=Lax${secureAttr}`;
}

export function useSettings() {
  const [settings, setSettings] = useState<ISettings>(DEFAULT_SETTINGS);
  const [mounted, setMounted] = useState(false);

  // 初次加载从 localstorage 取数据
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<ISettings>;
        const merged = { ...DEFAULT_SETTINGS, ...parsed } as ISettings;
        setSettings(merged);
        syncBucketCacheCookie(merged.bucketRuntimeCache);
      } catch (e) {
        console.error('Failed to parse settings');
        syncBucketCacheCookie(DEFAULT_SETTINGS.bucketRuntimeCache);
      }
    } else {
      syncBucketCacheCookie(DEFAULT_SETTINGS.bucketRuntimeCache);
    }
  }, []);

  const updateSettings = (updates: Partial<ISettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));
    if (typeof updates.bucketRuntimeCache !== 'undefined') {
      syncBucketCacheCookie(newSettings.bucketRuntimeCache);
    }
  };

  return { settings, updateSettings, mounted };
}
