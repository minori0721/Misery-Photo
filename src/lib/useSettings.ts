'use client';

import { useState, useEffect } from 'react';

export type ThemeType = 'abyss' | 'miku';

export interface ISettings {
  theme: ThemeType;
  glow: boolean;
  mobileCols: 1 | 2;
}

const DEFAULT_SETTINGS: ISettings = {
  theme: 'miku',
  glow: true,
  mobileCols: 2,
};

export function useSettings() {
  const [settings, setSettings] = useState<ISettings>(DEFAULT_SETTINGS);
  const [mounted, setMounted] = useState(false);

  // 初次加载从 localstorage 取数据
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('misery_settings');
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse settings');
      }
    }
  }, []);

  const updateSettings = (updates: Partial<ISettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    localStorage.setItem('misery_settings', JSON.stringify(newSettings));
  };

  return { settings, updateSettings, mounted };
}
