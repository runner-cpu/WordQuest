/**
 * 成长体系：学习经验 × 词汇积累阶段。
 * 阶段按应用内词卡积累的历史峰值展示，不代表语言测评结果。
 * 稳定 id 与阈值沿用旧版本，保证历史进度与解锁兼容。
 */

export interface RankDef {
  id: string
  /** 应用内阶段序号，用于紧凑展示 */
  code: string
  name: string
  /** 说明词卡积累进度 */
  desc: string
  threshold: number
  mascotStage: string
  unlock: string
}

export const RANKS: RankDef[] = [
  {
    id: 'a1',
    code: '阶段1',
    name: '词芽',
    desc: '从第一张词卡开始，逐步积累复习记录',
    threshold: 0,
    mascotStage: '蛋',
    unlock: '基础主题',
  },
  {
    id: 'a2',
    code: '阶段2',
    name: '词苗',
    desc: '词卡积累达到 300 点，继续巩固已学内容',
    threshold: 300,
    mascotStage: '幼年体',
    unlock: '主题商店',
  },
  {
    id: 'b1',
    code: '阶段3',
    name: '词枝',
    desc: '词卡积累达到 900 点，留下更多复习足迹',
    threshold: 900,
    mascotStage: '少年体',
    unlock: '专属称号「词枝」',
  },
  {
    id: 'b2',
    code: '阶段4',
    name: '词林',
    desc: '词卡积累达到 2000 点，持续扩展词汇记录',
    threshold: 2000,
    mascotStage: '成年体',
    unlock: '学习报告海报框',
  },
  {
    id: 'c1',
    code: '阶段5',
    name: '词海',
    desc: '词卡积累达到 4000 点，巩固长期学习成果',
    threshold: 4000,
    mascotStage: '披风形态',
    unlock: '专属称号「词海」',
  },
  {
    id: 'c2',
    code: '阶段6',
    name: '词汇行家',
    desc: '词卡积累达到 7000 点，记录扎实的学习投入',
    threshold: 7000,
    mascotStage: '光环形态',
    unlock: '专属称号「词汇行家」',
  },
  {
    id: 'master',
    code: '阶段7',
    name: '词汇收藏家',
    desc: '词卡积累达到 12000 点，继续维护记忆与复习习惯',
    threshold: 12000,
    mascotStage: '传说形态',
    unlock: '专属称号「词汇收藏家」',
  },
]

export function rankFromPower(peak: number): { rank: RankDef; tier: number; next?: RankDef } {
  let idx = 0
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (peak >= RANKS[i].threshold) {
      idx = i
      break
    }
  }
  const rank = RANKS[idx]
  const next = RANKS[idx + 1]
  // 每大段位分 3 小级：按到下一段位的进度切三档
  let tier = 0
  if (next) {
    const span = next.threshold - rank.threshold
    const into = peak - rank.threshold
    tier = Math.min(2, Math.floor((into / span) * 3))
  } else {
    tier = 2
  }
  return { rank, tier, next }
}

/** 等级从 0 XP 的 Lv.1 起步，后续阈值为 round(100 × L^1.5)。 */
export function levelFromXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1
  let level = Math.max(1, Math.floor(Math.pow(xp / 100, 2 / 3)))
  // 阈值取整后，公式反解可能差 1 XP；以展示的整数阈值为准。
  if (xp >= xpForLevel(level + 1)) level++
  else if (level > 1 && xp < xpForLevel(level)) level--
  return level
}

export function xpForLevel(level: number): number {
  if (level <= 1) return 0
  return Math.round(100 * Math.pow(level, 1.5))
}

export function levelProgress(xp: number): { level: number; into: number; span: number; pct: number } {
  const safeXp = Number.isFinite(xp) ? Math.max(0, xp) : 0
  const level = levelFromXp(safeXp)
  const base = xpForLevel(level)
  const next = xpForLevel(level + 1)
  const span = Math.max(1, next - base)
  const into = Math.max(0, safeXp - base)
  return { level, into, span, pct: Math.min(100, (into / span) * 100) }
}

/** XP 规则（§4.1） */
export const XP_RULES = {
  newWord: 10,
  reviewCorrect: 3,
  reviewHard: 5,
  dictation: 15,
  dailyQuestAll: 20,
} as const

/** 难度权重：按 BNC 词频分档（§4.1） */
export function difficultyWeight(bncRank: number | undefined): number {
  if (!bncRank || bncRank <= 0) return 1.6
  if (bncRank <= 2000) return 1.0
  if (bncRank <= 5000) return 1.3
  return 1.6
}

/**
 * 战力 = Σ(掌握词难度权重) + 精听完成句数 × 3 + 听写正确率加成（§4.1）
 * M0/M1 尚无听力数据时后两项为 0。
 */
export function computePower(opts: {
  masteredWeights: number[]
  listeningSentences?: number
  dictationAccuracy?: number
}): number {
  const vocab = opts.masteredWeights.reduce((a, b) => a + b, 0)
  const listening = (opts.listeningSentences ?? 0) * 3
  const accBonus = opts.dictationAccuracy ? Math.round(opts.dictationAccuracy * 100) : 0
  return Math.round(vocab + listening + accBonus)
}

export const COIN_RULES = {
  questEach: 15,
  questAll: 30,
  achievement: 20,
  streakMilestone: 25,
} as const

export const FREEZE_RULES = {
  streakDaysPerFreeze: 7,
  coinPrice: 200,
} as const
