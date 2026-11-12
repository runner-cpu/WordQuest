# WordQuest 学习闭环分批交付记录

执行日期：2026-11-12。依据用户 A–G 指令；用户明确在全部工程完成后统一核验解析。

## 批次 A 完成报告（工程已完成，内容待人工核验）

### 改动摘要
- 独立解析索引按来源及原卷 revision 关联，不改动原题和参考答案；解析随应用构建缓存。
- 接入 2026 年 6 月四级第 1 套阅读 46–55 题的 10 份草稿，包含原文引用、干扰项解释和表达对照。全部 `verified:false`。
- 已核对题的订正导航就地展开解析，无解析明确回退；继续未答题不会自动透露答案。
- 证据带题号追加到原有复盘笔记，重复点击不重复追加；继续使用自动保存、跨页合并和冲突处理。
- 统计页显示已有解析的已做题比例、待核验数量；复盘题号有解析标记。

### 文件清单
- 新增：`src/core/cetExplanations.ts`、`src/core/cetAnalysisCoverage.ts`、`src/data/cetExplanations.json`、`src/features/CetQuestionAnalysis.tsx`。
- 修改：`src/types/cetReadyPaper.ts`、`src/features/CetReadyWorkspace.tsx`、`src/features/CetProgressReport.tsx`、`src/features/cetReadyWorkspace.css`、`DESIGN.md`。
- 新增测试：`test/cetExplanations.test.ts`、`test/cetAnalysisCoverage.test.ts`、`e2e/batch-a.spec.ts`、共用 `e2e/helpers.ts`。
- 文档：`docs/cet-analysis-review-2026-11-02.md`、实施计划及本记录。

### 数据结构与迁移
无持久化结构变更，数据库仍为 schema 7。新增可选解析类型，数据保存在独立静态索引中，不改变原卷哈希或用户历史。

### 测试
- 单元测试新增 9 项，总计 **154/154** 通过。
- 浏览器流程新增 3 项，总计 **9/9** 通过；包含证据笔记重开后保留、无解析回退、未答题不提前显示答案。
- `npm run typecheck`、`npm run build` 通过。
- 浏览器回归继续覆盖跨标签草稿、离线录音、手机/平板/桌面/横屏及明暗主题。

### 已知边界与 TODO
- 10 题尚未经人工核验，不能满足原验收中 `verified:true` 的内容要求。49、52、53 题疑点已逐项记录，用户稍后统一核验。
- 现有听力答案文件缺少可引用的完整转写，未编造听力证据；待补清单在审阅稿中。
- 解析覆盖为部分卷别，不把草稿解析视为考试院官方发布内容。

### 对现有基线的影响
145 项原单测与 6 项原浏览器流程全部保留并通过。无新增依赖、无数据清空、无原始素材修改。审查发现并修复了未答题答案提前展开及选词解析列宽问题。

## 批次 B 完成报告

### 改动摘要
- 当前站内版本首次正确每题 2 XP/1 金币，首次订正正确 3 XP/1 金币，本轮有新增单题依据的订正另加 1 XP/1 金币；结算分三行显示。
- 每题首次状态和各奖励种类凭据按来源、版本、题号保存；跨档案、分区交叉核对、刷新、重复提交和双标签共用凭据。
- 单题依据记录自己的保存时刻及所基于的错误提交；旧公共笔记不自动获得证据加成。证据可从解析追加，也可手写；双页冲突保留两份并明确选择。
- 新增两项真题订正成就，保留原 68 个 ID。成就说明依据本机学习行为，不是能力认证。表达维持独立 3 XP/1 金币、辅助及同日重复 0，并补清晰说明。

### 文件清单
- 新增：`src/core/cetRewards.ts`、`test/cetRewards.test.ts`、`test/cetRewardProgress.test.ts`、`e2e/batch-b.spec.ts`。
- 修改：`src/types/model.ts`、`src/types/cetPaper.ts`、`src/db/database.ts`、`src/core/cetPapers.ts`、`src/core/backup.ts`、`src/core/progress.ts`、`src/core/achievements.ts`。
- 界面：`src/features/CetReadyWorkspace.tsx`、`src/features/CetQuestionAnalysis.tsx`、`src/features/cetReadyWorkspace.css`、`src/features/ExpressionPractice.tsx`。
- 回归测试：`test/backup.test.ts`、`test/achievements.test.ts`、`test/cetPapers.test.ts`、`test/cetPractice.test.ts`。

### 数据结构与迁移
数据库增量升级至 schema 8，保留 1–7 版本。Profile 增加可选 `cetRewardProgress`，真题档案增加可选 `correctionEvidence`；旧档案建立无补奖基线。凭据与余额、每日经验在同一事务更新；导入以凭据并集合并、余额取既有最大值策略，不补发奖励。旧备份缺新字段不会清空本地记录。

### 测试
- 新增 22 项单元测试，总计 **176/176** 通过；覆盖完整回滚、并发、跨档案、修改答案键、部分答题、旧笔记隔离与重复备份。
- 新增 3 项浏览器流程，总计 **12/12** 通过：三类奖励及刷新去重、双标签共用一次凭据、订正依据冲突恢复。
- `npm run typecheck`、`npm run build` 通过。
- 原 schema 数字断言从 7 更新为真实版本 8，成就总数断言更新为 70，同时新增原 68 个 ID 全部保留的证明，未删除原行为断言。

