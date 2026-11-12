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


## 批次 E 完成报告

### 改动摘要
- 写作与翻译共用双稿编辑区，初稿和修订稿分别保存，支持八类修改原因、各版三项自查和文本快照；继续修改只清除该版自查。
- 参考按完整句展开，合并 PDF 软换行；按段落位置近似提示，数量不同明确回退手动选择，不作语义匹配或自动评分。自带 PDF 档案也可手动对照。
- 真题工作区深比较修订对象，保留保存期间输入与双标签冲突选择；归档复用同一 CAS 流程。
- 原创专项保留原稿完成快照，顺序保存两版、同步事务后时间基线，后台和关闭时追平最新输入。

### 文件清单
- 新增：src/types/outputRevision.ts、src/core/outputRevision.ts、src/features/OutputRevisionEditor.tsx、test/outputRevision.test.ts、test/cetPaperDraft.test.ts、e2e/batch-e.spec.ts。
- 修改：types/cetPaper、types/model、db/database、core/cetPapers、cetPractice、backup、features/useCetPaperDraft、CetOutputExercise、CetReadyWorkspace、CetPaperWorkspace；对应备份和领域回归测试。

### 数据结构与迁移
schema 10 增量保留旧迁移。CetPaperStudy 增加可选 writingRevision/translationRevision；CetPracticeRecord 增加可选 revision。旧初稿和完成文本不改写。修订独立按保存时间合并；旧备份缺字段不会清除修订，仅修订有内容也计入备份进度保护。

### 测试
- 新增 19 项单测，共 214/214 通过；覆盖双稿、八类原因、检查失效、软换行、严格数据校验、深比较冲突、保存期间继续输入、备份往返与旧数据兼容。
- 新增 2 条浏览器流程，共 19/19 通过；覆盖主卷两版与原因持久化、参考手动对应、继续输入清除自查、手机原创初稿完成后修订并重开。
- typecheck、build、diff 检查通过。发现并修复词数 output 的隐含 status 与原保存状态选择器冲突；未修改或放宽原浏览器断言。

### 已知边界与 TODO
参考仅按位置辅助核对，表达质量与信息覆盖由学习者判断；缺少参考的卷别保留说明。自查标记不是自动评分，写译不发放题目正确奖励。

### 对现有基线的影响
原 145 项单测与 6 项浏览器流程全部保留通过。schema 数字断言同步为 10，无新依赖、无数据清理。独立代码复核未发现剩余输入丢失或自查错误标记问题。


## 批次 F 完成报告

### 改动摘要
- 首次设置和设置页共用可跳过的日期/自述基础选择，原三步引导保留；未选日期不代填，个人日期、预计场次与已公布来源分开说明。
- 根据个人日期给出基础积累、专项突破、真题模考或考前冲刺建议；日期过期单独提醒，所有入口继续可用，不作能力诊断。
- 今日“本周建议主攻”和统计下一步共用同一规则：有解析覆盖的待订正题型中优先数量最多者，否则选待订正最多并明确没有结构化解析。听力建议进入听力页。
- 推荐使用最近已核对快照，草稿改对尚未提交不消除待订正；按来源/版本去重，只有修订稿有内容也纳入活动。设置的两项快速连续修改串行保存，失败保留输入可重试。

### 文件清单
- 新增：src/core/cetStudyPlan.ts、src/features/PlanningPreferences.tsx、test/cetStudyPlan.test.ts、e2e/batch-f.spec.ts。
- 修改：types/model、db/database、core/profile、backup、learningReport、cetAnalysisCoverage，以及 MePage、SettingsPage、TodayPage、CetProgressReport；相应备份、报告和 schema 断言测试。

### 数据结构与迁移
schema 11 增量升级，仅新增可选 Profile.cetFoundation 自述偏好，既有考试日期字段复用。旧设置和学习历史原样保留，不推测基础。新设备按现有备份规则恢复有效偏好，已有本机进度时保留本机设置，旧备份不删除偏好。

### 测试
- 新增 14 项单测，共 228/228 通过；覆盖日期边界、未设置/过期回退、偏好、待订正覆盖优先、题型入口、冻结核对记录、版本隔离及旧备份恢复。
- 新增 2 条浏览器流程，共 21/21 通过：可选设置、刷新持久化、快速连续更改两字段；完全跳过后可用，今日与统计推荐同一有解析的待订正题型。
- typecheck、build、diff 检查通过。新增测试将已存在的试卷入口按真实“继续”状态选择，未修改原浏览器断言。

### 已知边界与 TODO
阶段依据个人计划和自述偏好，题型建议依据本机核对记录；不代表能力诊断、官方备考安排或考试成绩。当前可用解析均为待人工核验草稿，六级等无覆盖题型显示手动核对提示。推荐入口进入对应页面后仍由用户选卷和题型。

### 对现有基线的影响
原 145 单测与 6 条浏览器流程全部保留通过；无新依赖、无功能锁定、无数据清理。

## 批次 G 完成报告

