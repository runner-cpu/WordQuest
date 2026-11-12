import { getCetAnalysis } from './cetExplanations'
import { latestNonemptyPaperStudies } from './learningReport'
import type { CetPaperStudy } from '../types/cetPaper'

/** Match the report's latest nonempty study per edition; repeated attempts are not extra samples. */
export function buildCetAnalysisCoverage(studies: CetPaperStudy[]) {
  let answered = 0, covered = 0, verified = 0
  for (const study of latestNonemptyPaperStudies(studies)) {
    for (let index = 0; index < study.answers.length; index++) {
      if (!study.answers[index]) continue
      answered++
      // Imported paper archives without a pinned edition cannot safely reuse built-in analysis.
      const analysis = study.paperRevision ? getCetAnalysis(study.sourceId, index + 1, study.paperRevision) : undefined
      if (!analysis) continue
      covered++
      if (analysis.verified) verified++
    }
  }
  return { answered, covered, verified, pendingReview: covered - verified }
}
