/*
 * ABRIDOR - host (ExtendScript / After Effects)
 *
 * Funções chamadas pelo painel via evalScript. Todas retornam uma string JSON.
 * Os dados grandes (estrutura dos slides, mapa de fontes) chegam por arquivo
 * JSON temporário escrito pelo painel.
 *
 * Cada camada de texto criada recebe um comentário "ABRIDOR {...}" com a fonte
 * original de cada trecho. É isso que permite trocar as fontes depois que as
 * comps já foram criadas (mesmo em outra sessão do After Effects).
 */

var ABRIDOR_TAG = 'ABRIDOR ';
var ABRIDOR_ROOT = 'ABRIDOR';
var ABRIDOR_MAP_TAG = 'ABRIDOR_FONT_MAP ';

// ------------------------------------------------------------------ JSON --
function abr_stringify(v) {
	var t = typeof v;
	if (v === null || v === undefined) return 'null';
	if (t === 'number') return isFinite(v) ? String(v) : 'null';
	if (t === 'boolean') return v ? 'true' : 'false';
	if (t === 'string') {
		var out = '"';
		for (var i = 0; i < v.length; i++) {
			var c = v.charAt(i), code = v.charCodeAt(i);
			if (c === '"') out += '\\"';
			else if (c === '\\') out += '\\\\';
			else if (c === '\n') out += '\\n';
			else if (c === '\r') out += '\\r';
			else if (c === '\t') out += '\\t';
			else if (code < 32 || code > 126) {
				var h = code.toString(16);
				while (h.length < 4) h = '0' + h;
				out += '\\u' + h;
			} else out += c;
		}
		return out + '"';
	}
	if (v instanceof Array) {
		var a = [];
		for (var j = 0; j < v.length; j++) a.push(abr_stringify(v[j]));
		return '[' + a.join(',') + ']';
	}
	if (t === 'object') {
		var o = [];
		for (var k in v) {
			if (v.hasOwnProperty(k) && typeof v[k] !== 'function') o.push(abr_stringify(k) + ':' + abr_stringify(v[k]));
		}
		return '{' + o.join(',') + '}';
	}
	return 'null';
}

function abr_parse(str) {
	// o conteúdo é gerado pelo próprio painel (JSON.stringify)
	return eval('(' + str + ')');
}

// --------------------------------------------------------- tradu\u00e7\u00f5es --
// textos em portugu\u00eas (usados enquanto o painel n\u00e3o manda os do idioma atual;
// as chaves s\u00e3o as "host.*" de i18n/strings.csv, sem o prefixo)
var ABR_STR_PT = {
	'file_not_found': 'arquivo n\u00e3o encontrado: {path}',
	'at_line': '{msg} (linha {line})',
	'font_unavailable': 'fonte "{font}" indispon\u00edvel ({key}) \u2192 {used}',
	'ranges_unsupported': 'estilos por trecho n\u00e3o suportados nesta vers\u00e3o do AE (camada "{layer}")',
	'mixed_simplified': 'estilos mistos simplificados (AE sem characterRange): "{layer}"',
	'text_error': 'erro no texto {n}: {msg}',
	'kept_new_layer': '"{layer}": {msg} (mantida a camada nova)',
	'no_match': '"{layer}" n\u00e3o tem mais texto correspondente no documento (mantida)',
	'ref_missing': 'imagem de refer\u00eancia n\u00e3o encontrada: {path}',
	'ref_error': 'erro na imagem de refer\u00eancia: {msg}',
	'item_not_found': 'item n\u00e3o encontrado no projeto',
	'split_keyframes': '"{layer}" tem keyframes ou express\u00e3o no texto: n\u00e3o foi dividida',
	'layer_locked': '"{layer}" est\u00e1 travada',
	'layer_error': '"{layer}": {msg}',
	'from_selected': 'camadas selecionadas',
	'from_comps.one': '{n} comp',
	'from_comps.other': '{n} comps',
	'undo_prepare': 'ABRIDOR - preparar',
	'undo_master': 'ABRIDOR - master',
	'undo_fonts': 'ABRIDOR - trocar fontes',
	'undo_split': 'ABRIDOR - dividir em linhas'
};
var ABR_STR = $.global.ABR_STR || {};

// chamado pelo painel na abertura: { chave: texto } no idioma atual (objeto ou string JSON)
function abridor_setStrings(json) {
	try {
		var o = typeof json === 'string' ? abr_parse(json) : json;
		ABR_STR = {};
		if (o) for (var k in o) if (o.hasOwnProperty(k) && typeof o[k] === 'string' && o[k] !== '') ABR_STR[k] = o[k];
		$.global.ABR_STR = ABR_STR;
		return abr_stringify({ ok: true });
	} catch (e) {
		return abr_error(e);
	}
}

function abr_t(key, vars) {
	var s = ABR_STR.hasOwnProperty(key) ? ABR_STR[key] : (ABR_STR_PT.hasOwnProperty(key) ? ABR_STR_PT[key] : key);
	if (!vars) return s;
	return String(s).replace(/\{(\w+)\}/g, function (m, k) {
		return vars.hasOwnProperty(k) && vars[k] !== null && vars[k] !== undefined ? String(vars[k]) : m;
	});
}

// plural: chave.one / chave.other com {n}
function abr_tn(key, n, vars) {
	var v = { n: n };
	if (vars) for (var k in vars) if (vars.hasOwnProperty(k)) v[k] = vars[k];
	return abr_t(key + (n === 1 ? '.one' : '.other'), v);
}

// mensagem de um erro, com a linha quando houver
function abr_errMsg(e) {
	var msg = e && e.message ? e.message : String(e);
	return e && e.line ? abr_t('at_line', { msg: msg, line: e.line }) : msg;
}

function abr_readJSON(path) {
	var f = new File(path);
	if (!f.exists) throw new Error(abr_t('file_not_found', { path: path }));
	f.encoding = 'UTF-8';
	f.open('r');
	var s = f.read();
	f.close();
	return abr_parse(s);
}

function abr_error(e) {
	return abr_stringify({ error: abr_errMsg(e) });
}

// ------------------------------------------------------------- projeto --
function abr_findFolder(name, parent) {
	for (var i = 1; i <= app.project.numItems; i++) {
		var it = app.project.item(i);
		if (it instanceof FolderItem && it.name === name && (!parent || it.parentFolder === parent)) return it;
	}
	return null;
}

function abr_rootFolder(create) {
	var f = abr_findFolder(ABRIDOR_ROOT, app.project.rootFolder);
	if (!f && create) f = app.project.items.addFolder(ABRIDOR_ROOT);
	return f;
}

function abr_newFolder(name, parent) {
	var f = app.project.items.addFolder(name);
	if (parent) f.parentFolder = parent;
	return f;
}

function abr_itemById(id) {
	for (var i = 1; i <= app.project.numItems; i++) {
		if (app.project.item(i).id === id) return app.project.item(i);
	}
	return null;
}

