/*
 * ABRIDOR - leitor de PDF (via pdf.js)
 *
 * Gera o mesmo modelo de documento do leitor de PPTX. No PDF as posições são
 * exatas (linha de base de cada trecho de texto), então os textos viram
 * "texto de ponto" no After Effects, ancorados na linha de base da 1ª linha.
 *
 * As linhas são agrupadas em parágrafos quando têm o mesmo tamanho de fonte,
 * entrelinha constante e o mesmo alinhamento (esquerda / centro / direita).
 */
(function (global) {
	'use strict';

	var ABR = global.ABR = global.ABR || {};

	var THUMB_W = 320;

	function cleanFontName(name) {
		if (!name) return 'Desconhecida';
		var n = String(name)
			.replace(/^[A-Z]{6}\+/, '')  // prefixo de subconjunto (ABCDEF+Fonte)
			.replace(/^\*/, '')
			.replace(/,/g, '-')
			.replace(/-\d+$/, '')
			.replace(/\s+$/, '');
		return n || 'Desconhecida';
	}

	function guessStyle(key) {
		var family = key, style = '';
		var m = key.match(/^(.+?)[-_ ](.+)$/);
		if (m && /bold|black|heavy|semi|demi|light|thin|medium|regular|book|italic|oblique|roman|extra|ultra|condensed|narrow|mt$|ps$/i.test(m[2])) {
			family = m[1]; style = m[2];
		}
		family = family.replace(/(PS|MT|PSMT)$/, '');
		// TimesNewRoman -> Times New Roman
		if (!/\s/.test(family)) family = family.replace(/([a-z])([A-Z])/g, '$1 $2');
		return {
			family: family,
			bold: /bold|black|heavy|semibold|demibold/i.test(style || key),
			italic: /italic|oblique/i.test(style || key)
		};
	}

	function createCanvas(w, h) {
		var c = document.createElement('canvas');
		c.width = Math.max(1, Math.round(w));
		c.height = Math.max(1, Math.round(h));
		return c;
	}

	// ------------------------------------------------------- cor do texto ----
	function colorDist(a, b) {
		var dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
		return Math.sqrt(dr * dr + dg * dg + db * db);
	}

	function sampleTextColor(img, W, H, x0, y0, x1, y1) {
		x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
		x1 = Math.min(W - 1, Math.ceil(x1)); y1 = Math.min(H - 1, Math.ceil(y1));
		if (x1 <= x0 || y1 <= y0) return [0, 0, 0];
		var d = img.data;
		function px(x, y) { var i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; }

		// fundo = cor mais frequente no contorno
		var hist = {}, best = null, bestN = 0;
		function vote(c) {
			var k = (c[0] >> 3) + ',' + (c[1] >> 3) + ',' + (c[2] >> 3);
			var e = hist[k] || (hist[k] = { n: 0, c: c });
			e.n++;
			if (e.n > bestN) { bestN = e.n; best = e.c; }
		}
		var x, y;
		for (x = x0; x <= x1; x++) { vote(px(x, y0)); vote(px(x, y1)); }
		for (y = y0; y <= y1; y++) { vote(px(x0, y)); vote(px(x1, y)); }
		var bg = best || [255, 255, 255];

		var maxD = 0, pixels = [];
		var step = Math.max(1, Math.floor(Math.max(x1 - x0, y1 - y0) / 120));
		for (y = y0; y <= y1; y += step) {
			for (x = x0; x <= x1; x += step) {
				var c = px(x, y);
				var dd = colorDist(c, bg);
				if (dd > 40) { pixels.push([c, dd]); if (dd > maxD) maxD = dd; }
			}
		}
		if (!pixels.length) {
			var lum = (bg[0] + bg[1] + bg[2]) / 3;
			return lum > 128 ? [0, 0, 0] : [1, 1, 1];
		}
		var sum = [0, 0, 0], n = 0;
		pixels.forEach(function (p) {
			if (p[1] >= maxD * 0.85) { sum[0] += p[0][0]; sum[1] += p[0][1]; sum[2] += p[0][2]; n++; }
		});
		return [sum[0] / n / 255, sum[1] / n / 255, sum[2] / n / 255];
	}

	function parseCssColor(c) {
		if (typeof c !== 'string') return null;
		var m = c.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
		if (m) return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
		m = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
		if (m) return [parseFloat(m[1]) / 255, parseFloat(m[2]) / 255, parseFloat(m[3]) / 255];
		return null;
	}

	// registra a cor de preenchimento de cada glifo desenhado pelo pdf.js
	function hookGlyphs(ctx) {
		var glyphs = [];
		var origFill = ctx.fillText;
		ctx.fillText = function (t, x, y) {
			try {
				var m = ctx.getTransform();
				glyphs.push({
					x: m.a * x + m.c * y + m.e,
					y: m.b * x + m.d * y + m.f,
					style: ctx.fillStyle
				});
			} catch (e) { /* ignora */ }
			return origFill.apply(ctx, arguments);
		};
		return glyphs;
	}

	// cor mais frequente entre os glifos dentro da caixa (em pixels do canvas)
	function glyphColor(glyphs, x0, y0, x1, y1) {
		var votes = {}, best = null, bestN = 0;
		for (var i = 0; i < glyphs.length; i++) {
			var g = glyphs[i];
			if (g.x < x0 || g.x > x1 || g.y < y0 || g.y > y1) continue;
			if (typeof g.style !== 'string') continue;
			var n = votes[g.style] = (votes[g.style] || 0) + 1;
			if (n > bestN) { bestN = n; best = g.style; }
		}
		return best ? parseCssColor(best) : null;
	}

	// ------------------------------------------------------- agrupamento -----
	function sameRunStyle(a, b) {
		return a.fontKey === b.fontKey && Math.abs(a.size - b.size) < 0.05 &&
			colorDist(a.color, b.color) < 0.04;
	}

	function buildLines(items) {
		// ordena por linha de base e depois por x
		items.sort(function (a, b) {
			if (Math.abs(a.y - b.y) > Math.min(a.size, b.size) * 0.3) return a.y - b.y;
			return a.x - b.x;
		});

		var lines = [];
		items.forEach(function (it) {
			var line = null;
			for (var i = lines.length - 1; i >= 0 && i >= lines.length - 6; i--) {
				var L = lines[i];
				if (L.rot !== it.rot) continue;
				if (Math.abs(L.y - it.y) > Math.min(L.size, it.size) * 0.35) continue;
				var gap = it.x - L.right;
				if (gap < -it.size * 0.6 || gap > Math.max(L.size, it.size) * 1.8) continue;
				line = L;
				break;
			}
			// espaços não têm pixels: herdam o estilo do trecho anterior
			if (!/\S/.test(it.str)) {
				if (line && line.runs.length) {
					var lrun = line.runs[line.runs.length - 1];
					if (!/\s$/.test(lrun.text)) lrun.text += ' ';
					line.right = Math.max(line.right, it.x + it.w);
				}
				return;
			}
			if (!line) {
				line = { y: it.y, left: it.x, right: it.x, size: it.size, rot: it.rot, runs: [] };
				lines.push(line);
			} else {
				var g = it.x - line.right;
				var last = line.runs[line.runs.length - 1];
				if (g > it.size * 0.18 && last && !/\s$/.test(last.text) && !/^\s/.test(it.str)) {
					last.text += ' ';
				}
			}
			var run = {
				text: it.str, fontKey: it.fontKey, family: it.family,
				bold: it.bold, italic: it.italic, size: it.size,
				color: it.color, tracking: 0, caps: false
			};
			var lr = line.runs[line.runs.length - 1];
			if (lr && sameRunStyle(lr, run)) lr.text += run.text;
			else line.runs.push(run);
			line.right = Math.max(line.right, it.x + it.w);
			line.left = Math.min(line.left, it.x);
			line.size = Math.max(line.size, it.size);
		});

		// limpa espaços das pontas
		lines.forEach(function (L) {
			if (L.runs.length) {
				L.runs[0].text = L.runs[0].text.replace(/^\s+/, '');
				var lr = L.runs[L.runs.length - 1];
				lr.text = lr.text.replace(/\s+$/, '');
			}
			L.runs = L.runs.filter(function (r) { return r.text.length; });
			L.center = (L.left + L.right) / 2;
		});
		return lines.filter(function (L) { return L.runs.length; });
	}

	function alignMatches(a, b, tol) {
		var out = [];
		if (Math.abs(a.left - b.left) <= tol) out.push('left');
		if (Math.abs(a.center - b.center) <= tol) out.push('center');
		if (Math.abs(a.right - b.right) <= tol) out.push('right');
		return out;
	}

	function intersect(a, b) {
		return a.filter(function (x) { return b.indexOf(x) >= 0; });
	}

	function buildBlocks(lines, pageW, mode) {
		lines.sort(function (a, b) { return a.y - b.y || a.left - b.left; });
		var blocks = [];

		lines.forEach(function (L) {
			var target = null, targetAligns = null;
			if (mode !== 'line' && L.rot === 0) {
				for (var i = blocks.length - 1; i >= 0; i--) {
					var B = blocks[i];
					var last = B.lines[B.lines.length - 1];
					if (B.rot !== 0) continue;
					if (Math.abs(last.size - L.size) > L.size * 0.06) continue;
					var dy = L.y - last.y;
					if (dy < L.size * 0.75 || dy > L.size * 2.4) continue;
					if (B.leading && Math.abs(dy - B.leading) > L.size * 0.12) continue;
					var al = intersect(B.aligns, alignMatches(last, L, L.size * 0.6));
					if (!al.length) continue;
					target = B; targetAligns = al;
					break;
				}
			}
			if (target) {
				target.leading = target.leading || (L.y - target.lines[target.lines.length - 1].y);
				target.aligns = targetAligns;
				target.lines.push(L);
			} else {
				blocks.push({ lines: [L], aligns: ['left', 'center', 'right'], leading: 0, rot: L.rot });
			}
		});

		return blocks.map(function (B) {
			var f = B.lines[0];
			var align;
			if (B.aligns.length === 1) align = B.aligns[0];
			else if (B.lines.length === 1) {
				// linha solta: centralizada se estiver no meio da página
				align = Math.abs(f.center - pageW / 2) < pageW * 0.025 ? 'center' : 'left';
			} else {
				align = B.aligns.indexOf('left') >= 0 ? 'left' : B.aligns[0];
			}
			var leading = B.leading || f.size * 1.2;
			var left = Math.min.apply(null, B.lines.map(function (l) { return l.left; }));
			var right = Math.max.apply(null, B.lines.map(function (l) { return l.right; }));
			var lastL = B.lines[B.lines.length - 1];
			return {
				source: 'slide', name: 'texto',
				mode: 'point',
				align: align,
				ax: align === 'center' ? f.center : (align === 'right' ? f.right : f.left),
				ay: f.y,
				rotation: B.rot,
				// caixa aproximada (preview / referência)
				x: left, y: f.y - f.size * 0.8, w: right - left, h: (lastL.y - f.y) + f.size * 1.05,
				paragraphs: B.lines.map(function (l) {
					return { align: align, leading: Math.round(leading * 100) / 100, spaceBefore: 0, spaceAfter: 0, runs: l.runs };
				})
			};
		});
	}

	// ------------------------------------------------------- leitura ---------
	function PdfDoc(pdf) { this.pdf = pdf; }

	PdfDoc.prototype.renderPage = function (index, scale) {
		return this.pdf.getPage(index + 1).then(function (page) {
			var vp = page.getViewport({ scale: scale });
			var canvas = createCanvas(vp.width, vp.height);
			var ctx = canvas.getContext('2d');
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () { return canvas; });
		});
	};

	// imagem PNG (dataURL) com largura/altura exatas
	PdfDoc.prototype.renderToSize = function (index, w, h, fit) {
		var self = this;
		return this.pdf.getPage(index + 1).then(function (page) {
			var vp1 = page.getViewport({ scale: 1 });
			var s = fit === 'fill' ? Math.max(w / vp1.width, h / vp1.height) : Math.min(w / vp1.width, h / vp1.height);
			return self.renderPage(index, s).then(function (src) {
				var c = createCanvas(w, h);
				var ctx = c.getContext('2d');
				ctx.fillStyle = '#000';
				ctx.fillRect(0, 0, w, h);
				ctx.drawImage(src, (w - src.width) / 2, (h - src.height) / 2);
				return c.toDataURL('image/png');
			});
		});
	};

	function readPage(pdf, index, opts) {
		return pdf.getPage(index + 1).then(function (page) {
			var vp = page.getViewport({ scale: 1 });
			var W = vp.width, H = vp.height;
			var sampleScale = Math.min(3, Math.max(1, 1600 / W));
			var svp = page.getViewport({ scale: sampleScale });
			var canvas = createCanvas(svp.width, svp.height);
			var ctx = canvas.getContext('2d');
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, canvas.width, canvas.height);

			var glyphs = hookGlyphs(ctx);
			// renderizar primeiro garante que as fontes estejam em commonObjs
			return page.render({ canvasContext: ctx, viewport: svp }).promise.then(function () {
				return page.getTextContent();
			}).then(function (tc) {
				var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
				var items = [];

				tc.items.forEach(function (it) {
					if (!it.str || !it.str.replace(/\s/g, '').length && it.str !== ' ') return;
					var tx = pdfjsLib.Util.transform(vp.transform, it.transform);
					var size = Math.hypot(tx[2], tx[3]);
					if (!size || size < 0.5) return;
					var rot = Math.round(Math.atan2(tx[1], tx[0]) * 180 / Math.PI * 100) / 100;

					var fontName = it.fontName;
					var realName = null;
					try {
						if (page.commonObjs.has(fontName)) {
							var fo = page.commonObjs.get(fontName);
							realName = fo && (fo.name || fo.loadedName);
						}
					} catch (e) { /* fonte ainda não carregada */ }
					if (!realName && tc.styles[fontName]) realName = tc.styles[fontName].fontFamily;
					var key = cleanFontName(realName);
					var st = guessStyle(key);

					var w = it.width * (vp.scale || 1);
					var x = tx[4], y = tx[5];
					var color = null;
					if (rot === 0) {
						color = glyphColor(glyphs, (x - 1) * sampleScale, (y - size) * sampleScale,
							(x + w + 1) * sampleScale, (y + size * 0.3) * sampleScale);
					}
					if (color) {
						// cor exata do operador de preenchimento
					} else if (rot === 0) {
						color = sampleTextColor(img, canvas.width, canvas.height,
							x * sampleScale - 1, (y - size * 0.8) * sampleScale - 1,
							(x + w) * sampleScale + 1, (y + size * 0.25) * sampleScale + 1);
					} else {
						color = sampleTextColor(img, canvas.width, canvas.height,
							(x - size) * sampleScale, (y - size) * sampleScale, (x + size) * sampleScale, (y + size) * sampleScale);
					}

					items.push({
						str: it.str, x: x, y: y, w: w, size: Math.round(size * 100) / 100, rot: rot,
						fontKey: key, family: st.family, bold: st.bold, italic: st.italic,
						color: color.map(function (c) { return Math.round(c * 1000) / 1000; })
					});
				});

				var lines = buildLines(items);
				var texts = buildBlocks(lines, W, opts.groupMode);

				// miniatura
				var tw = THUMB_W, th = Math.round(THUMB_W * H / W);
				var thumb = createCanvas(tw, th);
				thumb.getContext('2d').drawImage(canvas, 0, 0, tw, th);

				return {
					index: index, number: index + 1, name: 'Página ' + (index + 1),
					width: W, height: H, hidden: false,
					texts: texts,
					thumb: thumb.toDataURL('image/jpeg', 0.85)
				};
			});
		});
	}

	ABR.parsePDF = function (bytes, opts, onProgress) {
		opts = opts || {};
		var task = pdfjsLib.getDocument({
			data: bytes,
			isEvalSupported: false,
			useSystemFonts: true,
			disableFontFace: false
		});
		return task.promise.then(function (pdf) {
			var pages = [];
			var chain = Promise.resolve();
			for (var i = 0; i < pdf.numPages; i++) {
				(function (i) {
					chain = chain.then(function () {
						if (onProgress) onProgress(i, pdf.numPages);
						return readPage(pdf, i, opts);
					}).then(function (p) { pages.push(p); });
				})(i);
			}
			return chain.then(function () {
				return {
					type: 'pdf',
					width: pages.length ? pages[0].width : 960,
					height: pages.length ? pages[0].height : 540,
					pages: pages,
					pdf: new PdfDoc(pdf)
				};
			});
		});
	};

	ABR._pdf = { cleanFontName: cleanFontName, guessStyle: guessStyle, buildLines: buildLines, buildBlocks: buildBlocks };

})(window);
