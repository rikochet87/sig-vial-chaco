import React, { createContext, useContext } from 'react';
import { type ColorPalette, THEMES } from '@/constants/Colors';

interface ThemeCtx {
  colors: ColorPalette;
}

const Ctx = createContext<ThemeCtx>({ colors: THEMES.cad });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <Ctx.Provider value={{ colors: THEMES.cad }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}

export function useColors(): ColorPalette {
  return useContext(Ctx).colors;
}
