#!/usr/bin/env python3
"""
生成单文件 HTML 演示页。

把 7 张真机截图以 base64 内嵌，输出一个自包含的 demo.html：
不依赖网络、不依赖图片文件，双击即可打开演示。

用法：python scripts/build-demo.py
"""
import base64
import glob
import json
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEMO_DIR = ROOT / 'demo'
OUT = ROOT / 'demo.html'

# 页面清单：key 对应截图文件名，其余是展示文案
# 宽屏截图单独展示
DESKTOP = [
    ('desktop', '电脑端今日', '左侧固定导航 + 多列内容', '宽屏下自动切换为侧边栏布局。顶栏常驻主题切换与设置。'),
    ('stats', '统计', '六个图表，每个回答一个问题', '词汇量累计、掌握分布、词频档位、正确率趋势、热力图、7 天预测。全部用 SVG 与 CSS 画，跟着主题换色。'),
    ('settings', '设置', '风格与配色分开选', '4 种视觉风格 × 6 种配色自由组合。词书、考试场次、数据备份都在这里。'),
    ('soft', '换一套风格', '现代极简 + 晨光米白', '同一套应用，换个风格就是干净的浅色效率工具。不喜欢像素风不必将就。'),
]

# 手机截图
PAGES = [
    ('battle', '战斗', '单轮 24 题，复习优先', '到期复习先排，剩余名额给新词。进度条分母固定为初始题量，答错重排不虚增总数。'),
    ('listening', '听力', '四种题型，不再是整句默写', '选词填空、听音选义、词序排列，整句听写默认关闭。10 篇内置材料 + 真题导入。'),
]

FEATURES = [
    ('FSRS 间隔重复', 'ts-fsrs 官方默认参数，四档评级由作答正确性与用时自动推导，也可手动纠正。'),
    ('六种题型', '看词选义 / 看义选词 / 拼写 / 听音辨义 / 听音拼写。复习轮里拼写类占一半以上。'),
    ('六本词书', '四级/六级各分核心与全本，另有考研核心、雅思核心。ECDICT（MIT）同源，清洗释义、归一化 IPA。'),
    ('词根拆解', '611 条词根词缀，448 条带本地例词，可拆解 1506 个单词。'),
    ('听力四题型', '选词填空 / 听音选义 / 词序排列 / 整句听写（可选）。10 篇内置原创材料 + 真题导入。'),
    ('电脑与手机都适配', '宽屏切侧边栏多列布局，窄屏底部导航单列。同一套代码，不用装两个版本。'),
    ('英语水平命名', '词芽 / 短语匠 / 段落读者 / 论说文手 / 学术阅览者 / 语感行家 / 词源考据者，每个都对应具体能做的事。'),
    ('多套视觉风格', '像素复古 / 现代极简 / 护眼纸墨 / 暗夜专注，配 6 种配色，自由组合。'),
    ('离线优先', 'Workbox 预缓存 500KB，词库按需缓存。断网刷新、断网答题全部可用。'),
]

FIXES = [
    ('听力音频存不回来', 'Dexie schema 漏声明 media 表，导入的音频静默丢失', 'schema 升到 v2'),
    ('手动改评级重复计分', '同一题写两条日志、重复加经验', '改为改写日志后重放'),
    ('听力经验不进等级', 'XP 只写 daily 不写 profile', '统一走 awardRewards'),
    ('连击成就永不解锁', 'recordCombo 定义了却从未调用', '接入答题流程'),
    ('听力成就永不解锁', '答题后从不检查成就', '补上 checkAchievements'),
    ('宝箱碎片不发放', '只弹提示，不写数据', '写入 themeFragments 并开放兑换'),
    ('只听力不算有效学习日', '不更新 studySeconds', '时长与句数一起累加'),
    ('连点重复提交', '一次作答写多条日志', '加同步 submittingRef 锁'),
    ('一轮 36 题劝退', '复习堆积时无上限', '上限 24 题，剩余提示再来一轮'),
    ('休眠机制形同虚设', 'dormancy 从不置 true', '启动时按 30 天未学判定'),
]