### 已知边界与 TODO
奖励表示记录到的本机学习行为，不验证手写依据的质量。词汇掌握奖励接口预留，尚未提前更改词汇规则，按批次 D 统一处理。未新增断签惩罚。

### 对现有基线的影响
原单测与 6 项原浏览器流程继续通过。自带资料的原提交 API 保持原有不发奖励行为；奖励入口只接受通过版本及内容散列验证的站内卷。

## 批次 C 完成报告

### 改动摘要
- 原创短练与句子练习复用精听播放器：逐句、单句循环、手动 A/B、0.75/1/1.25/1.5 倍速、空格和左右键；实际起播后才显示播放中，载入超时可重试，切材料与退出停止。
- 独立句子优先直接使用内置 MP3；全文以实际媒体时长估算边界，界面明确“时间轴为机器估算/待校对”。参考原文默认折叠，标明不是考试字幕。
- 真题完整区间支持题组循环；无定位仍有完整录音与手动 A/B。核对发现 60 组起止完整、2 组仅起点、14 组无起点，未编造后两类终点。
- 静态时间轴索引提供人工补录格式，只有 verified:true 且文本/时长一致的覆盖才采用。新增数据随脚本缓存离线；原完整 MP3 与资源散列未修改。

### 文件清单
- 新增：src/core/intensiveListening.ts、src/data/originalTimelines.json、src/features/IntensiveListeningPlayer.tsx、src/features/intensiveListening.css、src/features/CetListeningPlayer.tsx。
- 修改：src/features/ExamPlayer.tsx、src/features/ListeningPage.tsx、src/features/CetReadyWorkspace.tsx、src/features/cetReadyWorkspace.css。
- 测试与清单：test/intensiveListening.test.ts、e2e/batch-c.spec.ts、docs/listening-location-todo.md。

### 数据结构与迁移
无数据库变更，继续 schema 8。手动 A/B 仅在本次会话生效；静态 JSON 的人工时间轴字段独立于原音频。

### 测试
- 新增 9 项单测，合计 185/185 通过；覆盖切句、边界、倍速、循环和人工覆盖校验。
- 新增 2 项浏览器流程，合计 14/14 通过；覆盖真实起播、逐句循环、A/B、快捷键、真题循环和无定位提示。原离线真实重听流程继续通过。
- typecheck、build 通过。CSS 置于懒加载页入口，保留原组件服务端渲染测试。

### 已知边界与 TODO
人工核验的逐句时间轴尚未补录。原指令“62 组起始定位”不能等同于“62 组完整区间”；实际 2 组只有起点，已提供手动区间且逐项登记来源与版本。

### 对现有基线的影响
保留全部原测试与原音频字节，无新增依赖或用户记录清理。

## 批次 D 完成报告

### 改动摘要
- 到期词没有准确拼写/听写日志时优先主动提取；新词同轮先选择接触，再有独立拼写环节。可选错题重练有上限。
- 掌握须同时满足原 FSRS 间隔门槛与至少一次准确产出。新记录的一处笔误仍按原规则反馈和调度，但不计入产出证据；结算和成就使用统一状态。
- 词书增加熟词快速自查，英文/释义检索、按需展开词义、标记暂停与恢复；主学习、关卡与攻坚队列均过滤，历史不删除。
- 默认新词 10 个并标为推荐，老设置保留；今日积压提示先复习，统计显示产出覆盖及掌握依据。

### 文件清单
- 新增：src/core/vocabProgress.ts、src/features/FamiliarWords.tsx、test/vocabProgress.test.ts、test/vocabSession.test.ts、e2e/batch-d.spec.ts。
- 修改：types/model、core/fsrs、profile、session、backup、db/database，以及 Battle、WordsPage、StatsPage、MePage、SettingsPage、TodayPage。
- 回归：test/unit、backup、sessionPlan、sessionConcurrency、cetPapers、cetPractice、cetRewards。

### 数据结构与迁移
schema 9 保留全部旧迁移，增加可选 productionCorrectCount、日志 nearMiss 与 Profile.familiarWords。产出从日志重建，FSRS 原快照不变；更新当前战力，保留峰值、段位、余额和已获成就。熟词恢复也有时间凭据，备份逐词合并，旧备份不会复活较旧排除。仅快照且无日志不能证明产出。

### 测试
- 新增 10 项单测，195/195 通过；包括掌握门槛、产出题型、同轮队列、熟词恢复、迁移不改调度与旧备份合并。
- 新增 3 条浏览器流程，17/17 通过；覆盖保守目标、到期提取、完成与重开一轮、新词选择后拼写、熟词暂停与恢复。
- typecheck、build 通过。schema 数字断言更新到9，原断言保留；原仅长间隔掌握断言扩展成有/无产出两分支。

### 已知边界与 TODO
历史日志未记录 nearMiss，旧正确拼写只能按已有记录识别。熟词是自我安排标记，不代表掌握或词汇量认证；产出次数也不是能力认证。

### 对现有基线的影响
145 项原单测和6条原浏览器流程均保留并通过；不更改FSRS算法，不新增依赖。每轮按最多24个词组织，新词额外产出次数单独表达，结算词单去重。
