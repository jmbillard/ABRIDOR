/*
 * ABRIDOR - painel principal
 */
(function (global) {
	'use strict';

	var ABR = global.ABR;
	var UI = ABR.ui;
	var icon = UI.icon;
	var VERSION = '1.1.0';
	var THUMB_W = 320;
	var TABS = ['pages', 'comps', 'fonts'];

	var state = {
		doc: null,
		path: null,
		realPath: false,  // false quando o arquivo veio por arrastar sem caminho conhecido
		name: '',
		bytes: null,
		selected: [],
		durations: [],
		extImages: [],
		fonts: {},     // fontes de origem: key -> {key, family, bold, italic, type, pages, texts, count}
		map: {},       // key -> {ps, scale, manual}
		busy: false,
		log: [],
		tab: 'pages',
		openFont: null,
		hasLayers: false   // o projeto tem camadas do ABRIDOR (criadas ou lidas)
	};

	// configurações (persistentes)
	var DEFAULTS = {
		res: '1920x1080', w: 1920, h: 1080, fps: '29.97', fit: 'fit', duration: 5,
		master: true, refImages: true, refOpacity: 50, groupMode: 'paragraph', keepAutofit: true,
		fallbackFont: 'ArialMT', scope: 'all', previewSize: 22, showBoxes: true, adv: false, theme: 'auto', layerMode: 'lines'
	};
	var S = {};

	ABR.state = state;

	function $(id) { return document.getElementById(id); }

	function esc(s) {
		return String(s).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}

	function pad(n, l) { n = String(n); while (n.length < l) n = '0' + n; return n; }

	function each(list, fn) { Array.prototype.forEach.call(list, fn); }

	// ------------------------------------------------------ armazenamento ---
	function store(key, val) {
		try { localStorage.setItem('abridor.' + key, JSON.stringify(val)); } catch (e) { }
	}

	function load(key, def) {
		try {
			var v = localStorage.getItem('abridor.' + key);
			return v ? JSON.parse(v) : def;
		} catch (e) { return def; }
	}

	function saveSettings() { store('settings2', S); }

	// ------------------------------------------------------ status ----------
	// texto acessível (e usado pelos testes) + toast visível
	function status(msg, kind, sticky) {
		$('status').textContent = msg;
		if (kind !== 'silent') UI.toast(msg, kind || 'info', sticky);
	}

	function setLog(lines) {
		state.log = lines;
		$('log').textContent = lines.join('\n');
		$('logCount').textContent = lines.length;
		$('btnLog').classList.toggle('hidden', !lines.length);
		if (!lines.length) UI.collapse($('logBox'), false, true);
	}

	function setBusy(b) {
		state.busy = b;
		$('btnBuild').disabled = b || !state.doc || !selectedIndexes().length;
		$('btnApplyFonts').disabled = b;
		$('docChip').disabled = b;
	}

	// ------------------------------------------------------ comps -----------
	function compSize() {
		if (S.res === 'custom') return [Math.max(16, parseInt(S.w, 10) || 1920), Math.max(16, parseInt(S.h, 10) || 1080)];
		var p = S.res.split('x');
		return [parseInt(p[0], 10), parseInt(p[1], 10)];
	}

	function settings() {
		var sz = compSize();
		return {
			width: sz[0], height: sz[1], par: 1,
			fps: parseFloat(S.fps),
			fit: S.fit,
			duration: Math.max(0.04, parseFloat(S.duration) || 5),
			master: S.master,
			refImages: S.refImages,
			refOpacity: parseInt(S.refOpacity, 10),
			prefix: ($('prefix').value || '').replace(/^\s+|\s+$/g, '') || 'LAYOUT',
			fallbackFont: (S.fallbackFont || '').replace(/^\s+|\s+$/g, '') || 'ArialMT'
		};
	}

	function timecode(sec, fps) {
		var fr = Math.round(sec * fps);
		var base = Math.round(fps);
		var f = fr % base, s = Math.floor(fr / base);
		return pad(Math.floor(s / 3600), 2) + ':' + pad(Math.floor(s / 60) % 60, 2) + ':' + pad(s % 60, 2) + (Math.abs(fps - base) > 0.001 ? ';' : ':') + pad(f, 2) +
			'  (' + fr + ' fr)';
	}

	function fmtSec(v) { return String(Math.round(v * 100) / 100).replace('.', ','); }

	function pageDuration(i) {
		var d = state.durations[i];
		return d && d > 0 ? d : settings().duration;
	}

	function digits() { return Math.max(2, String(state.doc ? state.doc.pages.length : 1).length); }

	function compName(page) { return settings().prefix + ' ' + pad(page.number, digits()); }

	function resLabel(w, h) {
		if (w === 3840 && h === 2160) return '4K';
		if (w === 1920 && h === 1080) return '1080p';
		if (w === 1280 && h === 720) return '720p';
		return w + '×' + h;
	}

	function updateCompsInfo() {
		var st = settings();
		var fr = Math.round(st.duration * st.fps);
		$('durTC').innerHTML = '<b>' + timecode(st.duration, st.fps).replace(/\s+\(.*/, '') + '</b>' + fr + ' frames';
		if (document.activeElement !== $('duration')) $('duration').value = fmtSec(S.duration);
		$('refOpacityVal').textContent = S.refOpacity + '%';
		$('nameSuffix').textContent = pad(1, digits());

		var total = 0, n = selectedIndexes().length;
		selectedIndexes().forEach(function (i) { total += Math.round(pageDuration(i) * st.fps); });
		var fpsTxt = String(st.fps).replace('.', ',');
		$('summary').innerHTML = state.doc
			? icon('comps') + '<b>' + n + '</b> comp' + (n === 1 ? '' : 's') +
				'<span class="sep">·</span>' + timecode(total / st.fps, st.fps).replace(/\s+\(.*/, '') +
				'<span class="sep">·</span>' + resLabel(st.width, st.height) + ' ' + fpsTxt
			: '<span>' + icon('info') + '</span>abra um documento para começar';
		$('ctaText').textContent = state.doc && n ? 'criar ' + n + ' comp' + (n === 1 ? '' : 's') : 'criar comps';
		each(document.querySelectorAll('.dur'), function (d) {
			var i = +d.dataset.i;
			if (!state.durations[i]) d.querySelector('.dur-val').textContent = fmtSec(st.duration) + 's';
		});
	}

	// ------------------------------------------------------ tema ------------
	var THEME_NEXT = { auto: 'light', light: 'dark', dark: 'auto' };
	var THEME_LABEL = { auto: 'tema automático (segue o After Effects)', light: 'tema claro', dark: 'tema escuro' };

	// claro ou escuro conforme o brilho do painel do After Effects (ou do sistema, fora do AE)
	function hostTheme() {
		var skin = ABR.hostSkin();
		var c = skin && skin.panelBackgroundColor && skin.panelBackgroundColor.color;
		if (c) return (0.299 * c.red + 0.587 * c.green + 0.114 * c.blue) / 255 > 0.5 ? 'light' : 'dark';
		return global.matchMedia && global.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
	}

	function applyTheme(animate) {
		var mode = S.theme === 'auto' ? hostTheme() : S.theme;
		var root = document.documentElement;
		if (root.dataset.theme === mode && !animate) return;
		if (animate && !UI.reduced()) {
			root.classList.add('theme-anim');
			clearTimeout(applyTheme.t);
			applyTheme.t = setTimeout(function () { root.classList.remove('theme-anim'); }, 550);
		}
		root.dataset.theme = mode;
		var btn = $('themeBtn');
		btn.dataset.mode = S.theme;
		btn.title = THEME_LABEL[S.theme] + ' — clique para trocar';
	}

	// ------------------------------------------------------ abas ------------
	function placeTabInk() {
		var b = document.querySelector('.tab.active');
		var ink = document.querySelector('.tab-ink');
		if (!b || !ink) return;
		ink.style.width = b.offsetWidth + 'px';
		ink.style.transform = 'translateX(' + b.offsetLeft + 'px)';
	}

	function showTab(name) {
		var from = TABS.indexOf(state.tab), to = TABS.indexOf(name);
		state.tab = name;
		each(document.querySelectorAll('.tab'), function (t) { t.classList.toggle('active', t.dataset.tab === name); });
		each(document.querySelectorAll('.panel'), function (p) {
			var idx = TABS.indexOf(p.id.replace('tab-', ''));
			p.style.setProperty('--from', (idx < to ? -16 : 16) + 'px');
			p.classList.toggle('active', idx === to);
		});
		if (from !== to) placeTabInk();
		setTimeout(UI.relayout, 30);
	}

	// ------------------------------------------------------ documento -------
	function pickDocument() {
		if (state.busy) return;
		ABR.dialog.openFile('abrir PPTX ou PDF', ['pptx', 'pdf']).then(function (p) {
			if (p) return loadPath(p);
			if (!ABR.isCEP && !global.ABR_MOCK) $('filePicker').click();
		});
	}

	function loadPath(p) {
		var bytes;
		try {
			bytes = ABR.fs.readBinary(p);
		} catch (e) {
			status('não foi possível ler o arquivo: ' + e.message, 'error');
			return;
		}
		setDocument(p, bytes, true);
	}

	function loadFile(file) {
		if (!/\.(pptx|pdf)$/i.test(file.name)) { status('use um arquivo .pptx ou .pdf', 'error'); return; }
		if (file.path && ABR.hasFS) return loadPath(file.path);
		var reader = new FileReader();
		reader.onload = function () { setDocument(file.name, new Uint8Array(reader.result), false); };
		reader.onerror = function () { status('não foi possível ler o arquivo.', 'error'); };
		reader.readAsArrayBuffer(file);
	}

	function setDocument(p, bytes, real) {
		state.path = p;
		state.realPath = real;
		state.bytes = bytes;
		state.name = ABR.fs.basename(p).replace(/\.(pptx|pdf)$/i, '');
		state.extImages = [];
		$('docName').textContent = ABR.fs.basename(p);
		$('docMeta').textContent = 'lendo…';
		$('docType').textContent = /\.pdf$/i.test(p) ? 'PDF' : 'PPTX';
		$('docType').classList.toggle('pptx', !/\.pdf$/i.test(p));
		$('prefix').value = state.name.toUpperCase().replace(/[_\s]+/g, ' ').slice(0, 24).replace(/\s+$/, '') || 'LAYOUT';
		parseDocument(true);
	}

	function skeleton(n) {
		var html = '';
		for (var i = 0; i < n; i++) html += '<div class="skeleton" style="--i:' + i + '"></div>';
		$('grid').innerHTML = html;
	}

	function parseDocument(fresh) {
		if (!state.bytes) return;
		var isPdf = /\.pdf$/i.test(state.path);
		setBusy(true);
		$('dropZone').classList.add('loading');
		if (!state.doc) document.body.classList.remove('is-empty');
		skeleton(state.doc ? state.doc.pages.length : 6);
		status('lendo ' + (isPdf ? 'PDF' : 'PPTX') + '…', 'info', true);
		var onProgress = function (i, n) {
			status('lendo página ' + (i + 1) + ' de ' + n + '…', 'info', true);
			if ($('grid').children.length !== n && i === 0) skeleton(n);
		};
		var bytes = state.bytes.slice(); // pdf.js pode transferir o buffer
		var p = isPdf
			? ABR.parsePDF(bytes, { groupMode: 'paragraph' }, onProgress)
			: ABR.parsePPTX(bytes, { ignoreAutofit: !S.keepAutofit }, onProgress);

		p.then(function (doc) {
			doc.name = state.name;
			if (!doc.pages.length) throw new Error('nenhuma página encontrada.');
			return (doc.type === 'pptx' ? makePptxThumbs(doc) : Promise.resolve()).then(function () { return doc; });
		}).then(function (doc) {
			var prevSel = state.selected, prevDur = state.durations;
			state.doc = doc;
			if (fresh || prevSel.length !== doc.pages.length) {
				state.selected = doc.pages.map(function (pg) { return !pg.hidden; });
				state.durations = doc.pages.map(function () { return null; });
			} else {
				state.selected = prevSel;
				state.durations = prevDur;
			}
			document.body.classList.remove('is-empty');
			document.body.classList.toggle('doc-pdf', doc.type === 'pdf');
			document.body.classList.toggle('doc-pptx', doc.type === 'pptx');
			var type = $('docType');
			type.textContent = doc.type.toUpperCase();
			type.classList.toggle('pptx', doc.type === 'pptx');
			$('docName').textContent = ABR.fs.basename(state.path);
			var nTexts = doc.pages.reduce(function (n, pg) { return n + pg.texts.length; }, 0);
			$('docMeta').textContent = doc.pages.length + ' páginas · ' + nTexts + ' textos';
			$('docChip').title = ABR.fs.basename(state.path) + '\n' + Math.round(doc.width) + ' × ' + Math.round(doc.height) + ' pt\n\nclique para abrir outro documento';
			collectFonts();
			renderGrid();
			renderFonts();
			updateCompsInfo();
			setTimeout(placeTabInk, 350);
			status('documento carregado. desmarque as páginas que não devem ser processadas.', 'ok');
		}).catch(function (e) {
			console.error(e);
			if (!state.doc) { document.body.classList.add('is-empty'); $('grid').innerHTML = ''; }
			else renderGrid();
			status('erro ao ler o documento: ' + e.message, 'error');
		}).then(function () {
			$('dropZone').classList.remove('loading');
			setBusy(false);
		});
	}

	function makePptxThumbs(doc) {
		var chain = Promise.resolve();
		doc.pages.forEach(function (pg) {
			chain = chain.then(function () {
				var h = Math.round(THUMB_W * pg.height / pg.width);
				return ABR.renderPptxPage(pg, THUMB_W, h, 'fit').then(function (c) {
					pg.thumb = c.toDataURL('image/jpeg', 0.85);
				});
			});
		});
		return chain;
	}

	// ------------------------------------------------------ grade -----------
	function selectedIndexes() {
		var out = [];
		state.selected.forEach(function (s, i) { if (s) out.push(i); });
		return out;
	}

	function updateSelection(changed) {
		if (!state.doc) return;
		var n = selectedIndexes().length;
		var selN = $('selN');
		if (selN.textContent !== String(n)) { selN.textContent = n; UI.replay(selN, 'bump'); }
		$('selT').textContent = state.doc.pages.length;
		var badge = $('pagesBadge');
		badge.textContent = n;
		badge.classList.toggle('hidden', false);
		each($('grid').querySelectorAll('.page'), function (el) {
			var i = +el.dataset.i;
			var off = !state.selected[i];
			if (el.classList.contains('off') !== off) {
				el.classList.toggle('off', off);
				if (!off && changed) UI.replay(el, 'pop');
			}
		});
		$('btnBuild').disabled = state.busy || !n;
		updateCompsInfo();
		updateFontCounts();
	}

	function renderGrid() {
		var grid = $('grid');
		grid.innerHTML = '';
		grid.classList.toggle('no-boxes', !S.showBoxes);
		if (!state.doc) return;

		state.doc.pages.forEach(function (pg, i) {
			var el = document.createElement('div');
			el.className = 'page' + (state.selected[i] ? '' : ' off');
			el.dataset.i = i;
			el.style.setProperty('--i', Math.min(i, 20));
			var custom = state.durations[i];
			el.innerHTML =
				'<div class="thumb"><img alt="">' +
				'<span class="chip num">' + pad(pg.number, 2) + '</span>' +
				(pg.hidden ? '<span class="chip flag" title="oculto no PowerPoint">' + icon('eyeOff') + '</span>' : '') +
				(state.extImages[i] ? '<span class="chip flag ext" title="' + esc(state.extImages[i]) + '">' + icon('image') + '</span>' : '') +
				'<span class="check">' + icon('check') + '</span>' +
				'<span class="chip texts" title="textos detectados">' + icon('type') + pg.texts.length + '</span>' +
				'<button class="dur' + (custom ? ' custom' : '') + '" data-i="' + i + '" title="duração desta página">' + icon('clock') +
				'<span class="dur-val">' + fmtSec(custom || settings().duration) + 's</span>' +
				'<input type="text" inputmode="decimal" spellcheck="false"></button>' +
				'</div>';

			var img = el.querySelector('img');
			var thumb = el.querySelector('.thumb');
			img.onload = function () {
				var c = document.createElement('canvas');
				c.className = 'overlay';
				c.width = img.naturalWidth;
				c.height = img.naturalHeight;
				ABR.drawTextBoxes(c.getContext('2d'), pg, c.width, c.height, 'fit');
				thumb.insertBefore(c, img.nextSibling);
			};
			img.src = pg.thumb || '';
			thumb.title = pg.name + (pg.texts.length ? '\n\n' + pg.texts.slice(0, 12).map(function (t) {
				return '• ' + t.paragraphs.map(function (p) { return p.runs.map(function (r) { return r.text; }).join(''); }).join(' / ').slice(0, 60);
			}).join('\n') : '\n\nnenhum texto encontrado');
			thumb.onclick = function (e) {
				if (e.target.closest('.dur')) return;
				state.selected[i] = !state.selected[i];
				updateSelection(true);
			};
			bindDuration(el.querySelector('.dur'), i);
			grid.appendChild(el);
		});
		updateSelection(false);
	}

	function bindDuration(btn, i) {
		var input = btn.querySelector('input');
		var label = btn.querySelector('.dur-val');
		function commit(cancel) {
			if (!btn.classList.contains('editing')) return;
			btn.classList.remove('editing');
			if (cancel) return;
			var v = parseFloat(String(input.value).replace(',', '.'));
			state.durations[i] = v > 0 ? v : null;
			btn.classList.toggle('custom', !!state.durations[i]);
			label.textContent = fmtSec(pageDuration(i)) + 's';
			updateCompsInfo();
		}
		btn.onclick = function (e) {
			e.stopPropagation();
			if (btn.classList.contains('editing')) return;
			btn.classList.add('editing');
			input.value = state.durations[i] ? fmtSec(state.durations[i]) : '';
			input.placeholder = fmtSec(settings().duration);
			setTimeout(function () { input.focus(); input.select(); }, 30);
		};
		input.onkeydown = function (e) {
			if (e.key === 'Enter') commit();
			if (e.key === 'Escape') commit(true);
		};
		input.onblur = function () { commit(); };
	}

	// "1-3, 5, 8-" -> índices
	function parseRange(str, total) {
		var out = [];
		str.split(/[,;\s]+/).forEach(function (part) {
			if (!part) return;
			var m = part.match(/^(\d*)\s*-\s*(\d*)$/);
			var a, b;
			if (m) {
				a = m[1] ? parseInt(m[1], 10) : 1;
				b = m[2] ? parseInt(m[2], 10) : total;
			} else if (/^\d+$/.test(part)) {
				a = b = parseInt(part, 10);
			} else return;
			for (var i = Math.max(1, a); i <= Math.min(total, b); i++) out.push(i - 1);
		});
		return out;
	}

	// ------------------------------------------------------ fontes ----------
	function collectFonts() {
		var fonts = {};
		for (var k in state.fonts) if (state.fonts[k].type === 'project') fonts[k] = state.fonts[k];
		if (state.doc) {
			state.doc.pages.forEach(function (pg, pi) {
				pg.texts.forEach(function (t) {
					t.paragraphs.forEach(function (p) {
						p.runs.forEach(function (r) {
							if (!r.text || r.text === '\r') return;
							var f = fonts[r.fontKey];
							if (!f || f.type === 'project') {
								f = fonts[r.fontKey] = {
									key: r.fontKey, family: r.family, bold: r.bold, italic: r.italic,
									type: state.doc.type, count: 0, pages: {}, texts: {}, sample: ''
								};
							}
							f.pages[pi] = (f.pages[pi] || 0) + 1;
							var tx = f.texts[pi] || '';
							if (tx.length < 30 && r.text.replace(/\s/g, '').length > 1) {
								f.texts[pi] = (tx ? tx + ' ' : '') + r.text.replace(/[\r\n]+/g, ' ').trim();
							}
						});
					});
				});
			});
		}
		state.fonts = fonts;
		autoMatch(false);
	}

	function autoMatch(force) {
		var remembered = load('fontmap', {});
		for (var k in state.fonts) {
			var cur = state.map[k];
			if (cur && cur.manual && !force) continue;
			if (!force && remembered[k] && remembered[k].ps) {
				state.map[k] = { ps: remembered[k].ps, scale: remembered[k].scale || 100, manual: true };
				continue;
			}
			var f = ABR.fonts.autoMatch(state.fonts[k]);
			state.map[k] = { ps: f ? f.ps : (cur && cur.ps && !force ? cur.ps : ''), scale: cur ? cur.scale : 100, manual: false };
		}
	}

	function rememberMap() {
		var remembered = load('fontmap', {});
		for (var k in state.map) {
			if (state.map[k].manual && state.map[k].ps) remembered[k] = { ps: state.map[k].ps, scale: state.map[k].scale };
		}
		store('fontmap', remembered);
	}

	function fontUseCount(f) {
		if (f.type === 'project') return f.count || 0;
		var n = 0;
		for (var p in f.pages) if (state.selected[p]) n += f.pages[p];
		return n;
	}

	// texto de exemplo da fonte, priorizando as páginas selecionadas
	function sampleOf(f) {
		if (!f.texts) return f.sample || '';
		var out = '', any = '';
		for (var p in f.texts) {
			if (!any) any = f.texts[p];
			if (state.selected[p] && out.length < 30) out = (out ? out + ' ' : '') + f.texts[p];
		}
		return out || any || f.sample || '';
	}

	function fontState(key) {
		var m = state.map[key] || {};
		var f = ABR.fonts.get(m.ps);
		if (!ABR.fonts.supported) return m.ps ? 'manual' : 'missing';
		if (!f) return 'missing';
		return m.manual ? 'manual' : 'ok';
	}

	var lastMissing = -1;

	function updateFontCounts() {
		var missing = 0;
		each($('fontList').querySelectorAll('.font'), function (row) {
			var f = state.fonts[row.dataset.key];
			if (!f) return;
			var n = fontUseCount(f);
			row.querySelector('.uses').textContent = n + '×';
			row.querySelector('.uses').title = f.type === 'project' ? 'camadas no projeto' : 'usos nas páginas selecionadas';
			row.style.opacity = n || f.type === 'project' ? 1 : 0.45;
		});
		for (var k in state.fonts) {
			if (fontState(k) === 'missing' && fontUseCount(state.fonts[k])) missing++;
		}
		var badge = $('fontBadge');
		badge.textContent = missing;
		badge.classList.toggle('hidden', !missing);
		if (missing !== lastMissing && lastMissing !== -1 && missing) UI.replay(badge, 'bump');
		lastMissing = missing;
	}

	var familyOptionsHTML = null;

	function familyOptions() {
		if (familyOptionsHTML !== null) return familyOptionsHTML;
		var seen = {}, html = ['<option value="">escolher fonte…</option>'];
		ABR.fonts.list.forEach(function (f) {
			if (seen[f.family]) return;
			seen[f.family] = 1;
			html.push('<option value="' + esc(f.family) + '">' + esc(f.family) + '</option>');
		});
		familyOptionsHTML = html.join('');
		return familyOptionsHTML;
	}

	function stylesOf(family) {
		return ABR.fonts.list.filter(function (f) { return f.family === family; });
	}

	function renderFonts() {
		var list = $('fontList');
		var all = Object.keys(state.fonts);
		var keys = all.sort(function (a, b) {
			var ma = fontState(a) === 'missing' ? 1 : 0, mb = fontState(b) === 'missing' ? 1 : 0;
			return mb - ma || fontUseCount(state.fonts[b]) - fontUseCount(state.fonts[a]) || a.localeCompare(b);
		});
		var filter = $('fontFilter').value.toLowerCase();
		if (filter) keys = keys.filter(function (k) { return k.toLowerCase().indexOf(filter) >= 0; });

		if (!keys.length) {
			list.innerHTML = all.length
				? '<div class="empty-state">' + icon('search') + '<span>nenhuma fonte com “' + esc(filter) + '”</span></div>'
				: '<div class="empty-state">' + icon('fonts') + '<b>nenhuma fonte ainda</b><span>abra um documento, ou leia as fontes<br>das comps já criadas neste projeto.</span>' +
					'<button class="btn" id="emptyScan">' + icon('project') + 'ler do projeto</button></div>';
			var b = $('emptyScan');
			if (b) b.onclick = scanProject;
			updateFontCounts();
			return;
		}
		list.innerHTML = '';
		keys.forEach(function (k, i) { list.appendChild(fontRow(state.fonts[k], i)); });
		updateFontCounts();
	}

	function fontRow(src, i) {
		var row = document.createElement('div');
		row.dataset.key = src.key;
		row.style.setProperty('--i', Math.min(i, 12));
		var supported = ABR.fonts.supported;
		row.innerHTML =
			'<div class="font-head">' +
			'<i class="dot"></i>' +
			'<span class="font-names"><span class="src" title="fonte do documento">' + esc(src.key) + '</span>' + icon('arrow') + '<span class="dst"></span></span>' +
			'<span class="uses"></span>' + icon('chevron', 'chev') +
			'</div>' +
			'<div class="font-preview"></div>' +
			'<div class="collapse font-edit"><div class="font-edit-inner">' +
			'<div class="font-pick">' +
			(supported ? '<select class="family"></select><select class="style"></select>' : '<input type="text" class="ps" placeholder="nome PostScript (ex: Montserrat-Bold)" spellcheck="false">') +
			'</div>' +
			'<div class="font-tools">' +
			'<span class="orig" title="texto na fonte original (se instalada)"><small>original</small><span></span></span>' +
			'<span class="scale-step" title="escala do tamanho">' +
			'<button class="icon-btn s-minus">' + icon('minus') + '</button><span class="s-val"></span><button class="icon-btn s-plus">' + icon('plus') + '</button>' +
			'</span></div>' +
			'</div></div>';

		var m = state.map[src.key] || (state.map[src.key] = { ps: '', scale: 100, manual: false });
		var fam = row.querySelector('select.family');
		var sty = row.querySelector('select.style');
		var psIn = row.querySelector('input.ps');
		var edit = row.querySelector('.font-edit');
		var preview = row.querySelector('.font-preview');
		var built = false;

		function fillStyles(family, selectedPS) {
			if (!sty) return;
			sty.innerHTML = stylesOf(family).map(function (f) {
				return '<option value="' + esc(f.ps) + '"' + (f.ps === selectedPS ? ' selected' : '') + '>' + esc(f.style || f.ps) + '</option>';
			}).join('');
		}

		function buildEditor() {
			if (built) return;
			built = true;
			if (fam) {
				fam.innerHTML = familyOptions();
				var cur = ABR.fonts.get(m.ps);
				if (cur) { fam.value = cur.family; fillStyles(cur.family, cur.ps); }
			}
			if (psIn) psIn.value = m.ps || '';
		}

		function refresh(animate) {
			var f = ABR.fonts.get(m.ps);
			var st = fontState(src.key);
			row.className = 'font ' + st + (row.classList.contains('open') ? ' open' : '');
			var dst = row.querySelector('.dst');
			dst.textContent = f ? f.family + ' ' + f.style : (m.ps ? m.ps : 'sem fonte');
			dst.title = f ? f.ps : (m.ps ? 'não instalada: ' + m.ps : 'usa a fonte reserva (' + S.fallbackFont + ')');
			var sample = $('sampleText').value || sampleOf(src) || src.key;
			preview.textContent = sample;
			preview.style.fontSize = Math.round(S.previewSize * (m.scale || 100) / 100) + 'px';
			ABR.fonts.applyPreview(preview, f, f ? null : (m.ps ? { family: m.ps } : { family: S.fallbackFont }));
			var orig = row.querySelector('.orig > span');
			orig.textContent = sample;
			ABR.fonts.applyPreview(orig, ABR.fonts.autoMatch(src), src);
			row.querySelector('.s-val').textContent = (m.scale || 100) + '%';
			if (animate) UI.replay(preview, 'swap');
			updateFontCounts();
		}

		function changed() {
			m.manual = true;
			rememberMap();
			refresh(true);
		}

		function toggle(open) {
			if (open === undefined) open = !row.classList.contains('open');
			if (open) {
				buildEditor();
				if (state.openFont && state.openFont !== row && state.openFont.isConnected) state.openFont._close();
				state.openFont = row;
			}
			row.classList.toggle('open', open);
			UI.collapse(edit, open);
		}
		row._close = function () { toggle(false); };

		row.querySelector('.font-head').onclick = function () { toggle(); };
		preview.onclick = function () { toggle(); };

		if (fam) {
			fam.onchange = function () {
				var styles = stylesOf(fam.value);
				// aproveita o peso/estilo que está no nome da fonte original (ex. "Gotham Black" -> Black)
				var hint = (src.key.match(/thin|hairline|extra ?light|ultra ?light|light|book|regular|medium|semi ?bold|demi ?bold|extra ?bold|ultra ?bold|bold|heavy|black|italic|oblique|condensed|narrow/gi) || []).join(' ');
				var pick = styles.length ? (ABR.fonts.autoMatch({ key: fam.value + (hint ? ' ' + hint : ''), family: fam.value + (hint ? ' ' + hint : ''), bold: src.bold, italic: src.italic, type: 'pptx' }) || styles[0]) : null;
				if (pick && pick.family !== fam.value) pick = styles[0];
				fillStyles(fam.value, pick ? pick.ps : '');
				m.ps = pick ? pick.ps : '';
				changed();
			};
			sty.onchange = function () { m.ps = sty.value; changed(); };
		}
		if (psIn) psIn.onchange = function () { m.ps = psIn.value.trim(); changed(); };

		function step(d) {
			m.scale = Math.max(10, Math.min(400, (m.scale || 100) + d));
			changed();
		}
		row.querySelector('.s-minus').onclick = function () { step(-5); };
		row.querySelector('.s-plus').onclick = function () { step(5); };

		refresh(false);
		return row;
	}

	function fontMapForHost() {
		var out = {};
		for (var k in state.map) {
			var src = state.fonts[k] || {};
			out[k] = {
				ps: state.map[k].ps || '',
				scale: state.map[k].scale || 100,
				family: src.family || '', bold: !!src.bold, italic: !!src.italic, type: src.type || '',
				sample: sampleOf(src).slice(0, 60)
			};
		}
		return out;
	}

	function loadInstalledFonts() {
		familyOptionsHTML = null;
		ABR.fonts.previewCache = {};
		return ABR.fonts.load().then(function () {
			if (!ABR.fonts.supported) {
				status('esta versão do After Effects não lista as fontes (necessário AE 2024+). digite os nomes PostScript.', 'info');
			}
		}).catch(function (e) {
			ABR.fonts.supported = false;
			status('não foi possível ler as fontes do After Effects: ' + e.message, 'error');
		});
	}

	function scanProject() {
		if (state.busy) return;
		setBusy(true);
		var btn = $('btnScan');
		btn.classList.add('busy');
		showTab('fonts');
		status('lendo fontes das camadas do projeto…', 'info', true);
		ABR.callHostJSON('abridor_scanProject').then(function (res) {
			var n = 0;
			for (var k in res.fonts) {
				n++;
				if (!state.fonts[k]) {
					var stored = res.map[k] || {};
					state.fonts[k] = {
						key: k, family: stored.family || ABR._pdf.guessStyle(k).family, bold: !!stored.bold, italic: !!stored.italic,
						type: 'project', count: res.fonts[k].count, pages: {}, sample: res.fonts[k].sample || stored.sample || ''
					};
				} else {
					state.fonts[k].count = res.fonts[k].count;
				}
				if (res.map[k] && res.map[k].ps) {
					state.map[k] = { ps: res.map[k].ps, scale: res.map[k].scale || 100, manual: true };
				} else if (!state.map[k]) {
					var f = ABR.fonts.autoMatch(state.fonts[k]);
					state.map[k] = { ps: f ? f.ps : '', scale: 100, manual: false };
				}
			}
			if (n) showApply(true);
			renderFonts();
			status(n ? n + ' fontes encontradas nas camadas do projeto.' : 'nenhuma camada criada pelo ABRIDOR no projeto.', n ? 'ok' : 'info');
		}).catch(function (e) {
			status('erro: ' + e.message, 'error');
		}).then(function () {
			btn.classList.remove('busy');
			setBusy(false);
		});
	}

	function applyFonts() {
		var path = ABR.fs.join(ABR.fs.tmpDir(), 'abridor_fontmap.json');
		try {
			ABR.fs.mkdirp(ABR.fs.tmpDir());
			ABR.fs.writeText(path, JSON.stringify({ map: fontMapForHost() }));
		} catch (e) {
			status('erro ao gravar arquivo temporário: ' + e.message, 'error');
			return;
		}
		var btn = $('btnApplyFonts');
		setBusy(true);
		btn.classList.add('busy');
		status('aplicando fontes…', 'silent');
		UI.hideToast();
		ABR.callHostJSON('abridor_applyFonts', [path, S.scope]).then(function (res) {
			$('status').textContent = res.layers + ' camadas atualizadas em ' + res.comps + ' comps.';
			btn.title = $('status').textContent;
			UI.replay(btn, 'done');
			setTimeout(function () { btn.classList.remove('done'); btn.title = 'trocar as fontes nas comps já criadas'; }, 1800);
			setLog(res.failed || []);
			if (res.failed && res.failed.length) status(res.failed.length + ' camadas não puderam ser atualizadas. veja os avisos.', 'error');
		}).catch(function (e) {
			status('erro: ' + e.message, 'error');
		}).then(function () {
			btn.classList.remove('busy');
			setBusy(false);
		});
	}

	// passo extra: divide em linhas as camadas de texto já criadas
	function splitExisting() {
		if (state.busy) return;
		var btn = $('btnSplit');
		setBusy(true);
		btn.classList.add('busy');
		ABR.callHostJSON('abridor_splitLines').then(function (res) {
			if (!res.layers) {
				status('selecione camadas de texto na comp ativa, ou comps no painel Project.', 'info');
			} else {
				status(res.layers + ' camada' + (res.layers === 1 ? '' : 's') + ' (' + res.from + ') → ' + res.lines + ' linhas.', 'ok');
				UI.replay(btn, 'done');
				setTimeout(function () { btn.classList.remove('done'); }, 1600);
			}
			if (res.log && res.log.length) setLog(res.log);
		}).catch(function (e) {
			status('erro: ' + e.message, 'error');
		}).then(function () {
			btn.classList.remove('busy');
			setBusy(false);
		});
	}

	function showApply(on) {
		state.hasLayers = on;
		UI.collapse($('applyBox'), on);
	}

	// ------------------------------------------------------ criação ---------
	function refFolder() {
		var dir;
		if (state.realPath) {
			dir = ABR.fs.join(ABR.fs.dirname(state.path), state.name + '_ABRIDOR');
			try {
				ABR.fs.mkdirp(dir);
				var probe = ABR.fs.join(dir, '.abridor');
				ABR.fs.writeText(probe, 'ok');
				ABR.fs.remove(probe);
				return dir;
			} catch (e) { /* sem permissão: usa a pasta temporária */ }
		}
		dir = ABR.fs.join(ABR.fs.tmpDir(), state.name + '_ABRIDOR');
		ABR.fs.mkdirp(dir);
		return dir;
	}

	function renderRef(pg, st) {
		if (state.doc.type === 'pdf') return state.doc.pdf.renderToSize(pg.index, st.width, st.height, st.fit);
		return ABR.renderPptxPage(pg, st.width, st.height, st.fit).then(function (c) { return c.toDataURL('image/png'); });
	}

	function stripPage(pg) {
		return pg.texts.map(function (t) {
			var o = {};
			for (var k in t) if (k !== 'source') o[k] = t[k];
			return o;
		});
	}

	var cta = {
		start: function () {
			var b = $('btnBuild');
			b.classList.remove('done');
			b.classList.add('working');
			cta.progress(0);
		},
		progress: function (v, label) {
			$('btnBuild').querySelector('.cta-fill').style.width = Math.round(Math.max(0, Math.min(1, v)) * 100) + '%';
			if (label) $('ctaText').textContent = label;
		},
		finish: function (ok) {
			var b = $('btnBuild');
			b.classList.remove('working');
			if (ok) b.classList.add('done');
			setTimeout(function () {
				b.classList.remove('done');
				cta.progress(0);
				updateCompsInfo();
			}, ok ? 1700 : 0);
		}
	};

	function build() {
		if (state.busy || !state.doc) return;
		var st = settings();
		var idx = selectedIndexes();
		if (!idx.length) { status('nenhuma página selecionada.', 'error'); return; }
		setBusy(true);
		setLog([]);
		UI.hideToast();
		cta.start();
		var log = [];
		var job = {
			docName: state.name,
			settings: {
				width: st.width, height: st.height, par: 1, fps: st.fps, fit: st.fit,
				master: st.master, masterName: st.prefix + ' MASTER',
				refImages: st.refImages, refOpacity: st.refOpacity,
				fallbackFont: st.fallbackFont,
				lines: S.layerMode === 'lines'
			},
			fontMap: fontMapForHost(),
			pages: []
		};

		var jobPath = ABR.fs.join(ABR.fs.tmpDir(), 'abridor_job.json');
		var chain = Promise.resolve();
		var refShare = st.refImages ? 0.3 : 0;

		if (st.refImages) {
			var dir = refFolder();
			idx.forEach(function (i, n) {
				chain = chain.then(function () {
					var pg = state.doc.pages[i];
					status('gerando referência ' + (n + 1) + ' de ' + idx.length + '…', 'silent');
					cta.progress(n / idx.length * refShare, 'referências ' + (n + 1) + '/' + idx.length);
					if (state.extImages[i]) return state.extImages[i];
					var file = ABR.fs.join(dir, 'ref_' + pad(pg.number, 3) + '_' + st.width + 'x' + st.height + '.png');
					return renderRef(pg, st).then(function (dataURL) {
						ABR.fs.writeDataURL(file, dataURL);
						return file;
					});
				}).then(function (file) {
					state.doc.pages[i]._ref = file;
				});
			});
		}

		chain.then(function () {
			idx.forEach(function (i) {
				var pg = state.doc.pages[i];
				job.pages.push({
					index: pg.index,
					compName: compName(pg),
					duration: pageDuration(i),
					width: pg.width, height: pg.height,
					refImage: st.refImages ? (pg._ref || '') : '',
					refFit: state.extImages[i] ? st.fit : 'fit',
					texts: stripPage(pg)
				});
			});
			ABR.fs.mkdirp(ABR.fs.tmpDir());
			ABR.fs.writeText(jobPath, JSON.stringify(job));
			status('preparando o projeto…', 'silent');
			cta.progress(refShare, 'preparando…');
			return ABR.callHostJSON('abridor_begin', [jobPath]);
		}).then(function () {
			var c = Promise.resolve();
			job.pages.forEach(function (pg, n) {
				c = c.then(function () {
					status('criando ' + pg.compName + ' (' + (n + 1) + '/' + job.pages.length + ')…', 'silent');
					cta.progress(refShare + n / job.pages.length * (0.95 - refShare), 'criando ' + (n + 1) + '/' + job.pages.length);
					return ABR.callHostJSON('abridor_buildPage', [jobPath, n]);
				}).then(function (res) {
					(res.log || []).forEach(function (l) { log.push(pg.compName + ': ' + l); });
				});
			});
			return c;
		}).then(function () {
			cta.progress(0.97, 'finalizando…');
			return ABR.callHostJSON('abridor_finish', [jobPath]);
		}).then(function (res) {
			cta.progress(1);
			var seen = {};
			log = log.filter(function (l) {
				var k = l.replace(/^[^:]+: /, '');
				if (/^fonte /.test(k)) { if (seen[k]) return false; seen[k] = 1; }
				return true;
			});
			setLog(log);
			cta.finish(true);
			showApply(true);
			status(res.comps + ' comps criadas' + (res.master ? ' + "' + res.master + '"' : '') + '.' + (log.length ? ' veja os avisos.' : ''), 'ok');
		}).catch(function (e) {
			console.error(e);
			cta.finish(false);
			status('erro: ' + e.message, 'error');
			setLog(log);
		}).then(function () {
			setBusy(false);
		});
	}

	// ------------------------------------------------------ imagens externas -
	function toggleExternalImages() {
		if (!state.doc || state.busy) return;
		var btn = $('btnExtImages');
		if (state.extImages.length) {
			state.extImages = [];
			btn.classList.remove('on');
			renderGrid();
			status('voltando a usar a referência gerada pelo ABRIDOR.', 'info');
			return;
		}
		ABR.dialog.openFolder('pasta com as imagens exportadas dos slides').then(function (dir) {
			if (!dir) return;
			var files = ABR.fs.listImages(dir);
			files.sort(function (a, b) {
				var na = parseInt((ABR.fs.basename(a).match(/\d+/g) || ['0']).pop(), 10);
				var nb = parseInt((ABR.fs.basename(b).match(/\d+/g) || ['0']).pop(), 10);
				return na - nb || a.localeCompare(b);
			});
			if (!files.length) { status('nenhuma imagem PNG/JPG na pasta.', 'error'); return; }
			state.extImages = state.doc.pages.map(function (pg, i) { return files[i] || null; });
			btn.classList.add('on');
			if (files.length !== state.doc.pages.length) {
				status(files.length + ' imagens para ' + state.doc.pages.length + ' páginas (associadas pela ordem).', 'error');
			} else {
				status(files.length + ' imagens associadas às páginas.', 'ok');
			}
			renderGrid();
		});
	}

	// ------------------------------------------------------ eventos ---------
	function animIcon(btn, cls) {
		UI.replay(btn, cls);
		setTimeout(function () { btn.classList.remove(cls); }, 700);
	}

	function bindSwitch(id, key, onChange) {
		var input = $(id);
		var row = input.closest('.switch-row');
		input.checked = !!S[key];
		row.classList.toggle('on', input.checked);
		input.onchange = function () {
			S[key] = input.checked;
			row.classList.toggle('on', input.checked);
			saveSettings();
			updateCompsInfo();
			if (onChange) onChange(input.checked);
		};
	}

	function expander(field, btn, input, onEnter) {
		btn.onclick = function () {
			var open = !field.classList.contains('open');
			field.classList.toggle('open', open);
			if (open) setTimeout(function () { input.focus(); }, 60);
			else { input.blur(); }
		};
		input.onkeydown = function (e) {
			if (e.key === 'Enter' && onEnter) onEnter();
			if (e.key === 'Escape') { field.classList.remove('open'); input.blur(); }
		};
		input.onblur = function () { if (!input.value) field.classList.remove('open'); };
	}

	function bind() {
		UI.hydrateIcons();

		// tema
		applyTheme(false);
		$('themeBtn').onclick = function () {
			S.theme = THEME_NEXT[S.theme] || 'auto';
			saveSettings();
			applyTheme(true);
			status(THEME_LABEL[S.theme], 'silent');
		};
		ABR.onHostThemeChange(function () { if (S.theme === 'auto') applyTheme(true); });
		if (global.matchMedia) {
			var mq = global.matchMedia('(prefers-color-scheme: light)');
			var onMq = function () { if (S.theme === 'auto' && !ABR.isCEP) applyTheme(true); };
			if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
		}

		// abas
		each(document.querySelectorAll('.tab'), function (t) {
			t.onclick = function () { showTab(t.dataset.tab); };
		});

		// documento
		$('dropZone').onclick = pickDocument;
		$('dropZone').onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') pickDocument(); };
		$('docChip').onclick = pickDocument;
		$('filePicker').onchange = function () { if (this.files[0]) loadFile(this.files[0]); this.value = ''; };

		var depth = 0;
		document.addEventListener('dragenter', function (e) { e.preventDefault(); depth++; $('dropZone').classList.add('over'); });
		document.addEventListener('dragleave', function () { if (--depth <= 0) { depth = 0; $('dropZone').classList.remove('over'); } });
		document.addEventListener('dragover', function (e) { e.preventDefault(); });
		document.addEventListener('drop', function (e) {
			e.preventDefault();
			depth = 0;
			$('dropZone').classList.remove('over');
			var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
			if (f && !state.busy) { showTab('pages'); loadFile(f); }
		});

		// páginas
		function setAll(fn, btn) {
			if (!state.doc) return;
			state.selected = state.selected.map(fn);
			updateSelection(true);
			animIcon(btn, 'nudge');
		}
		$('selAll').onclick = function () { setAll(function () { return true; }, this); };
		$('selNone').onclick = function () { setAll(function () { return false; }, this); };
		$('selInvert').onclick = function () { setAll(function (s) { return !s; }, this); };
		expander($('rangeBox'), $('rangeBtn'), $('selRange'), function () {
			if (!state.doc) return;
			var r = parseRange($('selRange').value, state.doc.pages.length);
			if (!r.length) { status('intervalo inválido. ex: 1-3, 5, 8-', 'error'); return; }
			state.selected = state.doc.pages.map(function (p, i) { return r.indexOf(i) >= 0; });
			updateSelection(true);
			UI.replay($('rangeBox'), 'flash');
		});
		$('showBoxes').classList.toggle('on', S.showBoxes);
		$('showBoxes').onclick = function () {
			S.showBoxes = !S.showBoxes;
			this.classList.toggle('on', S.showBoxes);
			$('grid').classList.toggle('no-boxes', !S.showBoxes);
			animIcon(this, 'nudge');
			saveSettings();
		};
		$('btnExtImages').onclick = toggleExternalImages;

		// comps
		var res = UI.seg($('resSeg'), function (v) {
			S.res = v;
			UI.collapse($('customBox'), v === 'custom');
			saveSettings(); updateCompsInfo();
		});
		res.set(S.res, true);
		UI.collapse($('customBox'), S.res === 'custom', true);
		$('compW').value = S.w; $('compH').value = S.h;
		$('compW').oninput = function () { S.w = this.value; saveSettings(); updateCompsInfo(); };
		$('compH').oninput = function () { S.h = this.value; saveSettings(); updateCompsInfo(); };

		var fps = UI.seg($('fpsSeg'), function (v) { S.fps = v; saveSettings(); updateCompsInfo(); });
		fps.set(S.fps, true);

		function setDuration(v) {
			S.duration = Math.max(0.5, Math.round(v * 100) / 100);
			saveSettings();
			updateCompsInfo();
		}
		$('durMinus').onclick = function () { setDuration((parseFloat(S.duration) || 5) - 0.5); animIcon(this, 'nudge'); };
		$('durPlus').onclick = function () { setDuration((parseFloat(S.duration) || 5) + 0.5); animIcon(this, 'nudge'); };
		$('duration').onchange = function () { setDuration(parseFloat(this.value.replace(',', '.')) || 5); };
		$('duration').onkeydown = function (e) {
			if (e.key === 'ArrowUp') { e.preventDefault(); $('durPlus').click(); }
			if (e.key === 'ArrowDown') { e.preventDefault(); $('durMinus').click(); }
			if (e.key === 'Enter') this.blur();
		};
		$('prefix').oninput = updateCompsInfo;

		bindSwitch('master', 'master');
		bindSwitch('refImages', 'refImages', function (on) { UI.collapse($('refBox'), on); });
		UI.collapse($('refBox'), S.refImages, true);
		$('refOpacity').value = S.refOpacity;
		$('refOpacity').oninput = function () { S.refOpacity = +this.value; saveSettings(); updateCompsInfo(); };

		$('advBtn').classList.toggle('open', S.adv);
		UI.collapse($('advBox'), S.adv, true);
		$('advBtn').onclick = function () {
			S.adv = !S.adv;
			this.classList.toggle('open', S.adv);
			UI.collapse($('advBox'), S.adv);
			saveSettings();
			setTimeout(UI.relayout, 50);
		};
		var fit = UI.seg($('fitSeg'), function (v) { S.fit = v; saveSettings(); });
		fit.set(S.fit, true);
		var LAYER_HINT = {
			lines: 'texto de ponto, anchor point na linha de base de cada linha',
			blocks: 'PPTX: caixa de parágrafo · PDF: texto de ponto com várias linhas'
		};
		var layerSeg = UI.seg($('layerSeg'), function (v) {
			S.layerMode = v;
			saveSettings();
			$('layerHint').textContent = LAYER_HINT[v];
			UI.replay($('layerHint'), 'swap');
		});
		layerSeg.set(S.layerMode, true);
		$('layerHint').textContent = LAYER_HINT[S.layerMode];
		$('btnSplit').onclick = splitExisting;
		bindSwitch('keepAutofit', 'keepAutofit', function () { if (state.doc && state.doc.type === 'pptx') parseDocument(false); });
		$('fallbackFont').value = S.fallbackFont;
		$('fallbackFont').onchange = function () { S.fallbackFont = this.value.trim() || 'ArialMT'; saveSettings(); };

		// fontes
		expander($('searchBox'), $('searchBtn'), $('fontFilter'));
		$('fontFilter').oninput = renderFonts;
		$('previewBtn').onclick = function () {
			var open = !this.classList.contains('on');
			this.classList.toggle('on', open);
			UI.collapse($('previewBox'), open);
			if (open) setTimeout(function () { $('sampleText').focus(); }, 200);
		};
		$('sampleText').oninput = renderFonts;
		$('previewSize').value = S.previewSize;
		$('previewSize').oninput = function () { S.previewSize = +this.value; saveSettings(); renderFonts(); };
		$('btnAuto').onclick = function () {
			animIcon(this, 'wiggle');
			autoMatch(true);
			renderFonts();
			status('fontes associadas automaticamente.', 'ok');
		};
		$('btnScan').onclick = scanProject;
		$('btnReloadFonts').onclick = function () {
			var b = this;
			b.classList.add('busy');
			loadInstalledFonts().then(function () {
				for (var k in state.map) if (!state.map[k].manual) delete state.map[k];
				autoMatch(false);
				renderFonts();
				b.classList.remove('busy');
				status(ABR.fonts.list.length + ' fontes instaladas.', 'ok');
			});
		};
		var scope = UI.seg($('scopeSeg'), function (v) { S.scope = v; saveSettings(); });
		scope.set(S.scope, true);
		UI.collapse($('applyBox'), false, true);
		$('btnApplyFonts').onclick = applyFonts;

		// rodapé
		$('btnBuild').onclick = build;
		$('btnLog').onclick = function () { UI.collapse($('logBox'), !$('logBox').classList.contains('open')); };
		$('toast').onclick = UI.hideToast;

		global.addEventListener('resize', placeTabInk);
		document.addEventListener('keydown', function (e) {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); pickDocument(); }
		});
	}

	function init() {
		var saved = load('settings2', {});
		for (var k in DEFAULTS) S[k] = saved[k] !== undefined ? saved[k] : DEFAULTS[k];
		bind();
		renderFonts();
		updateCompsInfo();
		requestAnimationFrame(function () { placeTabInk(); UI.relayout(); });
		if (!ABR.isCEP && !global.ABR_MOCK) {
			status('abra este painel pelo After Effects (Window > Extensions > ABRIDOR).', 'error', true);
			return;
		}
		loadInstalledFonts().then(function () {
			renderFonts();
			if (ABR.fonts.supported) status('pronto — ' + ABR.fonts.list.length + ' fontes instaladas.', 'silent');
		});
	}

	ABR.app = { state: state, settings: S, parseRange: parseRange, build: build, renderFonts: renderFonts, timecode: timecode, showTab: showTab };

	document.addEventListener('DOMContentLoaded', init);

})(window);