// mapa de fontes salvo no comentário da pasta ABRIDOR do projeto
function abr_loadStoredMap() {
	var root = abr_rootFolder(false);
	if (!root || !root.comment || root.comment.indexOf(ABRIDOR_MAP_TAG) !== 0) return {};
	try { return abr_parse(root.comment.substr(ABRIDOR_MAP_TAG.length)) || {}; } catch (e) { return {}; }
}

function abr_storeMap(map) {
	var root = abr_rootFolder(true);
	var old = abr_loadStoredMap();
	for (var k in map) if (map.hasOwnProperty(k)) old[k] = map[k];
	root.comment = ABRIDOR_MAP_TAG + abr_stringify(old);
	return old;
}

// ------------------------------------------------------------- fontes ---
function abridor_ping() {
	return abr_stringify({ ok: true, version: app.version, fonts: !!(app.fonts && app.fonts.allFonts) });
}

function abridor_getFonts() {
	try {
		if (!app.fonts || !app.fonts.allFonts) return abr_stringify({ unsupported: true });
		var groups = app.fonts.allFonts;
		var parts = [];
		for (var i = 0; i < groups.length; i++) {
			var g = groups[i];
			var list = (g instanceof Array) ? g : [g];
			for (var j = 0; j < list.length; j++) {
				var f = list[j];
				var o = {};
				try { o.f = f.familyName; } catch (e1) { o.f = ''; }
				try { o.s = f.styleName; } catch (e2) { o.s = ''; }
				try { o.p = f.postScriptName; } catch (e3) { o.p = ''; }
				try { o.n = f.fullName; } catch (e4) { }
				try { o.l = f.location; } catch (e5) { }
				try { if (f.isSubstitute) continue; } catch (e6) { }
				if (o.p) parts.push(abr_stringify(o));
			}
		}
		return '{"fonts":[' + parts.join(',') + ']}';
	} catch (e) {
		return abr_error(e);
	}
}

// --------------------------------------------------------- texto --------
var ABR_JUST = null;
function abr_just(align) {
	if (!ABR_JUST) {
		ABR_JUST = {
			left: ParagraphJustification.LEFT_JUSTIFY,
			center: ParagraphJustification.CENTER_JUSTIFY,
			right: ParagraphJustification.RIGHT_JUSTIFY,
			justify: ParagraphJustification.FULL_JUSTIFY_LASTLINE_LEFT
		};
	}
	return ABR_JUST[align] || ABR_JUST.left;
}

// junta os parágrafos num texto único e calcula os intervalos de cada trecho
function abr_flatten(paragraphs) {
	var text = '', runs = [], para = [];
	for (var i = 0; i < paragraphs.length; i++) {
		var p = paragraphs[i];
		if (i > 0) {
			// o "\r" herda o estilo do último trecho do parágrafo anterior
			text += '\r';
		}
		var pStart = text.length;
		for (var j = 0; j < p.runs.length; j++) {
			var r = p.runs[j];
			var t = r.caps ? r.text.toUpperCase() : r.text;
			if (!t.length) continue;
			runs.push({ start: text.length, end: text.length + t.length, run: r, para: i });
			text += t;
		}
		para.push({ start: pStart, end: text.length, p: p });
	}
	return { text: text, runs: runs, paras: para };
}

function abr_sameStyle(a, b) {
	return a.fontKey === b.fontKey && Math.abs(a.size - b.size) < 0.01 &&
		Math.abs(a.color[0] - b.color[0]) < 0.01 && Math.abs(a.color[1] - b.color[1]) < 0.01 &&
		Math.abs(a.color[2] - b.color[2]) < 0.01 && (a.tracking || 0) === (b.tracking || 0);
}

function abr_try(fn) { try { fn(); return true; } catch (e) { return false; } }

function abr_fontFor(run, fontMap, fallback) {
	var m = fontMap[run.fontKey];
	return {
		ps: (m && m.ps) ? m.ps : fallback,
		scale: (m && m.scale) ? m.scale / 100 : 1
	};
}

// aplica as propriedades de um trecho num TextDocument ou CharacterRange
function abr_applyRunStyle(target, run, s, fontMap, fallback, leading) {
	var f = abr_fontFor(run, fontMap, fallback);
	var size = run.size * s * f.scale;
	abr_try(function () { target.font = f.ps; });
	abr_try(function () { target.fontSize = size; });
	abr_try(function () { target.applyFill = true; });
	abr_try(function () { target.fillColor = [run.color[0], run.color[1], run.color[2]]; });
	abr_try(function () { target.applyStroke = false; });
	abr_try(function () { target.tracking = run.tracking || 0; });
	if (leading) {
		abr_try(function () { target.autoLeading = false; });
		// a entrelinha não acompanha a escala da fonte: mantém a posição das linhas do documento
		abr_try(function () { target.leading = leading; });
	}
	return size;
}

function abr_layerName(text) {
	var n = text.replace(/[\r\n]+/g, ' ').replace(/^\s+|\s+$/g, '');
	if (n.length > 40) n = n.substr(0, 40) + '\u2026';
	return n || 'texto';
}

