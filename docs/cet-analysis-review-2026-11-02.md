# 2026 年 6 月四级第 1 套：阅读解析草案审阅记录

日期：2026-11-02。范围：`cet4-202606-set1-nju` 的仔细阅读第 46–55 题。

## 版本与来源

- 练习基准：`public/exams/cet4-202606-1/paper.json`。
- 题目目录修订：`4222c1c11c62fb7c`（取 `src/data/cetReadyPapers.json`）。
- 原卷：同目录 `paper.pdf`，14 页；阅读两篇原文及题目位于 PDF 实际页 9–13。
- 高校答案文件：同目录 `answers.pdf`，5 页；46–47 题简析位于 PDF 实际页 3，其余 48–55 题位于第 4 页。
- 新增数据：`src/data/cetExplanations.json`。此文件不修改原题或参考答案。

## 审阅状态和使用边界

本批次依据已在仓库中的文章、选项、答案键及答案 PDF 整理。所有推理、干扰项类型与释义均由模型撰写，**未经过人工审核**；数据中全部为 `verified: false`。本记录表示来源核对和机械校验，不表示人工认证，也不表示考试院官方解析。

`evidence.text` 逐条与对应阅读文章做精确子串校验；`passageIndex` 从 0 起算（0 为 Passage One，1 为 Passage Two）。没有对展平成单段的 JSON 虚构段落号或句号索引。`sourceRef` 使用原答案 PDF 的实际页数，不是印刷页码。

当前仅完成 10 题可靠阅读草案，没有为了凑到 14 题而编造听力证据。听力 `answers.pdf` 第 2 页只列答案，并明确表示没有原文解析；`paper.json` 无听力转写。因此第 1–25 题听力需先取得可核验转写或逐段核听，再写证据与干扰项解释。不能仅凭正确选项反推录音原话。

## 逐题来源、推理和待确认项

### 第 46 题 · 参考答案 D

- 题干：What is the classic grocery store dilemma?
- 原文定位：Passage One；`answers.pdf p.3`。
- 正确选项：D. One wants the best food but their budget is limited.

证据原句：

> On the one hand, your family dinner table deserves only the best.

> On the other hand, your wallet can only stretch so far.

推理与限定：依据本套 paper.json 原文与 answers.pdf p.3 的参考答案/简析整理；以下推理和干扰项归类由模型撰写，尚未人工核验。两句由 on the one hand / on the other hand 构成取舍：想买最好的食物，但预算有限，合起来对应 D。

三个干扰选项：

- **A. Whether or not one should eat organic food.**（`scope-shift`）：A 只把问题表述为是否吃有机食品，没有说明题目所问 dilemma 中“最好品质”与“有限预算”的冲突，概括不完整。
- **B. Whether or not one can stretch their wallet far.**（`scope-shift`）：B 只保留钱包/支出的一面，遗漏想给家人最好食物的一面；题目要找的是两者之间的矛盾。
- **C. Organic food costs more but it certainly tastes better.**（`not-mentioned`）：文章以有机食品是否值得更高价格开篇，但没有断言它 certainly tastes better；“肯定更美味”无原文依据。

待人工确认：核对原卷、答案 PDF 与题目版本是否一致；确认上述证据足以支撑最佳选项、干扰分类不过度断言。

### 第 47 题 · 参考答案 A

- 题干：What do we learn about organic food from science?
- 原文定位：Passage One；`answers.pdf p.3`。
- 正确选项：A. Whether it is any better remains uncertain.

证据原句：

> Science won't give a clear-cut answer to the question of whether organic food is "better."

> One thing is definitive: Organic and conventionally grown food are equally nutritious.

推理与限定：依据本套 paper.json 原文与 answers.pdf p.3 的参考答案/简析整理；以下推理和干扰项归类由模型撰写，尚未人工核验。题目问科学能否确定有机食品总体更好，原文明确说没有清晰结论，A 的 remains uncertain 对应这一点；随后营养方面的确定结论不能扩大成总体优越。

三个干扰选项：

