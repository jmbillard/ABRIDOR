"""Gera o CSS das micro-interações dos ícones (abridor-cep/css/micro.css).

Cada linha da tabela: ícone, parte (seletor dentro do SVG), animação.
A animação dispara no hover de qualquer botão/rótulo que contenha o ícone
(e na classe .hov, usada na prévia/documentação).
uso: python3 tests/make_micro_css.py
"""
import os

HOSTS = ['button:hover', 'label:hover', '.hov']

# (ícone, parte, origem, animação)
#  origem: 'fill' = centro da própria parte; 'view' = centro do ícone (12,12)
RULES = [
    ('swap', 'path:nth-child(1)', 'fill', 'mi-slide-r .6s var(--spring)'),
    ('swap', 'path:nth-child(2)', 'fill', 'mi-slide-l .6s var(--spring)'),
    ('pages', 'rect:nth-child(1)', 'fill', 'mi-pop .45s var(--spring)'),
    ('pages', 'rect:nth-child(2)', 'fill', 'mi-pop .45s var(--spring) .06s'),
    ('pages', 'rect:nth-child(4)', 'fill', 'mi-pop .45s var(--spring) .12s'),
    ('pages', 'rect:nth-child(3)', 'fill', 'mi-pop .45s var(--spring) .18s'),
    ('comps', 'path:nth-child(1)', 'fill', 'mi-up .55s var(--spring)'),
    ('comps', 'path:nth-child(3)', 'fill', 'mi-down .55s var(--spring)'),
    ('layers', 'path:nth-child(1)', 'fill', 'mi-up .55s var(--spring)'),
    ('fonts', 'path:nth-child(-n+3)', 'fill', 'mi-hop .5s var(--spring)'),
    ('fonts', 'path:nth-child(n+4)', 'fill', 'mi-hop .5s var(--spring) .1s'),
    ('all', 'path', 'fill', 'mi-draw .5s var(--ease)'),
    ('none', 'rect', 'fill', 'mi-pop .45s var(--spring)'),
    ('invert', '', 'view', 'mi-turn .55s var(--spring)'),
    ('range', '', 'view', 'mi-tilt .55s var(--spring)'),
    ('boxes', 'rect:nth-child(n+2)', 'fill', 'mi-march .9s linear infinite'),
    ('image', 'circle', 'fill', 'mi-rise .6s var(--spring)'),
    ('image', 'path', 'fill', 'mi-hop .6s var(--spring) .08s'),
    ('eye', '', 'view', 'mi-blink .4s ease'),
    ('eyeOff', '', 'view', 'mi-blink .4s ease'),
    ('clock', 'path', 'view', 'mi-hands .8s var(--ease)'),
    ('wand', 'path:nth-child(-n+2)', 'view', 'mi-wave .6s var(--spring)'),
    ('wand', 'path:nth-child(3)', 'fill', 'mi-twinkle .6s ease'),
    ('refresh', '', 'view', 'mi-spin-back .6s var(--spring)'),
    ('search', '', 'view', 'mi-seek .6s var(--spring)'),
    ('type', 'path', 'fill', 'mi-stretch .5s var(--spring)'),
    ('autofit', 'path:nth-child(2)', 'fill', 'mi-down .5s var(--spring)'),
    ('project', 'path:nth-child(2)', 'fill', 'mi-drop .7s var(--spring)'),
    ('master', 'rect:nth-child(1)', 'fill', 'mi-slide-l .5s var(--spring)'),
    ('master', 'rect:nth-child(3)', 'fill', 'mi-slide-r .5s var(--spring)'),
    ('alert', '', 'view', 'mi-shake .5s ease'),
    ('arrow', '', 'view', 'mi-nudge-r .5s var(--spring)'),
    ('x', '', 'view', 'mi-turn .45s var(--spring)'),
    ('plus', '', 'view', 'mi-turn .45s var(--spring)'),
    ('minus', '', 'view', 'mi-squash .4s var(--spring)'),
    ('monitor', 'rect', 'fill', 'mi-pop .45s var(--spring)'),
    ('tag', '', 'view', 'mi-swing .6s var(--spring)'),
    ('tune', 'circle:nth-of-type(1)', 'fill', 'mi-slide-l .55s var(--spring)'),
    ('tune', 'circle:nth-of-type(2)', 'fill', 'mi-slide-r .55s var(--spring)'),
    ('tune', 'circle:nth-of-type(3)', 'fill', 'mi-slide-l .55s var(--spring) .05s'),
    ('fit', 'rect:nth-child(2)', 'fill', 'mi-pop .45s var(--spring)'),
    ('fill', 'rect:nth-of-type(2)', 'fill', 'mi-grow .5s var(--spring)'),
    ('para', 'path:nth-child(1)', 'fill', 'mi-type .5s var(--ease)'),
    ('para', 'path:nth-child(2)', 'fill', 'mi-type .5s var(--ease) .1s'),
    ('line', 'path:nth-child(1)', 'fill', 'mi-type .45s var(--ease)'),
    ('line', 'path:nth-child(2)', 'fill', 'mi-type .45s var(--ease) .08s'),
    ('line', 'path:nth-child(3)', 'fill', 'mi-type .45s var(--ease) .16s'),
    ('split', 'path:nth-child(4)', 'fill', 'mi-nudge-r .55s var(--spring)'),
    ('split', 'path:nth-child(2)', 'fill', 'mi-type .45s var(--ease)'),
    ('help', '', 'view', 'mi-bob .6s var(--spring)'),
    ('info', 'path', 'fill', 'mi-hop .5s var(--spring)'),
    ('sun', 'path', 'view', 'mi-rays .7s var(--spring)'),
    ('moon', '', 'view', 'mi-swing .7s var(--spring)'),
    ('themeAuto', 'path', 'view', 'mi-spin-half .6s var(--spring)'),
    ('open', 'path:nth-child(n+3)', 'fill', 'mi-up .55s var(--spring)'),
]