// cria uma camada de texto a partir de um item do modelo
function abr_createText(comp, t, s, ox, oy, fontMap, fallback, log) {
	var flat = abr_flatten(t.paragraphs);
	if (!flat.text.replace(/\s/g, '').length) return null;

	// trecho dominante (mais caracteres) define o estilo base da camada
	var dom = flat.runs[0].run, domLen = 0, counts = {};
	var maxSize = 0;
	for (var i = 0; i < flat.runs.length; i++) {
		var r = flat.runs[i];
		var k = r.run.fontKey + '|' + r.run.size;
		counts[k] = (counts[k] || 0) + (r.end - r.start);
		if (counts[k] > domLen) { domLen = counts[k]; dom = r.run; }
		if (r.run.size > maxSize) maxSize = r.run.size;
	}

	var p0 = t.paragraphs[0];
	var leading = p0.leading * s;
	var isBox = t.mode === 'box';
	var bw = 0, bh = 0, boxH = 0;
	var layer;

	if (isBox) {
		bw = Math.max(4, t.w * s);
		bh = Math.max(4, t.h * s);
		// folga extra na altura para o texto não ser cortado se a fonte nova for maior
		boxH = Math.max(bh * 2, bh + maxSize * s * 6);
		layer = comp.layers.addBoxText([bw, boxH]);
	} else {
		layer = comp.layers.addText(' ');
	}

	var prop = layer.property('ADBE Text Properties').property('ADBE Text Document');
	var td = prop.value;
	abr_try(function () { td.resetCharStyle(); });
	abr_try(function () { td.resetParagraphStyle(); });
	td.text = flat.text;
	abr_applyRunStyle(td, dom, s, fontMap, fallback, leading);
	abr_try(function () { td.justification = abr_just(isBox ? p0.align : (t.align || p0.align)); });
	prop.setValue(td);

	// confere se a fonte foi aceita
	var wanted = abr_fontFor(dom, fontMap, fallback).ps;
	td = prop.value;
	if (td.font !== wanted) {
		log.push(abr_t('font_unavailable', { font: wanted, key: dom.fontKey, used: td.font }));
	}

	// estilos por trecho (AE 24.3+: TextDocument.characterRange)
	var multi = false;
	for (i = 0; i < flat.runs.length; i++) {
		if (!abr_sameStyle(flat.runs[i].run, dom)) { multi = true; break; }
	}
	var perParagraph = false;
	for (i = 1; i < t.paragraphs.length; i++) {
		if (t.paragraphs[i].align !== p0.align || Math.abs(t.paragraphs[i].leading - p0.leading) > 0.01 ||
			t.paragraphs[i].spaceBefore || t.paragraphs[i - 1].spaceAfter) { perParagraph = true; break; }
	}
	var rangesOK = false;
	if ((multi || perParagraph) && typeof td.characterRange === 'function') {
		rangesOK = abr_try(function () {
			for (var q = 0; q < flat.runs.length; q++) {
				var fr = flat.runs[q];
				var lead = t.paragraphs[fr.para].leading * s;
				// inclui o "\r" seguinte no mesmo estilo
				var end = fr.end;
				if (end < flat.text.length && flat.text.charAt(end) === '\r') end++;
				var cr = td.characterRange(fr.start, end);
				abr_applyRunStyle(cr, fr.run, s, fontMap, fallback, lead);
			}
			if (perParagraph && typeof td.paragraphRange === 'function') {
				for (var pp = 0; pp < flat.paras.length; pp++) {
					var P = flat.paras[pp];
					// paragraphRange usa índices de parágrafo
					var pr = td.paragraphRange(pp, pp + 1);
					pr.justification = abr_just(P.p.align);
					abr_try(function () { pr.spaceBefore = pp ? (P.p.spaceBefore || 0) * s : 0; });
					abr_try(function () { pr.spaceAfter = (P.p.spaceAfter || 0) * s; });
				}
			}
			prop.setValue(td);
		});
		if (!rangesOK) log.push(abr_t('ranges_unsupported', { layer: abr_layerName(flat.text) }));
	} else if (multi) {
		log.push(abr_t('mixed_simplified', { layer: abr_layerName(flat.text) }));
	}

	// ----- posição
	var tr = layer.property('ADBE Transform Group');
	if (isBox) {
		td = prop.value;
		var bp = null;
		try { bp = td.boxTextPos; } catch (e) { bp = null; }
		if (!bp || bp.length < 2) bp = [-bw / 2, -boxH / 2];

		// alinhamento vertical: mede as linhas (baselineLocs) para centralizar/alinhar embaixo
		var dy = 0;
		if (t.vAlign === 'middle' || t.vAlign === 'bottom') {
			var total = null;
			try {
				var locs = td.baselineLocs;
				var ys = [];
				for (var b = 0; b + 3 < locs.length; b += 4) {
					if (isFinite(locs[b + 1]) && Math.abs(locs[b + 1]) < 1e6) ys.push(locs[b + 1]);
				}
				if (ys.length) total = (ys[ys.length - 1] - ys[0]) + leading;
			} catch (e) { total = null; }
			if (total === null) {
				// estimativa: largura média de caractere ~ 0.5 x tamanho
				var lines = 0;
				for (i = 0; i < t.paragraphs.length; i++) {
					var chars = 0, sz = 0;
					for (var j = 0; j < t.paragraphs[i].runs.length; j++) {
						chars += t.paragraphs[i].runs[j].text.length;
						sz = Math.max(sz, t.paragraphs[i].runs[j].size);
					}
					lines += Math.max(1, Math.ceil(chars * sz * s * 0.5 / bw));
				}
				total = lines * leading;
			}
			dy = t.vAlign === 'middle' ? (bh - total) / 2 : (bh - total);
		}

		// caixa original (espaço da camada) + modelo de linhas do PowerPoint, para dividir em linhas depois
		var lay = { x: bp[0], y: bp[1] - dy, w: bw, h: bh, v: t.vAlign, ps: [], p: [] };
		for (i = 0; i < flat.paras.length; i++) {
			var PP = flat.paras[i].p;
			var big = 0;
			for (var q2 = 0; q2 < PP.runs.length; q2++) big = Math.max(big, PP.runs[q2].size);
			lay.ps.push(flat.paras[i].start);
			lay.p.push([
				Math.round(PP.leading * s * 100) / 100,
				Math.round((PP.base !== undefined ? PP.base : PP.leading - big * 0.2) * s * 100) / 100,
				Math.round((PP.spaceBefore || 0) * s * 100) / 100,
				Math.round((PP.spaceAfter || 0) * s * 100) / 100,
				PP.align
			]);
		}

		var anchor = [bp[0] + (t.cx - t.x) * s, bp[1] + (t.cy - t.y) * s - dy];
		tr.property('ADBE Anchor Point').setValue([anchor[0], anchor[1], 0]);
		tr.property('ADBE Position').setValue([ox + t.cx * s, oy + t.cy * s, 0]);
	} else {
		tr.property('ADBE Anchor Point').setValue([0, 0, 0]);
		tr.property('ADBE Position').setValue([ox + t.ax * s, oy + t.ay * s, 0]);
	}
	if (t.rotation) tr.property('ADBE Rotate Z').setValue(t.rotation);

	layer.name = abr_layerName(flat.text);

	// metadados para a troca de fontes posterior
	var meta = { v: 1, k: dom.fontKey, sz: dom.size * s, sc: abr_fontFor(dom, fontMap, fallback).scale, runs: [] };
	if (isBox) meta.lay = lay;
	if (rangesOK && multi) {
		for (i = 0; i < flat.runs.length; i++) {
			var fr2 = flat.runs[i];
			meta.runs.push([fr2.start, fr2.end, fr2.run.fontKey, Math.round(fr2.run.size * s * 1000) / 1000]);
		}
	}
	layer.comment = ABRIDOR_TAG + abr_stringify(meta);
	return layer;
}

// ----------------------------------------------------------- criação ----
// estado entre as chamadas (uma chamada por slide para o painel mostrar o progresso)
$.global.__abridor = $.global.__abridor || {};

var ABRIDOR_DOC_TAG = 'ABRIDOR_DOC ';

// pasta do documento dentro da pasta ABRIDOR (ou null)
function abr_docFolder(name) {
	var root = abr_rootFolder(false);
	if (!root) return null;
	return abr_findFolder(name, root);
}

function abr_subFolder(name, parent, create) {
	var f = abr_findFolder(name, parent);
	if (!f && create) f = abr_newFolder(name, parent);
	return f;
}

// todos os itens de uma pasta (recursivo)
function abr_itemsIn(folder, out) {
	out = out || [];
	for (var i = 1; i <= folder.numItems; i++) {
		var it = folder.item(i);
		out.push(it);
		if (it instanceof FolderItem) abr_itemsIn(it, out);
	}
	return out;
}

function abr_rangesSupported() {
	try {
		var td = new TextDocument('x');
		return typeof td.characterRange === 'function';
	} catch (e) {
		return parseFloat(app.version) >= 24.3;
	}
}

