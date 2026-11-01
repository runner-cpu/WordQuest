import { applyCustomHue, clearCustomHue } from '../core/customTheme'
import type { Profile } from '../types/model'
import { readPreference, rememberPreference } from '../core/preferences'

/** 主题清单与轻量应用方法独立于设置页，避免首页加载整页设置。 */
export const THEMES: {
  id: string
  name: string
  bg: string
  accent: string
  light?: boolean
  custom?: boolean
}[] = [
  { id: 'night', name: '星夜', bg: '#0d0d1a', accent: '#ffe845' },
  { id: 'gameboy', name: 'GameBoy 绿', bg: '#0f380f', accent: '#c8e05a' },
  { id: 'midnight-neon', name: '午夜霓虹', bg: '#05060f', accent: '#45f5d0' },
  { id: 'sunset', name: '日落', bg: '#1a0d1f', accent: '#ffb86b' },
  { id: 'legend-gold', name: '传说金', bg: '#14100a', accent: '#ffd75e' },
  { id: 'forest', name: '深林', bg: '#0a1a12', accent: '#e8c46a' },
  { id: 'paper', name: '晨光米白', bg: '#f7f4ed', accent: '#8a5a1f', light: true },
  { id: 'custom', name: '自定义色相', bg: '#141428', accent: '#9ecbff', custom: true },
]

export const STYLES: { id: string; name: string; desc: string }[] = [
  { id: 'pixel', name: '像素复古', desc: '直角、硬阴影、像素字体' },
  { id: 'soft', name: '现代极简', desc: '圆角、柔和阴影、系统字体' },
  { id: 'calm', name: '护眼纸墨', desc: '细边框、无阴影、适合浅色' },
  { id: 'focus', name: '暗夜专注', desc: '弱边框、靠留白分层' },
]

/** 外观缓存不可用时，仍可用 IndexedDB 内的资料打开应用。 */
export function readAppearance(key: string): string | null {
  return readPreference(key)
}

export function rememberAppearance(key: string, value: string) {
  rememberPreference(key, value)
}

export function applyTheme(themeId: string, customHue = 210) {
  const theme = THEMES.some((t) => t.id === themeId) ? themeId : 'night'
  document.documentElement.dataset.theme = theme
  if (theme === 'custom') applyCustomHue(customHue)
  else clearCustomHue()
  rememberAppearance('wq:theme', theme)
}

export function applyStyle(styleId: string) {
  const style = STYLES.some((s) => s.id === styleId) ? styleId : 'pixel'
  document.documentElement.dataset.style = style
  rememberAppearance('wq:style', style)
}

export function restoreAppearance(profile?: Profile) {
  // 数据库资料为主；首次读取前用缓存减少闪烁。
  const theme = profile?.theme ?? readAppearance('wq:theme') ?? 'night'
  const cachedHue = readAppearance('wq:custom-hue')
  const hue = profile?.customHue ?? (cachedHue === null ? 210 : Number(cachedHue))
  applyTheme(theme, Number.isFinite(hue) ? hue : 210)
  applyStyle(profile?.styleId ?? readAppearance('wq:style') ?? 'pixel')
  document.documentElement.dataset.scanlines = readAppearance('wq:scanlines') === 'off' ? 'off' : 'on'
}
