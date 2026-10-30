import type { ReviewLog } from '../types/model'
import { todayKey } from '../db/database'

export type AchievementCategory = '坚持' | '词汇' | '复习' | '拼写' | '听力' | '运用'

export interface AchievementCtx {
  streak: number
  mastered: number
  learned: number
  bookMasteryRatio: number
  listeningSentences: number
  listeningSeconds: number
  listeningDays: number
  perfectDays: number
  accuracyStreakDays: number
  maxCombo: number
  totalAnswered: number
  studyDays: number
  reviewsDone: number
  correctReviews: number
  recoveredWords: number
  relearnedWords: number
  spellingCorrect: number
  spellingWords: number
  listeningSpellCorrect: number
  spellingStreak: number
  adventureCompleted: number
  adventurePerfect: number
  expressionIndependent: number
  expressionRetained: number
  learningDimensions: number
}

export interface AchievementDef {
  id: string
  name: string
  desc: string
  category: AchievementCategory
  unit: string
  check: (ctx: AchievementCtx) => boolean
  progress: (ctx: AchievementCtx) => [number, number]
  hidden?: boolean
}

function milestone(
  id: string, name: string, desc: string, category: AchievementCategory,
  metric: keyof AchievementCtx, target: number, unit: string, hidden = false,
): AchievementDef {
  return {
    id, name, desc, category, unit, hidden,
    check: (ctx) => ctx[metric] >= target,
    progress: (ctx) => [Math.max(0, Math.min(target, ctx[metric])), target],
  }
}