// o que existe no projeto antes de criar: versão do AE e se o documento já foi criado
function abridor_inspect(docName) {
	try {
		var out = { ok: true, version: app.version, ranges: abr_rangesSupported(), existing: null, next: 2 };
		var root = abr_rootFolder(false);
		if (root) {
			for (var i = 1; i <= root.numItems; i++) {
				var it = root.item(i);
				if (!(it instanceof FolderItem)) continue;
				if (it.name === docName) {
					var comps = 0, all = abr_itemsIn(it);
					for (var j = 0; j < all.length; j++) if (all[j] instanceof CompItem) comps++;
					var created = '';
					if (it.comment && it.comment.indexOf(ABRIDOR_DOC_TAG) === 0) {
						try { created = abr_parse(it.comment.substr(ABRIDOR_DOC_TAG.length)).t || ''; } catch (e) { }
					}
					out.existing = { name: it.name, comps: comps, created: created };
				}
				var m = it.name.match(/^(.*) (\d+)$/);
				if (m && m[1] === docName) out.next = Math.max(out.next, parseInt(m[2], 10) + 1);
			}
		}
		return abr_stringify(out);
	} catch (e) {
		return abr_error(e);
	}
}

function abridor_begin(jobPath) {
	try {
		var job = abr_readJSON(jobPath);
		var mode = job.settings.mode || 'new';
		app.beginUndoGroup(abr_t('undo_prepare'));
		try {
			if (!app.project) app.newProject();
			var root = abr_rootFolder(true);
			var existing = abr_docFolder(job.docName);
			var docFolder = null;

			if (existing && mode === 'replace') {
				// apaga as comps, imagens e pastas antigas do documento
				var all = abr_itemsIn(existing);
				for (var i = all.length - 1; i >= 0; i--) {
					try { if (!(all[i] instanceof FolderItem)) all[i].remove(); } catch (e1) { }
				}
				try { existing.remove(); } catch (e2) { }
				existing = null;
			}
			if (existing && mode === 'texts') docFolder = existing;
			else {
				docFolder = abr_newFolder(job.folderName || job.docName, root);
				docFolder.comment = ABRIDOR_DOC_TAG + abr_stringify({ t: new Date().toString() });
				mode = mode === 'texts' ? 'new' : mode;
			}

			var slides = abr_subFolder('slides', docFolder, true);
			var refs = job.settings.refImages ? abr_subFolder('refer\u00eancias', docFolder, true) : null;
			abr_storeMap(job.fontMap);
			$.global.__abridor = {
				docFolder: docFolder.id,
				slides: slides.id,
				refs: refs ? refs.id : 0,
				mode: mode,
				comps: []
			};
		} finally {
			app.endUndoGroup();
		}
		return abr_stringify({ ok: true, mode: mode });
	} catch (e) {
		return abr_error(e);
	}
}

// comp de uma página já criada antes (modo "só os textos")
function abr_findPageComp(st, name) {
	var folder = abr_itemById(st.docFolder);
	if (!folder) return null;
	var all = abr_itemsIn(folder);
	for (var i = 0; i < all.length; i++) if (all[i] instanceof CompItem && all[i].name === name) return all[i];
	return null;
}

// cria as camadas de texto de uma página e numera na ordem do documento
function abr_buildTexts(comp, page, S, s, ox, oy, fontMap, log) {
	var made = [], seq = 0;
	for (var i = 0; i < page.texts.length; i++) {
		try {
			var layer = abr_createText(comp, page.texts[i], s, ox, oy, fontMap, S.fallbackFont || 'ArialMT', log);
			if (!layer) continue;
			var layers = [layer];
			if (S.lines) layers = abr_splitLayer(layer, log).layers || [];
			for (var j = 0; j < layers.length; j++) {
				var meta = abr_layerMeta(layers[j]);
				if (meta) {
					meta.i = seq;
					layers[j].comment = ABRIDOR_TAG + abr_stringify(meta);
				}
				seq++;
				made.push(layers[j]);
			}
		} catch (e) {
			log.push(abr_t('text_error', { n: i + 1, msg: abr_errMsg(e) }));
		}
	}
	return made;
}

// ordem de leitura: pelo índice gravado na criação, senão pela posição (de cima para baixo)
function abr_readingOrder(layers) {
	var info = [];
	for (var i = 0; i < layers.length; i++) {
		var meta = abr_layerMeta(layers[i]);
		var p = layers[i].property('ADBE Transform Group').property('ADBE Position').value;
		info.push({ l: layers[i], i: meta && meta.i !== undefined ? meta.i : null, x: p[0], y: p[1] });
	}
	var allIndexed = true;
	for (i = 0; i < info.length; i++) if (info[i].i === null) allIndexed = false;
	info.sort(function (a, b) {
		if (allIndexed) return a.i - b.i;
		if (Math.abs(a.y - b.y) > 4) return a.y - b.y;
		return a.x - b.x;
	});
	return { list: info, indexed: allIndexed };
}

function abr_contains(arr, x) {
	for (var i = 0; i < arr.length; i++) if (arr[i] === x) return true;
	return false;
}

// modo "só os textos": mantém cada camada antiga (posição, animação, efeitos) e troca só o conteúdo
function abr_updateTexts(comp, made, log) {
	var old = [];
	for (var i = 1; i <= comp.numLayers; i++) {
		var l = comp.layer(i);
		if (abr_layerMeta(l) && !abr_contains(made, l)) old.push(l);
	}
	var A = abr_readingOrder(old), B = abr_readingOrder(made);
	var olds = A.list, news = B.list;
	var updated = 0, added = 0;
	for (i = 0; i < news.length; i++) {
		var nl = news[i].l;
		var match = null;
		if (A.indexed && B.indexed) {
			for (var k = 0; k < olds.length; k++) if (olds[k].i === news[i].i && !olds[k].used) { match = olds[k]; break; }
		} else if (i < olds.length) match = olds[i];
		if (!match) { added++; continue; }
		match.used = true;
		var ol = match.l;
		var op = abr_textProp(ol), np = abr_textProp(nl);
		var oldText = '';
		try { oldText = op.value.text; } catch (e0) { }
		try {
			var wasLocked = ol.locked;
			ol.locked = false;
			if (op.numKeys > 0) {
				for (var key = 1; key <= op.numKeys; key++) op.setValueAtKey(key, np.value);
			} else {
				op.setValue(np.value);
			}
			ol.comment = nl.comment;
			if (ol.name === abr_layerName(oldText)) ol.name = nl.name;
			ol.locked = wasLocked;
			nl.remove();
			updated++;
		} catch (e) {
			log.push(abr_t('kept_new_layer', { layer: ol.name, msg: e.message }));
			added++;
		}
	}
	var left = 0;
	for (i = 0; i < olds.length; i++) {
		if (!olds[i].used) {
			left++;
			log.push(abr_t('no_match', { layer: olds[i].l.name }));
		}
	}
	return { updated: updated, added: added, left: left };
}