- **B. Whether it is healthier is under consideration.**（`scope-shift`）：B 把较宽的 better 改成 healthier，并说仍在考虑；本文没有给出“是否更健康正在研究”这一具体结论，不能替代原文的总体不确定性。
- **C. Whether it is more nutritious than conventional food is arguable.**（`mismatch`）：C 说是否更有营养尚可争论，但紧随其后的原文说 equally nutritious / no difference，和这一明确结论不符。
- **D. Whether it is going to replace conventional food is still unclear.**（`not-mentioned`）：原文没有讨论有机食品将来是否会取代传统食品；replace conventional food 不是题目定位句涉及的话题。

待人工确认：核对原卷、答案 PDF 与题目版本是否一致；确认上述证据足以支撑最佳选项、干扰分类不过度断言。

### 第 48 题 · 参考答案 D

- 题干：What does the passage say about organic and non-organic products as far as food safety is concerned?
- 原文定位：Passage One；`answers.pdf p.4`。
- 正确选项：D. There is no substantial difference between the two.

证据原句：

> There is also no big difference between organic and non-organic products from a food-safety perspective.

> Even organic growers use pesticides.

推理与限定：依据本套 paper.json 原文与 answers.pdf p.4 的参考答案/简析整理；以下推理和干扰项归类由模型撰写，尚未人工核验。题干限定食品安全角度，no big difference 与 D 的 no substantial difference 是直接对应。

三个干扰选项：

- **A. Their difference is the conventions used to test them.**（`not-mentioned`）：文章没有说明两类食品的差别来自测试惯例或测试方法；conventions used to test them 没有原文依据。
- **B. They differ in how much pesticide remains on them.**（`scope-shift`）：文中确实讨论用药量及残留，但题干问食品安全的整体比较；把局部用药细节当成两类食品在安全上的主要差别，偏离定位句。
- **C. One relies on pesticides whereas the other does not.**（`mismatch`）：C 断言一类依赖农药而另一类不用；原文 even organic growers use pesticides 明确说明有机种植也使用农药。

待人工确认：核对原卷、答案 PDF 与题目版本是否一致；确认上述证据足以支撑最佳选项、干扰分类不过度断言。

### 第 49 题 · 参考答案 C

- 题干：What does the author say about organic farming?
- 原文定位：Passage One；`answers.pdf p.4`。
- 正确选项：C. It may impact the environment less than conventional farming.

证据原句：

> On the whole, organic agriculture may have a smaller environmental footprint.

> That's mostly because the risk of groundwater contamination from organic farming is lower.

> Organic farmers never used neonics, the controversial pesticides that have been linked to shrinking bee populations worldwide.

推理与限定：依据本套 paper.json 原文与 answers.pdf p.4 的参考答案/简析整理；以下推理和干扰项归类由模型撰写，尚未人工核验。总体结论是有机农业“可能”造成较小环境影响，C 保留 may 的限定；较低地下水污染风险是后面的支持细节。TODO：B 的概括程度与 C 的最佳性需由人工结合题干确认，不把“只提细节”泛化成事实错误。

三个干扰选项：

- **A. It may be blamed for the shrinking bee populations in the world.**（`mismatch`）：原文将蜜蜂减少与 neonics 联系，并说有机农场从不用这种农药；A 却把责任归给有机农业，改变了原文关系。
- **B. It minimizes the use of controversial pesticides in its operations.**（`scope-shift`）：原文只就 neonics 这一特定争议农药说 never used；B 泛指减少有争议农药的使用，且未概括总体环境影响，不能直接替代段落主结论。
- **D. It contaminates groundwater as much as conventional farming.**（`mismatch`）：原文说有机农业的地下水污染风险 lower，D 的 as much as 把较低风险改成相同程度。

待人工确认：核对原卷、答案 PDF 与题目版本是否一致；确认上述证据足以支撑最佳选项、干扰分类不过度断言。重点复核 B 的范围与最佳答案判断。

### 第 50 题 · 参考答案 B

- 题干：What do advocates of organic farming argue about its yields and efficiency?
- 原文定位：Passage One；`answers.pdf p.4`。
- 正确选项：B. They would improve remarkably with more research and investment.

