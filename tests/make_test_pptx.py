"""Gera um PPTX de teste com casos variados (alinhamentos, runs mistos, slide oculto, tabela, grupo, rotação)."""
import sys
from pptx import Presentation
from pptx.util import Pt, Emu, Inches
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
blank = prs.slide_layouts[6]
title_layout = prs.slide_layouts[0]

# 1: título (placeholders herdados do layout)
s = prs.slides.add_slide(title_layout)
s.shapes.title.text = "TEMPLATE DE CRÉDITOS"
s.placeholders[1].text = "dramaturgia curta"

# 2: créditos centralizados com runs mistos
s = prs.slides.add_slide(blank)
bg = s.background.fill; bg.solid(); bg.fore_color.rgb = RGBColor(0x10, 0x10, 0x30)
tb = s.shapes.add_textbox(Inches(2), Inches(2.5), Inches(9.333), Inches(2.5))
tf = tb.text_frame; tf.word_wrap = True; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
r = p.add_run(); r.text = "direção "; r.font.size = Pt(24); r.font.name = "Arial"; r.font.color.rgb = RGBColor(0xAA, 0xAA, 0xAA)
r = p.add_run(); r.text = "FULANO DE TAL"; r.font.size = Pt(36); r.font.bold = True; r.font.name = "Arial"; r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
p2 = tf.add_paragraph(); p2.alignment = PP_ALIGN.CENTER
r = p2.add_run(); r.text = "roteiro BELTRANA SILVA"; r.font.size = Pt(28); r.font.name = "Georgia"; r.font.color.rgb = RGBColor(0xFF, 0xCC, 0x00)

# 3: oculto
s = prs.slides.add_slide(blank)
s._element.set('show', '0')
tb = s.shapes.add_textbox(Inches(1), Inches(1), Inches(5), Inches(1))
tb.text_frame.text = "slide oculto"

# 4: esquerda / direita / rotação / sem quebra
s = prs.slides.add_slide(blank)
tb = s.shapes.add_textbox(Inches(0.5), Inches(0.5), Inches(5), Inches(1.5))
tb.text_frame.word_wrap = True
tb.text_frame.text = "texto alinhado à esquerda com quebra automática de linha bem longa para testar"
for r in tb.text_frame.paragraphs[0].runs: r.font.size = Pt(20)
tb = s.shapes.add_textbox(Inches(7.5), Inches(0.5), Inches(5.3), Inches(1))
tb.text_frame.text = "à direita"; tb.text_frame.paragraphs[0].alignment = PP_ALIGN.RIGHT
tb.text_frame.vertical_anchor = MSO_ANCHOR.BOTTOM
tb = s.shapes.add_textbox(Inches(5), Inches(4), Inches(3), Inches(0.8))
tb.rotation = -15
tb.text_frame.text = "rotacionado"
tb = s.shapes.add_textbox(Inches(1), Inches(6), Inches(2), Inches(0.6))
tb.text_frame.word_wrap = False
tb.text_frame.text = "sem quebra de linha, passa da caixa"
rect = s.shapes.add_shape(1, Inches(9), Inches(3), Inches(3), Inches(2))
rect.fill.solid(); rect.fill.fore_color.rgb = RGBColor(0x05, 0xA6, 0xFF)
rect.text_frame.text = "forma com texto"

# 5: tabela
s = prs.slides.add_slide(blank)
tbl = s.shapes.add_table(3, 2, Inches(2), Inches(2), Inches(9), Inches(3)).table
data = [["função", "nome"], ["produção", "CICLANO"], ["música", "JOÃO"]]
for i, row in enumerate(data):
    for j, v in enumerate(row):
        tbl.cell(i, j).text = v

# 6: grupo
s = prs.slides.add_slide(blank)
grp = s.shapes.add_group_shape()
a = grp.shapes.add_textbox(Inches(1), Inches(1), Inches(4), Inches(1)); a.text_frame.text = "no grupo A"
b = grp.shapes.add_textbox(Inches(1), Inches(3), Inches(4), Inches(1)); b.text_frame.text = "no grupo B"

prs.save(sys.argv[1])
print("ok", sys.argv[1])