function abr_addReference(comp, page, S, st, log) {
	try {
		var file = new File(page.refImage);
		if (!file.exists) { log.push(abr_t('ref_missing', { path: page.refImage })); return; }
		var footage = app.project.importFile(new ImportOptions(file));
		var refs = abr_itemById(st.refs);
		if (refs) footage.parentFolder = refs;
		var ref = comp.layers.add(footage);
		ref.name = 'REF - ' + page.compName;
		ref.moveToEnd();
		var sc = Math.min(S.width / footage.width, S.height / footage.height) * 100;
		if (page.refFit === 'fill') sc = Math.max(S.width / footage.width, S.height / footage.height) * 100;
		ref.property('ADBE Transform Group').property('ADBE Scale').setValue([sc, sc, 100]);
		ref.property('ADBE Transform Group').property('ADBE Opacity').setValue(S.refOpacity);
		ref.guideLayer = true;
		ref.label = 0;
		ref.locked = true;
	} catch (e2) {
		log.push(abr_t('ref_error', { msg: e2.message }));
	}
}

function abridor_buildPage(jobPath, index) {
	try {
		var job = abr_readJSON(jobPath);
		var S = job.settings;
		var page = job.pages[index];
		var st = $.global.__abridor;
		var log = [];
		var result = { ok: true, texts: 0, log: log };

		app.beginUndoGroup('ABRIDOR - ' + page.compName);
		try {
			var comp = st.mode === 'texts' ? abr_findPageComp(st, page.compName) : null;
			var isNew = !comp;
			if (isNew) {
				var fps = S.fps;
				var frames = Math.max(1, Math.round(page.duration * fps));
				comp = app.project.items.addComp(page.compName, S.width, S.height, S.par || 1, frames / fps, fps);
				comp.bgColor = [0, 0, 0];
				var slidesFolder = abr_itemById(st.slides);
				if (slidesFolder) comp.parentFolder = slidesFolder;
			}

			// a escala usa o tamanho da comp (no modo "só os textos", o da comp existente)
			var W = comp.width, H = comp.height;
			var s = S.fit === 'fill' ? Math.max(W / page.width, H / page.height) : Math.min(W / page.width, H / page.height);
			var ox = (W - page.width * s) / 2;
			var oy = (H - page.height * s) / 2;

			var made = abr_buildTexts(comp, page, S, s, ox, oy, job.fontMap, log);
			result.texts = made.length;
			if (!isNew) {
				var up = abr_updateTexts(comp, made, log);
				result.updated = up.updated;
				result.added = up.added;
				result.left = up.left;
			} else if (S.refImages && page.refImage) {
				abr_addReference(comp, page, S, st, log);
			}

			result.compId = comp.id;
			result.isNew = isNew;
			st.comps.push(comp.id);
		} finally {
			app.endUndoGroup();
		}
		return abr_stringify(result);
	} catch (e) {
		return abr_error(e);
	}
}

function abridor_finish(jobPath) {
	try {
		var job = abr_readJSON(jobPath);
		var S = job.settings;
		var st = $.global.__abridor;
		var comps = [];
		for (var i = 0; i < st.comps.length; i++) {
			var c = abr_itemById(st.comps[i]);
			if (c) comps.push(c);
		}
		if (!comps.length) return abr_stringify({ ok: true, comps: 0 });

		var master = null, reused = false;
		app.beginUndoGroup(abr_t('undo_master'));
		try {
			if (S.master) {
				// no modo "só os textos" a master existente é mantida
				if (st.mode === 'texts') {
					master = abr_findPageComp(st, S.masterName);
					reused = !!master;
				}
				if (!master) {
					var total = 0;
					for (i = 0; i < comps.length; i++) total += comps[i].duration;
					master = app.project.items.addComp(S.masterName, S.width, S.height, S.par || 1, total, S.fps);
					master.bgColor = [0, 0, 0];
					var docFolder = abr_itemById(st.docFolder);
					if (docFolder) master.parentFolder = docFolder;
					var t = 0;
					for (i = 0; i < comps.length; i++) {
						var l = master.layers.add(comps[i]);
						l.startTime = t;
						l.moveToEnd();
						try {
							master.markerProperty.setValueAtTime(t, new MarkerValue(comps[i].name));
						} catch (em) { /* marcadores de comp: AE 14.0+ */ }
						t += comps[i].duration;
					}
				}
			}
			(master || comps[0]).openInViewer();
		} finally {
			app.endUndoGroup();
		}
		return abr_stringify({
			ok: true, comps: comps.length, mode: st.mode,
			master: master ? master.name : '', masterId: master ? master.id : 0, reused: reused,
			folderId: st.docFolder
		});
	} catch (e) {
		return abr_error(e);
	}
}

// ações depois de criar: abrir a master / mostrar a pasta no painel Project
function abridor_reveal(id) {
	try {
		var item = abr_itemById(parseInt(id, 10));
		if (!item) return abr_stringify({ error: abr_t('item_not_found') });
		if (item instanceof CompItem) {
			item.openInViewer();
		} else {
			var sel = app.project.selection;
			for (var i = 0; i < sel.length; i++) sel[i].selected = false;
			item.selected = true;
			try { app.executeCommand(app.findMenuCommandId('Project')); } catch (e) { }
		}
		return abr_stringify({ ok: true });
	} catch (e) {
		return abr_error(e);
	}
}

// -------------------------------------------------- troca de fontes -----
function abr_compsInScope(scope) {
	var out = [];
	var i;
	if (scope === 'selected') {
		var sel = app.project.selection;
		for (i = 0; i < sel.length; i++) if (sel[i] instanceof CompItem) out.push(sel[i]);
		if (!out.length && app.project.activeItem instanceof CompItem) out.push(app.project.activeItem);
		return out;
	}
	for (i = 1; i <= app.project.numItems; i++) {
		if (app.project.item(i) instanceof CompItem) out.push(app.project.item(i));
	}
	return out;
}

function abr_layerMeta(layer) {
	if (!(layer instanceof TextLayer)) return null;
	var c = layer.comment;
	if (!c || c.indexOf(ABRIDOR_TAG) !== 0) return null;
	try { return abr_parse(c.substr(ABRIDOR_TAG.length)); } catch (e) { return null; }
}

function abr_remapDoc(td, meta, map) {
	var changed = false;
	var len = td.text.length;
	if (meta.runs && meta.runs.length > 1 && typeof td.characterRange === 'function') {
		for (var i = 0; i < meta.runs.length; i++) {
			var r = meta.runs[i];
			var m = map[r[2]];
			if (!m || !m.ps) continue;
			var a = Math.min(r[0], len), b = Math.min(r[1], len);
			if (b <= a) continue;
			var cr = td.characterRange(a, b);
			cr.font = m.ps;
			cr.fontSize = r[3] * ((m.scale || 100) / 100);
			changed = true;
		}
	} else {
		var mm = map[meta.k];
		if (mm && mm.ps) {
			var newScale = (mm.scale || 100) / 100;
			var oldScale = meta.sc || 1;
			td.font = mm.ps;
			if (Math.abs(newScale - oldScale) > 0.0001) td.fontSize = td.fontSize / oldScale * newScale;
			changed = true;
		}
	}
	return changed;
}