KEYFRAMES = """
@keyframes mi-slide-r { 40% { transform: translateX(3px); } }
@keyframes mi-slide-l { 40% { transform: translateX(-3px); } }
@keyframes mi-up { 40% { transform: translateY(-2.5px); } }
@keyframes mi-down { 40% { transform: translateY(2.5px); } }
@keyframes mi-pop { 0% { transform: scale(1); } 35% { transform: scale(.72); } 70% { transform: scale(1.1); } }
@keyframes mi-hop { 35% { transform: translateY(-2.5px); } 65% { transform: translateY(.5px); } }
@keyframes mi-draw { 0% { stroke-dasharray: 20; stroke-dashoffset: 20; } 100% { stroke-dasharray: 20; stroke-dashoffset: 0; } }
@keyframes mi-turn { 100% { transform: rotate(90deg); } }
@keyframes mi-tilt { 30% { transform: rotate(-14deg); } 65% { transform: rotate(8deg); } }
@keyframes mi-march { to { stroke-dashoffset: -7.2; } }
@keyframes mi-rise { 45% { transform: translateY(-3px) scale(1.15); } }
@keyframes mi-blink { 45% { transform: scaleY(.15); } }
@keyframes mi-hands { to { transform: rotate(360deg); } }
@keyframes mi-wave { 30% { transform: rotate(-16deg); } 65% { transform: rotate(8deg); } }
@keyframes mi-twinkle { 0%, 100% { opacity: 1; transform: scale(1); } 40% { opacity: .2; transform: scale(.4); } 70% { opacity: 1; transform: scale(1.3); } }
@keyframes mi-spin-half { to { transform: rotate(180deg); } }
@keyframes mi-spin-back { to { transform: rotate(-180deg); } }
@keyframes mi-seek { 30% { transform: translate(-1.5px, -1.5px) scale(1.1); } 65% { transform: translate(1px, 1px); } }
@keyframes mi-stretch { 40% { transform: scaleX(1.18); } 70% { transform: scaleX(.95); } }
@keyframes mi-drop { 30% { transform: translateY(2.5px); } 55% { transform: translateY(-1px); } 75% { transform: translateY(1.5px); } }
@keyframes mi-shake { 20%, 60% { transform: rotate(-12deg); } 40%, 80% { transform: rotate(12deg); } }
@keyframes mi-nudge-r { 45% { transform: translateX(3px); } }
@keyframes mi-squash { 45% { transform: scaleX(.55); } }
@keyframes mi-swing { 30% { transform: rotate(-18deg); } 65% { transform: rotate(10deg); } }
@keyframes mi-grow { 0% { transform: scale(.5); } 70% { transform: scale(1.08); } }
@keyframes mi-type { 0% { transform: scaleX(0); } }
@keyframes mi-bob { 35% { transform: translateY(-2.5px) rotate(-8deg); } 70% { transform: translateY(.5px) rotate(4deg); } }
@keyframes mi-rays { to { transform: rotate(90deg); } }
"""

def sel(name, part):
    return ', '.join('%s .ico-%s%s' % (h, name, (' ' + part) if part else '') for h in HOSTS)

out = ['/* gerado por tests/make_micro_css.py: micro-interações dos ícones no hover */',
       '.ico > * { transform-box: fill-box; transform-origin: center; }',
       '.ico { transform-origin: center; }',
       KEYFRAMES.strip(), '']
for name, part, origin, anim in RULES:
    decl = 'animation: %s;' % anim
    if origin == 'view' and part:
        decl += ' transform-box: view-box; transform-origin: 12px 12px;'
    out.append('%s { %s }' % (sel(name, part), decl))
# a âncora (origem) da regra de vista vale só para partes; o ícone inteiro gira no centro
out.append('')
# "carregando" tem prioridade sobre o hover
out.append('.icon-btn.busy .ico, .btn.busy .ico { animation: spin .9s linear infinite !important; }')
out.append('@media (prefers-reduced-motion: reduce) { .ico, .ico > * { animation: none !important; } }')
dst = os.path.join(os.path.dirname(__file__), '..', 'abridor-cep', 'css', 'micro.css')
open(dst, 'w').write('\n'.join(out) + '\n')
print('ok', len(RULES), 'regras ->', os.path.relpath(dst))
