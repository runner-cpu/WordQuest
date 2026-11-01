import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { CET_PAPER_SOURCES } from '../data/cetPaperSources'
import { buildPaperReport } from '../core/learningReport'
import { useUi } from '../state/ui'
import { Panel, PixelButton, SectionHead } from '../ui/Pixel'

export function CetProgressReport() {
  const level = useUi(state => state.profile?.examType ?? 'cet4')
  const setTab = useUi(state => state.setTab)
  const openCetPrep = useUi(state => state.openCetPrep)
  const data = useLiveQuery(async () => {
    const [papers, practices] = await Promise.all([db.cetPapers.toArray(), db.cetPractice.where('examType').equals(level).toArray()])
    const sourceIds = new Set(CET_PAPER_SOURCES.filter(source => source.level === level).map(source => source.id))
    return { report: buildPaperReport(papers.filter(paper => sourceIds.has(paper.sourceId))), practices }
  }, [level])
  if (!data) return <Panel><p role="status" className="readable text-dim">正在读取真题与专项记录…</p></Panel>
  const { report, practices } = data
  const pending = report.sections.reduce((sum, section) => sum + section.pending, 0)
  const priority = [...report.sections].sort((a, b) => b.pending - a.pending)[0]
  const hasActivity = report.papers > 0 || practices.some(row => row.draft.trim() || row.completedAt)
  return <Panel as="section" className="cet-progress-report">
    <SectionHead>{level === 'cet4' ? '四级' : '六级'}练习报告</SectionHead>
    <p className="readable text-dim">{hasActivity ? `已练 ${report.papers} 套真题 · 待订正 ${pending} 题` : '从一段听力或一篇阅读开始，作答和核对后就能看到各题型记录。'}</p>
    {report.papers > 0 && <>
      <div className="overflow-x-auto mt-3">
        <table className="learning-report-table readable">
          <caption className="sr-only">真题分题型首次核对表现与最近待订正题数</caption>
          <thead><tr><th scope="col">题型</th><th scope="col">已答</th><th scope="col">首次正确</th><th scope="col">待订正</th></tr></thead>
          <tbody>{report.sections.map(section => <tr key={section.id}><th scope="row">{section.name}</th><td>{section.answered}</td><td>{section.compared ? `${section.firstCorrect}/${section.compared}` : '未核对'}</td><td>{section.pending}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="readable mt-3 text-dim">写作草稿 {report.writing} 份 · 翻译草稿 {report.translation} 份。草稿数量不代表完成自查或达到考试要求。</p>
      <p className="readable mt-2 text-dim">每套同版本试卷取最近有作答的档案，首次与订正分开统计。样本量和题型不同，不能据此换算考试分数。</p>
      {pending > 0 && <p className="readable mt-3 text-gold">下一步：先复盘「{priority.name}」的 {priority.pending} 道错题，找出原文或录音依据后再核对。</p>}
    </>}
    {practices.some(row => row.completedAt) && <p className="readable mt-3 text-dim">原创专项已完成 {practices.filter(row => row.completedAt).length} 项；与真题记录分开统计。</p>}
    <div className="flex flex-wrap gap-2 mt-4"><PixelButton onClick={() => setTab('listening')}>练听力</PixelButton><PixelButton onClick={openCetPrep}>练阅读与写译</PixelButton></div>
  </Panel>
}
