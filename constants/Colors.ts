// Paleta oficial DVP — Dirección de Vialidad Provincial del Chaco
// Amarillo dorado #F5C300 · Carbón #2C2C2C
export type ColorPalette = {
  primary:        string;
  primaryLight:   string;
  primaryDark:    string;
  accent:         string;
  accentLight:    string;
  accentDark:     string;
  secondary:      string;
  secondaryLight: string;
  success:        string;
  warning:        string;
  danger:         string;
  background:     string;
  surface:        string;
  border:         string;
  textPrimary:    string;
  textSecondary:  string;
  textMuted:      string;
  white:          string;
  black:          string;
  tabBar:         string;
  tabBarActive:   string;
  tabBarInactive: string;
};

export type ThemeName = 'original' | 'dark' | 'light';

const ORIGINAL: ColorPalette = {
  primary:        '#2C2C2C',
  primaryLight:   '#444444',
  primaryDark:    '#1A1A1A',
  accent:         '#F5C300',
  accentLight:    '#FFD740',
  accentDark:     '#D4A900',
  secondary:      '#F5C300',
  secondaryLight: '#FFD740',
  success:        '#27AE60',
  warning:        '#F5C300',
  danger:         '#E74C3C',
  background:     '#F5F5F5',
  surface:        '#FFFFFF',
  border:         '#E0E0E0',
  textPrimary:    '#1C1C1C',
  textSecondary:  '#555555',
  textMuted:      '#999999',
  white:          '#FFFFFF',
  black:          '#000000',
  tabBar:         '#2C2C2C',
  tabBarActive:   '#F5C300',
  tabBarInactive: '#888888',
};

const DARK: ColorPalette = {
  primary:        '#161B22',
  primaryLight:   '#21262D',
  primaryDark:    '#0D1117',
  accent:         '#F5C300',
  accentLight:    '#FFD740',
  accentDark:     '#D4A900',
  secondary:      '#F5C300',
  secondaryLight: '#FFD740',
  success:        '#3FB950',
  warning:        '#F5C300',
  danger:         '#F85149',
  background:     '#0D1117',
  surface:        '#161B22',
  border:         '#30363D',
  textPrimary:    '#E6EDF3',
  textSecondary:  '#8B949E',
  textMuted:      '#484F58',
  white:          '#FFFFFF',
  black:          '#000000',
  tabBar:         '#161B22',
  tabBarActive:   '#F5C300',
  tabBarInactive: '#484F58',
};

const LIGHT: ColorPalette = {
  primary:        '#1E40AF',
  primaryLight:   '#2563EB',
  primaryDark:    '#1E3A8A',
  accent:         '#F59E0B',
  accentLight:    '#FCD34D',
  accentDark:     '#D97706',
  secondary:      '#F59E0B',
  secondaryLight: '#FCD34D',
  success:        '#22C55E',
  warning:        '#F59E0B',
  danger:         '#EF4444',
  background:     '#F8FAFC',
  surface:        '#FFFFFF',
  border:         '#E2E8F0',
  textPrimary:    '#0F172A',
  textSecondary:  '#475569',
  textMuted:      '#94A3B8',
  white:          '#FFFFFF',
  black:          '#000000',
  tabBar:         '#1E40AF',
  tabBarActive:   '#F59E0B',
  tabBarInactive: '#94A3B8',
};

export const THEMES: Record<ThemeName, ColorPalette> = {
  original: ORIGINAL,
  dark:     DARK,
  light:    LIGHT,
};

export const THEME_LABELS: Record<ThemeName, string> = {
  original: 'Original',
  dark:     'Oscuro',
  light:    'Claro',
};

// Compatibilidad con imports existentes (Colors.xxx) — apunta al tema original por defecto.
// Los componentes que usan el tema dinámico deben usar useColors() del ThemeContext.
export const Colors: ColorPalette = ORIGINAL;