/** 旧 ID 保持稳定；旧版已获奖的记录继续有效。每项新条件都可由学习数据验证。 */
export const ACHIEVEMENTS: AchievementDef[] = [
  milestone('streak-1', '初出茅庐', '完成第 1 天学习打卡', '坚持', 'streak', 1, '天'),
  milestone('streak-7', '七日之约', '连续打卡 7 天', '坚持', 'streak', 7, '天'),
  milestone('streak-14', '两周相伴', '连续打卡 14 天', '坚持', 'streak', 14, '天'),
  milestone('streak-30', '三十而立', '连续打卡 30 天', '坚持', 'streak', 30, '天'),
  milestone('streak-60', '双月同行', '连续打卡 60 天', '坚持', 'streak', 60, '天'),
  milestone('streak-100', '百日筑基', '连续打卡 100 天', '坚持', 'streak', 100, '天'),
  milestone('streak-180', '半年之志', '连续打卡 180 天', '坚持', 'streak', 180, '天'),
  milestone('streak-365', '寒来暑往', '连续打卡 365 天', '坚持', 'streak', 365, '天'),
  milestone('word-1', '第一块基石', '掌握第 1 个单词', '词汇', 'mastered', 1, '词'),
  milestone('word-50', '小试牛刀', '掌握 50 个单词', '词汇', 'mastered', 50, '词'),
  milestone('word-100', '百词斩', '掌握 100 个单词', '词汇', 'mastered', 100, '词'),
  milestone('word-300', '三百勇士', '掌握 300 个单词', '词汇', 'mastered', 300, '词'),
  milestone('word-500', '半千之壁', '掌握 500 个单词', '词汇', 'mastered', 500, '词'),
  milestone('word-1000', '千军万马', '掌握 1000 个单词', '词汇', 'mastered', 1000, '词'),
  milestone('word-2000', '词海泛舟', '掌握 2000 个单词', '词汇', 'mastered', 2000, '词'),
  milestone('word-3000', '三千越甲', '掌握 3000 个单词', '词汇', 'mastered', 3000, '词'),
  { ...milestone('cet4-90', '四级通关', '四级全本 3837 词中掌握至少 90%', '词汇', 'bookMasteryRatio', 0.9, '%'),
    progress: (ctx) => [Math.min(90, Math.floor(ctx.bookMasteryRatio * 1000) / 10), 90] },
  milestone('learn-500', '词汇拓荒者', '累计接触并练习过 500 个不同单词', '词汇', 'learned', 500, '词'),
  milestone('listen-1', '侧耳倾听', '完成第 1 句精听练习', '听力', 'listeningSentences', 1, '句'),
  milestone('listen-20', '耳熟能详', '累计完成 20 句精听练习', '听力', 'listeningSentences', 20, '句'),
  milestone('listen-50', '渐入佳境', '累计完成 50 句精听练习', '听力', 'listeningSentences', 50, '句'),
  milestone('listen-100', '顺风耳', '累计完成 100 句精听练习', '听力', 'listeningSentences', 100, '句'),
  milestone('listen-300', '听见更远', '累计完成 300 句精听练习', '听力', 'listeningSentences', 300, '句'),
  milestone('listen-perfect-20', '一周听感', '在 7 个不同日期练过听力', '听力', 'listeningDays', 7, '天'),
  milestone('listen-speed', '听力起步', '累计完成 10 句精听练习', '听力', 'listeningSentences', 10, '句'),
  milestone('listen-marathon', '听力积木', '累计精听 30 分钟，可分多次完成', '听力', 'listeningSeconds', 1800, '秒'),
  milestone('combo-10', '手感渐热', '连续答对 10 道单词题，可跨学习轮次', '复习', 'maxCombo', 10, '题'),
  milestone('combo-25', '复习熟手', '累计答对 25 次复习题', '复习', 'correctReviews', 25, '次'),
  milestone('combo-perfect', '稳稳一日', '有一天至少答 20 道单词题且全部答对', '复习', 'perfectDays', 1, '天'),
  milestone('combo-steady', '七日稳进', '曾连续 7 个自然日每天答至少 5 题且正确率不低于 90%', '复习', 'accuracyStreakDays', 7, '天'),
  milestone('combo-night', '有始有终', '累计在 7 个不同日期学习，不要求连续', '坚持', 'studyDays', 7, '天'),
  milestone('combo-50', '温故知新', '累计答对 50 次复习题', '复习', 'correctReviews', 50, '次'),
  milestone('fail-day', '再见已会', '有 1 个答错的词，在之后另一天答对', '复习', 'recoveredWords', 1, '词'),
  milestone('fail-triple', '记忆回春', '有 1 个词先答对、后来答错，再在之后另一天答对', '复习', 'relearnedWords', 1, '词'),
  milestone('fail-hard20', '重拾二十', '20 个答错的词，分别在之后另一天答对', '复习', 'recoveredWords', 20, '词'),
  milestone('hide-early', '一路同行', '累计在 30 个不同日期学习', '坚持', 'studyDays', 30, '天', true),
  milestone('hide-nearmiss', '笔尖稳了', '连续 10 道拼写练习被判正确', '拼写', 'spellingStreak', 10, '题', true),
  milestone('hide-collector', '四路开花', '词汇、复习、拼写、听力、情景运用中已练习任意 4 类', '运用', 'learningDimensions', 4, '类', true),
  milestone('hide-broke', '记忆回声', '10 个曾答对又遗忘的词，在答错之后另一天重新答对', '复习', 'relearnedWords', 10, '词', true),
  milestone('hide-marathon', '万题长征', '累计完成 10000 道单词题', '坚持', 'totalAnswered', 10000, '题', true),
  milestone('review-1', '温故第一步', '完成第 1 次单词复习', '复习', 'reviewsDone', 1, '次'),
  milestone('review-50', '常见常新', '累计完成 50 次单词复习', '复习', 'reviewsDone', 50, '次'),
  milestone('review-200', '记忆养护员', '累计完成 200 次单词复习', '复习', 'reviewsDone', 200, '次'),
  milestone('review-500', '记忆长跑', '累计完成 500 次单词复习', '复习', 'reviewsDone', 500, '次'),
  milestone('review-1000', '千次回响', '累计完成 1000 次单词复习', '复习', 'reviewsDone', 1000, '次'),
  milestone('recover-5', '重逢五词', '5 个答错的词，分别在之后另一天答对', '复习', 'recoveredWords', 5, '词'),
  milestone('recover-10', '找回十词', '10 个答错的词，分别在之后另一天答对', '复习', 'recoveredWords', 10, '词'),
  milestone('spell-1', '落笔有声', '第 1 道拼写练习被判正确', '拼写', 'spellingCorrect', 1, '次'),
  milestone('spell-25', '写得出来', '累计 25 道拼写练习被判正确', '拼写', 'spellingCorrect', 25, '次'),
  milestone('spell-100', '百次落笔', '累计 100 道拼写练习被判正确', '拼写', 'spellingCorrect', 100, '次'),
  milestone('spell-300', '拼写工匠', '累计 300 道拼写练习被判正确', '拼写', 'spellingCorrect', 300, '次'),
  milestone('listen-spell-25', '听到就会写', '累计 25 道听音拼写练习被判正确', '拼写', 'listeningSpellCorrect', 25, '次'),
  milestone('spell-words-50', '五十词在手', '50 个不同单词的拼写练习被判正确', '拼写', 'spellingWords', 50, '词'),
  milestone('study-days-3', '再来三次', '累计在 3 个不同日期学习，不要求连续', '坚持', 'studyDays', 3, '天'),
  milestone('study-days-14', '两周足迹', '累计在 14 个不同日期学习，不要求连续', '坚持', 'studyDays', 14, '天'),
  milestone('study-days-60', '六十枚脚印', '累计在 60 个不同日期学习，不要求连续', '坚持', 'studyDays', 60, '天'),
  milestone('study-days-180', '长久相伴', '累计在 180 个不同日期学习，不要求连续', '坚持', 'studyDays', 180, '天'),
  milestone('adventure-1', '情景第一站', '通过 1 个不同的原创情景，每个至少答对 2/3 题', '运用', 'adventureCompleted', 1, '场景'),
  milestone('adventure-3', '三站旅人', '通过 3 个不同的原创情景，每个至少答对 2/3 题', '运用', 'adventureCompleted', 3, '场景'),
  milestone('adventure-6', '越走越远', '通过 6 个不同的原创情景，每个至少答对 2/3 题', '运用', 'adventureCompleted', 6, '场景'),
  milestone('adventure-9', '生活通行证', '通过全部 9 个原创情景，每个至少答对 2/3 题', '运用', 'adventureCompleted', 9, '场景'),
  milestone('adventure-perfect-1', '应对自如', '1 个原创情景的单次练习答对全部 3 题', '运用', 'adventurePerfect', 1, '场景'),
  milestone('adventure-perfect-3', '句句到位', '3 个不同原创情景的单次练习答对全部 3 题', '运用', 'adventurePerfect', 3, '场景'),
  milestone('adventure-perfect-9', '九站全星', '全部 9 个原创情景的单次练习都曾答对全部 3 题', '运用', 'adventurePerfect', 9, '场景'),
  milestone('expression-1', '自己说一句', '第 1 个不同短语在首次或到期练习中不看提示独立写出', '运用', 'expressionIndependent', 1, '表达'),
  milestone('expression-6', '六句随身带', '6 个不同短语在首次或到期练习中不看提示独立写出', '运用', 'expressionIndependent', 6, '表达'),
  milestone('expression-18', '表达行囊', '全部 18 个短语都曾在首次或到期练习中不看提示独立写出', '运用', 'expressionIndependent', 18, '表达'),
  milestone('expression-recall-3', '隔日仍记得', '3 个不同短语各自在至少 2 个不同日期的首次或到期练习中独立想起', '运用', 'expressionRetained', 3, '表达'),
]

