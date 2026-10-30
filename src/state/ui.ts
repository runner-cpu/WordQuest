import { create } from 'zustand'
import type { Profile } from '../types/model'

export type Tab = 'today' | 'words' | 'listening' | 'stats' | 'me'

interface UiState {
  tab: Tab
  setTab: (t: Tab) => void
  todaySection: 'cet-prep' | null
  openCetPrep: () => void
  clearTodaySection: () => void
  profile: Profile | null
  setProfile: (p: Profile) => void
  toast: { id: number; text: string; kind: 'info' | 'xp' | 'levelup' } | null
  pushToast: (text: string, kind?: 'info' | 'xp' | 'levelup') => void
  clearToast: () => void
}

export const useUi = create<UiState>((set) => ({
  tab: 'today',
  setTab: (tab) => set({ tab, todaySection: null }),
  todaySection: null,
  openCetPrep: () => set({ tab: 'today', todaySection: 'cet-prep' }),
  clearTodaySection: () => set({ todaySection: null }),
  profile: null,
  setProfile: (profile) => set({ profile }),
  toast: null,
  pushToast: (text, kind = 'info') => {
    const id = Date.now()
    set({ toast: { id, text, kind } })
    setTimeout(() => {
      set((s) => (s.toast?.id === id ? { toast: null } : s))
    }, 2400)
  },
  clearToast: () => set({ toast: null }),
}))