function abridor_applyFonts(mapPath, scope) {
	try {
		var data = abr_readJSON(mapPath);
		var map = data.map;
		var comps = abr_compsInScope(scope);
		var layers = 0, failed = [];

		app.beginUndoGroup(abr_t('undo_fonts'));
		try {
			abr_storeMap(map);
			for (var c = 0; c < comps.length; c++) {
				var comp = comps[c];
				for (var i = 1; i <= comp.numLayers; i++) {
					var layer = comp.layer(i);
					var meta = abr_layerMeta(layer);
					if (!meta) continue;
					var wasLocked = layer.locked;
					layer.locked = false;
					var prop = layer.property('ADBE Text Properties').property('ADBE Text Document');
					var changed = false;
					try {
						if (prop.numKeys > 0) {
							for (var k = 1; k <= prop.numKeys; k++) {
								var tdk = prop.keyValue(k);
								if (abr_remapDoc(tdk, meta, map)) { prop.setValueAtKey(k, tdk); changed = true; }
							}
						} else {
							var td = prop.value;
							if (abr_remapDoc(td, meta, map)) { prop.setValue(td); changed = true; }
						}
					} catch (e) {
						failed.push(comp.name + ' / ' + layer.name + ': ' + e.message);
					}
					if (changed) {
						layers++;
						if (map[meta.k]) meta.sc = (map[meta.k].scale || 100) / 100;
						layer.comment = ABRIDOR_TAG + abr_stringify(meta);
					}
					layer.locked = wasLocked;
				}
			}
		} finally {
			app.endUndoGroup();
		}
		return abr_stringify({ ok: true, layers: layers, comps: comps.length, failed: failed });
	} catch (e) {
		return abr_error(e);
	}
}

// lista as fontes de origem presentes nas camadas do projeto + mapa salvo
function abridor_scanProject() {
	try {
		var stored = abr_loadStoredMap();
		var fonts = {};
		var comps = abr_compsInScope('all');
		for (var c = 0; c < comps.length; c++) {
			for (var i = 1; i <= comps[c].numLayers; i++) {
				var layer = comps[c].layer(i);
				var meta = abr_layerMeta(layer);
				if (!meta) continue;
				var text = '';
				try { text = layer.property('ADBE Text Properties').property('ADBE Text Document').value.text; } catch (e) { }
				var keys = [meta.k];
				if (meta.runs) for (var r = 0; r < meta.runs.length; r++) keys.push(meta.runs[r][2]);
				for (var k = 0; k < keys.length; k++) {
					var key = keys[k];
					if (!fonts[key]) fonts[key] = { count: 0, sample: '' };
					fonts[key].count++;
					if (!fonts[key].sample && text) {
						var sample = text;
						if (meta.runs && meta.runs.length > 1 && k > 0) sample = text.substring(meta.runs[k - 1][0], meta.runs[k - 1][1]);
						fonts[key].sample = sample.replace(/[\r\n]+/g, ' ').substr(0, 80);
					}
				}
			}
		}
		return abr_stringify({ ok: true, map: stored, fonts: fonts });
	} catch (e) {
		return abr_error(e);
	}
}

function abridor_saveMap(mapPath) {
	try {
		var data = abr_readJSON(mapPath);
		abr_storeMap(data.map);
		return abr_stringify({ ok: true });
	} catch (e) {
		return abr_error(e);
	}
}

// seleciona no projeto as camadas que usam uma fonte de origem
function abridor_selectLayers(fontKey) {
	try {
		var comp = app.project.activeItem;
		if (!(comp instanceof CompItem)) return abr_stringify({ ok: true, count: 0 });
		var n = 0;
		for (var i = 1; i <= comp.numLayers; i++) {
			var l = comp.layer(i);
			var meta = abr_layerMeta(l);
			var hit = false;
			if (meta) {
				if (meta.k === fontKey) hit = true;
				if (meta.runs) for (var r = 0; r < meta.runs.length; r++) if (meta.runs[r][2] === fontKey) hit = true;
			}
			l.selected = hit;
			if (hit) n++;
		}
		return abr_stringify({ ok: true, count: n });
	} catch (e) {
		return abr_error(e);
	}
}


// ------------------------------------------------- dividir em linhas ----
// Converte uma camada de texto (caixa ou ponto, com várias linhas) em uma camada
// de texto de ponto por linha, com o anchor point em [0,0] na linha de base.

function abr_textProp(layer) {
	return layer.property('ADBE Text Properties').property('ADBE Text Document');
}

// ponto do espaço da camada -> espaço do pai (posição), considerando anchor, escala e rotação
function abr_toParent(layer, p) {
	var tr = layer.property('ADBE Transform Group');
	var a = tr.property('ADBE Anchor Point').value;
	var pos = tr.property('ADBE Position').value;
	var sc = tr.property('ADBE Scale').value;
	var rot = tr.property('ADBE Rotate Z').value * Math.PI / 180;
	var vx = (p[0] - a[0]) * sc[0] / 100, vy = (p[1] - a[1]) * sc[1] / 100;
	return [pos[0] + vx * Math.cos(rot) - vy * Math.sin(rot), pos[1] + vx * Math.sin(rot) + vy * Math.cos(rot), pos.length > 2 ? pos[2] : 0];
}

// estilo de cada caractere (AE 24.3+), ou null
function abr_readStyles(td, len) {
	if (typeof td.characterRange !== 'function') return null;
	var out = [];
	try {
		for (var c = 0; c < len; c++) {
			var cr = td.characterRange(c, c + 1);
			var st = {};
			abr_try(function () { st.font = cr.font; });
			abr_try(function () { st.fontSize = cr.fontSize; });
			abr_try(function () { st.fillColor = cr.fillColor; });
			abr_try(function () { st.applyFill = cr.applyFill; });
			abr_try(function () { st.tracking = cr.tracking; });
			abr_try(function () { st.leading = cr.autoLeading ? null : cr.leading; });
			abr_try(function () { st.applyStroke = cr.applyStroke; });
			abr_try(function () { st.strokeColor = cr.strokeColor; });
			abr_try(function () { st.strokeWidth = cr.strokeWidth; });
			out.push(st);
		}
	} catch (e) { return null; }
	return out;
}

function abr_sameChar(a, b) {
	return a.font === b.font && Math.abs((a.fontSize || 0) - (b.fontSize || 0)) < 0.001 && String(a.fillColor) === String(b.fillColor) &&
		a.tracking === b.tracking && a.applyStroke === b.applyStroke && String(a.strokeColor) === String(b.strokeColor);
}

function abr_applyChar(target, st) {
	if (st.font) abr_try(function () { target.font = st.font; });
	if (st.fontSize) abr_try(function () { target.fontSize = st.fontSize; });
	if (st.applyFill !== undefined) abr_try(function () { target.applyFill = st.applyFill; });
	if (st.fillColor) abr_try(function () { target.fillColor = st.fillColor; });
	if (st.tracking !== undefined) abr_try(function () { target.tracking = st.tracking; });
	if (st.applyStroke !== undefined) abr_try(function () { target.applyStroke = st.applyStroke; });
	if (st.applyStroke && st.strokeColor) abr_try(function () { target.strokeColor = st.strokeColor; });
	if (st.applyStroke && st.strokeWidth) abr_try(function () { target.strokeWidth = st.strokeWidth; });
}