证据原句：

> On the other hand, advocates of organic farming argue yields and efficiency could be significantly improved if the food industry devoted as much research and money to organic farming as it does conventional agriculture.

推理与限定：依据本套 paper.json 原文与 answers.pdf p.4 的参考答案/简析整理；以下推理和干扰项归类由模型撰写，尚未人工核验。支持者提出的是有条件判断：给予有机农业与传统农业同等的研究和资金，产量与效率可能显著提高，B 保留研究与投入这两个条件。

三个干扰选项：

- **A. They would increase quickly with the emergence of new technologies.**（`not-mentioned`）：原文提出 research and money，没有说新技术出现后产量会 quickly 增加；不能用常识补出速度和技术条件。
- **C. They would be achieved along with enormous health benefits.**（`not-mentioned`）：定位句没有承诺巨大的健康收益；前文关于营养的比较也不能支持 enormous health benefits。
- **D. They would considerably lower the cost to the environment.**（`concept-swap`）：题目问支持者如何提高 yields and efficiency，D 换成降低环境成本；这是把产量效率的改进与环境影响混为一谈。

待人工确认：核对原卷、答案 PDF 与题目版本是否一致；确认上述证据足以支撑最佳选项、干扰分类不过度断言。

### 第 51 题 · 参考答案 A

- 题干：What is the finding of one recent study about being selfish?
- 原文定位：Passage Two；`answers.pdf p.4`。
- 正确选项：A. It may bring certain benefits in the short term.

证据原句：

> It found that being selfish was more advantageous than cooperating.

> The benefit may be short-lived, however.

> Another study showed that players who cooperated did better in the long run.

推理与限定：依据本套 paper.json 原文与 answers.pdf p.4 的参考答案/简析整理；以下推理和干扰项归类由模型撰写，尚未人工核验。one recent study 的发现是自私比合作有利，但后一句限制为可能短暂；A 概括为短期某些收益。后一项长期合作表现来自另一研究，应区分来源。

三个干扰选项：

- **B. It usually yields more disadvantages than advantages.**（`mismatch`）：B 说弊通常多于利，与该研究中 more advantageous 的表述方向相反。
- **C. It serves individual interest rather than a collective's.**（`scope-shift`）：C 是对“自私”含义的概括，没有表达题目所问研究发现的“相对合作更有利且收益可能短暂”。
- **D. It may give way to cooperating in the long run.**（`scope-shift`）：D 把答案转到长期可能让位于合作；原文长期合作表现属于 another study，题干指定的是 one recent study 关于自私的发现。

待人工确认：核对原卷、答案 PDF 与题目版本是否一致；确认上述证据足以支撑最佳选项、干扰分类不过度断言。

### 第 52 题 · 参考答案 B

- 题干：What have researchers found by studying identical and non-identical twins?
- 原文定位：Passage Two；`answers.pdf p.4`。
- 正确选项：B. One's behavior is largely determined by their genetic traits.

证据原句：

> By comparing identical twins, who share nearly 100 percent of their genes, and non-identical twins, who share about half, researchers have found overwhelming evidence for genetic effects on behaviors.

> Yet almost no behavior is entirely genetic, even among identical twins.

推理与限定：依据本套 paper.json 原文与 answers.pdf p.4 的参考答案/简析整理；以下推理和干扰项归类由模型撰写，尚未人工核验。高校参考答案为 B，简析将双胞胎研究归结为基因对行为的明显影响。定位句确实支持 genetic effects，但不直接量化为 B 的 largely determined；末段还排除完全由基因决定。TODO：必须人工复核 B 中 largely determined 的强度及本整理版题目/答案对应；本条仍是未核验草案，不将“基因影响”讲成基因决定论。

三个干扰选项：

