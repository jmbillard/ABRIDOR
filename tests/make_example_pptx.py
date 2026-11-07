"""Gera 'test files/exemplo_creditos.pptx', usado nos prints do README."""
import sys
from pptx import Presentation
from pptx.util import Pt, Inches
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

BG = RGBColor(0x0E, 0x10, 0x1A)
ROLE = RGBColor(0x9A, 0xA3, 0xB5)
NAME = RGBColor(0xFF, 0xFF, 0xFF)
ACCENT = RGBColor(0x05, 0xA6, 0xFF)

prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
blank = prs.slide_layouts[6]


def slide(hidden=False):
    s = prs.slides.add_slide(blank)
    f = s.background.fill
    f.solid()
    f.fore_color.rgb = BG
    if hidden:
        s._element.set('show', '0')
    return s


def box(s, x, y, w, h, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE):
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.paragraphs[0].alignment = align
    return tf


def run(p, text, font, size, color, bold=False):
    r = p.add_run()
    r.text = text
    r.font.name = font
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.color.rgb = color
    return r


def credit(tf, role, names, align=PP_ALIGN.CENTER, first=True):
    p = tf.paragraphs[0] if first else tf.add_paragraph()
    p.alignment = align
    run(p, role, 'Inter Light', 20, ROLE)
    for n in names:
        q = tf.add_paragraph()
        q.alignment = align
        run(q, n, 'Inter', 34, NAME, bold=True)


# 1 · título
s = slide()
line = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(5.67), Inches(4.35), Inches(2), Inches(0.06))
line.fill.solid(); line.fill.fore_color.rgb = ACCENT; line.line.fill.background()
tf = box(s, 1.5, 2.2, 10.333, 2)
run(tf.paragraphs[0], 'O SOM DO MAR', 'Gotham Black', 72, NAME)
tf = box(s, 1.5, 4.6, 10.333, 0.8)
run(tf.paragraphs[0], 'série original · episódio 1', 'Inter Light', 24, ROLE)

# 2 · direção
s = slide()
tf = box(s, 2, 2.4, 9.333, 2.6)
credit(tf, 'direção', ['ANA BEATRIZ LIMA'])

# 3 · duas colunas
s = slide()
tf = box(s, 0.8, 4.4, 5.5, 2.4, PP_ALIGN.LEFT, MSO_ANCHOR.BOTTOM)
credit(tf, 'roteiro', ['Carla Menezes', 'Rafael Toledo'], PP_ALIGN.LEFT)
tf = box(s, 7.0, 4.4, 5.5, 2.4, PP_ALIGN.RIGHT, MSO_ANCHOR.BOTTOM)
credit(tf, 'direção de fotografia', ['Marcos Viana, ABC'], PP_ALIGN.RIGHT)

# 4 · oculto
s = slide(hidden=True)
tf = box(s, 2, 3, 9.333, 1.5)
run(tf.paragraphs[0], 'rascunho — não usar', 'Calibri', 40, ROLE)

# 5 · elenco
s = slide()
tf = box(s, 2, 1.2, 9.333, 5.2)
p = tf.paragraphs[0]
run(p, 'elenco', 'Inter Light', 20, ROLE)
for n in ['Júlia Andrade', 'Pedro Henrique Sá', 'Luiza Prado', 'Tomás Ribeiro']:
    q = tf.add_paragraph(); q.alignment = PP_ALIGN.CENTER
    run(q, n, 'Inter', 34, NAME, bold=True)

# 6 · produção (texto em Calibri, sem a fonte instalada nos prints)
s = slide()
tf = box(s, 2, 2.6, 9.333, 2.2)
run(tf.paragraphs[0], 'uma produção', 'Calibri', 22, ROLE)
q = tf.add_paragraph(); q.alignment = PP_ALIGN.CENTER
run(q, 'ESTÚDIO HORIZONTE', 'Calibri', 44, NAME, bold=True)

prs.save(sys.argv[1] if len(sys.argv) > 1 else 'test files/exemplo_creditos.pptx')
print('ok')