STATS = [
    ('13433', '词条总数'),
    ('6', '本词书'),
    ('611', '词根词缀'),
    ('10', '内置听力'),
    ('4', '听力题型'),
    ('4×6', '风格×配色'),
]


def load_shots():
    shots = {}
    for f in sorted(glob.glob(str(DEMO_DIR / 'shot-*.png'))):
        key = os.path.basename(f).replace('shot-', '').replace('.png', '')
        with open(f, 'rb') as fh:
            shots[key] = 'data:image/png;base64,' + base64.b64encode(fh.read()).decode()
    return shots


def render():
    shots = load_shots()
    missing = [k for k, *_ in PAGES if k not in shots]
    if missing:
        raise SystemExit(f'缺少截图：{missing}，请先运行截图步骤')

    desktop_cards = []
    for i, (key, name, headline, desc) in enumerate(DESKTOP):
        desktop_cards.append(f'''
      <article class="wide-card">
        <div class="wide-frame">
          <img src="{shots[key]}" alt="{name}界面截图（电脑端）" loading="lazy" width="1440" height="900">
        </div>
        <div class="phone-caption">
          <div class="caption-index">D{i + 1:02d}</div>
          <h3>{name}</h3>
          <p class="caption-head">{headline}</p>
          <p class="caption-desc">{desc}</p>
        </div>
      </article>''')

    page_cards = []
    for i, (key, name, headline, desc) in enumerate(PAGES):
        page_cards.append(f'''
      <article class="phone-card">
        <div class="phone">
          <div class="phone-notch"></div>
          <img src="{shots[key]}" alt="{name}页面截图" loading="lazy" width="420" height="900">
        </div>
        <div class="phone-caption">
          <div class="caption-index">{i + 1:02d}</div>
          <h3>{name}</h3>
          <p class="caption-head">{headline}</p>
          <p class="caption-desc">{desc}</p>
        </div>
      </article>''')

    feature_items = '\n'.join(
        f'''      <li>
        <h3>{t}</h3>
        <p>{d}</p>
      </li>''' for t, d in FEATURES
    )

    fix_rows = '\n'.join(
        f'''      <tr>
        <td class="fix-name">{n}</td>
        <td>{sym}</td>
        <td class="fix-way">{w}</td>
      </tr>''' for n, sym, w in FIXES
    )

    stat_items = '\n'.join(
        f'''      <div class="stat">
        <div class="stat-num">{v}</div>
        <div class="stat-label">{l}</div>
      </div>''' for v, l in STATS
    )

    return f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>单词勇者 WordQuest · 项目演示</title>