- **A. They are overwhelmingly different in the amounts of genes.**（`scope-shift`）：nearly 100 percent 与 about half 描述同卵/异卵双胞胎各自共享基因的比例，是研究比较的背景；A 把它改成“双胞胎基因数量极不相同”的结论，未回答研究发现。
- **C. One's biological roots can be identified by their genes.**（`concept-swap`）：文中 genes 是用来研究行为生物根源的因素；C 把“识别行为的生物根源”改成“由基因识别一个人的生物根源”，对象发生变化。
- **D. They differ from each other in their behavior patterns.**（`scope-shift`）：D 只笼统说行为模式不同，遗漏题干研究据此得到的基因影响。原文定位句强调 genetic effects，而非仅列差异。

待人工确认：核对原卷、答案 PDF 与题目版本是否一致；确认上述证据足以支撑最佳选项、干扰分类不过度断言。重点复核 B 的 largely determined 是否超过 genetic effects 的强度。

### 第 53 题 · 参考答案 C

- 题干：What did the author and colleagues identify in their recent research?
- 原文定位：Passage Two；`answers.pdf p.4`。
- 正确选项：C. A specific gene associated with altruistic behavior.

证据原句：

> My colleagues and I recently identified a gene linked to altruistic behavior and found that a particular variant of it was associated with more selfish behavior in preschoolers.

推理与限定：依据本套 paper.json 原文与 answers.pdf p.4 的参考答案/简析整理；以下推理和干扰项归类由模型撰写，尚未人工核验。identified 的直接宾语是 a gene；C 的 a specific gene associated with altruistic behavior 与前半句直接对应。后半句补充该基因一个变体与自私行为相关。TODO：人工审校 A/C 的干扰唯一性；linked/associated 是相关，不是已证明的决定性因果。

三个干扰选项：

- **A. A gene-related selfish behavior in preschool children.**（`scope-shift`）：A 截取后半句中学前儿童自私行为的相关性，并把识别对象表述为行为；题干问作者团队 identified 什么，前半句直接指向基因。A 与后半事实有关，不能简单说原文完全未提。
- **B. Key factors that determine one's altruistic behavior.**（`over-inference`）：原文只报告特定基因及相关性，B 扩大为决定利他行为的关键因素，determine 的因果强度也超过 linked / associated。
- **D. Roles played by genes in shaping one's character.**（`scope-shift`）：原文讨论利他/自私这一类行为与一个基因的联系，D 扩为基因塑造整体性格的作用，范围更宽。

待人工确认：核对原卷、答案 PDF 与题目版本是否一致；确认上述证据足以支撑最佳选项、干扰分类不过度断言。重点复核 A/C 的信息层级与唯一最佳答案。

### 第 54 题 · 参考答案 A

- 题干：What do we learn from evolutionary scientists about cooperative behavior?
- 原文定位：Passage Two；`answers.pdf p.4`。
- 正确选项：A. It may have initially originated in individuals linked by blood.

证据原句：

> According to evolutionary scientists, cooperative behavior may have evolved first among relatives to promote the continuation of their genetic line.

> As communities diversified, mutual support could have broadened to include individuals not linked by blood.

> Groups of highly cooperative individuals have higher chances of survival because they can work together to reach goals that are unattainable to less cooperative groups.

推理与限定：依据本套 paper.json 原文与 answers.pdf p.4 的参考答案/简析整理；以下推理和干扰项归类由模型撰写，尚未人工核验。first among relatives 与 A 的 initially ... linked by blood 对应；may 在原句和选项中都表示可能，不是确定的历史断言。

三个干扰选项：

- **B. It may have caused the diversification of communities.**（`concept-swap`）：原文说随着社群多样化，互助可能扩展到非血亲；B 改成合作行为造成社群多样化，改变了事件之间的关系。
- **C. It helps to build relationships among blood-related people.**（`scope-shift`）：C 讨论合作建立亲属间关系的作用，而定位句讨论合作首先在亲属中演化并延续基因的可能起源；不是同一研究结论。
- **D. It guarantees the achievement of goals otherwise unattainable.**（`over-inference`）：原文用 higher chances of survival 和 can work together 表述优势，D 的 guarantees 把机会和能力扩大成必然达成目标。

待人工确认：核对原卷、答案 PDF 与题目版本是否一致；确认上述证据足以支撑最佳选项、干扰分类不过度断言。

