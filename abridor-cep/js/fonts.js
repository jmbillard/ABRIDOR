/*
 * ABRIDOR - fontes
 *
 * - lê a lista de fontes instaladas a partir do After Effects (app.fonts, AE 24+)
 * - associa automaticamente as fontes do documento às fontes instaladas
 * - carrega o arquivo da fonte (Font.location) para o preview no painel
 */
(function (global) {
	'use strict';

	var ABR = global.ABR = global.ABR || {};

	var F = ABR.fonts = {
		list: [],          // [{family, style, ps, full, loc}]
		byPS: {},
		families: {},      // família normalizada -> [fontes]
		supported: true,   // false quando o AE não expõe app.fonts
		previewCache: {}
	};

	function norm(s) { return String(s || '').toLowerCase().replace(/[\s\-_,.]/g, ''); }

	F.norm = norm;

	F.setList = function (list) {
		F.list = list.filter(function (f) { return f && f.ps; });
		F.byPS = {};
		F.families = {};
		F.list.forEach(function (f) {
			F.byPS[f.ps.toLowerCase()] = f;
			var k = norm(f.family);
			(F.families[k] = F.families[k] || []).push(f);
		});
		F.list.sort(function (a, b) {
			return a.family.localeCompare(b.family) || styleRank(a.style) - styleRank(b.style) || a.style.localeCompare(b.style);
		});
	};

	F.load = function () {
		return ABR.callHostJSON('abridor_getFonts').then(function (res) {
			if (res.unsupported) {
				F.supported = false;
				F.setList([]);
			} else {
				F.supported = true;
				F.setList(res.fonts.map(function (f) {
					return { family: f.f, style: f.s, ps: f.p, full: f.n || (f.f + ' ' + f.s), loc: f.l || '' };
				}));
			}
			return F.list;
		});
	};

	F.get = function (ps) {
		if (!ps) return null;
		return F.byPS[String(ps).toLowerCase()] || null;
	};

	// ---------------------------------------------------- estilos -----------
	function isBold(style) { return /bold|black|heavy|semibold|demibold|extrabold|ultrabold/i.test(style); }
	function isItalic(style) { return /italic|oblique|inclined/i.test(style); }

	function styleRank(style) {
		var s = style.toLowerCase();
		var order = ['thin', 'hairline', 'extralight', 'ultralight', 'light', 'book', 'regular', 'roman', 'normal', 'medium', 'semibold', 'demibold', 'bold', 'extrabold', 'heavy', 'black'];
		var r = order.length;
		for (var i = 0; i < order.length; i++) if (s.replace(/\s/g, '').indexOf(order[i]) >= 0) { r = i; }
		return r * 2 + (isItalic(s) ? 1 : 0);
	}

	function scoreStyle(style, wantBold, wantItalic, wantStyle) {
		var s = style.toLowerCase();
		var sc = 0;
		if (wantStyle && norm(style) === norm(wantStyle)) sc += 50;
		if (isBold(s) === !!wantBold) sc += 10;
		if (isItalic(s) === !!wantItalic) sc += 10;
		if (/^(regular|roman|book|normal|plain)$/.test(s) && !wantBold && !wantItalic) sc += 6;
		if (/^bold$/.test(s) && wantBold && !wantItalic) sc += 6;
		if (/^(italic|oblique)$/.test(s) && wantItalic && !wantBold) sc += 6;
		if (/^bold ?(italic|oblique)$/.test(s) && wantItalic && wantBold) sc += 6;
		if (wantBold && /^bold/.test(s)) sc += 2;
		if (/condensed|narrow|compressed|extended|expanded|wide|display|caption|subhead/.test(s)) sc -= 3;
		if (/thin|light|hairline/.test(s)) sc -= 2;
		return sc;
	}

	function bestInFamily(fonts, wantBold, wantItalic, wantStyle) {
		var best = null, bestSc = -1e9;
		fonts.forEach(function (f) {
			var sc = scoreStyle(f.style, wantBold, wantItalic, wantStyle);
			if (sc > bestSc) { bestSc = sc; best = f; }
		});
		return best;
	}

	// src = {key, family, bold, italic, type}
	F.autoMatch = function (src) {
		if (!F.list.length) return null;
		var key = src.key || '';

		// 1) nome PostScript exato (PDF)
		var f = F.get(key);
		if (f) return f;

		var nk = norm(key);
		var i;
		// 2) PostScript / nome completo normalizado
		for (i = 0; i < F.list.length; i++) {
			if (norm(F.list[i].ps) === nk || norm(F.list[i].full) === nk) return F.list[i];
		}

		var fam = F.families[norm(src.family)];
		var wantStyle = null;
		if (src.type === 'pdf') {
			var m = key.match(/^(.+?)[-_](.+)$/);
			if (m) {
				wantStyle = m[2];
				fam = fam || F.families[norm(m[1].replace(/(PSMT|PS|MT)$/, ''))];
			}
		}
		if (fam) return bestInFamily(fam, src.bold, src.italic, wantStyle);

		// 3) "Montserrat Black" -> família "Montserrat" + estilo "Black"
		var famName = src.family || key;
		var words = famName.split(/\s+/);
		for (var n = words.length - 1; n >= 1; n--) {
			var head = norm(words.slice(0, n).join(' '));
			var tail = words.slice(n).join(' ');
			if (F.families[head]) return bestInFamily(F.families[head], src.bold || isBold(tail), src.italic || isItalic(tail), tail);
		}

		// 4) nome do documento começa com o nome da família (ex. "ArialNarrow")
		var bestF = null, bestLen = 0;
		for (var k in F.families) {
			if (k.length > 3 && nk.indexOf(k) === 0 && k.length > bestLen) { bestLen = k.length; bestF = k; }
		}
		if (bestF) return bestInFamily(F.families[bestF], src.bold, src.italic, key.slice(bestLen));
		return null;
	};

	// ---------------------------------------------------- preview -----------
	var faceId = 0;

	// devolve uma Promise com {family, weight, style} pronta para CSS
	F.previewCSS = function (font, fallback) {
		if (!font) {
			fallback = fallback || {};
			return Promise.resolve({
				family: '"' + (fallback.family || 'Arial') + '", sans-serif',
				weight: fallback.bold ? 'bold' : 'normal',
				style: fallback.italic ? 'italic' : 'normal',
				loaded: false
			});
		}
		if (F.previewCache[font.ps]) return F.previewCache[font.ps];

		var simple = {
			family: '"' + font.family + '", "' + font.full + '", sans-serif',
			weight: isBold(font.style) ? 'bold' : (/light|thin/i.test(font.style) ? '300' : 'normal'),
			style: isItalic(font.style) ? 'italic' : 'normal',
			loaded: false
		};

		var p;
		if (font.loc && ABR.hasFS && typeof FontFace === 'function' && !/\.(ttc|dfont)$/i.test(font.loc)) {
			p = new Promise(function (resolve) {
				try {
					var bytes = ABR.fs.readBinary(font.loc);
					var name = 'abr_font_' + (++faceId);
					var face = new FontFace(name, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
					face.load().then(function (ff) {
						document.fonts.add(ff);
						resolve({ family: '"' + name + '", sans-serif', weight: 'normal', style: 'normal', loaded: true });
					}, function () { resolve(simple); });
				} catch (e) { resolve(simple); }
			});
		} else {
			p = Promise.resolve(simple);
		}
		F.previewCache[font.ps] = p;
		return p;
	};

	F.applyPreview = function (el, font, fallback) {
		return F.previewCSS(font, fallback).then(function (c) {
			el.style.fontFamily = c.family;
			el.style.fontWeight = c.weight;
			el.style.fontStyle = c.style;
			return c;
		});
	};

	F.isBold = isBold;
	F.isItalic = isItalic;

})(window);