// estilo da camada inteira (quando não há characterRange)
function abr_docStyle(td) {
	var st = {};
	abr_try(function () { st.font = td.font; });
	abr_try(function () { st.fontSize = td.fontSize; });
	abr_try(function () { st.fillColor = td.fillColor; });
	abr_try(function () { st.applyFill = td.applyFill; });
	abr_try(function () { st.tracking = td.tracking; });
	abr_try(function () { st.applyStroke = td.applyStroke; });
	abr_try(function () { st.strokeColor = td.strokeColor; });
	abr_try(function () { st.strokeWidth = td.strokeWidth; });
	return st;
}

// quebra em linhas medindo com uma camada temporária (quando o AE não informa as linhas compostas)
function abr_measureWrap(layer, td, text, boxW) {
	var comp = layer.containingComp;
	var tmp = comp.layers.addText('x');
	var tp = abr_textProp(tmp);
	var base = tp.value;
	abr_applyChar(base, abr_docStyle(td));
	var t = layer.inPoint;
	function width(str) {
		var d = tp.value;
		d.text = str || ' ';
		tp.setValue(d);
		return tmp.sourceRectAtTime(t, false).width;
	}
	tp.setValue(base);
	var out = [];
	var pos = 0;
	var paras = text.split(/[\r\n\u0003]/);
	for (var p = 0; p < paras.length; p++) {
		var words = paras[p].split(' ');
		var line = '', lineStart = pos, cursor = pos;
		for (var w = 0; w < words.length; w++) {
			var cand = line ? line + ' ' + words[w] : words[w];
			if (line && width(cand) > boxW) {
				out.push({ s: lineStart, e: lineStart + line.length });
				lineStart = cursor;
				line = words[w];
			} else {
				line = cand;
			}
			cursor += words[w].length + 1;
		}
		out.push({ s: lineStart, e: lineStart + line.length });
		pos += paras[p].length + 1;
	}
	tmp.remove();
	return out;
}

// intervalos de caracteres de cada linha
function abr_lineRanges(layer, td, text, isBox) {
	var lines = [], i;
	if (isBox) {
		try {
			if (typeof td.composedLineRange === 'function' && td.composedLineCount > 0) {
				for (i = 0; i < td.composedLineCount; i++) {
					var r = td.composedLineRange(i, i + 1);
					if (typeof r.characterStart !== 'number') throw new Error('sem linhas compostas');
					lines.push({ s: r.characterStart, e: r.characterEnd });
				}
			}
		} catch (e) { lines = []; }
		if (!lines.length) {
			var bw = 0;
			try { bw = td.boxTextSize[0]; } catch (e2) { bw = 0; }
			lines = bw ? abr_measureWrap(layer, td, text, bw) : [];
		}
	}
	if (!lines.length) {
		var start = 0;
		for (i = 0; i <= text.length; i++) {
			var ch = text.charAt(i);
			if (i === text.length || ch === '\r' || ch === '\n' || ch === '\u0003') {
				lines.push({ s: start, e: i });
				start = i + 1;
			}
		}
	}
	// remove quebras e espaços das pontas (linhas vazias continuam na lista: ocupam altura)
	for (i = 0; i < lines.length; i++) {
		var L = lines[i];
		L.start = L.s;
		while (L.e > L.s && /[\r\n\u0003 \t]/.test(text.charAt(L.e - 1))) L.e--;
		while (L.s < L.e && /[\r\n\u0003 \t]/.test(text.charAt(L.s))) L.s++;
		L.empty = L.e <= L.s;
	}
	return lines;
}

// alinhamento do parágrafo de um caractere
function abr_justAt(td, c, paraIndex) {
	var j = null;
	if (typeof td.paragraphRange === 'function') {
		try { j = td.paragraphRange(paraIndex, paraIndex + 1).justification; } catch (e) { j = null; }
	}
	if (j === null || j === undefined) {
		try { j = td.justification; } catch (e2) { j = ParagraphJustification.LEFT_JUSTIFY; }
	}
	return j;
}

function abr_alignName(j) {
	if (j === ParagraphJustification.CENTER_JUSTIFY) return 'center';
	if (j === ParagraphJustification.RIGHT_JUSTIFY) return 'right';
	return 'left';
}

function abr_paraIndex(text, c) {
	var n = 0;
	for (var i = 0; i < c; i++) if (text.charAt(i) === '\r') n++;
	return n;
}

// posição (espaço da camada) da origem de cada linha: [x, y da linha de base]
function abr_linePositions(layer, td, text, lines, isBox, meta) {
	var out = [], i;
	var lay = meta && meta.lay;

	// 1) caixa criada pelo ABRIDOR: modelo de linhas do PowerPoint
	if (isBox && lay && lay.p && lay.p.length) {
		var y = 0, prev = -1, ys = [], pis = [];
		for (i = 0; i < lines.length; i++) {
			var pi = 0;
			for (var k = 0; k < lay.ps.length; k++) if (lay.ps[k] <= lines[i].start) pi = k;
			var P = lay.p[pi];
			if (i > 0 && pi !== prev) y += lay.p[prev][3] + P[2];
			ys.push(y + P[1]);
			pis.push(pi);
			y += P[0];
			prev = pi;
		}
		var off = 0;
		if (lay.v === 'middle') off = (lay.h - y) / 2;
		else if (lay.v === 'bottom') off = lay.h - y;
		for (i = 0; i < lines.length; i++) {
			var al = lay.p[pis[i]][4];
			var x = al === 'center' ? lay.x + lay.w / 2 : (al === 'right' ? lay.x + lay.w : lay.x);
			out.push({ x: x, y: lay.y + off + ys[i], align: al === 'justify' ? 'left' : al });
		}
		return out;
	}

	// 2) linhas de base calculadas pelo AE
	var locs = null;
	try { locs = td.baselineLocs; } catch (e) { locs = null; }
	if (isBox && locs && locs.length >= lines.length * 4) {
		for (i = 0; i < lines.length; i++) {
			var j = abr_justAt(td, lines[i].s, abr_paraIndex(text, lines[i].s));
			var name = abr_alignName(j);
			var x0 = locs[i * 4], y0 = locs[i * 4 + 1], x1 = locs[i * 4 + 2];
			out.push({ x: name === 'center' ? (x0 + x1) / 2 : (name === 'right' ? x1 : x0), y: y0, align: name });
		}
		return out;
	}

	// 3) texto de ponto: todas as linhas saem da origem, uma entrelinha abaixo da outra
	var lead = 0;
	try { lead = td.autoLeading ? td.fontSize * 1.2 : td.leading; } catch (e3) { lead = 0; }
	if (!lead) lead = (td.fontSize || 40) * 1.2;
	var yy = 0;
	for (i = 0; i < lines.length; i++) {
		var j2 = abr_justAt(td, lines[i].s, abr_paraIndex(text, lines[i].s));
		if (isBox) {
			// sem informação do AE: estimativa a partir do topo da caixa
			var bp = [0, 0], bs = [0, 0];
			try { bp = td.boxTextPos; bs = td.boxTextSize; } catch (e4) { }
			var nm = abr_alignName(j2);
			out.push({ x: nm === 'center' ? bp[0] + bs[0] / 2 : (nm === 'right' ? bp[0] + bs[0] : bp[0]), y: bp[1] + td.fontSize * 1.0 + yy, align: nm });
		} else {
			out.push({ x: 0, y: yy, align: abr_alignName(j2) });
		}
		yy += lead;
	}
	return out;
}

