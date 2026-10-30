import { create } from 'zustand'
import type { Word } from '../types/model'

interface BattleStore {
  reviews: Word[]
  news: Word[]
  pool: Word[]
  /** 用户真实学过的词（含学习中），用于生成「眼熟」的干扰项 */
  knownWords: Word[]
  isOpen: boolean
  open: (d: { reviews: Word[]; news: Word[]; pool: Word[]; knownWords?: Word[] }) => void
  close: () => void
}

export const useBattle = create<BattleStore>((set) => ({
  reviews: [],
  news: [],
  pool: [],
  knownWords: [],
  isOpen: false,
  open: (d) => set({ knownWords: [], ...d, isOpen: true }),
  close: () => set({ isOpen: false, reviews: [], news: [], pool: [], knownWords: [] }),
}))
