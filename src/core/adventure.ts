import { ADVENTURE_SCENES } from '../data/adventures'
import { db } from '../db/database'
import type { AdventureProgress } from '../types/model'
import { bumpDaily, ensureProfile, patchProfile } from './profile'
import { settleStreak } from './progress'

export interface AdventureAnswer {
  questionId: string
  optionIndex: number
}

export interface AdventureResult {
  score: number
  total: number
  stars: number
  newCorrect: number
  xp: number
  coins: number
  progress: AdventureProgress
}

/** 完整提交一场情景练习；每道题只在首次答对时发放奖励。 */
export async function finishAdventure(
  sceneId: string,
  answers: AdventureAnswer[],
  elapsedMs: number,
): Promise<AdventureResult> {
  const scene = ADVENTURE_SCENES.find((candidate) => candidate.id === sceneId)
  if (!scene) throw new Error('未找到这个情景，请返回冒险地图重试')
  const questionIds = new Set(scene.questions.map((question) => question.id))
  if (scene.questions.length !== 3 || questionIds.size !== 3 || scene.questions.some((question) =>
    !question.id || !Array.isArray(question.options) || question.options.length < 2 ||
    !Number.isInteger(question.answer) || question.answer < 0 || question.answer >= question.options.length)) {
    throw new Error('情景题目不完整，暂时无法提交')
  }
  if (!Array.isArray(answers) || answers.length !== scene.questions.length) {
    throw new Error('请完成本情景的全部三道题')
  }
  const selected = new Map<string, number>()
  for (const answer of answers) {
    if (!answer || typeof answer.questionId !== 'string' || !questionIds.has(answer.questionId)) {
      throw new Error('答案中包含不属于本情景的题目')
    }
    if (selected.has(answer.questionId)) throw new Error('同一道题不能重复提交')
    const question = scene.questions.find((item) => item.id === answer.questionId)!
    if (!Number.isInteger(answer.optionIndex) || answer.optionIndex < 0 || answer.optionIndex >= question.options.length) {
      throw new Error('请选择题目提供的有效选项')
    }
    selected.set(answer.questionId, answer.optionIndex)
  }
  if (!Number.isFinite(elapsedMs)) throw new Error('练习用时无效，请重新进入情景')
  const studySeconds = Math.max(0, Math.min(600, Math.round(elapsedMs / 1000)))
  const correctIds = scene.questions
    .filter((question) => selected.get(question.id) === question.answer)
    .map((question) => question.id)
  const score = correctIds.length

  return db.transaction('rw', [db.adventures, db.profile, db.dailyLogs], async () => {
    // 进度和账户都在写事务内读取；双击或另一标签页同时交卷也不会重复领奖。
    const previous = await db.adventures.get(sceneId)
    const alreadyCorrect = new Set(previous?.correctQuestionIds ?? [])
    const newCorrect = correctIds.filter((id) => !alreadyCorrect.has(id)).length
    const xp = newCorrect * 3
    const coins = newCorrect
    const now = Date.now()
    const progress: AdventureProgress = {
      sceneId,
      bestScore: Math.max(previous?.bestScore ?? 0, score),
      attempts: (previous?.attempts ?? 0) + 1,
      correctQuestionIds: [...new Set([...alreadyCorrect, ...correctIds])],
      firstPlayedAt: previous?.firstPlayedAt ?? now,
      lastPlayedAt: now,
      ...(previous?.completedAt !== undefined
        ? { completedAt: previous.completedAt }
        : score >= 2 ? { completedAt: now } : {}),
    }
    const profile = await ensureProfile()
    await db.adventures.put(progress)
    await bumpDaily({ studySeconds, xp, coinsEarned: coins })
    await patchProfile({ xp: profile.xp + xp, coins: profile.coins + coins })
    // 只登记真实用时与奖励；情景练习不改变词汇正确率、新词量或 FSRS 卡片。
    await settleStreak()
    return { score, total: scene.questions.length, stars: score, newCorrect, xp, coins, progress }
  })
}
