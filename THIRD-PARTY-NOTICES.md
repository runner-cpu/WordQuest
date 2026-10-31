# 第三方资源许可声明（THIRD-PARTY NOTICES）

本应用包含以下第三方资源。发布前请逐项核对并保留本文件。

## 词库

- **ECDICT** — https://github.com/skywind3000/ECDICT
- 许可：MIT License
- 用途：CET-4 / CET-6 词条、音标、释义、BNC/当代语料库词频、词形变化
- 义务：保留版权声明与许可全文
- 修改：本项目做了以下加工——仅保留带 `cet4`/`cet6` 标签的词条、剔除词组与带连字符/撇号的条目、清洗 `[网络]` 等语域标记、音标字符归一化为 IPA、按词频分档计算难度权重、按单元分片为 JSON

### 词根词缀数据

- 来源：ECDICT 仓库附带的 `wordroot.txt`（同上 MIT 许可）
- 用途：词根拆解与词根表浏览
- 修改：611 条中筛选出有释义的条目；释义做规则化中文化（未命中的保留英文原文）；例句过滤到本地词书实际存在的词；生成「词 → 词根」反向索引

## 复习算法

- **ts-fsrs** — https://github.com/open-spaced-repetition/ts-fsrs
- 许可：MIT License
- 用途：FSRS 间隔重复调度
- 说明：使用官方默认参数，未做个性化参数优化

## 字体

- **Fusion Pixel Font（缝合像素字体）** — https://github.com/TakWolf/fusion-pixel-font
- 许可：SIL Open Font License 1.1
- 版权：Copyright (c) 2022, TakWolf (https://takwolf.com), with Reserved Font Name 'Fusion Pixel'
- 用途：UI 与单词展示
- 修改：使用 `pyftsubset` 按实际字符集子集化（923KB → 115KB）
- 义务：保留版权声明；不得单独售卖字体；不得使用保留字体名 'Fusion Pixel' 命名修改版

## 运行时依赖

| 包 | 许可 | 用途 |
|:---|:---|:---|
| React | MIT | UI 框架 |
| Dexie | Apache-2.0 | IndexedDB 封装 |
| Zustand | MIT | 状态管理 |
| Vite | MIT | 构建工具 |
| Tailwind CSS | MIT | 样式 |
| vite-plugin-pwa / Workbox | MIT | PWA 离线缓存 |

### 关于释义内容

ECDICT 数据库本身的打包与分发以 MIT 许可授权。需要说明的是，其中的词典释义内容聚合自多家公开词典资料，数据库的 MIT 许可不等同于其中每一条释义都可脱离该数据库独立商用。本项目以「依赖该数据库整体」的方式使用（构建期转换为 JSON 分片，不单独售卖数据），并在本文件中如实注明来源。

### 真题、录音与原创练习

站内真题使用南京大学 eol 平台公开托管的四六级整理资料。现提供 10 套第 1 套题目（550 道客观题及写译任务）、参考答案与录音；高校网页、原卷 PDF、答案 PDF 和 MP3 的原始 URL、文件大小及 SHA-256 保存在每套 `public/exams/*/paper.json` 中。目录见 `src/data/cetReadyPapers.json`，逐套来源与修正方式见 `docs/ready-cet-papers-2026-10-31.md`。

公开可访问不等同于采用 MIT 或其他开放内容许可。试题版权归相应权利人，录音、范文和解析保留原作者权利；本项目保留来源信息，用于学习交流，不声称这些内容属于本项目原创或考试院官方发布。项目代码的许可证不授权第三方试题、音频或解析的独立商业再分发。

导入过程保留高校资料原措辞，对照原卷恢复网页截断的匹配题、缺失的阅读材料，并去除混入选项的章节指示。修正记录在 `scripts/cet-paper-corrections.json`。2025 年 12 月六级参考资料缺失 Q16–25，未列为完整站内套卷；2025 年 6 月六级未提供写译参考文本，界面明确提示。

原有真题档案仍支持用户导入自备 PDF、音频和对应答案；附件只保存在用户浏览器。旧的高校来源 ID 为档案兼容保留，不代表其全部内容均已在本站内置。

听力短练、情景冒险和专项内容属于原创练习，使用独立主题名，不以真实考试年月或套号包装，不声称题量、播放流程或难度经过官方校准。原创听力的 82 条英语合成录音由本机 System.Speech / Microsoft Zira Desktop（en-US）生成并编码为 MP3，明确标注为合成语音；内容、音频大小和 SHA-256 见 `src/data/originalAudio.json`。生成工具仅在内容维护时运行，不调用在线朗读接口。真题使用对应高校资料录音。

## 未使用但方案中提及的资源

以下资源在方案评审后**未采用**，在此说明原因，避免后续误用：

- **kajweb/dict** — 无明确授权，不可用于公开发布产品
- **qwerty-learner 发音音频** — 来自有道词典开放 API，音频不可再分发
- **edge-tts** — 逆向调用 Edge 在线朗读接口，批量生成与 CDN 再分发违反 ToS

## 语音合成

- 发音优先使用 **Web Speech API**（浏览器内置，无体积、无许可问题）
- 音频包方案（Piper / Kokoro）尚未启用。启用前须逐个核对 voice 模型许可，并在此处登记