### 第 55 题 · 参考答案 D

- 题干：What can we infer from the last paragraph?
- 原文定位：Passage Two；`answers.pdf p.4`。
- 正确选项：D. Cooperative behavior may be cultivated.

证据原句：

> Yet almost no behavior is entirely genetic, even among identical twins.

> Culture, schooling and parenting are important determinants of cooperation.

> Thus, the degree to which we act cooperatively or selfishly is unique to each individual and depends on a variety of genetic and environmental influences.

推理与限定：依据本套 paper.json 原文与 answers.pdf p.4 的参考答案/简析整理；以下推理和干扰项归类由模型撰写，尚未人工核验。文化、学校教育和家庭教养都会影响合作，因此可推得合作行为能够受到培养，D 使用 may，保留推断的限定。

三个干扰选项：

- **A. Cooperative behavior is evident among identical twins.**（`scope-shift`）：末段提到同卵双胞胎是为了说明行为也不全由基因决定，并非要证明同卵双胞胎普遍表现合作；A 没有抓住段落主旨。
- **B. One is born either cooperative or non-cooperative.**（`mismatch`）：B 把人分为天生合作或不合作两类；原文说每个人受多种基因与环境影响，反对这种二分且固定的理解。
- **C. Genes determine one's tendency to cooperate.**（`over-inference`）：基因是影响因素之一，但末段同时强调文化、教育和教养；C 的 determine 若理解为单由基因决定，就超出原文的多因素解释。

待人工确认：核对原卷、答案 PDF 与题目版本是否一致；确认上述证据足以支撑最佳选项、干扰分类不过度断言。

## 听力待办清单（本批未入数据）

本套听力答案只能作为核对字母，不能作为录音转写。下列 4 题是首批候选，均保持 TODO：

| 题号 | 高校参考答案 | 当前证据 | 补齐要求 |
|---|---|---|---|
| 1 | C | `answers.pdf p.2` 仅答案；`paper.pdf p.1` 仅四选项 | 取得新闻原话及问题原话，确认点餐的主语、事件和时间 |
| 2 | B | 同上 | 核听 change password 的依据，区分建议与已执行动作 |
| 3 | A | `answers.pdf p.2` 仅答案；`paper.pdf p.2` 仅四选项 | 取得研究目标的原话，不能由正确选项反推访问者影响动物行为 |
| 4 | D | 同上 | 核听出生和饲养环境的表达及题目所指动物，不能凭选项推断录音内容 |

对其余 9 套现有 `answers.pdf` 做了只读文本抽检与转写标记搜索：部分文件有中文简析和英文选项片段，但本次未确认可直接引用的完整听力原文。没有将简析中的正确选项文字伪装为录音原话，也未据此扩充本批听力题。

## 人工审核清单

- [ ] 复核原卷的出版/整理身份及场次套号，不把高校整理版写成考试院官方发布。
- [ ] 逐题确认第 46–55 题题干、四选项与当前答案键。
- [ ] 将 10 题推理与原卷原文逐项核对，审校“未提及”和“错误”两种说法的差别。
- [ ] 特别处理第 49 题 B 作为局部细节的范围、第 52 题 B 的量化强度、第 53 题 A/C 的接近语义。
- [ ] 不把本地科普文章对食品、基因的概括当作外部健康或科学建议；这是文本阅读练习。
- [ ] 核对 `paraphrase` 为学习释义，非宣称所有语境都完全等义。
- [ ] 听力先取得逐字稿或实际核听证据，再添加引用、位置和干扰解释；当前保持 TODO。
- [ ] 人工审核通过之前不把 `verified` 改为 `true`，不向用户显示“人工已核验”。

## 机械检查

- 10 个题号唯一，均在 46–55 范围。
- 每题都包含对应原文精确子串证据。
- 每题恰好列出 3 个错误选项，不把正确选项当作干扰项。
- 全部 `verified` 为 `false`；未加入未经核听的听力解析。
- 仅新增数据文件和本审阅文档，未修改原卷、题目 JSON 或项目逻辑。
