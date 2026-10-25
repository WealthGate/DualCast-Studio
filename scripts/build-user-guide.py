"""Build the bundled user guide from its Markdown source using ReportLab."""
from pathlib import Path
import re
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/OpenChurch-Broadcast-Studio-User-Guide.md"
OUTPUT = ROOT / "assets/OpenChurch-Broadcast-Studio-User-Guide.pdf"
VERSION = __import__("json").loads((ROOT / "package.json").read_text())["version"]


def inline(text):
    text = text.translate(str.maketrans({"→": " > ", "…": "...", "–": "-", "—": "-", "‑": "-", "’": "'", "‘": "'", "“": '"', "”": '"'}))
    text = escape(text)
    def link(match):
        title, url = match.groups()
        if not url.startswith(("https://", "http://")):
            url = f"https://github.com/WealthGate/DualCast-Studio/blob/v{VERSION}/docs/{url}"
        return f'<link href="{url}" color="#236398">{title}</link>'
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link, text)
    text = re.sub(r"`([^`]+)`", r'<font name="Courier" size="8.4">\1</font>', text)
    return re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="GuideBody", fontName="Helvetica", fontSize=10, leading=14, spaceAfter=7, textColor=colors.HexColor("#233044"), alignment=TA_LEFT))
styles.add(ParagraphStyle(name="GuideTitle", parent=styles["GuideBody"], fontName="Helvetica-Bold", fontSize=22, leading=27, spaceAfter=18))
styles.add(ParagraphStyle(name="GuideSection", parent=styles["GuideBody"], fontName="Helvetica-Bold", fontSize=15, leading=20, spaceBefore=14, spaceAfter=8, keepWithNext=True))
styles.add(ParagraphStyle(name="GuideSubsection", parent=styles["GuideSection"], fontSize=11, leading=15, spaceBefore=9))
styles.add(ParagraphStyle(name="GuideList", parent=styles["GuideBody"], leftIndent=17, firstLineIndent=-13, spaceAfter=5))
story, paragraph = [], []


def flush():
    if paragraph:
        story.append(Paragraph(inline(" ".join(paragraph)), styles["GuideBody"]))
        paragraph.clear()


for line in SOURCE.read_text(encoding="utf-8").splitlines():
    if not line.strip():
        flush()
    elif line.startswith("# "):
        flush(); story.append(Paragraph(inline(line[2:]), styles["GuideTitle"]))
    elif line.startswith("## "):
        flush(); story.append(Paragraph(inline(line[3:]), styles["GuideSection"]))
    elif line.startswith("### "):
        flush(); story.append(Paragraph(inline(line[4:]), styles["GuideSubsection"]))
    elif re.match(r"^(?:- |\d+\. )", line):
        flush(); story.append(Paragraph(inline(line), styles["GuideList"]))
    else:
        paragraph.append(line.strip())
flush()


def footer(canvas, document):
    canvas.saveState(); canvas.setStrokeColor(colors.HexColor("#d1d9e3")); canvas.setLineWidth(.5)
    canvas.line(42, 36, A4[0] - 42, 36)
    canvas.setFont("Helvetica", 8); canvas.setFillColor(colors.HexColor("#5b6b80"))
    canvas.drawString(42, 23, f"OpenChurch Broadcast Studio v{VERSION} - User Guide")
    canvas.drawRightString(A4[0] - 42, 23, str(document.page)); canvas.restoreState()


document = SimpleDocTemplate(str(OUTPUT), pagesize=A4, leftMargin=42, rightMargin=42, topMargin=38, bottomMargin=48,
                             title=f"OpenChurch Broadcast Studio v{VERSION} - Complete User Guide", author="OpenChurch Broadcast Studio")
document.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUTPUT)