<style>
  :root {{
    --bg: #0d0d1a;
    --panel: #16162a;
    --panel-2: #1e1e36;
    --edge: #525285;
    --gold: #ffe845;
    --pass: #3cdb6f;
    --text: #e8e8f5;
    --dim: #9494bf;
  }}
  * {{ box-sizing: border-box; }}
  html {{ scroll-behavior: smooth; }}
  body {{
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: ui-monospace, "SFMono-Regular", "Cascadia Mono", Consolas, monospace;
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
  }}
  ::selection {{ background: var(--gold); color: #14140f; }}

  .wrap {{ max-width: 1120px; margin: 0 auto; padding: 0 20px; }}

  /* 顶部 */
  header {{
    border-bottom: 2px solid var(--edge);
    padding: 56px 0 40px;
  }}
  .eyebrow {{
    font-size: 12px;
    letter-spacing: 0.18em;
    color: var(--gold);
    text-transform: uppercase;
  }}
  h1 {{
    font-size: clamp(32px, 6vw, 56px);
    line-height: 1.05;
    margin: 12px 0 16px;
    letter-spacing: -0.01em;
  }}
  .lede {{
    font-size: 16px;
    color: var(--dim);
    max-width: 62ch;
    margin: 0;
  }}
  .lede strong {{ color: var(--text); font-weight: 400; }}

  .stats {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 2px;
    margin-top: 32px;
    border: 2px solid var(--edge);
    background: var(--edge);
  }}
  .stat {{ background: var(--panel); padding: 16px 14px; }}
  .stat-num {{
    font-size: 28px;
    color: var(--gold);
    font-variant-numeric: tabular-nums;
  }}
  .stat-label {{ font-size: 12px; color: var(--dim); }}

  /* 区块 */
  section {{ padding: 56px 0; border-bottom: 2px solid var(--edge); }}
  section:last-of-type {{ border-bottom: 0; }}
  h2 {{
    font-size: 12px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--gold);
    margin: 0 0 8px;
  }}
  .section-title {{
    font-size: clamp(22px, 3.4vw, 32px);
    margin: 0 0 12px;
    line-height: 1.2;
  }}
  .section-note {{ color: var(--dim); max-width: 66ch; margin: 0 0 32px; font-size: 14px; }}

  /* 页面截图 */
  .phones {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 32px 24px;
  }}
  .phone-card {{ margin: 0; }}
  .phone {{
    position: relative;
    border: 2px solid var(--edge);
    box-shadow: 6px 6px 0 #000;
    background: var(--panel-2);
    overflow: hidden;
  }}
  .phone-notch {{
    position: absolute;
    top: 0; left: 50%; transform: translateX(-50%);
    width: 88px; height: 5px;
    background: var(--edge);
    z-index: 2;
  }}
  .phone img {{ display: block; width: 100%; height: auto; }}
  .phone-caption {{ padding: 14px 2px 0; }}
  .wides {{ display: grid; gap: 32px; margin-bottom: 40px; }}
  .wide-frame {{
    border: 2px solid var(--edge);
    box-shadow: 6px 6px 0 #000;
    background: var(--panel-2);
    overflow: hidden;
  }}
  .wide-frame img {{ display: block; width: 100%; height: auto; }}
  .subhead {{
    font-size: 12px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--dim);
    margin: 0 0 20px;
    padding-top: 8px;
    border-top: 2px solid var(--edge);
  }}
  .caption-index {{
    font-size: 11px;
    color: var(--dim);
    font-variant-numeric: tabular-nums;
  }}
  .phone-caption h3 {{ margin: 2px 0 4px; font-size: 16px; }}
  .caption-head {{ margin: 0 0 6px; font-size: 13px; color: var(--gold); }}
  .caption-desc {{ margin: 0; font-size: 13px; color: var(--dim); }}

  /* 功能 */
  .features {{
    list-style: none;
    margin: 0; padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 2px;
    background: var(--edge);
    border: 2px solid var(--edge);
  }}
  .features li {{ background: var(--panel); padding: 20px; }}
  .features h3 {{
    margin: 0 0 8px;
    font-size: 15px;
    color: var(--text);
  }}
  .features p {{ margin: 0; font-size: 13px; color: var(--dim); }}

  /* 缺陷表 */
  .fix-table {{
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }}
  .fix-table th {{
    text-align: left;
    font-weight: 400;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--dim);
    padding: 0 12px 10px 0;
    border-bottom: 2px solid var(--edge);
  }}
  .fix-table td {{
    padding: 12px 12px 12px 0;
    border-bottom: 1px solid var(--panel-2);
    color: var(--dim);
    vertical-align: top;
  }}
  .fix-table tr:last-child td {{ border-bottom: 0; }}
  .fix-name {{ color: var(--text); white-space: nowrap; }}
  .fix-way {{ color: var(--pass); }}

  /* 技术栈 */
  .stack {{
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }}
  .stack span {{
    border: 2px solid var(--edge);
    padding: 6px 10px;
    font-size: 12px;
    color: var(--dim);
  }}

  footer {{
    padding: 40px 0 64px;
    color: var(--dim);
    font-size: 12px;
  }}
  footer p {{ margin: 4px 0; }}

  @media (max-width: 640px) {{
    header {{ padding: 40px 0 32px; }}
    section {{ padding: 40px 0; }}
    .fix-table {{ font-size: 12px; }}
    .fix-table th:first-child, .fix-table td:first-child {{ white-space: normal; }}
  }}
