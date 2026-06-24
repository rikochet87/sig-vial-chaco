import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { type ColorPalette, type ThemeName, THEMES } from '@/constants/Colors';

const PREFS_PATH = (FileSystem.documentDirectory ?? '') + 'prefs.json';

interface ThemeCtx {
  theme: ThemeName;
  colors: ColorPalette;
  setTheme: (t: ThemeName) => void;
}

const Ctx = createContext<ThemeCtx>({
  theme: 'original',
  colors: THEMES.original,
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>('original');

  // Load saved theme on mount
  useEffect(() => {
    (async () => {
      try {
        const info = await FileSystem.getInfoAsync(PREFS_PATH);
        if (info.exists) {
          const raw = await FileSystem.readAsStringAsync(PREFS_PATH);
          const prefs = JSON.parse(raw);
          if (prefs.theme && prefs.theme in THEMES) {
            setThemeState(prefs.theme as ThemeName);
          }
        }
      } catch {}
    })();
  }, []);

  const setTheme = useCallback((t: ThemeName) => {
    setThemeState(t);
    FileSystem.writeAsStringAsync(PREFS_PATH, JSON.stringify({ theme: t })).catch(() => {});
  }, []);

  return (
    <Ctx.Provider value={{ theme, colors: THEMES[theme], setTheme }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTheme() {
  return useContext(Ctx);
}

export function useColors(): ColorPalette {
  return useContext(Ctx).colors;
}
