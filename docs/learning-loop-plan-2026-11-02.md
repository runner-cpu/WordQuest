# WordQuest 学习闭环分批实施计划

依据：用户提供的《WordQuest 学习闭环与游戏化深化》A-G 批次指令；应用基线提交 4b63775。保持现有导出、数据与视觉语言，不新增第三方依赖，不上传学习数据。用户原工作区的介绍文档与录音删除不纳入本次提交。

## 执行与验收

- [x] A 工程：独立解析索引、严格结构与证据验证、就地订正、证据追加笔记、部分覆盖标记。原卷题目版本不因解析改变。154 单测、9 浏览器流程及类型/构建通过。内容人工核验仍待用户最终确认，全部 verified:false。
- [x] B：以试卷来源/题号/奖励种类保存一次性凭据，事务中与余额一起更新；区分首次正确、订正正确、证据记录；备份保留凭据。schema 8，176 单测、12 浏览器流程及类型/构建通过。
- [x] C：原创逐句与 AB 循环、倍速、快捷键；真题定位循环与缺失定位清单；未知时间轴不冒充精确值。185 单测、14 浏览器流程及类型/构建通过。
- [x] D：组题优先主动提取、掌握需产出证据、熟词排除可恢复、低新词档位；FSRS 事件和状态保留。schema 9，195 单测、17 浏览器流程及类型/构建通过。
- [ ] E：写译初稿与修订稿分离、修改原因、自查失效与手动参考对应；不自动评分。
- [ ] F：可跳过的阶段建议、今日主攻与解析覆盖联动，理由可解释。
- [ ] G：压缩迁移码包装现有备份合并，不含附件；本机统计标注与首次提示。

每批先补失败测试，再实施；运行 typecheck、完整单测、build、Chromium e2e。记录测试结果及边界后独立中文 commit；通过后进入下一批。每批报告保存在 docs/learning-loop-delivery-2026-11-12.md。

## 已核对的复用点

| 批次 | 现有实现 | 新接口/数据策略 |
|---|---|---|
| A | types/cetReadyPaper、features/CetReadyWorkspace、useCetPaperDraft | cetExplanations 静态侧车索引；appendEvidenceNote 追加 notes |
| B | core/cetPapers.submitCetPaperStudy、core/profile.awardRewards、core/backup | 独立奖励凭据，复用奖励事务；随备份合并 |
| C | core/audio、features/ExamPlayer、ListeningPage、CetReadyWorkspace | 共享精听纯逻辑和受控播放器，不改 MP3 原始字节 |
| D | core/session、core/fsrs、features/Battle、UserWordStat、reviewLogs | 日志派生产出证据；熟词排除独立保存可恢复 |
| E | CetPaperStudy、useCetPaperDraft、CetOutputExercise | 可选版本字段、原因标签、自查快照，兼容旧文本 |
| F | core/cetPlan、Profile、MePage、SettingsPage、TodayPage | 可选基础/阶段偏好；纯函数计算推荐 |
| G | db.exportBackup、core/backup.importBackup、SettingsPage | 原生压缩及文本编码，复用唯一导入路径 |

## 内容审校边界

首套 2026-06 四级仓库资料可支持 46-55 阅读证据；该套答案 PDF 明确未提供听力原文，不能仅从选项推造证据。相关听力条目保留待补清单。人工核验是 A 的内容验收依赖，工程测试不替代人工核验。