export function achievementProgress(achievement: AchievementDef, ctx: AchievementCtx) {
  const [current, target] = achievement.progress(ctx)
  return { current, target, ratio: Math.min(1, current / Math.max(1, target)), remaining: Math.max(0, target - current) }
}

/** 隐藏成就不参与推荐，避免通过追踪或进度暴露条件。 */
export function achievementTarget(ctx: AchievementCtx, unlocked: ReadonlySet<string>, pinnedId?: string) {
  const pinned = ACHIEVEMENTS.find((achievement) => achievement.id === pinnedId && !achievement.hidden)
  if (pinned) return pinned
  return ACHIEVEMENTS.filter((achievement) => !achievement.hidden && !unlocked.has(achievement.id))
    .sort((a, b) => achievementProgress(b, ctx).ratio - achievementProgress(a, ctx).ratio)[0]
}

export interface AchievementLogFacts {
  correctReviews: number
  recoveredWords: number
  relearnedWords: number
  spellingCorrect: number
  spellingWords: number
  listeningSpellCorrect: number
  spellingStreak: number
  maxCombo: number
}

export function createAchievementLogAccumulator() {
  const words = new Map<string, { seen: boolean; correct: boolean; wrongDay?: string; forgotten: boolean }>()
  const recovered = new Set<string>()
  const relearned = new Set<string>()
  const spelled = new Set<string>()
  const facts: AchievementLogFacts = { correctReviews: 0, recoveredWords: 0, relearnedWords: 0, spellingCorrect: 0, spellingWords: 0, listeningSpellCorrect: 0, spellingStreak: 0, maxCombo: 0 }
  let correctRun = 0
  let spellRun = 0
  return {
    add(log: ReviewLog) {
      const state = words.get(log.wordId) ?? { seen: false, correct: false, forgotten: false }
      const day = todayKey(new Date(log.reviewedAt))
      if (log.correct) {
        correctRun++
        facts.maxCombo = Math.max(facts.maxCombo, correctRun)
        if (state.seen) facts.correctReviews++
        if (state.wrongDay && day > state.wrongDay) {
          recovered.add(log.wordId)
          if (state.forgotten) relearned.add(log.wordId)
        }
        state.correct = true
      } else {
        correctRun = 0
        state.wrongDay = day
        if (state.correct) state.forgotten = true
      }
      if (log.mode === 'spell' || log.mode === 'listen-spell') {
        spellRun = log.correct ? spellRun + 1 : 0
        facts.spellingStreak = Math.max(facts.spellingStreak, spellRun)
        if (log.correct) {
          facts.spellingCorrect++
          spelled.add(log.wordId)
          if (log.mode === 'listen-spell') facts.listeningSpellCorrect++
        }
      }
      state.seen = true
      words.set(log.wordId, state)
      facts.recoveredWords = recovered.size
      facts.relearnedWords = relearned.size
      facts.spellingWords = spelled.size
    },
    snapshot: (): AchievementLogFacts => ({ ...facts }),
  }
}

export function summarizeAchievementLogs(logs: readonly ReviewLog[]): AchievementLogFacts {
  const accumulator = createAchievementLogAccumulator()
  for (const log of [...logs].sort((a, b) => a.reviewedAt - b.reviewedAt || a.id.localeCompare(b.id))) accumulator.add(log)
  return accumulator.snapshot()
}