### 改动摘要
- 设置增加折叠的快速迁移码：原生 gzip、WQ1 版本头和 base64url，生成、复制、全选、粘贴合并均在本机完成。失败保留内容，JSON 完整备份继续可用。
- 轻量导出省略词条正文和媒体字节，只读取学习过词条所需的难度元数据；保留学习记录、双稿、熟词标记、设置和奖励凭据，沿用唯一的 importBackup 合并入口。
- 统计空状态、词卡累计、CET 报告与导出海报标明本机范围；首次说明可关闭，存储被阻止时本次使用通过内存保留关闭状态。
- 复制被拒绝时可手动全选；数据操作共用锁并等待设置保存。导入刷新档案和外观，刷新失败明确记录已经合并。
- 最终回归修复交卷过程中切题型被异步复盘跳转打断；修复缺少词条时迁移和旧版本升级高估战力及峰值，后续下载的真实词条优先于缓存。

### 文件清单
- 新增：src/core/quickMigration.ts、src/core/localDataNotice.ts、src/features/QuickMigrationPanel.tsx、src/features/LocalDataNotice.tsx。
- 修改：src/types/model.ts、src/db/database.ts、src/core/backup.ts、src/core/profile.ts、src/features/SettingsPage.tsx、StatsPage.tsx、CetProgressReport.tsx、CetReadyWorkspace.tsx、DESIGN.md。
- 新增测试：test/quickMigration.test.ts、test/localDataNotice.test.ts、e2e/batch-g.spec.ts；扩展 backup、vocabProgress 及当前 schema 数值断言。

### 数据结构与迁移
schema 12 保留版本 1–11 的升级路径。新增可选 Profile.wordDifficultyWeights，只接受 1、1.3、1.6 的逐词数字元数据，不包含正文。升级仅标记版本，不猜测缺失值或改写 FSRS；导入独立合并缓存，本机真实词条优先。旧码缺少词条和元数据时采用最低合法权重，保留原历史峰值。旧 schema 9 升级经过同类回归修正，缺词不再采用最高默认权重。

### 测试
- 新增 16 项单测，244/244 通过，无跳过；覆盖编码往返、格式/版本/损坏输入、流式解压上限、能力回退、附件省略、难度元数据校验与接力合并、旧码与旧升级、首次提示。
- 新增 2 条浏览器流程，23/23 通过；覆盖两个独立上下文间迁移双稿、重复导入、迁移后再次交卷三类奖励均为 0、剪贴板拒绝后的完整全选、统计提示跨刷新及存储拒绝回退、JSON 键盘入口。
- typecheck、build、diff 检查通过。原浏览器断言未放宽；当前 schema 数字断言更新为 12。

### 已知边界与 TODO
迁移码不是固定长度短口令，上限 2,097,152 字符、解压 JSON 上限 8 MiB；不支持原生压缩、超限或损坏时使用 JSON。词条正文、自带音频、PDF 需另行备份或下载，文件引用保留；没有账号或自动同步。统计说明的关闭偏好属于当前浏览器，不随迁移传递。

### 对现有基线的影响
原 145 项单测与 6 条浏览器流程均保留通过，无新增依赖。完整 JSON 导出仍默认包含词条和附件，迁移复用同一合并语义；重复导入与再次交卷不重复奖励，无数据清理。

## 最终工程交付与集中核验

A–G 工程已逐批完成。最终通过类型检查、244 项单测、生产构建和 23 条 Chromium 流程；电脑 1440px、手机 390px 批量目视检查今日、熟词、听力目录、精听、写译双稿、统计和迁移区，未发现横向溢出。原布局回归同时覆盖 320px、768px、1440px 与短横屏、星夜与晨光主题。自动化不替代真实 Safari/Firefox 与手机系统验证。

README、使用说明和含英文名称/网址的项目介绍同步更新，介绍 PDF 逐页渲染核对。按原授权推送到仓库并由 Pages 工作流重新执行测试后部署；线上状态以工作流实际结果为准。

可按以下路线集中核验：

1. 今日 → 2026 年 6 月四级第 1 套 → 仔细阅读：先作答交卷，再点待订正题，查看证据与干扰项、添加笔记并核对三类奖励。
2. 听力 → 原创加练：试逐句、循环、A/B、倍速与键盘；真题目录按级别/年份直接练。完整缓存后再断网检查重听。
3. 单词 → 快速标记熟词：搜索、暂停、恢复；今日新词在选择后还有一次独立产出。
4. 写作或翻译：分别保存初稿与修订稿，选择修改原因，勾选自查后修改文字，再刷新检查两版和自查状态。
5. 设置：日期/基础可跳过或修改；核对今日和统计的推荐理由。
6. 设置 → 数据 → 快速迁移：在另一浏览器导入，检查双稿、记录、外观和余额，再次导入/交卷不应重奖。

内容验收仍独立待人工核验：首批阅读 46–55 题全部 verified:false，尤其 49、52、53 题；[逐题核验清单](./cet-analysis-review-2026-11-02.md)保留原文和待确认点。听力可靠原文不足、2 组仅起点、14 组无定位，以及估算逐句时间轴，均保留明确说明和[定位待补清单](./listening-location-todo.md)。工程完成不把这些内容改称已人工核验。
