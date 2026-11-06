"""Gera o banner (PNG 360x84) do instalador e imprime como literal de string ExtendScript."""
import io, sys
from PIL import Image, ImageDraw, ImageFont

W, H = 360, 84
S = 3  # supersampling
img = Image.new('RGB', (W * S, H * S), (11, 13, 14))
d = ImageDraw.Draw(img)
bold = ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-Bold.otf', 30 * S)
reg = ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-Regular.otf', 11 * S)

# título com espaçamento entre letras
x, y = 22 * S, 16 * S
for ch in 'ABRIDOR':
    d.text((x, y), ch, font=bold, fill=(5, 166, 255))
    x += d.textlength(ch, font=bold) + 4 * S
d.text((22 * S, 54 * S), 'layouts de PPTX e PDF no After Effects', font=reg, fill=(147, 149, 152))

# linha em degradê (azul -> roxo) na base
for i in range(W * S):
    t = i / (W * S)
    c = tuple(int(a + (b - a) * t) for a, b in zip((5, 166, 255), (136, 0, 248)))
    d.line([(i, H * S - 3 * S), (i, H * S)], fill=c)

img = img.resize((W, H), Image.LANCZOS)
buf = io.BytesIO()
img.save(buf, 'PNG', optimize=True)
if len(sys.argv) > 1:
    img.save(sys.argv[1])
out = ''
for b in buf.getvalue():
    c = chr(b)
    if c == "'" or c == '\\':
        out += '\\' + c
    elif 32 <= b < 127:
        out += c
    else:
        out += '\\x%02X' % b
print("'" + out + "'")
