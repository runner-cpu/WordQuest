import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { CET_PAPER_SOURCES } from '../data/cetPaperSources'
import { buildPaperReport } from '../core/learningReport'
import { buildCetAnalysisCoverage } from '../core/cetAnalysisCoverage'
import { buildCetStudyPlan } from '../core/cetStudyPlan'
import { useUi } from '../state/ui'
import { useStudyClock } from '../state/useStudyClock'
import { Panel, PixelButton, SectionHead } from '../ui/Pixel'

export function CetProgressReport() {
  const profile = useUi(state => state.profile)
  const level = profile?.examType ?? 'cet4'
  const setTab = useUi(state => state.setTab)
  const openCetPrep = useUi(state => state.openCetPrep)
  const now = useStudyClock()
  const data = useLiveQuery(async () => {
    const [papers, practices] = await Promise.all([db.cetPapers.toArray(), db.cetPractice.where('examType').equals(level).toArray()])
    const sourceIds = new Set(CET_PAPER_SOURCES.filter(source => source.level === level).map(source => source.id))
    const studies = papers.filter(paper => sourceIds.has(paper.sourceId))
    return { studies, report: buildPaperReport(studies), coverage: buildCetAnalysisCoverage(studies), practices }
  }, [level])
  if (!data) return <Panel><p role="status" className="readable text-dim">正在读取真题与专项记录…</p></Panel>
  const { studies, report, coverage, practices } = data
  const pending = report.sections.reduce((sum, section) => sum + section.pending, 0)
  const plan = buildCetStudyPlan(profile ?? {}, studies, new Date(now))
  const hasActivity = report.papers > 0 || practices.some(row => row.draft.trim() || row.revision?.text.trim() || row.completedAt)
  return <Panel as="section" className="cet-progress-report">
    <SectionHead>{level === 'cet4' ? '四级' : '六级'}练习报告</SectionHead>
    <p className="readable text-dim">{hasActivity ? `已练 ${report.papers} 套真题 · 待订正 ${pending} 题` : '从一段听力或一篇阅读开始，作答和核对后就能看到各题型记录。'}</p>
    <p className="readable mt-3 text-dim">已有解析的已做题 {coverage.covered}/{coverage.answered} · 人工已核验 {coverage.verified} 题{coverage.pendingReview > 0 ? ` · 待人工核验 ${coverage.pendingReview} 题` : ''}。解析覆盖为部分卷别；草稿解析仅供复盘参考。</p>
    {report.papers > 0 && <>
      <div className="overflow-x-auto mt-3">
        <table className="learning-report-table readable">
          <caption className="sr-only">真题分题型首次核对表现与最近待订正题数</caption>
          <thead><tr><th scope="col">题型</th><th scope="col">已答</th><th scope="col">首次正确</th><th scope="col">待订正</th></tr></thead>
          <tbody>{report.sections.map(section => <tr key={section.id}><th scope="row">{section.name}</th><td>{section.answered}</td><td>{section.compared ? `${section.firstCorrect}/${section.compared}` : '未核对'}</td><td>{section.pending}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="readable mt-3 text-dim">写作草稿 {report.writing} 份 · 翻译草稿 {report.translation} 份。初稿或修订稿有文字即计入，数量不代表完成自查或达到考试要求。</p>
      <p className="readable mt-2 text-dim">每套同版本试卷取最近有作答的档案，首次与订正分开统计。样本量和题型不同，不能据此换算考试分数。</p>
    </>}
    {practices.some(row => row.completedAt) && <p className="readable mt-3 text-dim">原创专项已完成 {practices.filter(row => row.completedAt).length} 项；与真题记录分开统计。</p>}
    <section className="mt-4 border-t-2 border-edge pt-4" aria-label="下一步建议">
      <h3 className="text-px12 text-gold">下一步建议 · {plan.stageLabel}</h3>
      <p className="readable mt-2 text-dim">{plan.stageReason}</p>
      <p className="readable mt-3 text-bright">{plan.title}</p>
      <p className="readable mt-2 text-dim">{plan.reason}</p>
      {plan.coverageNote && <p className="readable mt-2 text-dim">{plan.coverageNote}</p>}
      <PixelButton className="mt-3" variant="primary" onClick={() => {
        if (plan.target === 'vocabulary') setTab('words')
        else if (plan.target === 'listening') setTab('listening')
        else openCetPrep()
      }}>{plan.target === 'vocabulary' ? '去单词页选择学习内容' : plan.target === 'listening' ? '去听力页选择练习' : '去备考台选择题型'}</PixelButton>
    </section>
    <div className="flex flex-wrap gap-2 mt-4"><PixelButton onClick={() => setTab('listening')}>练听力</PixelButton><PixelButton onClick={openCetPrep}>练阅读与写译</PixelButton></div>
  </Panel>
}
