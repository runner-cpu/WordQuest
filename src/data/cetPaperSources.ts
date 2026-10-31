/**
 * 高校公开的四六级真题资料与原始出处。
 * 可直接练习的套卷见 cetReadyPapers.json；保留旧来源 ID 以兼容本机档案。
 * 高校整理版与考试院正式发布应区别对待；未举行的考试不在目录中。
 */
export interface CetPaperSource {
  id: string;
  level: 'cet4' | 'cet6';
  year: number;
  month: 6 | 12;
  title: string;
  provider: string;
  sourceUrl: string;
  paperUrl?: string;
  answersUrl?: string;
  audioUrl?: string;
  note: string;
  checkedAt: string;
}

const CHECKED_AT = '2026-10-30';
const NJU_PROVIDER = '南京大学 eol 平台（高校托管资料）';
const NJU_NOTE = '真题资料／整理版；来源标为第1套，套号沿用资料页。高校托管不代表考试院官方原卷或官方答案，解析仅供学习参考。来源页分别提供试题 PDF、答案 PDF 和听力 MP3。';
const XJ_PROVIDER = '新疆第二医学院语言文化部';
const XJ_SOURCE = 'https://www.xjsmc.edu.cn/yywhb/info/1081/1510.htm';
const XJ_NOTE = '真题资料；套号沿用附件标题。高校资料页发布于2024-12-16，未说明是否为官方原卷或回忆整理，未单独列出答案附件。试卷和听力下载入口要求在学校网页手动填写验证码。';

// 下列文件名均来自已打开的资料页下载链接，不根据年份或套号猜测附件地址。
const njuAsset = (level: 'cet4' | 'cet6', filename: string) =>
  `https://eol.nju.edu.cn/${level}/papers/${encodeURIComponent(filename)}`;
const xjAsset = (fileId: number) =>
  `https://www.xjsmc.edu.cn/system/_content/download.jsp?urltype=news.DownloadAttachUrl&owner=1838905640&wbfileid=${fileId}`;

