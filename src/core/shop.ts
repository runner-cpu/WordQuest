import type { Profile } from '../types/model'
import { RANKS } from './game'

/**
 * 商店（§4.4）—— 零内购，金币只能靠学习获得。
 * 卖的是外观与便利，绝不卖学习能力。
 */

export type ShopItemKind = 'theme' | 'freeze' | 'mascot'

export interface ShopItem {
  id: string
  kind: ShopItemKind
  name: string
  desc: string
  price: number
  /** 达到对应词汇积累阶段后可购买外观。 */
  requiresRank?: string
  /** 主题 id 或皮肤 id */
  payload: string
  /** 可用主题碎片抵扣的数量；碎片来自每日宝箱 */
  fragmentCost?: number
}

export const SHOP_ITEMS: ShopItem[] = [
  // 主题：GameBoy 绿为默认已拥有，其余需购买
  {
    id: 'theme-midnight-neon',
    kind: 'theme',
    name: '午夜霓虹',
    desc: '青绿与深蓝，适合夜间',
    price: 320,
    payload: 'midnight-neon',
  },
  {
    id: 'theme-sunset',
    kind: 'theme',
    name: '日落',
    desc: '暖橙与洋红',
    price: 320,
    payload: 'sunset',
  },
  {
    id: 'theme-legend-gold',
    kind: 'theme',
    name: '传说金',
    desc: '词汇积累达到词林阶段后可购买',
    price: 600,
    requiresRank: 'b2',
    payload: 'legend-gold',
  },
  {
    id: 'theme-forest',
    kind: 'theme',
    name: '深林',
    desc: '集齐 3 个主题碎片可兑换（每日宝箱每 5 个给 1 个）',
    price: 0,
    fragmentCost: 3,
    payload: 'forest',
  },
  // 便利：冻结券
  {
    id: 'freeze-1',
    kind: 'freeze',
    name: '冻结券 ×1',
    desc: '漏卡时保住连击',
    price: 200,
    payload: 'freeze',
  },
  {
    id: 'freeze-3',
    kind: 'freeze',
    name: '冻结券 ×3',
    desc: '一次买三张，省 100 金币',
    price: 500,
    payload: 'freeze3',
  },
  // 吉祥物皮肤
  {
    id: 'mascot-leaf',
    kind: 'mascot',
    name: '嫩芽皮肤',
    desc: '吉祥物头顶长出一片叶子',
    price: 260,
    payload: 'leaf',
  },
  {
    id: 'mascot-crown',
    kind: 'mascot',
    name: '王冠皮肤',
    desc: '需要词林积累阶段',
    price: 480,
    requiresRank: 'b2',
    payload: 'crown',
  },
]

/** 默认就拥有的主题（不需要购买） */
/**
 * 默认拥有的主题。
 *
 * 纸墨是唯一的浅色主题，也是「护眼纸墨」风格的必要搭配，
 * 不该被金币锁住：用户可能就想要浅色，不能先逼他背 300 个词。
 */
export const DEFAULT_THEMES = ['night', 'gameboy', 'paper', 'custom']

/**
 * 判断是否拥有某主题。
 *
 * 老用户的 ownedThemes 里没有后来新增的默认主题（如 paper），
 * 直接 includes 会把他们锁在门外。默认主题永远视为拥有。
 */
export function ownsTheme(profile: { ownedThemes?: string[] } | null | undefined, themeId: string): boolean {
  if (DEFAULT_THEMES.includes(themeId)) return true
  return (profile?.ownedThemes ?? []).includes(themeId)
}

/** 已拥有的主题列表（含默认） */
export function ownedThemeList(profile: { ownedThemes?: string[] } | null | undefined): string[] {
  const set = new Set([...DEFAULT_THEMES, ...(profile?.ownedThemes ?? [])])
  return [...set]
}

export function hasRank(peak: number, rankId: string): boolean {
  const idx = RANKS.findIndex((r) => r.id === rankId)
  if (idx < 0) return true
  return peak >= RANKS[idx].threshold
}

export interface PurchaseCheck {
  ok: boolean
  reason?: string
}

export function canBuy(item: ShopItem, profile: Profile): PurchaseCheck {
  if (item.requiresRank && !hasRank(profile.powerPeak, item.requiresRank)) {
    const rank = RANKS.find((r) => r.id === item.requiresRank)
    return { ok: false, reason: `需要${rank?.name ?? '更高'}积累阶段` }
  }
  if (item.kind === 'theme' && profile.ownedThemes?.includes(item.payload)) {
    return { ok: false, reason: '已拥有' }
  }
  if (item.kind === 'mascot' && profile.ownedSkins?.includes(item.payload)) {
    return { ok: false, reason: '已拥有' }
  }
  if (item.fragmentCost) {
    const have = profile.themeFragments ?? 0
    if (have < item.fragmentCost) {
      return { ok: false, reason: `还差 ${item.fragmentCost - have} 个碎片` }
    }
    return { ok: true }
  }
  if (profile.coins < item.price) {
    return { ok: false, reason: `还差 ${item.price - profile.coins} 金币` }
  }
  return { ok: true }
}

/** 计算购买后的 profile 补丁。调用方负责落库。 */
export function applyPurchase(item: ShopItem, profile: Profile): Partial<Profile> {
  const patch: Partial<Profile> = {}
  if (item.fragmentCost) {
    patch.themeFragments = (profile.themeFragments ?? 0) - item.fragmentCost
  } else {
    patch.coins = profile.coins - item.price
  }
  switch (item.kind) {
    case 'theme':
      patch.ownedThemes = [...(profile.ownedThemes ?? DEFAULT_THEMES), item.payload]
      patch.theme = item.payload
      break
    case 'freeze':
      patch.freezes = profile.freezes + (item.payload === 'freeze3' ? 3 : 1)
      break
    case 'mascot':
      patch.ownedSkins = [...(profile.ownedSkins ?? ['default']), item.payload]
      patch.mascot = { ...profile.mascot, skin: item.payload }
      break
  }
  return patch
}

/** 基础练习始终可用，外观继续按积累阶段解锁。 */
export interface Unlocks {
  /** 听力填空：始终开放，保留兼容字段 */
  listenFill: boolean
  /** 听力问答：始终开放，保留兼容字段 */
  listenQuiz: boolean
  /** 学习报告海报框：词林阶段 */
  posterFrame: boolean
  /** 深夜模式 = 霓虹主题免金币（铂金） */
  neonFree: boolean
}

export function unlocksFor(peak: number): Unlocks {
  return {
    listenFill: true,
    listenQuiz: true,
    posterFrame: hasRank(peak, 'b2'),
    neonFree: hasRank(peak, 'c1'),
  }
}
