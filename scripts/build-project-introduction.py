"""Build the shareable project introduction from its Markdown source."""

from pathlib import Path
import html
import re
from urllib.parse import urlsplit

from reportlab.lib import colors, textsplit
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, StyleSheet1
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate
from reportlab.platypus import paragraph as paragraph_layout


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "WordQuest-项目介绍.md"
OUTPUT = ROOT / "output" / "pdf" / "WordQuest-项目介绍.pdf"


def inline(text: str) -> str:
    tokens = re.compile(r"\*\*(.+?)\*\*|\[([^\]\n]+)\]\((https?://[^\s<>]+?)\)", re.IGNORECASE)

    def render(value: str) -> str:
        parts = []
        cursor = 0
        for token in tokens.finditer(value):
            parts.append(html.escape(value[cursor:token.start()]))
            bold, label, target = token.groups()
            if bold is not None:
                parts.append(f"<b>{render(bold)}</b>")
            else:
                try:
                    parsed = urlsplit(target)
                    safe = parsed.scheme.lower() in {"http", "https"} and bool(parsed.hostname)
                    safe = safe and not any(ord(char) < 32 or ord(char) == 127 for char in target)
                except ValueError:
                    safe = False
                if safe:
                    href = html.escape(target, quote=True)
                    parts.append(f'<link href="{href}" color="#2D5D8C"><u>{render(label)}</u></link>')
                else:
                    parts.append(html.escape(token.group(0)))
            cursor = token.end()
        parts.append(html.escape(value[cursor:]))
        return "".join(parts)

    return render(text.strip())


def build() -> None:
    # ReportLab's CJK defaults omit these common Chinese full-width marks.
    textsplit.ALL_CANNOT_START += "，；：？！"
    paragraph_layout.ALL_CANNOT_START = textsplit.ALL_CANNOT_START
    pdfmetrics.registerFont(TTFont("YaHei", "C:/Windows/Fonts/msyh.ttc", subfontIndex=0))
    pdfmetrics.registerFont(TTFont("YaHeiBold", "C:/Windows/Fonts/msyhbd.ttc", subfontIndex=0))
    pdfmetrics.registerFontFamily("YaHei", normal="YaHei", bold="YaHeiBold", italic="YaHei", boldItalic="YaHeiBold")
    pdfmetrics.registerFont(TTFont("Arial", "C:/Windows/Fonts/arial.ttf"))
    pdfmetrics.registerFont(TTFont("ArialBold", "C:/Windows/Fonts/arialbd.ttf"))
    pdfmetrics.registerFontFamily("Arial", normal="Arial", bold="ArialBold", italic="Arial", boldItalic="ArialBold")

    styles = StyleSheet1()
    styles.add(ParagraphStyle("Body", fontName="YaHei", fontSize=10.8, leading=18.2, textColor=colors.HexColor("#242835"), spaceAfter=9, wordWrap="CJK", alignment=TA_LEFT))
    styles.add(ParagraphStyle("Title", parent=styles["Body"], fontName="YaHeiBold", fontSize=23, leading=32, textColor=colors.black, spaceAfter=13, keepWithNext=True))
    styles.add(ParagraphStyle("Subtitle", parent=styles["Body"], fontSize=12, leading=20, textColor=colors.HexColor("#555A69"), spaceAfter=17, keepWithNext=True))
    styles.add(ParagraphStyle("H2", parent=styles["Body"], fontName="YaHeiBold", fontSize=15, leading=23, textColor=colors.HexColor("#343451"), spaceBefore=9, spaceAfter=9, keepWithNext=True))
    styles.add(ParagraphStyle("H3", parent=styles["Body"], fontName="YaHeiBold", fontSize=11.8, leading=19, spaceBefore=6, spaceAfter=6, keepWithNext=True))
    styles.add(ParagraphStyle("List", parent=styles["Body"], leftIndent=13, firstLineIndent=-13, spaceAfter=7))
    styles.add(ParagraphStyle("English", parent=styles["Body"], fontName="Arial", fontSize=10.6, leading=15.1, wordWrap=None, spaceAfter=8))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document = SimpleDocTemplate(str(OUTPUT), pagesize=letter, rightMargin=49, leftMargin=49, topMargin=43, bottomMargin=45, title="单词勇者 WordQuest 项目介绍", author="WordQuest", subject="面向大学英语四六级的游戏化英语学习应用", pageCompression=1)
    flow = []
    english = False
    first_paragraph = True
    buffer = []

    def flush():
        nonlocal first_paragraph
        if buffer:
            value = "<br/>".join(inline(part) for part in buffer)
            style = "Subtitle" if first_paragraph else "English" if english else "Body"
            if style == "English":
                value = re.sub(r"([\u3400-\u9fff]+)", r'<font name="YaHei">\1</font>', value)
            flow.append(Paragraph(value, styles[style]))
            buffer.clear()
            first_paragraph = False

    for line in SOURCE.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            flush()
            continue
        if line == "<!-- pagebreak -->":
            flush()
            flow.append(PageBreak())
        elif line.startswith("# "):
            flush()
            flow.append(Paragraph(inline(line[2:]), styles["Title"]))
        elif line.startswith("## "):
            flush()
            english = line == "## English overview"
            flow.append(Paragraph(inline(line[3:]), styles["H2"]))
        elif line.startswith("### "):
            flush()
            flow.append(Paragraph(inline(line[4:]), styles["H3"]))
        elif line.startswith("- ") or re.match(r"^\d+\. ", line):
            flush()
            value = "• " + line[2:] if line.startswith("- ") else line
            flow.append(Paragraph(inline(value), styles["List"]))
        else:
            buffer.append(line.rstrip())
    flush()

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Arial", 8.2)
        canvas.setFillColor(colors.HexColor("#747985"))
        canvas.drawString(49, 24, "WordQuest  |  Project Introduction  |  2026-10-30")
        canvas.drawRightString(letter[0] - 49, 24, str(doc.page))
        canvas.restoreState()

    document.build(flow, onFirstPage=footer, onLaterPages=footer)
    print(str(OUTPUT))


if __name__ == "__main__":
    build()