export const CET_PAPER_SOURCES: CetPaperSource[] = [
  {
    id: 'cet4-202312-set1-nju',
    level: 'cet4',
    year: 2023,
    month: 12,
    title: '2023年12月四级真题 · 第1套',
    provider: NJU_PROVIDER,
    sourceUrl: 'https://eol.nju.edu.cn/cet4/papers/202312-1.html',
    note: NJU_NOTE,
    checkedAt: '2026-10-31',
  },
  {
    id: 'cet4-202606-set1-nju',
    level: 'cet4',
    year: 2026,
    month: 6,
    title: '2026年6月四级真题资料 · 第1套',
    provider: NJU_PROVIDER,
    sourceUrl: 'https://eol.nju.edu.cn/cet4/papers/202606-1.html',
    paperUrl: njuAsset('cet4', '2026年6月大学英语四级真题（第1套）.pdf'),
    answersUrl: njuAsset('cet4', '2026年6月四级真题（第1套）答案解析.pdf'),
    audioUrl: njuAsset('cet4', '2026年6月英语四级听力音频(1).mp3'),
    note: NJU_NOTE,
    checkedAt: CHECKED_AT,
  },
  {
    id: 'cet6-202606-set1-nju',
    level: 'cet6',
    year: 2026,
    month: 6,
    title: '2026年6月六级真题资料 · 第1套',
    provider: NJU_PROVIDER,
    sourceUrl: 'https://eol.nju.edu.cn/cet6/papers/202606-1.html',
    paperUrl: njuAsset('cet6', '2026年6月大学英语六级真题（第1套）.pdf'),
    answersUrl: njuAsset('cet6', '2026年6月六级真题（第1套）答案解析.pdf'),
    audioUrl: njuAsset('cet6', '2026年6月英语六级听力音频.mp3'),
    note: NJU_NOTE,
    checkedAt: CHECKED_AT,
  },
  {
    id: 'cet4-202512-set1-nju',
    level: 'cet4',
    year: 2025,
    month: 12,
    title: '2025年12月四级真题资料 · 第1套',
    provider: NJU_PROVIDER,
    sourceUrl: 'https://eol.nju.edu.cn/cet4/papers/202512-1.html',
    paperUrl: njuAsset('cet4', '2025年12月大学英语四级真题（第一套）_ 完整版精排.pdf'),
    answersUrl: njuAsset('cet4', '2025年12月四级真题（第一套）答案解析.pdf'),
    audioUrl: njuAsset('cet4', '2025年12月四级听力第1套.mp3'),
    note: NJU_NOTE,
    checkedAt: CHECKED_AT,
  },
  {
    id: 'cet6-202512-set1-nju',
    level: 'cet6',
    year: 2025,
    month: 12,
    title: '2025年12月六级真题资料 · 第1套',
    provider: NJU_PROVIDER,
    sourceUrl: 'https://eol.nju.edu.cn/cet6/papers/202512-1.html',
    paperUrl: njuAsset('cet6', '2025年12月大学英语六级真题（第一套）_ 完整版精排.pdf'),
    answersUrl: njuAsset('cet6', '2025年12月六级真题（第一套）答案解析.pdf'),
    audioUrl: njuAsset('cet6', '2025.12六级听力第1套.mp3'),
    note: NJU_NOTE,
    checkedAt: CHECKED_AT,
  },
  {
    id: 'cet4-202506-set1-nju',
    level: 'cet4',
    year: 2025,
    month: 6,
    title: '2025年6月四级真题资料 · 第1套',
    provider: NJU_PROVIDER,
    sourceUrl: 'https://eol.nju.edu.cn/cet4/papers/202506-1.html',
    paperUrl: njuAsset('cet4', '2025年6月大学英语四级真题（第一套）_ 完整版精排.pdf'),
    answersUrl: njuAsset('cet4', '2025年6月四级真题（第一套）·答案解析.pdf'),
    audioUrl: njuAsset('cet4', '2025年06月四级听力音频第1套.mp3'),
    note: NJU_NOTE,
    checkedAt: CHECKED_AT,
  },
  {
    id: 'cet6-202506-set1-nju',
    level: 'cet6',
    year: 2025,
    month: 6,
    title: '2025年6月六级真题资料 · 第1套',
    provider: NJU_PROVIDER,
    sourceUrl: 'https://eol.nju.edu.cn/cet6/papers/202506-1.html',
    paperUrl: njuAsset('cet6', '2025年6月大学英语六级真题（第一套）_ 完整版精排.pdf'),
    answersUrl: njuAsset('cet6', '六级真题·2025年6月第1套 _ 答案纯净版.pdf'),
    audioUrl: njuAsset('cet6', '2025年06月六级听力音频1.mp3'),
    note: NJU_NOTE,
    checkedAt: CHECKED_AT,
  },
  {
    id: 'cet4-202412-set1-nju',
    level: 'cet4',
    year: 2024,
    month: 12,
    title: '2024年12月四级真题资料 · 第1套',
    provider: NJU_PROVIDER,
    sourceUrl: 'https://eol.nju.edu.cn/cet4/papers/202412-1.html',
    paperUrl: njuAsset('cet4', '2024年12月大学英语四级真题（第一套）_ 完整版精排.pdf'),
    answersUrl: njuAsset('cet4', '2024年12月四级真题（第一套）·答案解析.pdf'),
    audioUrl: njuAsset('cet4', '2024年12月英语四级听力（第一套）.mp3'),
    note: NJU_NOTE,
    checkedAt: CHECKED_AT,
  },
  {
    id: 'cet6-202412-set1-nju',
    level: 'cet6',
    year: 2024,
    month: 12,
    title: '2024年12月六级真题资料 · 第1套',
    provider: NJU_PROVIDER,
    sourceUrl: 'https://eol.nju.edu.cn/cet6/papers/202412-1.html',
    paperUrl: njuAsset('cet6', '2024年12月大学英语六级真题（第一套）_ 完整版精排.pdf'),
    answersUrl: njuAsset('cet6', '2024年12月六级真题（第一套）答案解析.pdf'),
    audioUrl: njuAsset('cet6', '2024年12月英语六级听力（第一套）.mp3'),
    note: NJU_NOTE,
    checkedAt: CHECKED_AT,
  },
  {
    id: 'cet4-202406-set1-nju',
    level: 'cet4',
    year: 2024,
    month: 6,
    title: '2024年6月四级真题资料 · 第1套',
    provider: NJU_PROVIDER,
    sourceUrl: 'https://eol.nju.edu.cn/cet4/papers/202406-1.html',
    paperUrl: njuAsset('cet4', '2024年6月大学英语四级真题（第一套）_ 完整版精排.pdf'),
    answersUrl: njuAsset('cet4', '2024年6月四级真题（第一套）·答案解析.pdf'),
    audioUrl: njuAsset('cet4', '2024年06月大学英语四级听力（第1套）.mp3'),
    note: NJU_NOTE,
    checkedAt: CHECKED_AT,
  },
  {
    id: 'cet6-202406-set1-nju',
    level: 'cet6',
    year: 2024,
    month: 6,
    title: '2024年6月六级真题资料 · 第1套',
    provider: NJU_PROVIDER,
    sourceUrl: 'https://eol.nju.edu.cn/cet6/papers/202406-1.html',
    paperUrl: njuAsset('cet6', '2024年6月大学英语六级真题（第一套）_ 完整版精排.pdf'),
    answersUrl: njuAsset('cet6', '2024年6月六级真题（第一套）答案解析.pdf'),
    audioUrl: njuAsset('cet6', '2024年6月六级真题（第1套）.mp3'),
    note: NJU_NOTE,
    checkedAt: CHECKED_AT,
  },
  {
    id: 'cet4-202312-set1-xjsmc',
    level: 'cet4',
    year: 2023,
    month: 12,
    title: '2023年12月四级真题资料 · 第1套',
    provider: XJ_PROVIDER,
    sourceUrl: XJ_SOURCE,
    paperUrl: xjAsset(11994549),
    audioUrl: xjAsset(11994551),
    note: XJ_NOTE,
    checkedAt: CHECKED_AT,
  },
  {
    id: 'cet6-202312-set1-xjsmc',
    level: 'cet6',
    year: 2023,
    month: 12,
    title: '2023年12月六级真题资料 · 第1套',
    provider: XJ_PROVIDER,
    sourceUrl: XJ_SOURCE,
    paperUrl: xjAsset(11994564),
    audioUrl: xjAsset(11994567),
    note: XJ_NOTE,
    checkedAt: CHECKED_AT,
  },
  {
    id: 'cet4-202306-set1-xjsmc',
    level: 'cet4',
    year: 2023,
    month: 6,
    title: '2023年6月四级真题资料 · 第1套',
    provider: XJ_PROVIDER,
    sourceUrl: XJ_SOURCE,
    paperUrl: xjAsset(11994544),
    audioUrl: xjAsset(11994547),
    note: XJ_NOTE,
    checkedAt: CHECKED_AT,
  },
  {
    id: 'cet6-202306-set1-xjsmc',
    level: 'cet6',
    year: 2023,
    month: 6,
    title: '2023年6月六级真题资料 · 第1套',
    provider: XJ_PROVIDER,
    sourceUrl: XJ_SOURCE,
    paperUrl: xjAsset(11994559),
    audioUrl: xjAsset(11994562),
    note: XJ_NOTE,
    checkedAt: CHECKED_AT,
  },
];
