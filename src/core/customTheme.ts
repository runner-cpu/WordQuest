/**
 * 自定义色相主题。
 *
 * 用户挑一个色相（0-359），由它生成一整套深色令牌。
 * 生成规则经过对比度验证：全色相下副文字 ≥7.4:1、强调色 ≥5.9:1，
 * 蓝、紫段（180-300）天然更暗，强调色亮度从 68% 提到 76% 补偿。
 *
 * 通过/错误两个语义色不跟随色相：绿色表示正确、红色表示错误，
 * 变色会造成误读，所以只有中性色与强调色可自定义。
 */

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h} ${s}% ${l}%)`
}

export interface CustomTokens {
  bg: string
  panel: string
  panel2: string
  edge: string
  gold: string
  dim: string
  text: string
  accent: string
  onAccent: string
}

export function customTokens(hue: number): CustomTokens {
  const h = ((Math.round(hue) % 360) + 360) % 360
  const goldL = h >= 180 && h <= 300 ? 76 : 68
  return {
    bg: hsl(h, 30, 7),
    panel: hsl(h, 28, 11),
    panel2: hsl(h, 26, 15),
    edge: hsl(h, 24, 38),
    gold: hsl(h, 88, goldL),
    dim: hsl(h, 18, 72),
    text: hsl(h, 20, 93),
    accent: hsl(h, 60, 45),
    onAccent: hsl(h, 45, 7),
  }
}

/** 把自定义令牌写到 <html> 的内联 style 上，优先级高于任何主题块 */
export function applyCustomHue(hue: number) {
  const t = customTokens(hue)
  const root = document.documentElement
  root.style.setProperty('--wq-bg', t.bg)
  root.style.setProperty('--wq-panel', t.panel)
  root.style.setProperty('--wq-panel-2', t.panel2)
  root.style.setProperty('--wq-edge', t.edge)
  root.style.setProperty('--wq-gold', t.gold)
  root.style.setProperty('--wq-dim', t.dim)
  root.style.setProperty('--wq-text', t.text)
  root.style.setProperty('--wq-accent', t.accent)
  root.style.setProperty('--wq-on-accent', t.onAccent)
}

/** 离开自定义主题时清掉内联变量，回到 CSS 主题块 */
export function clearCustomHue() {
  const root = document.documentElement
  for (const key of [
    '--wq-bg',
    '--wq-panel',
    '--wq-panel-2',
    '--wq-edge',
    '--wq-gold',
    '--wq-dim',
    '--wq-text',
    '--wq-accent',
    '--wq-on-accent',
  ]) {
    root.style.removeProperty(key)
  }
}

/** 预设色相：给不知道选什么的人一个起点 */
export const HUE_PRESETS: { hue: number; name: string }[] = [
  { hue: 45, name: '琥珀' },
  { hue: 160, name: '薄荷' },
  { hue: 200, name: '湖蓝' },
  { hue: 262, name: '鸢尾紫' },
  { hue: 320, name: '山茶粉' },
  { hue: 8, name: '绯红' },
]