function abr_splitLayer(layer, log) {
	var prop = abr_textProp(layer);
	if (prop.numKeys > 0 || prop.expressionEnabled) {
		log.push(abr_t('split_keyframes', { layer: layer.name }));
		return { created: 0 };
	}
	var td = prop.value;
	var text = td.text;
	var isBox = false;
	try { isBox = !!td.boxText; } catch (e) { isBox = false; }
	var meta = abr_layerMeta(layer);
	var lines = abr_lineRanges(layer, td, text, isBox);
	var filled = 0;
	for (var f0 = 0; f0 < lines.length; f0++) if (!lines[f0].empty) filled++;
	if (!filled) return { created: 0 };

	var tr = layer.property('ADBE Transform Group');
	var rot = tr.property('ADBE Rotate Z').value;
	var sc = tr.property('ADBE Scale').value;
	var opacity = tr.property('ADBE Opacity');

	// camada de ponto com uma linha só: apenas zera o anchor sem mover o texto
	if (!isBox && filled === 1 && lines.length === 1 && lines[0].s === 0 && lines[0].e === text.length) {
		var ap = tr.property('ADBE Anchor Point');
		if (ap.numKeys === 0 && tr.property('ADBE Position').numKeys === 0) {
			var p0 = abr_toParent(layer, [0, 0]);
			ap.setValue([0, 0, 0]);
			tr.property('ADBE Position').setValue(p0);
		}
		return { created: 1, kept: true, layers: [layer] };
	}

	var styles = abr_readStyles(td, text.length);
	var docSt = abr_docStyle(td);
	var pos = abr_linePositions(layer, td, text, lines, isBox, meta);
	var comp = layer.containingComp;
	var made = [];

	for (var i = 0; i < lines.length; i++) {
		var L = lines[i];
		if (L.empty) continue;
		var str = text.substring(L.s, L.e);
		var nl = comp.layers.addText(str);
		var np = abr_textProp(nl);
		var nd = np.value;
		abr_try(function () { nd.resetCharStyle(); });
		abr_try(function () { nd.resetParagraphStyle(); });
		nd.text = str;
		abr_applyChar(nd, styles ? styles[L.s] : docSt);
		abr_try(function () { nd.justification = abr_just(pos[i].align); });
		np.setValue(nd);

		// trechos com estilos diferentes dentro da linha
		if (styles) {
			var mixed = false;
			for (var c = L.s + 1; c < L.e; c++) if (!abr_sameChar(styles[c], styles[L.s])) { mixed = true; break; }
			if (mixed) {
				abr_try(function () {
					nd = np.value;
					var rs = L.s;
					for (var c2 = L.s + 1; c2 <= L.e; c2++) {
						if (c2 === L.e || !abr_sameChar(styles[c2], styles[rs])) {
							abr_applyChar(nd.characterRange(rs - L.s, c2 - L.s), styles[rs]);
							rs = c2;
						}
					}
					np.setValue(nd);
				});
			}
		}

		var ntr = nl.property('ADBE Transform Group');
		ntr.property('ADBE Anchor Point').setValue([0, 0, 0]);
		ntr.property('ADBE Position').setValue(abr_toParent(layer, [pos[i].x, pos[i].y]));
		ntr.property('ADBE Rotate Z').setValue(rot);
		ntr.property('ADBE Scale').setValue(sc);
		if (opacity.numKeys === 0) ntr.property('ADBE Opacity').setValue(opacity.value);

		abr_try(function () { nl.parent = layer.parent; });
		abr_try(function () { nl.startTime = layer.startTime; nl.inPoint = layer.inPoint; nl.outPoint = layer.outPoint; });
		abr_try(function () { nl.label = layer.label; });
		abr_try(function () { nl.threeDLayer = layer.threeDLayer; });
		nl.name = abr_layerName(str);

		// metadados da linha (para a troca de fontes continuar funcionando)
		if (meta) {
			var lm = { v: 1, k: meta.k, sz: meta.sz, sc: meta.sc, runs: [] };
			if (meta.runs && meta.runs.length) {
				var best = 0;
				for (var r = 0; r < meta.runs.length; r++) {
					var a = Math.max(meta.runs[r][0], L.s), b = Math.min(meta.runs[r][1], L.e);
					if (b > a) {
						lm.runs.push([a - L.s, b - L.s, meta.runs[r][2], meta.runs[r][3]]);
						if (b - a > best) { best = b - a; lm.k = meta.runs[r][2]; lm.sz = meta.runs[r][3]; }
					}
				}
				if (lm.runs.length < 2) lm.runs = [];
			}
			nl.comment = ABRIDOR_TAG + abr_stringify(lm);
		}
		made.push(nl);
	}

	// mantém a ordem: 1ª linha em cima, todas no lugar da camada original
	for (i = 0; i < made.length; i++) made[i].moveBefore(layer);
	layer.remove();
	return { created: made.length, layers: made };
}

// passo extra para comps já criadas: camadas de texto selecionadas na comp ativa,
// ou todas as camadas de texto das comps selecionadas no painel Project
function abridor_splitLines() {
	try {
		var targets = [], i, j;
		var active = app.project.activeItem;
		if (active instanceof CompItem) {
			var sel = active.selectedLayers;
			for (i = 0; i < sel.length; i++) if (sel[i] instanceof TextLayer) targets.push(sel[i]);
		}
		var from = abr_t('from_selected');
		if (!targets.length) {
			var comps = abr_compsInScope('selected');
			for (i = 0; i < comps.length; i++) {
				for (j = 1; j <= comps[i].numLayers; j++) {
					if (comps[i].layer(j) instanceof TextLayer) targets.push(comps[i].layer(j));
				}
			}
			from = abr_tn('from_comps', comps.length);
		}
		if (!targets.length) return abr_stringify({ ok: true, layers: 0, lines: 0, from: '' });

		var log = [], lines = 0, done = 0;
		app.beginUndoGroup(abr_t('undo_split'));
		try {
			for (i = 0; i < targets.length; i++) {
				var lk = targets[i].locked;
				if (lk) { log.push(abr_t('layer_locked', { layer: targets[i].name })); continue; }
				try {
					var res = abr_splitLayer(targets[i], log);
					if (res.created) { done++; lines += res.created; }
				} catch (e) {
					log.push(abr_t('layer_error', { layer: targets[i].name, msg: e.message }));
				}
			}
		} finally {
			app.endUndoGroup();
		}
		return abr_stringify({ ok: true, layers: done, lines: lines, from: from, log: log });
	} catch (e) {
		return abr_error(e);
	}
}
