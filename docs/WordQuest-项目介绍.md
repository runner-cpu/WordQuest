# 单词勇者 WordQuest 项目介绍

面向大学英语四六级的游戏化英语学习应用

**在线打开：[https://runner-cpu.github.io/WordQuest/](https://runner-cpu.github.io/WordQuest/)**

电脑、平板和手机使用同一网址，无需启动本地服务，也不必连接同一个 WiFi。首次访问需联网；应用、词书和录音缓存完成后，可离线使用相应内容。本文说明截至 **2026 年 11 月 12 日** 的实际功能与使用边界。

## 项目名称与定位

**中文名称：单词勇者**  
**英文名称：WordQuest**  
**英文介绍名称：WordQuest: A Gamified English Learning Companion for CET-4 and CET-6**

WordQuest 将 Word 与 Quest 结合，把英语学习组织成可以逐步完成的任务。项目面向大学英语四级、六级备考学生，将词汇复习、听力、阅读、写作翻译和真题订正放在同一个学习空间，并用像素角色、情景故事、成就和外观收集呈现日常积累。

产品帮助用户形成“先尝试、再核对、找证据、做修订、过几天再回想”的习惯。游戏反馈围绕真实作答与复盘记录展开，学习者可以随时进入所需模块。等级、词汇积累阶段和成就用于记录应用内活动，不换算考试成绩、CEFR 等级或过级概率。

## 服务哪些需求

- **备考内容分散**：把背词、听读写译、真题答案和草稿放在同一网站，减少练习时切换外部页面。
- **容易觉得枯燥**：提供短轮任务、故事语境、及时反馈、可追踪成就和角色外观，让每天有清晰的小目标。
- **看懂却写不出**：到期词优先主动拼写或听写，新词同轮增加产出；表达工坊要求在新语境主动输入短语。
- **做完题没有复盘**：保留首次与最新核对，定位待订正题，添加证据笔记；写译分别保留初稿和修订稿。
- **碎片时间与多设备使用**：电脑支持分栏，手机支持单列与底部导航；本机离线学习，通过迁移码或 JSON 手动合并记录。

## 五个入口

**今日**：查看本周建议主攻、完成词汇任务、进入阅读与写译真题、情景冒险及表达回想。  
**单词**：选择词书、下载单元、查词、练关卡、快速标记或恢复熟词。  
**听力**：按四级、六级和年份直接练近年真题；原创加练按需展开。  
**统计**：分别查看真题核对、词卡积累和产出覆盖，依据本机记录安排下一步。  
**我的**：查看角色、成就、商店外观，打开设置修改学习计划、外观或管理数据。

## 词汇：从辨认走向主动提取

词汇学习采用 FSRS 间隔重复调度，根据每次作答安排下次复习。每轮最多选入 24 个词，先处理到期复习，再补充当天尚未完成的新词额度。新用户默认每天 10 个新词，可以自行调高；复习积压时会提示先清复习，继续学习的入口仍然可用。

新词可以先通过选择题接触，但同一轮还会安排一次拼写或听写。到期词若没有准确产出记录，会优先安排产出题。错题可再练，额外重练有上限；结算区分独立词数与作答次数，避免把多次接触误算为多个新词。

“掌握”须同时具备 FSRS 复习间隔达到 21 天的调度依据，以及至少一次准确拼写或听写记录。选择题正确、一次近似拼写或熟词自述都不能直接替代产出证据。统计单独展示产出覆盖；历史数据从已有日志重建，旧 FSRS 快照保留，既有成就和库存不会因此被删除。

词书提供四级、六级核心词和相应标签词表，也支持其他考试方向。多个词书中的同一单词共享学习记录。“全本”指项目依据 ECDICT 标签收录的词表，不是对考试词汇的权威认证。四级核心词前 300 词随应用内置，完整词书和其他词书需联网下载。

下载后可打开“快速标记熟词”，搜索英文或释义，先回想再展开词义。标记后该词暂停进入主学习、关卡与攻坚队列；历史仍保留，可随时恢复。这个入口帮助安排复习，不用于宣称权威词汇量。

## 真题：站内答题与可回看的订正

网站内置 **10 套高校整理第 1 套，共 550 道客观题**。四级 6 套，覆盖 2023 年 12 月、2024 年 6 月与 12 月、2025 年 6 月与 12 月、2026 年 6 月；六级 4 套，为 2024 年 6 月与 12 月、2025 年 6 月、2026 年 6 月。资料来自南京大学 eol 高校托管页面，保留来源和整理版说明。缺少部分参考答案的 2025 年 12 月六级未作为完整套卷列入。

听力真题集中在听力页，阅读、写作和翻译在今日备考台。题干、选项、文章、录音及内置参考答案均在当前界面使用，无需跳转高校页面往返答题。来源链接用于查看出处，日常作答不依赖外部网页操作。

听力 25 题与阅读 30 题分别核对，保留首次和最近记录，同时共用同套草稿。复盘可筛选待订正或未答题，点击题号返回原题。未提交的修改不会被统计为已订正；首次表现与回看答案后的订正分开保存。

## 解析与证据笔记

首批结构化解析覆盖 **2026 年 6 月四级第 1 套仔细阅读 46-55 题**，包括原文证据、定位、干扰项说明和部分同义替换。可就地展开，并将证据句加入复盘笔记。没有解析的题明确显示“本题暂无结构化解析，仅提供参考答案”。

这些解析当前全部标为 **待人工核验的草稿**，不以工程测试替代内容审校。第 49、52、53 题尤其需要人工复核。听力原文没有可靠资料时，不根据选项编造证据或字幕。统计显示解析覆盖与核验状态，明确只覆盖部分卷别。

## 精听：把录音拆成可以重复练习的片段

原创加练包含 4 组理解短练和 10 篇句子材料，配有 **82 条内置英语合成录音**，无需安装系统英语语音包。支持整段或逐句播放、上一句与下一句、单句循环、手动 A/B 和 0.75、1、1.25、1.5 四档倍速。空格可播放或暂停，左右键切句；在输入框中不拦截打字。

逐句练习优先播放已有独立句子 MP3。全文句子边界按实际媒体时长估算，明确标为“时间轴为机器估算/待校对”；可在独立 JSON 中补录人工时间轴。精听参考默认折叠，标明不是考试字幕。播放状态依据实际起播，载入和错误有反馈，切换材料或退出时停止声音。

真题共有 76 个材料组，其中 **60 组起止完整、2 组只有起点、14 组尚无起点**。完整区间支持题组循环；后两类保留完整录音与手动 A/B，不编造缺失终点。未定位组有明确说明，待补清单记录来源、题组和版本。

原始 MP3 字节与完整缓存校验保持不变。原创录音需先完整加载并缓存；真题可在本套复盘区缓存题目和完整录音。缓存成功后，才可在当前设备离线重听。

## 写作与翻译：保留修改前后的证据

真题与原创专项提供初稿和修订稿两个版本。可复制初稿开始修订，也可直接输入，分别查看两版。修改原因包括时态、主谓一致、冠词、单复数、拼写、搭配、遗漏信息与段落衔接八类。

两版各有三项自查，绑定当时的文字；修改这一版后，需要重新检查。原创专项继续保留最近一次完成初稿自查的文本快照，修订稿独立保存。自动保存允许继续打字，返回、切后台或遇到多标签冲突时保留当前输入，并提供重试或明确的版本选择。

展开参考后，可点击完整参考句，查看按段落位置给出的近似提示；段落数量不同或缺少参考时，转为手动选择草稿段落。系统不推断语义对应，不自动判断信息是否覆盖，也不自动评分。来源没有写译参考的卷别仍明确说明。

## 轻量阶段建议

首次设置可选择个人考试日期与自述基础，也可以全部跳过；之后在设置中修改或清空。应用给出基础积累、专项突破、真题模考、考前冲刺四类建议，说明日期和偏好依据。日期过期时单独提醒更新，不把过期日期当成临考。

今日“本周建议主攻”和统计下一步使用同一规则。有解析覆盖的待订正题型中，优先处理待订正最多的一项；没有覆盖时，仍建议回到原卷或录音，说明“该题型暂无结构化解析”。推荐以当前目标级别的本机记录为依据，所有练习保持开放。

“真题模考”表示练习安排建议。当前没有内置整卷倒计时，也不提供预测分或过级概率；需要计时时，可自行安排。

## 游戏化如何服务学习

情景冒险有校园、城市旅行和工作观点 3 个章节，包含 **9 个原创情景、27 道挑战题**。先读对话，再完成理解、推断与得体表达。所有场景均可进入；一场答对至少 2 题可收集印章，星星保存最佳单次表现，重玩可补齐尚未首次答对的题。

表达工坊提供 **18 道原创短语题**，要求在新的语境中主动输入 1-5 个英文词。可按需看提示，系统区分独立想起与借助帮助完成；之后按到期日期回想，每轮最多 5 句。首次或到期日无帮助正确获得 3 XP、1 金币，同题同日不重复奖励。

成就馆有 **70 枚成就**，按坚持、词汇、复习、拼写、听力和运用等方向组织，保留 5 枚隐藏成就。可以按进度筛选、追踪一个公开目标，在今日查看。新增订正与证据成就依据实际记录，不表示能力认证；已获成就和达成日期保留。

真题客观题奖励分开显示：首次正确每题 2 XP、1 金币；原错题订正正确 3 XP、1 金币；记录订正依据 1 XP、1 金币。每类按来源、题目版本和题号只领一次。奖励凭据与余额在同一事务更新，刷新、跨标签并发和重复导入不会再次发奖。

证据奖励表示留下了订正依据，不自动验证文字质量。写译、原创 CET 专项及自带资料档案不发题目正确奖励。词汇关卡、每日任务、角色成长和商店外观提供进度反馈；没有新增扣币、掉级或断签惩罚。

## 一次约 20 分钟的学习示例

1. **约 5 分钟复习词汇**：完成部分到期任务，主动拼写或听写。
2. **约 10 分钟做一项备考练习**：听一段、读一篇，或继续写译修订；整卷另留时间。
3. **约 3 分钟应用英语**：体验一个场景或回想几句到期表达。
4. **约 2 分钟留下证据**：订正一题、记一处原文依据，或说明本次修改原因。

时间仅为个人安排示例；用户可以只练当天最需要的一项。

## 电脑和手机适配

电脑宽屏使用左侧导航与分栏材料/答题布局；手机使用底部五栏导航与单列内容，材料、题目和编辑区按需滚动。长英文与说明采用常规字体，像素字体集中用于短标题和角色。

新增按钮、复选项和选择器提供至少 44px 触达区域，编辑字号约 16-17px。播放器具备键盘入口，保留可见焦点；主题与减少动态效果偏好继续生效。提供 4 种视觉风格和 8 个配色选项。自动化覆盖手机、平板、桌面与横屏尺寸；真实 Safari、Firefox 与手机系统仍需进一步验证。

## 本机数据、备份与迁移

学习记录保存在当前浏览器 IndexedDB，不上传学习数据，也没有账号或自动云同步。电脑、手机、不同浏览器以及本地运行地址各自持有记录。统计页和导出学习报告标明本机范围，首次进入统计会提示跨设备使用迁移。

**快速迁移码**用于移动学习记录、写译草稿、成就、熟词标记与去重凭据。原生 gzip 压缩后生成文本，可复制到目标设备，在设置中粘贴并合并。它不是固定长度口令，记录较多时会更长；不含词条正文、录音、PDF 和其他大附件，目标设备需重新下载词书、缓存录音或导入原始文件。

迁移码复用 JSON 备份的同一导入合并逻辑。日志按 ID 合并并重建调度，奖励凭据取并集，余额按原规则保留较大值，导入本身不补发奖励。旧备份缺少新增字段不会清除本机修订或熟词恢复记录。

**完整 JSON 备份**继续可用，包含词条、记录、设置和导入文件；附件合计超过 100MiB 时跳过超额部分并提示。浏览器不支持压缩、迁移码损坏或体积过大时，可改用 JSON 文件。迁移不会自动上传，文件与文本均由用户自行传递。

离线内容必须先缓存或下载。题目、静态解析、原创文本与时间轴随相应应用资源缓存；站内真题原卷和完整录音按套缓存。尚未缓存的首次加载仍需联网。浏览器持久存储许可可减少自动清理风险，不能替代备份。

## 技术实现与数据演进

项目使用 React 18、TypeScript、Vite、Tailwind CSS、Zustand、Dexie/IndexedDB、ts-fsrs 与 vite-plugin-pwa，部署在 GitHub Pages。此次完善没有引入新的第三方依赖。

数据库增量升级至 schema 12，保留版本 1-11 的迁移路径。新增字段覆盖真题奖励凭据、产出计数、熟词排除与恢复、写译修订对象、可选基础自述及迁移所需的逐词难度元数据。学习记录不会通过清库重置来完成升级。

真题引用固定题目版本，解析不冒用其他卷别；首次和订正快照各自保存。自动保存采用字段比较与冲突恢复，奖励采用事务和持久凭据。迁移只包装现有备份规则，避免维护两套合并语义。

## 质量验证与内容审阅

每批运行类型检查、完整单元测试、生产构建和 Chromium 浏览器流程。原有 145 项单测和 6 条浏览器流程保留，新增覆盖证据订正、并发奖励、离线录音、词汇产出、双稿保存、阶段建议与跨浏览器迁移。最终数量与逐批结果见学习闭环交付报告。

工程检查验证计算、保存与交互，不替代真题来源和解析的人工核验。当前待处理内容包括首批 10 道阅读解析、缺少可靠听力原文的证据、2 组仅起点与 14 组未定位材料，以及机器估算的逐句时间轴。

## 当前边界与后续方向

网站已经支持站内真题练习、证据订正、主动提取、写译修订和手动跨设备迁移。当前不提供 PDF 自动识题、自由口语评分、写译自动评分、整卷计时或云同步。后续优先增加经过人工核验的解析和可靠时间轴，而不是只增加未经审校的题量。

<!-- pagebreak -->

## English overview

**WordQuest: A Gamified English Learning Companion for CET-4 and CET-6**

**Open the website: [https://runner-cpu.github.io/WordQuest/](https://runner-cpu.github.io/WordQuest/)**

WordQuest helps university students connect vocabulary review with listening, reading, writing, translation and past-paper correction. The name combines “Word” and “Quest” to express learning through manageable tasks and exploration. Desktop and mobile users can open the same website without running a local server.

The learning loop centres on trying, checking, finding evidence, revising and recalling later. FSRS schedules vocabulary review, while question selection encourages active production. New words receive a separate spelling or dictation turn. The mastery label requires both a sufficiently long review interval and an accurate production record. Familiar-word marking is reversible and serves planning rather than vocabulary certification.

Ten university-hosted paper editions provide 550 objective questions, original recordings and reference answers inside the app. Listening is on the Listening page; reading, writing and translation are on Today. First and latest checks are stored separately. An initial set of ten close-reading explanations includes evidence and distractor notes, but every explanation remains clearly marked as awaiting human review.

Original listening includes 82 bundled synthetic recordings, sentence playback, looping, A/B controls, four playback rates and keyboard shortcuts. Estimated sentence boundaries are labelled as approximate. Sixty past-paper groups have complete ranges; two have only a start point, and fourteen still require manual positioning. Missing timing or transcripts are not invented.

Writing and translation retain initial and revised drafts, eight revision-reason tags and separate text-bound self-checks. Reference sentences offer positional or manual paragraph cues without semantic grading. Optional exam dates and self-described foundations inform transparent recommendations; they do not restrict access to exercises.

Nine original story scenarios, eighteen expression tasks and seventy achievements make progress visible. Rewards distinguish first correct answers, successful corrections and recorded evidence. Persistent receipts prevent repeated submissions, concurrent tabs or backup imports from awarding the same reward again. Indicators describe practice activity, not exam scores or language certification.

Study records remain in the current browser. A compressed migration code transfers records and drafts manually, excluding vocabulary text and large attachments. Full JSON backups remain available. Both paths share merge rules; neither introduces cloud synchronisation. Downloaded content and complete cached recordings support offline practice.

WordQuest does not offer automated writing assessment, free-form speaking scores, predicted CET results or a built-in full-exam timer. Its next content priority is carefully reviewed explanations and reliable listening alignment. This document describes the project as of November 12, 2026.