</style>
</head>
<body>

<header>
  <div class="wrap">
    <div class="eyebrow">离线优先 · 像素 RPG · 四六级</div>
    <h1>单词勇者<br>WordQuest</h1>
    <p class="lede">
      把「背单词 + 练听力」变成像素 RPG 冒险。你背下的每个单词，都是勇者斩下的一只怪物。
      <strong>完全离线可用，无内购，无广告。</strong>
      复习调度用 FSRS，词库与词根来自 ECDICT（MIT）。
    </p>
    <div class="stats">
{stat_items}
    </div>
  </div>
</header>

<section>
  <div class="wrap">
    <h2>界面</h2>
    <p class="section-title">{len(DESKTOP) + len(PAGES)} 个真实界面，全部来自浏览器实拍</p>
    <p class="section-note">
      下面是电脑端（1440×900）与手机端（390×844）的实际截图，不是设计稿。
      像素字体只在 12 的整数倍上渲染，五套主题的副文字对比度实测 5.08-8.09，全部通过 WCAG AA。
    </p>
    <div class="wides">
{''.join(desktop_cards)}
    </div>
    <h3 class="subhead">手机端</h3>
    <div class="phones">
{''.join(page_cards)}
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <h2>能力</h2>
    <p class="section-title">做了什么</p>
    <ul class="features">
{feature_items}
    </ul>
  </div>
</section>

<section>
  <div class="wrap">
    <h2>质量</h2>
    <p class="section-title">开发中查出并修掉的 10 个真实缺陷</p>
    <p class="section-note">
      这些不是笔误，是会导致数据丢失或功能永远不生效的问题。每一条都经过复现验证。
    </p>
    <table class="fix-table">
      <thead>
        <tr><th>缺陷</th><th>后果</th><th>修复方式</th></tr>
      </thead>
      <tbody>
{fix_rows}
      </tbody>
    </table>
  </div>
</section>

<section>
  <div class="wrap">
    <h2>技术</h2>
    <p class="section-title">栈与约束</p>
    <p class="section-note">
      React 18 + TypeScript + Vite 6，Dexie 管 IndexedDB，ts-fsrs 管调度，Workbox 管离线。
      数据即真相：IndexedDB 是主存储，复习日志只追加不改写，同步取并集后重放。
    </p>
    <div class="stack">
      <span>React 18</span>
      <span>TypeScript</span>
      <span>Vite 6</span>
      <span>Tailwind</span>
      <span>Dexie</span>
      <span>ts-fsrs</span>
      <span>Workbox</span>
      <span>Zustand</span>
      <span>ECDICT (MIT)</span>
      <span>Fusion Pixel (OFL 1.1)</span>
    </div>
  </div>
</section>

<footer>
  <div class="wrap">
    <p>单词勇者 WordQuest · 四六级学习应用</p>
    <p>词库 ECDICT (MIT) · 复习算法 ts-fsrs (MIT) · 字体 Fusion Pixel (OFL 1.1)</p>
    <p>本页为单文件演示，截图已内嵌，无需联网即可查看。</p>
  </div>
</footer>

</body>
</html>
'''


def main():
    html = render()
    OUT.write_text(html, encoding='utf-8')
    size_kb = OUT.stat().st_size / 1024
    print(f'已生成 {OUT.relative_to(ROOT)}  ({size_kb:.0f} KB)')
    print(f'页面数：{len(PAGES)} · 功能条目：{len(FEATURES)} · 缺陷条目：{len(FIXES)}')


if __name__ == '__main__':
    main()
