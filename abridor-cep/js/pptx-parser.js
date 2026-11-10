/*
 * ABRIDOR - leitor de PPTX
 *
 * Lê o arquivo .pptx (zip + XML) e devolve o modelo de documento usado pelo painel:
 *
 * doc = {
 *   type: 'pptx', name, width, height,          // tamanho do slide em pontos
 *   pages: [{
 *     index, number, name, width, height, hidden,
 *     texts: [ textItem ],                       // ver abaixo
 *     render: [ renderItem ]                     // usado para desenhar a imagem de referência
 *   }]
 * }
 *
 * textItem = {
 *   mode: 'box' | 'point',
 *   x, y, w, h,          // box: retângulo da caixa de texto (já sem as margens internas)
 *                        // point: x,y = ponto de ancoragem (linha de base da 1ª linha)
 *   rotation,            // graus
 *   vAlign: 'top' | 'middle' | 'bottom',
 *   paragraphs: [{ align, leading, spaceBefore, spaceAfter, runs: [run] }]
 * }
 * run = { text, fontKey, family, bold, italic, size, color:[r,g,b], tracking, caps }
 *
 * Unidades: pontos (1pt = 12700 EMU). Origem no canto superior esquerdo.
 */
(function (global) {
	'use strict';

	var ABR = global.ABR = global.ABR || {};
	var EMU = 12700;

	// ------------------------------------------------------------ XML utils --
	function kids(el, name) {
		var out = [];
		if (!el) return out;
		for (var n = el.firstChild; n; n = n.nextSibling) {
			if (n.nodeType === 1 && (!name || n.localName === name)) out.push(n);
		}
		return out;
	}

	function kid(el, name) {
		if (!el) return null;
		for (var n = el.firstChild; n; n = n.nextSibling) {
			if (n.nodeType === 1 && n.localName === name) return n;
		}
		return null;
	}

	// kidPath(el, 'spPr/xfrm/off')
	function kidPath(el, p) {
		var parts = p.split('/');
		for (var i = 0; i < parts.length && el; i++) el = kid(el, parts[i]);
		return el || null;
	}

	function attr(el, name) {
		if (!el) return null;
		var v = el.getAttribute(name);
		return v === null || v === '' ? null : v;
	}

	function numAttr(el, name, def) {
		var v = attr(el, name);
		if (v === null) return def;
		var n = parseFloat(v);
		return isNaN(n) ? def : n;
	}

	function boolAttr(el, name) {
		var v = attr(el, name);
		if (v === null) return null;
		return v === '1' || v === 'true';
	}

	// r:embed / r:id (atributo com namespace de relacionamentos)
	function relAttr(el, name) {
		if (!el) return null;
		for (var i = 0; i < el.attributes.length; i++) {
			var a = el.attributes[i];
			if (a.localName === name && /relationships/.test(a.namespaceURI || '')) return a.value;
		}
		return attr(el, 'r:' + name);
	}

	function parseXML(str) {
		var doc = new DOMParser().parseFromString(str, 'application/xml');
		return doc.documentElement;
	}

	function resolvePath(base, target) {
		if (target.charAt(0) === '/') return target.slice(1);
		var parts = base.split('/');
		parts.pop();
		var t = target.split('/');
		for (var i = 0; i < t.length; i++) {
			if (t[i] === '..') parts.pop();
			else if (t[i] !== '.') parts.push(t[i]);
		}
		return parts.join('/');
	}

	// ------------------------------------------------------------ cores ------
	function hexToRgb(hex) {
		hex = hex.replace('#', '');
		if (hex.length !== 6) return [0, 0, 0];
		return [
			parseInt(hex.substr(0, 2), 16) / 255,
			parseInt(hex.substr(2, 2), 16) / 255,
			parseInt(hex.substr(4, 2), 16) / 255
		];
	}

	function rgbToHsl(c) {
		var r = c[0], g = c[1], b = c[2];
		var max = Math.max(r, g, b), min = Math.min(r, g, b);
		var h = 0, s = 0, l = (max + min) / 2;
		if (max !== min) {
			var d = max - min;
			s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
			if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
			else if (max === g) h = (b - r) / d + 2;
			else h = (r - g) / d + 4;
			h /= 6;
		}
		return [h, s, l];
	}

	function hslToRgb(hsl) {
		var h = hsl[0], s = hsl[1], l = hsl[2];
		if (s === 0) return [l, l, l];
		function hue(p, q, t) {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1 / 6) return p + (q - p) * 6 * t;
			if (t < 1 / 2) return q;
			if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
			return p;
		}
		var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		var p = 2 * l - q;
		return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
	}

	function clamp01(v) { return Math.max(0, Math.min(1, v)); }

	function applyColorMods(rgb, clrEl) {
		var alpha = 1;
		kids(clrEl).forEach(function (m) {
			var v = numAttr(m, 'val', 100000) / 100000;
			var hsl;
			switch (m.localName) {
				case 'lumMod': hsl = rgbToHsl(rgb); hsl[2] = clamp01(hsl[2] * v); rgb = hslToRgb(hsl); break;
				case 'lumOff': hsl = rgbToHsl(rgb); hsl[2] = clamp01(hsl[2] + v); rgb = hslToRgb(hsl); break;
				case 'satMod': hsl = rgbToHsl(rgb); hsl[1] = clamp01(hsl[1] * v); rgb = hslToRgb(hsl); break;
				case 'tint': rgb = rgb.map(function (c) { return c + (1 - c) * (1 - v); }); break;
				case 'shade': rgb = rgb.map(function (c) { return c * v; }); break;
				case 'alpha': alpha = v; break;
			}
		});
		rgb.alpha = alpha;
		return rgb;
	}

	var PRESET_COLORS = {
		black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF',
		yellow: 'FFFF00', gray: '808080', grey: '808080', darkGray: 'A9A9A9', lightGray: 'D3D3D3'
	};

	// ------------------------------------------------------------ parser -----
	function PptxReader(zip) {
		this.zip = zip;
		this.xmlCache = {};
		this.relsCache = {};
		this.mediaCache = {};
	}

	PptxReader.prototype.xml = function (p) {
		var self = this;
		if (this.xmlCache[p]) return this.xmlCache[p];
		var f = this.zip.file(p);
		if (!f) return Promise.resolve(null);
		this.xmlCache[p] = f.async('string').then(parseXML);
		return this.xmlCache[p].catch(function () { delete self.xmlCache[p]; return null; });
	};

	PptxReader.prototype.rels = function (p) {
		if (this.relsCache[p]) return this.relsCache[p];
		var parts = p.split('/');
		var file = parts.pop();
		var relPath = parts.join('/') + '/_rels/' + file + '.rels';
		this.relsCache[p] = this.xml(relPath).then(function (root) {
			var map = {};
			kids(root, 'Relationship').forEach(function (r) {
				var mode = attr(r, 'TargetMode');
				map[attr(r, 'Id')] = {
					type: (attr(r, 'Type') || '').replace(/^.*\//, ''),
					target: mode === 'External' ? null : resolvePath(p, attr(r, 'Target'))
				};
			});
			return map;
		});
		return this.relsCache[p];
	};

	PptxReader.prototype.relOfType = function (p, type) {
		return this.rels(p).then(function (map) {
			for (var k in map) if (map[k].type === type) return map[k].target;
			return null;
		});
	};

	PptxReader.prototype.media = function (p) {
		if (this.mediaCache[p]) return this.mediaCache[p];
		var f = this.zip.file(p);
		if (!f) return Promise.resolve(null);
		var ext = p.split('.').pop().toLowerCase();
		var mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' }[ext];
		if (!mime) return Promise.resolve(null); // EMF/WMF/TIFF não podem ser desenhados no canvas
		this.mediaCache[p] = f.async('base64').then(function (b64) {
			return 'data:' + mime + ';base64,' + b64;
		});
		return this.mediaCache[p];
	};

	// Contexto de tema/mestre de um slide.
	function Theme(root) {
		this.colors = {};
		this.major = 'Calibri Light';
		this.minor = 'Calibri';
		if (!root) return;
		var scheme = kidPath(root, 'themeElements/clrScheme');
		var self = this;
		kids(scheme).forEach(function (c) {
			var s = kid(c, 'srgbClr'), sys = kid(c, 'sysClr');
			if (s) self.colors[c.localName] = attr(s, 'val');
			else if (sys) self.colors[c.localName] = attr(sys, 'lastClr') || (attr(sys, 'val') === 'window' ? 'FFFFFF' : '000000');
		});
		var fs = kidPath(root, 'themeElements/fontScheme');
		var maj = kidPath(fs, 'majorFont/latin'), min = kidPath(fs, 'minorFont/latin');
		if (maj && attr(maj, 'typeface')) this.major = attr(maj, 'typeface');
		if (min && attr(min, 'typeface')) this.minor = attr(min, 'typeface');
		this.fillStyles = kids(kidPath(root, 'themeElements/fmtScheme/fillStyleLst'));
		this.bgFillStyles = kids(kidPath(root, 'themeElements/fmtScheme/bgFillStyleLst'));
	}

	function SlideCtx(theme, clrMap) {
		this.theme = theme;
		this.clrMap = clrMap || { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
	}

	SlideCtx.prototype.color = function (parent, phColor) {
		// parent: elemento que contém um elemento de cor (ex. solidFill)
		if (!parent) return null;
		var c = kids(parent)[0];
		if (!c) return null;
		var rgb = null;
		switch (c.localName) {
			case 'srgbClr': rgb = hexToRgb(attr(c, 'val') || '000000'); break;
			case 'scrgbClr':
				rgb = [numAttr(c, 'r', 0) / 100000, numAttr(c, 'g', 0) / 100000, numAttr(c, 'b', 0) / 100000];
				break;
			case 'sysClr': rgb = hexToRgb(attr(c, 'lastClr') || '000000'); break;
			case 'prstClr': rgb = hexToRgb(PRESET_COLORS[attr(c, 'val')] || '000000'); break;
			case 'schemeClr':
				var v = attr(c, 'val');
				if (v === 'phClr') { rgb = phColor ? phColor.slice(0, 3) : [0, 0, 0]; break; }
				if (this.clrMap[v]) v = this.clrMap[v];
				rgb = hexToRgb(this.theme.colors[v] || '000000');
				break;
			default: return null;
		}
		return applyColorMods(rgb, c);
	};

	// cor de um preenchimento (solidFill / gradFill) -> [r,g,b] (+alpha)
	SlideCtx.prototype.fillColor = function (fillParent, phColor) {
		if (!fillParent) return undefined;
		if (kid(fillParent, 'noFill')) return null;
		var sf = kid(fillParent, 'solidFill');
		if (sf) return this.color(sf, phColor);
		var gf = kid(fillParent, 'gradFill');
		if (gf) {
			var gs = kidPath(gf, 'gsLst/gs');
			if (gs) return this.color(gs, phColor);
		}
		return undefined;
	};

	SlideCtx.prototype.font = function (typeface) {
		if (!typeface) return null;
		if (/^\+mj/.test(typeface)) return this.theme.major;
		if (/^\+mn/.test(typeface)) return this.theme.minor;
		return typeface;
	};

	function readClrMap(el) {
		if (!el) return null;
		var m = {};
		for (var i = 0; i < el.attributes.length; i++) m[el.attributes[i].localName] = el.attributes[i].value;
		return m;
	}

	// ------------------------------------------------- placeholders ----------
	function phInfo(sp) {
		var nv = kids(sp).filter(function (k) { return /^nv/.test(k.localName); })[0];
		var ph = kidPath(nv, 'nvPr/ph');
		if (!ph) return null;
		return { type: attr(ph, 'type') || 'body', idx: attr(ph, 'idx'), hasType: !!attr(ph, 'type') };
	}

	function masterType(t) {
		if (t === 'ctrTitle' || t === 'title') return 'title';
		if (t === 'dt' || t === 'ftr' || t === 'sldNum') return t;
		return 'body';
	}

	function allShapes(spTree) {
		var out = [];
		(function walk(el) {
			kids(el).forEach(function (k) {
				if (k.localName === 'sp' || k.localName === 'pic') out.push(k);
				if (k.localName === 'grpSp') walk(k);
			});
		})(spTree);
		return out;
	}

	function findPh(spTree, info, isMaster) {
		if (!spTree || !info) return null;
		var shapes = allShapes(spTree);
		var i, p;
		if (!isMaster && info.idx !== null) {
			for (i = 0; i < shapes.length; i++) {
				p = phInfo(shapes[i]);
				if (p && p.idx === info.idx) return shapes[i];
			}
		}
		var want = isMaster ? masterType(info.type) : info.type;
		for (i = 0; i < shapes.length; i++) {
			p = phInfo(shapes[i]);
			if (!p) continue;
			var t = isMaster ? masterType(p.type) : p.type;
			if (t === want) return shapes[i];
		}
		return null;
	}

	// ------------------------------------------------- geometria -------------
	function readXfrm(x) {
		if (!x) return null;
		var off = kid(x, 'off'), ext = kid(x, 'ext');
		if (!off || !ext) return null;
		var r = {
			x: numAttr(off, 'x', 0), y: numAttr(off, 'y', 0),
			w: numAttr(ext, 'cx', 0), h: numAttr(ext, 'cy', 0),
			rot: numAttr(x, 'rot', 0) / 60000,
			flipH: boolAttr(x, 'flipH'), flipV: boolAttr(x, 'flipV')
		};
		var choff = kid(x, 'chOff'), chext = kid(x, 'chExt');
		if (choff && chext) {
			r.chX = numAttr(choff, 'x', 0); r.chY = numAttr(choff, 'y', 0);
			r.chW = numAttr(chext, 'cx', 0) || r.w; r.chH = numAttr(chext, 'cy', 0) || r.h;
		}
		return r;
	}

	function shapeXfrm(sp) {
		var spPr = kid(sp, 'spPr') || kid(sp, 'grpSpPr');
		var x = kid(spPr, 'xfrm') || kid(sp, 'xfrm'); // graphicFrame usa p:xfrm
		return readXfrm(x);
	}

	// transforma um retângulo (EMU, espaço do filho) para o espaço do slide (pt)
	function applyTx(tx, r) {
		return {
			x: (r.x * tx.sx + tx.tx) / EMU,
			y: (r.y * tx.sy + tx.ty) / EMU,
			w: r.w * tx.sx / EMU,
			h: r.h * tx.sy / EMU,
			rot: (r.rot || 0) + (tx.rot || 0)
		};
	}

	function groupTx(parent, gx) {
		if (!gx || gx.chW === undefined) return parent;
		var sx = gx.chW ? gx.w / gx.chW : 1;
		var sy = gx.chH ? gx.h / gx.chH : 1;
		var itx = gx.x - gx.chX * sx, ity = gx.y - gx.chY * sy;
		return {
			sx: parent.sx * sx, sy: parent.sy * sy,
			tx: parent.sx * itx + parent.tx, ty: parent.sy * ity + parent.ty,
			rot: (parent.rot || 0) + (gx.rot || 0)
		};
	}

	// ------------------------------------------------- estilos de texto ------
	function lvlPr(lstStyle, lvl) {
		if (!lstStyle) return null;
		return kid(lstStyle, 'lvl' + (lvl + 1) + 'pPr') || (lvl === 0 ? kid(lstStyle, 'defPPr') : null);
	}

	// primeiro valor definido na cadeia
	function first(list, fn) {
		for (var i = 0; i < list.length; i++) {
			if (!list[i]) continue;
			var v = fn(list[i]);
			if (v !== null && v !== undefined) return v;
		}
		return null;
	}

	function spacing(el, name, size) {
		var s = kid(el, name);
		if (!s) return null;
		var pct = kid(s, 'spcPct'), pts = kid(s, 'spcPts');
		if (pct) return { pct: numAttr(pct, 'val', 100000) / 100000 };
		if (pts) return { pts: numAttr(pts, 'val', 0) / 100 };
		return null;
	}

	function textOfRun(r) {
		var t = kid(r, 't');
		return t ? t.textContent : '';
	}

	// ------------------------------------------------- leitura do slide ------
	PptxReader.prototype.readSlide = function (slidePath, ctxInfo) {
		var self = this;
		var out = { texts: [], render: [], hidden: false };

		return Promise.all([
			this.xml(slidePath),
			this.relOfType(slidePath, 'slideLayout')
		]).then(function (r) {
			var slide = r[0], layoutPath = r[1];
			out.hidden = attr(slide, 'show') === '0';
			return Promise.all([
				slide,
				layoutPath,
				layoutPath ? self.xml(layoutPath) : null,
				layoutPath ? self.relOfType(layoutPath, 'slideMaster') : null
			]);
		}).then(function (r) {
			var slide = r[0], layoutPath = r[1], layout = r[2], masterPath = r[3];
			return Promise.all([
				slide, layoutPath, layout, masterPath,
				masterPath ? self.xml(masterPath) : null,
				masterPath ? self.relOfType(masterPath, 'theme') : null
			]);
		}).then(function (r) {
			var slide = r[0], layoutPath = r[1], layout = r[2], masterPath = r[3], master = r[4], themePath = r[5];
			return (themePath ? self.xml(themePath) : Promise.resolve(null)).then(function (theme) {
				var clrMap = readClrMap(kid(master, 'clrMap'));
				var ovr = kidPath(slide, 'clrMapOvr/overrideClrMapping') || kidPath(layout, 'clrMapOvr/overrideClrMapping');
				if (ovr) clrMap = readClrMap(ovr);
				var ctx = new SlideCtx(new Theme(theme), clrMap);

				var S = {
					ctx: ctx,
					slidePath: slidePath, layoutPath: layoutPath, masterPath: masterPath,
					slide: slide, layout: layout, master: master,
					slideTree: kidPath(slide, 'cSld/spTree'),
					layoutTree: kidPath(layout, 'cSld/spTree'),
					masterTree: kidPath(master, 'cSld/spTree'),
					txStyles: kid(master, 'txStyles'),
					defaultTextStyle: ctxInfo.defaultTextStyle,
					fontScaleOpt: ctxInfo.opts
				};

				return self.buildRender(S, out).then(function () {
					var tx = { sx: 1, sy: 1, tx: 0, ty: 0, rot: 0 };
					self.walkTree(S, S.slideTree, tx, out, 'slide');
					return out;
				});
			});
		});
	};

	// fundo + elementos do mestre/layout (apenas para a imagem de referência)
	PptxReader.prototype.buildRender = function (S, out) {
		var self = this;
		var ctx = S.ctx;
		var bgColor = [1, 1, 1], bgImage = null, bgImageRelBase = null;

		var sources = [[S.slide, S.slidePath], [S.layout, S.layoutPath], [S.master, S.masterPath]];
		for (var i = 0; i < sources.length; i++) {
			var bg = kidPath(sources[i][0], 'cSld/bg');
			if (!bg) continue;
			var bgPr = kid(bg, 'bgPr'), bgRef = kid(bg, 'bgRef');
			if (bgPr) {
				var blip = kidPath(bgPr, 'blipFill/blip');
				if (blip) { bgImage = relAttr(blip, 'embed'); bgImageRelBase = sources[i][1]; }
				var c = ctx.fillColor(bgPr);
				if (c) bgColor = c;
			} else if (bgRef) {
				var refColor = ctx.color(bgRef);
				var idx = numAttr(bgRef, 'idx', 0);
				var style = idx >= 1001 ? ctx.theme.bgFillStyles[idx - 1001] : ctx.theme.fillStyles[idx - 1];
				var sc = null;
				if (style) {
					// style é o próprio elemento de preenchimento
					if (style.localName === 'solidFill') sc = ctx.color(style, refColor);
					else if (style.localName === 'gradFill') sc = ctx.color(kidPath(style, 'gsLst/gs'), refColor);
				}
				bgColor = sc || refColor || bgColor;
			}
			break;
		}
		out.render.push({ type: 'bg', color: bgColor });

		var jobs = [];
		if (bgImage) {
			jobs.push(this.rels(bgImageRelBase).then(function (rels) {
				var rel = rels[bgImage];
				return rel && rel.target ? self.media(rel.target) : null;
			}).then(function (data) {
				if (data) out.render.push({ type: 'bgImage', src: data });
			}));
		}

		return Promise.all(jobs).then(function () {
			var tx = { sx: 1, sy: 1, tx: 0, ty: 0, rot: 0 };
			var showMaster = attr(S.slide, 'showMasterSp') !== '0';
			var showMasterL = attr(S.layout, 'showMasterSp') !== '0';
			var p = Promise.resolve();
			if (showMaster && showMasterL) p = p.then(function () { return self.renderTree(S, S.masterTree, tx, out, S.masterPath, true); });
			if (showMaster) p = p.then(function () { return self.renderTree(S, S.layoutTree, tx, out, S.layoutPath, true); });
			return p.then(function () { return self.renderTree(S, S.slideTree, tx, out, S.slidePath, false); });
		});
	};

	// coleta formas e imagens para a renderização de referência
	PptxReader.prototype.renderTree = function (S, tree, tx, out, relBase, skipPh) {
		var self = this;
		if (!tree) return Promise.resolve();
		var jobs = [];
		var slot = [];

		kids(tree).forEach(function (el) {
			var name = el.localName;
			if (name === 'grpSp') {
				var holder = [];
				slot.push(holder);
				var gtx = groupTx(tx, shapeXfrm(el));
				jobs.push(self.renderTree(S, el, gtx, { render: holder }, relBase, skipPh));
				return;
			}
			if (name !== 'sp' && name !== 'pic' && name !== 'cxnSp') return;
			var ph = phInfo(el);
			if (skipPh && ph) return; // placeholders do mestre/layout não aparecem no slide

			var xf = self.resolveXfrm(S, el, ph, relBase === S.slidePath);
			if (!xf) return;
			var rect = applyTx(tx, xf);
			var spPr = kid(el, 'spPr');

			if (name === 'pic') {
				var blip = kidPath(el, 'blipFill/blip');
				var rid = relAttr(blip, 'embed');
				if (!rid) return;
				var item = { type: 'image', rect: rect, src: null };
				slot.push(item);
				jobs.push(self.rels(relBase).then(function (rels) {
					var rel = rels[rid];
					return rel && rel.target ? self.media(rel.target) : null;
				}).then(function (data) { item.src = data; }));
				return;
			}

			var geom = attr(kidPath(spPr, 'prstGeom'), 'prst') || (kid(spPr, 'custGeom') ? 'rect' : 'rect');
			var fill = S.ctx.fillColor(spPr);
			var styleFill = null;
			if (fill === undefined) {
				var fr = kidPath(el, 'style/fillRef');
				if (fr && numAttr(fr, 'idx', 0) > 0) styleFill = S.ctx.color(fr);
			}
			var ln = kid(spPr, 'ln');
			var line = ln ? S.ctx.fillColor(ln) : undefined;
			if (line === undefined) {
				var lr = kidPath(el, 'style/lnRef');
				if (lr && numAttr(lr, 'idx', 0) > 0 && !(ln && kid(ln, 'noFill'))) line = S.ctx.color(lr);
			}
			var blipFill = kidPath(spPr, 'blipFill/blip');
			var shapeItem = {
				type: 'shape', geom: geom, rect: rect,
				fill: fill === undefined ? styleFill : fill,
				line: line || null,
				lineW: ln ? numAttr(ln, 'w', 9525) / EMU : 0.75
			};
			slot.push(shapeItem);
			if (blipFill) {
				var bid = relAttr(blipFill, 'embed');
				var imgItem = { type: 'image', rect: rect, src: null };
				slot.push(imgItem);
				jobs.push(self.rels(relBase).then(function (rels) {
					var rel = rels[bid];
					return rel && rel.target ? self.media(rel.target) : null;
				}).then(function (data) { imgItem.src = data; }));
			}
			// textos de formas do mestre/layout (ex. logotipos em texto) entram só na referência
			if (relBase !== S.slidePath && kid(el, 'txBody')) {
				var txt = self.readTextShape(S, el, null, tx, relBase === S.masterPath ? 'master' : 'layout');
				if (txt) slot.push({ type: 'text', item: txt });
			}
		});

		return Promise.all(jobs).then(function () {
			(function flat(arr) {
				arr.forEach(function (it) {
					if (Array.isArray(it)) flat(it);
					else out.render.push(it);
				});
			})(slot);
		});
	};

	// posição de uma forma, herdando do layout/mestre quando for placeholder
	PptxReader.prototype.resolveXfrm = function (S, el, ph, onSlide) {
		var xf = shapeXfrm(el);
		if (xf || !ph) return xf;
		if (onSlide) {
			var l = findPh(S.layoutTree, ph, false);
			xf = l ? shapeXfrm(l) : null;
			if (xf) return xf;
		}
		var m = findPh(S.masterTree, ph, true);
		return m ? shapeXfrm(m) : null;
	};

	PptxReader.prototype.walkTree = function (S, tree, tx, out, where) {
		var self = this;
		kids(tree).forEach(function (el) {
			var name = el.localName;
			if (name === 'grpSp') {
				self.walkTree(S, el, groupTx(tx, shapeXfrm(el)), out, where);
			} else if (name === 'sp') {
				var item = self.readTextShape(S, el, phInfo(el), tx, where);
				if (item) {
					out.texts.push(item);
					out.render.push({ type: 'text', item: item });
				}
			} else if (name === 'graphicFrame') {
				self.readTable(S, el, tx).forEach(function (item) {
					out.texts.push(item);
					out.render.push({ type: 'text', item: item });
				});
			}
		});
	};

	// cadeia de estilos (lstStyle) para uma forma
	PptxReader.prototype.styleChain = function (S, el, ph, where) {
		var chain = { lst: [], bodyPr: [] };
		chain.lst.push(kidPath(el, 'txBody/lstStyle'));
		chain.bodyPr.push(kidPath(el, 'txBody/bodyPr'));

		if (ph) {
			var lph = where === 'slide' ? findPh(S.layoutTree, ph, false) : null;
			var mph = findPh(S.masterTree, ph, true);
			if (lph) {
				chain.lst.push(kidPath(lph, 'txBody/lstStyle'));
				chain.bodyPr.push(kidPath(lph, 'txBody/bodyPr'));
			}
			if (mph && where !== 'master') {
				chain.lst.push(kidPath(mph, 'txBody/lstStyle'));
				chain.bodyPr.push(kidPath(mph, 'txBody/bodyPr'));
			}
			var mt = masterType(ph.type);
			if (mt === 'title') chain.lst.push(kid(S.txStyles, 'titleStyle'));
			else if (mt === 'body') chain.lst.push(kid(S.txStyles, 'bodyStyle'));
			else chain.lst.push(kid(S.txStyles, 'otherStyle'));
		} else {
			chain.lst.push(kid(S.txStyles, 'otherStyle'));
		}
		chain.lst.push(S.defaultTextStyle);
		return chain;
	};

	PptxReader.prototype.readParagraphs = function (S, txBody, chain, fontScale, lnReduction, defColor) {
		var ctx = S.ctx;
		var paragraphs = [];

		kids(txBody, 'p').forEach(function (p) {
			var pPr = kid(p, 'pPr');
			var lvl = numAttr(pPr, 'lvl', 0);
			var lvls = [pPr].concat(chain.lst.map(function (l) { return lvlPr(l, lvl); }));

			var algn = first(lvls, function (e) { return attr(e, 'algn'); }) || 'l';
			var lnSpc = first(lvls, function (e) { return spacing(e, 'lnSpc'); }) || { pct: 1 };
			var spcBef = first(lvls, function (e) { return spacing(e, 'spcBef'); });
			var spcAft = first(lvls, function (e) { return spacing(e, 'spcAft'); });
			var buNone = first(lvls, function (e) { return kid(e, 'buNone') ? 'none' : (kid(e, 'buChar') ? attr(kid(e, 'buChar'), 'char') : null); });

			var defRPrs = lvls.map(function (e) { return kid(e, 'defRPr'); });
			var runs = [];

			function runProps(rPr) {
				var rp = [rPr].concat(defRPrs);
				var size = first(rp, function (e) { return numAttr(e, 'sz', null); });
				size = (size ? size / 100 : 18) * fontScale;
				var latin = first(rp, function (e) { var l = kid(e, 'latin'); return l ? attr(l, 'typeface') : null; });
				var ea = first(rp, function (e) { var l = kid(e, 'ea'); return l ? attr(l, 'typeface') : null; });
				var family = ctx.font(latin) || ctx.font(ea) || ctx.theme.minor;
				var bold = !!first(rp, function (e) { return boolAttr(e, 'b'); });
				var italic = !!first(rp, function (e) { return boolAttr(e, 'i'); });
				// prioridade: trecho > estilo do parágrafo/forma > cor do estilo da forma (fontRef) > layout/mestre
				var colorOf = function (e) {
					var c = ctx.fillColor(e);
					return c === undefined ? null : c;
				};
				var color = first(rp.slice(0, 3), colorOf) || defColor || first(rp.slice(3), colorOf) || [0, 0, 0];
				var spc = first(rp, function (e) { return numAttr(e, 'spc', null); }) || 0;
				var cap = first(rp, function (e) { return attr(e, 'cap'); });
				return {
					family: family, bold: bold, italic: italic,
					fontKey: family + (bold ? ' Bold' : '') + (italic ? ' Italic' : ''),
					size: Math.round(size * 100) / 100,
					color: [color[0], color[1], color[2]],
					// spc em 1/100 pt -> tracking do AE em 1/1000 em
					tracking: size ? Math.round((spc / 100) / size * 1000) : 0,
					caps: cap === 'all'
				};
			}

			kids(p).forEach(function (r) {
				var rp;
				if (r.localName === 'r' || r.localName === 'fld') {
					var text = textOfRun(r);
					if (!text) return;
					rp = runProps(kid(r, 'rPr'));
					rp.text = text;
					runs.push(rp);
				} else if (r.localName === 'br') {
					rp = runProps(kid(r, 'rPr'));
					rp.text = '\r';
					runs.push(rp);
				}
			});

			var endProps = runProps(kid(p, 'endParaRPr'));
			if (buNone && buNone !== 'none' && runs.length) {
				var bu = Object.assign({}, runs[0]);
				bu.text = buNone + ' ';
				runs.unshift(bu);
			}

			var maxSize = runs.reduce(function (m, r) { return Math.max(m, r.size); }, 0) || endProps.size;
			var leading;
			if (lnSpc.pts) leading = lnSpc.pts;
			else leading = maxSize * 1.2 * Math.max(0.1, lnSpc.pct - lnReduction);

			function sp(s) {
				if (!s) return 0;
				if (s.pts !== undefined) return s.pts;
				return s.pct * maxSize * 1.2;
			}

			paragraphs.push({
				align: { l: 'left', ctr: 'center', r: 'right', just: 'justify', dist: 'justify' }[algn] || 'left',
				leading: Math.round(leading * 100) / 100,
				// linha de base a partir do topo da linha (PowerPoint: entrelinha - 0,2 x tamanho)
				base: Math.round((leading - maxSize * 0.2) * 100) / 100,
				spaceBefore: sp(spcBef),
				spaceAfter: sp(spcAft),
				emptySize: endProps.size,
				emptyProps: endProps,
				runs: runs
			});
		});

		// remove parágrafos vazios do final
		while (paragraphs.length && !paragraphs[paragraphs.length - 1].runs.length) paragraphs.pop();
		// parágrafos vazios no meio viram uma linha vazia com o tamanho do endParaRPr
		paragraphs.forEach(function (p) {
			if (!p.runs.length) {
				var e = Object.assign({}, p.emptyProps);
				e.text = '';
				p.runs.push(e);
			}
			delete p.emptyProps;
			delete p.emptySize;
		});
		if (!paragraphs.some(function (p) { return p.runs.some(function (r) { return r.text.replace(/\s/g, ''); }); })) return [];
		return paragraphs;
	};

	PptxReader.prototype.readTextShape = function (S, el, ph, tx, where) {
		var txBody = kid(el, 'txBody');
		if (!txBody) return null;
		if (ph && /^(dt|ftr|sldNum)$/.test(ph.type) && where === 'slide' && !kid(txBody, 'p')) return null;

		var xf = this.resolveXfrm(S, el, ph, where === 'slide');
		if (!xf) return null;
		var rect = applyTx(tx, xf);

		var chain = this.styleChain(S, el, ph, where);
		var bp = chain.bodyPr;
		var bodyPr = bp[0];

		var lIns = first(bp, function (e) { return numAttr(e, 'lIns', null); });
		var tIns = first(bp, function (e) { return numAttr(e, 'tIns', null); });
		var rIns = first(bp, function (e) { return numAttr(e, 'rIns', null); });
		var bIns = first(bp, function (e) { return numAttr(e, 'bIns', null); });
		lIns = (lIns === null ? 91440 : lIns) / EMU;
		rIns = (rIns === null ? 91440 : rIns) / EMU;
		tIns = (tIns === null ? 45720 : tIns) / EMU;
		bIns = (bIns === null ? 45720 : bIns) / EMU;

		var anchor = first(bp, function (e) { return attr(e, 'anchor'); }) || 't';
		var wrap = first(bp, function (e) { return attr(e, 'wrap'); }) || 'square';
		var vert = first(bp, function (e) { return attr(e, 'vert'); });
		var bodyRot = numAttr(bodyPr, 'rot', 0) / 60000;

		var fontScale = 1, lnReduction = 0;
		var norm = kid(bodyPr, 'normAutofit');
		if (norm) {
			fontScale = numAttr(norm, 'fontScale', 100000) / 100000;
			lnReduction = numAttr(norm, 'lnSpcReduction', 0) / 100000;
		}
		if (S.fontScaleOpt && S.fontScaleOpt.ignoreAutofit) { fontScale = 1; lnReduction = 0; }

		// cor padrão vinda do estilo da forma (fontRef)
		var fontRef = kidPath(el, 'style/fontRef');
		var defColor = fontRef ? S.ctx.color(fontRef) : null;

		var paragraphs = this.readParagraphs(S, txBody, chain, fontScale, lnReduction, defColor);
		if (!paragraphs.length) return null;

		var rot = rect.rot + bodyRot;
		if (vert === 'vert') rot += 90;
		else if (vert === 'vert270') rot -= 90;

		var inner = {
			x: rect.x + lIns, y: rect.y + tIns,
			w: Math.max(1, rect.w - lIns - rIns), h: Math.max(1, rect.h - tIns - bIns)
		};
		var item = {
			source: where,
			name: ph ? ph.type : (attr(kidPath(el, 'nvSpPr/cNvPr'), 'name') || 'texto'),
			mode: 'box',
			x: inner.x, y: inner.y, w: inner.w, h: inner.h,
			cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2, // centro da forma (rotação)
			rotation: rot,
			vAlign: { t: 'top', ctr: 'middle', b: 'bottom', just: 'top', dist: 'middle' }[anchor] || 'top',
			paragraphs: paragraphs
		};

		if (wrap === 'none') { item.nowrap = true; toPointItem(item); }
		return item;
	};

	// texto sem quebra automática: vira texto de ponto (linha de base calculada).
	// pode ser chamado de novo depois que a entrelinha for recalculada.
	function toPointItem(item) {
		var ps = item.paragraphs;
		var align = ps[0].align === 'justify' ? 'left' : ps[0].align;
		var total = 0;
		ps.forEach(function (p, i) {
			if (i > 0) total += p.spaceBefore + ps[i - 1].spaceAfter;
			var lines = 1;
			p.runs.forEach(function (r) { if (r.text === '\r') lines++; });
			total += p.leading * lines;
		});
		var firstSize = ps[0].runs.reduce(function (m, r) { return Math.max(m, r.size); }, 0);
		// distância do topo da linha até a linha de base
		var ascent = ps[0].base !== undefined ? ps[0].base : ps[0].leading - firstSize * 0.3;
		var top = item.y;
		if (item.vAlign === 'middle') top = item.y + (item.h - total) / 2;
		else if (item.vAlign === 'bottom') top = item.y + item.h - total;
		item.mode = 'point';
		var ax = align === 'center' ? item.x + item.w / 2 : (align === 'right' ? item.x + item.w : item.x);
		var ay = top + ascent;
		// a forma gira em torno do centro: leva o ponto de ancoragem junto
		if (item.rotation) {
			var a = item.rotation * Math.PI / 180, dx = ax - item.cx, dy = ay - item.cy;
			ax = item.cx + dx * Math.cos(a) - dy * Math.sin(a);
			ay = item.cy + dx * Math.sin(a) + dy * Math.cos(a);
		}
		item.ax = ax;
		item.ay = ay;
		item.align = align;
	}

	PptxReader.prototype.readTable = function (S, frame, tx) {
		var tbl = kidPath(frame, 'graphic/graphicData/tbl');
		if (!tbl) return [];
		var xf = shapeXfrm(frame);
		if (!xf) return [];
		var base = applyTx(tx, xf);
		var sx = tx.sx / EMU, sy = tx.sy / EMU;

		var cols = kids(kid(tbl, 'tblGrid'), 'gridCol').map(function (c) { return numAttr(c, 'w', 0) * sx; });
		var items = [];
		var y = base.y;
		var self = this;
		var chain = { lst: [kid(S.txStyles, 'otherStyle'), S.defaultTextStyle], bodyPr: [] };

		kids(tbl, 'tr').forEach(function (tr) {
			var h = numAttr(tr, 'h', 0) * sy;
			var x = base.x;
			kids(tr, 'tc').forEach(function (tc, ci) {
				var span = numAttr(tc, 'gridSpan', 1);
				var w = 0;
				for (var k = 0; k < span; k++) w += cols[ci + k] || 0;
				var skip = boolAttr(tc, 'hMerge') || boolAttr(tc, 'vMerge');
				var rowSpan = numAttr(tc, 'rowSpan', 1);
				var tcPr = kid(tc, 'tcPr');
				var txBody = kid(tc, 'txBody');
				if (!skip && txBody) {
					var cellChain = { lst: [kid(txBody, 'lstStyle')].concat(chain.lst), bodyPr: [] };
					var paragraphs = self.readParagraphs(S, txBody, cellChain, 1, 0, null);
					if (paragraphs.length) {
						var mL = numAttr(tcPr, 'marL', 91440) / EMU, mR = numAttr(tcPr, 'marR', 91440) / EMU;
						var mT = numAttr(tcPr, 'marT', 45720) / EMU, mB = numAttr(tcPr, 'marB', 45720) / EMU;
						var hh = h;
						if (rowSpan > 1) {
							var nxt = tr;
							for (var rr = 1; rr < rowSpan; rr++) {
								nxt = nxt.nextSibling;
								while (nxt && nxt.nodeType !== 1) nxt = nxt.nextSibling;
								if (nxt) hh += numAttr(nxt, 'h', 0) * sy;
							}
						}
						var anchor = attr(tcPr, 'anchor') || 't';
						items.push({
							source: 'slide', name: 'tabela',
							mode: 'box',
							x: x + mL, y: y + mT, w: Math.max(1, w - mL - mR), h: Math.max(1, hh - mT - mB),
							cx: x + w / 2, cy: y + hh / 2,
							rotation: 0,
							vAlign: { t: 'top', ctr: 'middle', b: 'bottom' }[anchor] || 'top',
							paragraphs: paragraphs
						});
					}
				}
				x += cols[ci] || 0;
			});
			y += h;
		});
		return items;
	};

	// ------------------------------------------------- entrada pública -------
	ABR.parsePPTX = function (bytes, opts, onProgress) {
		opts = opts || {};
		var reader;
		return JSZip.loadAsync(bytes).then(function (zip) {
			reader = new PptxReader(zip);
			return reader.xml('ppt/presentation.xml');
		}).then(function (pres) {
			if (!pres) throw new Error(ABR.t('err.pptxInvalid'));
			var sz = kid(pres, 'sldSz');
			var W = numAttr(sz, 'cx', 12192000) / EMU, H = numAttr(sz, 'cy', 6858000) / EMU;
			var defaultTextStyle = kid(pres, 'defaultTextStyle');
			var ids = kids(kid(pres, 'sldIdLst'), 'sldId').map(function (s) { return relAttr(s, 'id'); });

			return reader.rels('ppt/presentation.xml').then(function (rels) {
				var paths = ids.map(function (id) { return rels[id] && rels[id].target; }).filter(Boolean);
				var pages = [];
				var chainP = Promise.resolve();
				paths.forEach(function (p, i) {
					chainP = chainP.then(function () {
						if (onProgress) onProgress(i, paths.length);
						return reader.readSlide(p, { defaultTextStyle: defaultTextStyle, opts: opts });
					}).then(function (s) {
						pages.push({
							index: i, number: i + 1, name: ABR.t('parser.slideName', { n: i + 1 }),
							width: W, height: H,
							hidden: s.hidden,
							texts: s.texts,
							render: s.render
						});
					});
				});
				return chainP.then(function () {
					return { type: 'pptx', width: W, height: H, pages: pages };
				});
			});
		});
	};

	// exporta utilitários para testes
	ABR._pptx = { kids: kids, kid: kid, resolvePath: resolvePath, toPointItem: toPointItem };

})(window);
