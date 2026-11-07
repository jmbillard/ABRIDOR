/*
 * ABRIDOR - renderização aproximada de slides PPTX (miniaturas e imagem de referência)
 * e sobreposição das caixas de texto detectadas.
 *
 * O PowerPoint não guarda uma imagem de cada slide, então desenhamos:
 * fundo, imagens, formas com preenchimento e os textos (com quebra de linha simulada).
 * Para PDF a renderização é feita pelo próprio pdf.js.
 */
(function (global) {
	'use strict';

	var ABR = global.ABR = global.ABR || {};
	var imgCache = {};

	function loadImage(src) {
		if (!src) return Promise.resolve(null);
		if (imgCache[src]) return imgCache[src];
		imgCache[src] = new Promise(function (resolve) {
			var im = new Image();
			im.onload = function () { resolve(im); };
			im.onerror = function () { resolve(null); };
			im.src = src;
		});
		return imgCache[src];
	}

	function css(c, alpha) {
		if (!c) return 'transparent';
		var a = alpha !== undefined ? alpha : (c.alpha !== undefined ? c.alpha : 1);
		return 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + a + ')';
	}

	ABR.cssColor = css;

	function fontCSS(run, px) {
		return (run.italic ? 'italic ' : '') + (run.bold ? 'bold ' : '') +
			Math.max(1, px).toFixed(2) + 'px "' + run.family + '", "Arial", sans-serif';
	}

	function shapePath(ctx, geom, r) {
		ctx.beginPath();
		if (geom === 'ellipse') {
			ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.abs(r.w / 2), Math.abs(r.h / 2), 0, 0, Math.PI * 2);
		} else if (geom === 'roundRect' && ctx.roundRect) {
			ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(r.w, r.h) * 0.16);
		} else {
			ctx.rect(r.x, r.y, r.w, r.h);
		}
	}

	function withRotation(ctx, cx, cy, deg, fn) {
		ctx.save();
		if (deg) {
			ctx.translate(cx, cy);
			ctx.rotate(deg * Math.PI / 180);
			ctx.translate(-cx, -cy);
		}
		fn();
		ctx.restore();
	}

	// --- texto ----------------------------------------------------------------
	function runText(r) { return r.caps ? r.text.toUpperCase() : r.text; }

	// quebra os parágrafos em linhas (lista de segmentos {run, text, w})
	function layoutParagraph(ctx, p, maxW, s) {
		var lines = [];
		var cur = { segs: [], w: 0, size: 0 };
		function push() { lines.push(cur); cur = { segs: [], w: 0, size: 0 }; }

		p.runs.forEach(function (run) {
			if (run.text === '\r') { cur.size = Math.max(cur.size, run.size); push(); return; }
			ctx.font = fontCSS(run, run.size * s);
			var tokens = runText(run).split(/(\s+)/);
			tokens.forEach(function (tok) {
				if (!tok) return;
				var w = ctx.measureText(tok).width + (run.tracking || 0) / 1000 * run.size * s * tok.length;
				if (maxW && cur.w + w > maxW && cur.segs.length && !/^\s+$/.test(tok)) push();
				if (!cur.segs.length && /^\s+$/.test(tok) && lines.length) return;
				cur.segs.push({ run: run, text: tok, w: w });
				cur.w += w;
				cur.size = Math.max(cur.size, run.size);
			});
			if (!cur.size) cur.size = run.size;
		});
		push();
		return lines;
	}

	function drawLines(ctx, lines, x, baseline, align, maxW) {
		lines.forEach(function (L) {
			var w = L.w;
			// remove espaço final da medida
			var lastSeg = L.segs[L.segs.length - 1];
			if (lastSeg && /^\s+$/.test(lastSeg.text)) w -= lastSeg.w;
			var lx = x;
			if (align === 'center') lx = x + ((maxW || 0) - w) / 2 - (maxW ? 0 : w / 2);
			else if (align === 'right') lx = maxW ? x + maxW - w : x - w;
			L.segs.forEach(function (sg) {
				ctx.font = fontCSS(sg.run, sg.run.size * L.s);
				ctx.fillStyle = css(sg.run.color);
				ctx.fillText(sg.text, lx, L.baseline);
				lx += sg.w;
			});
		});
	}

	function drawTextItem(ctx, item, s, ox, oy) {
		ctx.textBaseline = 'alphabetic';
		var all = [];
		var maxW = item.mode === 'box' ? item.w * s : 0;

		item.paragraphs.forEach(function (p, pi) {
			var lines = layoutParagraph(ctx, p, maxW, s);
			lines.forEach(function (L, li) {
				L.align = p.align;
				L.s = s;
				L.lead = p.leading * s;
				L.before = (li === 0 && pi > 0) ? (p.spaceBefore + item.paragraphs[pi - 1].spaceAfter) * s : 0;
				all.push(L);
			});
		});
		if (!all.length) return;

		var total = 0;
		all.forEach(function (L) { total += L.lead + L.before; });

		if (item.mode === 'point') {
			var y = oy + item.ay * s;
			all.forEach(function (L, i) {
				if (i > 0) y += L.lead + L.before;
				L.baseline = y;
			});
			withRotation(ctx, ox + item.ax * s, oy + item.ay * s, item.rotation, function () {
				all.forEach(function (L) { drawLines(ctx, [L], ox + item.ax * s, L.baseline, item.align || L.align, 0); });
			});
			return;
		}

		var top = oy + item.y * s;
		var h = item.h * s;
		if (item.vAlign === 'middle') top += (h - total) / 2;
		else if (item.vAlign === 'bottom') top += h - total;
		var yy = top;
		all.forEach(function (L) {
			yy += L.before;
			L.baseline = yy + L.lead - L.size * s * 0.2;
			yy += L.lead;
		});
		withRotation(ctx, ox + item.cx * s, oy + item.cy * s, item.rotation, function () {
			all.forEach(function (L) {
				drawLines(ctx, [L], ox + item.x * s, L.baseline, L.align === 'justify' ? 'left' : L.align, item.w * s);
			});
		});
	}

	// --- slide ----------------------------------------------------------------
	// desenha um slide PPTX num canvas w x h (fit: 'fit' | 'fill')
	ABR.renderPptxPage = function (page, w, h, fit) {
		var canvas = document.createElement('canvas');
		canvas.width = Math.round(w);
		canvas.height = Math.round(h);
		var ctx = canvas.getContext('2d');
		var s = fit === 'fill' ? Math.max(w / page.width, h / page.height) : Math.min(w / page.width, h / page.height);
		var ox = (w - page.width * s) / 2, oy = (h - page.height * s) / 2;

		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);

		return Promise.all(page.render.map(function (r) { return r.src ? loadImage(r.src) : null; })).then(function (imgs) {
			ctx.save();
			ctx.beginPath();
			ctx.rect(ox, oy, page.width * s, page.height * s);
			ctx.clip();
			page.render.forEach(function (r, i) {
				var rr = r.rect ? { x: ox + r.rect.x * s, y: oy + r.rect.y * s, w: r.rect.w * s, h: r.rect.h * s } : null;
				if (r.type === 'bg') {
					ctx.fillStyle = css(r.color, 1);
					ctx.fillRect(ox, oy, page.width * s, page.height * s);
				} else if (r.type === 'bgImage' && imgs[i]) {
					ctx.drawImage(imgs[i], ox, oy, page.width * s, page.height * s);
				} else if (r.type === 'image' && imgs[i]) {
					withRotation(ctx, rr.x + rr.w / 2, rr.y + rr.h / 2, r.rect.rot, function () {
						ctx.drawImage(imgs[i], rr.x, rr.y, rr.w, rr.h);
					});
				} else if (r.type === 'shape') {
					withRotation(ctx, rr.x + rr.w / 2, rr.y + rr.h / 2, r.rect.rot, function () {
						if (r.geom === 'line' || r.geom === 'straightConnector1') {
							ctx.beginPath();
							ctx.moveTo(rr.x, rr.y);
							ctx.lineTo(rr.x + rr.w, rr.y + rr.h);
						} else {
							shapePath(ctx, r.geom, rr);
							if (r.fill) { ctx.fillStyle = css(r.fill); ctx.fill(); }
						}
						if (r.line) { ctx.strokeStyle = css(r.line); ctx.lineWidth = Math.max(0.5, r.lineW * s); ctx.stroke(); }
					});
				} else if (r.type === 'text') {
					drawTextItem(ctx, r.item, s, ox, oy);
				}
			});
			ctx.restore();
			return canvas;
		});
	};

	// contorno das caixas de texto detectadas (azul = caixa, laranja = ponto)
	ABR.drawTextBoxes = function (ctx, page, w, h, fit, highlight) {
		var s = fit === 'fill' ? Math.max(w / page.width, h / page.height) : Math.min(w / page.width, h / page.height);
		var ox = (w - page.width * s) / 2, oy = (h - page.height * s) / 2;
		ctx.save();
		ctx.lineWidth = Math.max(1, w / 200);
		page.texts.forEach(function (t, i) {
			var col = t.mode === 'box' ? '0,166,255' : '255,140,0';
			ctx.strokeStyle = 'rgba(' + col + ',0.6)';
			ctx.fillStyle = 'rgba(' + col + ',' + (highlight === i ? 0.35 : 0.12) + ')';
			var cx = t.cx !== undefined ? t.cx : t.ax, cy = t.cy !== undefined ? t.cy : t.ay;
			withRotation(ctx, ox + cx * s, oy + cy * s, t.rotation, function () {
				ctx.fillRect(ox + t.x * s, oy + t.y * s, t.w * s, t.h * s);
				ctx.strokeRect(ox + t.x * s + 0.5, oy + t.y * s + 0.5, t.w * s, t.h * s);
				if (t.mode === 'point') {
					ctx.fillStyle = 'rgba(' + col + ',1)';
					ctx.fillRect(ox + t.ax * s - 2, oy + t.ay * s - 2, 4, 4);
				}
			});
		});
		ctx.restore();
	};

	ABR.loadImage = loadImage;

})(window);
