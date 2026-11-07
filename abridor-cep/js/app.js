/*
 * ABRIDOR - painel principal
 */
(function (global) {
	'use strict';

	var ABR = global.ABR;
	var UI = ABR.ui;
	var icon = UI.icon;
	var VERSION = '1.4.0';
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
		if (name === 'fonts' && state.fontsDirty) {
			state.fontsDirty = false;
			setTimeout(function () { arrangeFonts(true); }, 280);
		}
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
		state.anchor = null;
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

	// ------------------------------------------------------ recentes ---------
	function addRecent(doc) {
		if (!state.realPath) return;
		var list = load('recents', []).filter(function (r) { return r.path !== state.path; });
		list.unshift({ path: state.path, name: ABR.fs.basename(state.path), type: doc.type, pages: doc.pages.length, t: Date.now() });
		store('recents', list.slice(0, 6));
		renderRecents();
	}

	function renderRecents() {
		var el = $('recent');
		var list = load('recents', []);
		el.classList.toggle('hidden', !list.length);
		if (!list.length) { el.innerHTML = ''; return; }
		el.innerHTML = '<div class="recent-head"><span>recentes</span><button id="recentClear" title="limpar a lista\nos arquivos não são apagados">limpar</button></div>' +
			list.map(function (r, i) {
				var ok = ABR.fs.exists(r.path);
				return '<button class="recent-item' + (ok ? '' : ' missing') + '" data-i="' + i + '" title="' + esc(r.path) + (ok ? '' : '\narquivo não encontrado') + '">' +
					'<span class="doc-type' + (r.type === 'pptx' ? ' pptx' : '') + '">' + r.type.toUpperCase() + '</span>' +
					'<span class="ri-text"><b>' + esc(r.name) + '</b><small>' + (ok ? r.pages + ' páginas · ' + relTime(r.t) : 'arquivo não encontrado') + '</small></span>' +
					icon(ok ? 'arrow' : 'x', 'ri-go') + '</button>';
			}).join('');
		$('recentClear').onclick = function (e) { e.stopPropagation(); store('recents', []); renderRecents(); };
		each(el.querySelectorAll('.recent-item'), function (b) {
			b.onclick = function (e) {
				var r = list[+b.dataset.i];
				if (b.classList.contains('missing')) {
					if (e.target.closest('.ri-go')) {
						store('recents', list.filter(function (x) { return x.path !== r.path; }));
						renderRecents();
					}
					return;
				}
				if (!state.busy) loadPath(r.path);
			};
		});
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
			if (fresh) addRecent(doc);
			var tourAfter = fresh;
			collectFonts();
			renderGrid();
			renderFonts();
			updateCompsInfo();
			setTimeout(placeTabInk, 350);
			status('documento carregado. desmarque as páginas que não devem ser processadas.', 'ok');
			if (tourAfter && ABR.tour) ABR.tour.documentReady();
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
		// fora da aba fontes, reorganiza quando ela for aberta (para a animação ser vista)
		if (state.tab === 'fonts') arrangeFonts(true);
		else state.fontsDirty = true;
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
				(pg.hidden ? '<span class="chip flag" title="slide oculto\nestava oculto no PowerPoint; por isso veio desmarcado">' + icon('eyeOff') + '</span>' : '') +
				(state.extImages[i] ? '<span class="chip flag ext" title="' + esc(state.extImages[i]) + '">' + icon('image') + '</span>' : '') +
				'<span class="check">' + icon('check') + '</span>' +
				'<span class="chip texts" title="textos detectados nesta página">' + icon('type') + pg.texts.length + '</span>' +
				'<button class="dur' + (custom ? ' custom' : '') + '" data-i="' + i + '" title="duração desta página\nclique para mudar · vazio volta ao padrão">' + icon('clock') +
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
			thumb.title = pg.name + '\n' + (pg.texts.length ? pg.texts.length + ' texto' + (pg.texts.length === 1 ? '' : 's') + ' · clique para incluir/excluir\n' + pg.texts.slice(0, 8).map(function (t) {
				return '• ' + t.paragraphs.map(function (p) { return p.runs.map(function (r) { return r.text; }).join(''); }).join(' / ').slice(0, 60);
			}).join('\n') + (pg.texts.length > 8 ? '\n• …' : '') : 'nenhum texto encontrado (texto em imagem?)');
			thumb.onclick = function (e) {
				if (e.target.closest('.dur')) return;
				var a = state.anchor;
				if (e.shiftKey && a !== null && a !== undefined && a !== i && a < state.selected.length) {
					// shift + clique: aplica ao intervalo o novo estado da página clicada
					var v = !state.selected[i];
					for (var k = Math.min(a, i); k <= Math.max(a, i); k++) state.selected[k] = v;
				} else {
					state.selected[i] = !state.selected[i];
				}
				state.anchor = i;
				state.hoverPage = i;
				updateRangePreview();
				updateSelection(true);
			};
			thumb.onmouseenter = function (e) { state.hoverPage = i; state.shift = e.shiftKey; updateRangePreview(); };
			thumb.onmouseleave = function () { if (state.hoverPage === i) { state.hoverPage = null; updateRangePreview(); } };
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

	// prévia do intervalo enquanto o shift está pressionado
	function updateRangePreview() {
		var a = state.anchor, h = state.hoverPage;
		var on = state.shift && state.doc && a !== null && a !== undefined && h !== null && h !== undefined && a !== h;
		var lo = on ? Math.min(a, h) : -1, hi = on ? Math.max(a, h) : -2;
		each($('grid').querySelectorAll('.page'), function (el) {
			var k = +el.dataset.i;
			el.classList.toggle('range', k >= lo && k <= hi);
		});
		var hint = $('rangeHint');
		if (!on) { if (hint) hint.parentNode.removeChild(hint); return; }
		if (UI.tip) UI.tip.hide();
		if (!hint) {
			hint = document.createElement('div');
			hint.id = 'rangeHint';
			hint.className = 'range-hint';
			document.body.appendChild(hint);
		}
		var verb = state.selected[h] ? 'desmarcar' : 'marcar';
		hint.innerHTML = '<kbd>shift</kbd> + clique: ' + verb + ' páginas ' + (lo + 1) + '–' + (hi + 1);
		var el = $('grid').querySelector('.page[data-i="' + h + '"]');
		if (!el) return;
		var r = el.getBoundingClientRect();
		hint.style.left = Math.max(6, Math.min(window.innerWidth - hint.offsetWidth - 6, r.left + 8)) + 'px';
		hint.style.top = Math.max(6, r.top - hint.offsetHeight - 6) + 'px';
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
		});
		for (var k in state.fonts) {
			if (fontState(k) === 'missing' && fontUseCount(state.fonts[k])) missing++;
		}
		var chip = $('preChip');
		var showChip = !!state.doc && missing > 0;
		chip.querySelector('span').textContent = missing + ' fonte' + (missing === 1 ? '' : 's') + ' sem associação';
		if (showChip && chip.classList.contains('hidden')) UI.replay(chip, 'pre-chip');
		chip.classList.toggle('hidden', !showChip);
		$('ctaDot').classList.toggle('hidden', !showChip);
		var badge = $('fontBadge');
		badge.textContent = missing;
		badge.classList.toggle('hidden', !missing);
		if (missing !== lastMissing && lastMissing !== -1 && missing) UI.replay(badge, 'bump');
		lastMissing = missing;
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
		list.innerHTML =
			'<div class="font-group used"></div>' +
			'<div class="collapse unused-wrap" id="unusedWrap">' +
			'<button class="unused-head' + (state.unusedOpen ? ' open' : '') + '" id="unusedHead" title="não usadas nas páginas selecionadas\nsó aparecem em páginas desmarcadas; as associações ficam guardadas">' +
			icon('chevron', 'chev') + '<span>não usadas nas páginas selecionadas</span><b class="pill" id="unusedCount">0</b></button>' +
			'<div class="collapse" id="unusedBox"><div class="font-group unused"></div></div>' +
			'</div>';
		state.fontRows = {};
		keys.forEach(function (k, i) { state.fontRows[k] = fontRow(state.fonts[k], i); });
		$('unusedHead').onclick = function () {
			state.unusedOpen = !state.unusedOpen;
			this.classList.toggle('open', state.unusedOpen);
			UI.collapse($('unusedBox'), state.unusedOpen);
		};
		UI.collapse($('unusedBox'), !!state.unusedOpen, true);
		state.fontsDirty = false;
		arrangeFonts(false);
		updateFontCounts();
	}

	function isUsed(f) { return f.type === 'project' || fontUseCount(f) > 0; }

	// distribui as linhas entre "usadas" e "não usadas" e anima a troca de lugar (FLIP)
	function arrangeFonts(animate) {
		var list = $('fontList');
		var usedG = list.querySelector('.font-group.used');
		var unusedG = list.querySelector('.font-group.unused');
		var rows = state.fontRows;
		if (!usedG || !rows) return;
		// lista desatualizada (documento novo ainda sendo montado): o renderFonts reorganiza depois
		for (var rk in rows) if (!state.fonts[rk]) return;
		var box = $('unusedBox');
		var keys = Object.keys(rows).sort(function (a, b) {
			var ma = fontState(a) === 'missing' ? 1 : 0, mb = fontState(b) === 'missing' ? 1 : 0;
			return mb - ma || fontUseCount(state.fonts[b]) - fontUseCount(state.fonts[a]) || a.localeCompare(b);
		});
		var hidden = function (el) { return !!el.closest('#unusedBox') && !box.classList.contains('open'); };
		var before = {}, wasHidden = {}, rects = {};
		if (animate) keys.forEach(function (k) {
			rects[k] = rows[k].getBoundingClientRect();
			before[k] = rects[k].top;
			wasHidden[k] = hidden(rows[k]);
		});

		var unused = 0;
		keys.forEach(function (k) {
			var used = isUsed(state.fonts[k]);
			var el = rows[k];
			if (!used) unused++;
			el.classList.toggle('unused', !used);
			(used ? usedG : unusedG).appendChild(el);
		});

		var count = $('unusedCount');
		if (count.textContent !== String(unused)) {
			count.textContent = unused;
			if (animate) UI.replay(count, 'bump');
		}
		UI.collapse($('unusedWrap'), unused > 0, !animate);
		if (!unused && state.unusedOpen) { state.unusedOpen = false; $('unusedHead').classList.remove('open'); UI.collapse(box, false, true); }
		if (!animate || UI.reduced()) return;

		var head = $('unusedHead').getBoundingClientRect();
		keys.forEach(function (k) {
			var el = rows[k];
			var nowHidden = hidden(el);
			// a linha foi para o grupo recolhido: um "fantasma" desce até o cabeçalho e some dentro dele
			if (nowHidden && !wasHidden[k] && rects[k].height) {
				var r0 = rects[k];
				var ghost = el.cloneNode(true);
				ghost.classList.add('font-ghost');
				ghost.style.cssText = 'position:fixed;left:' + r0.left + 'px;top:' + r0.top + 'px;width:' + r0.width + 'px;margin:0;animation:none;z-index:5;transition:none;';
				document.body.appendChild(ghost);
				void ghost.offsetHeight;
				var ty = (head.top || r0.top + 40) - r0.top - r0.height * 0.3;
				ghost.style.transition = 'transform .55s var(--ease), opacity .5s ease';
				ghost.style.transform = 'translateY(' + ty + 'px) scale(.82)';
				ghost.style.opacity = '0';
				setTimeout(function () { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); }, 600);
				return;
			}
			if (nowHidden) return;
			if (wasHidden[k]) { UI.replay(el, 'enter'); return; }
			var dy = before[k] - el.getBoundingClientRect().top;
			if (Math.abs(dy) < 1) return;
			el.style.transition = 'none';
			el.style.transform = 'translateY(' + dy + 'px)';
			void el.offsetHeight;
			el.style.transition = 'transform .5s var(--spring), background .2s, box-shadow .25s, opacity .3s';
			el.style.transform = '';
			setTimeout(function () { el.style.transition = ''; }, 520);
		});
	}

	function fontRow(src, i) {
		var row = document.createElement('div');
		row.dataset.key = src.key;
		row.addEventListener('animationend', function () { row.style.animation = 'none'; row.classList.remove('enter'); });
		row.style.setProperty('--i', Math.min(i, 12));
		var supported = ABR.fonts.supported;
		row.innerHTML =
			'<div class="font-head">' +
			'<i class="dot"></i>' +
			'<span class="font-names"><span class="src" title="' + esc(src.key) + '\nfonte usada no documento">' + esc(src.key) + '</span>' + icon('arrow') + '<span class="dst"></span></span>' +
			'<span class="uses"></span>' + icon('chevron', 'chev') +
			'</div>' +
			'<div class="font-preview"></div>' +
			'<div class="collapse font-edit"><div class="font-edit-inner">' +
			'<div class="font-pick">' +
			(supported ? '<button class="picker-field family" title="família\nclique para buscar entre as fontes instaladas"><span></span>' + icon('chevron') + '</button><select class="style"></select>' : '<input type="text" class="ps" placeholder="nome PostScript (ex: Montserrat-Bold)" spellcheck="false">') +
			'</div>' +
			'<div class="font-tools">' +
			'<span class="orig" title="original\no texto na fonte do documento, se ela estiver instalada"><small>original</small><span></span></span>' +
			'<span class="scale-step" title="escala do tamanho\npassos de 5%; útil quando a fonte nova é maior ou menor">' +
			'<button class="icon-btn s-minus">' + icon('minus') + '</button><span class="s-val"></span><button class="icon-btn s-plus">' + icon('plus') + '</button>' +
			'</span></div>' +
			'</div></div>';

		var m = state.map[src.key] || (state.map[src.key] = { ps: '', scale: 100, manual: false });
		var fam = row.querySelector('.picker-field.family');
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
				var cur = ABR.fonts.get(m.ps);
				setFamilyLabel(cur ? cur.family : '');
				if (cur) fillStyles(cur.family, cur.ps);
			}
			if (psIn) psIn.value = m.ps || '';
		}

		function setFamilyLabel(family) {
			fam.dataset.value = family || '';
			fam.querySelector('span').textContent = family || 'escolher fonte…';
			fam.classList.toggle('empty', !family);
		}

		function refresh(animate) {
			var f = ABR.fonts.get(m.ps);
			var st = fontState(src.key);
			row.className = 'font ' + st + (row.classList.contains('open') ? ' open' : '');
			var dst = row.querySelector('.dst');
			dst.textContent = f ? f.family + ' ' + f.style : (m.ps ? m.ps : 'sem fonte');
			dst.title = f ? f.family + ' ' + f.style + '\nPostScript: ' + f.ps : (m.ps ? 'não instalada\n' + m.ps : 'sem fonte\nas camadas vão usar a fonte reserva (' + S.fallbackFont + ')');
			row.querySelector('.dot').title = { ok: 'automático\nencontrada pelo nome', manual: 'manual\nescolhida por você', missing: 'sem fonte\nescolha uma família abaixo' }[st];
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
			fam.onclick = function () {
				openFontPicker(fam, src, fam.dataset.value, function (family) {
					var pick = styleFor(src, family);
					setFamilyLabel(family);
					fillStyles(family, pick ? pick.ps : '');
					m.ps = pick ? pick.ps : '';
					changed();
					offerFamily(row, src, family);
				});
			};
			sty.onchange = function () { m.ps = sty.value; changed(); };
		}
		row._refresh = function () {
			if (built && fam) {
				var cur = ABR.fonts.get(m.ps);
				setFamilyLabel(cur ? cur.family : '');
				if (cur) fillStyles(cur.family, cur.ps);
			}
			refresh(true);
		};
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

	// estilo da família escolhida mais parecido com a fonte de origem (ex. "Gotham Black" -> Black)
	function styleFor(src, family) {
		var styles = stylesOf(family);
		if (!styles.length) return null;
		var hint = (src.key.match(/thin|hairline|extra ?light|ultra ?light|light|book|regular|medium|semi ?bold|demi ?bold|extra ?bold|ultra ?bold|bold|heavy|black|italic|oblique|condensed|narrow/gi) || []).join(' ');
		var pick = ABR.fonts.autoMatch({ key: family + (hint ? ' ' + hint : ''), family: family + (hint ? ' ' + hint : ''), bold: src.bold, italic: src.italic, type: 'pptx' }) || styles[0];
		return pick.family === family ? pick : styles[0];
	}

	// ------------------------------------------------------ família inteira -
	// depois de trocar uma fonte, oferece trocar os outros estilos da mesma família de origem
	function offerFamily(row, src, family) {
		var old = row.querySelector('.family-hint');
		if (old) old.parentNode.removeChild(old);
		var fam0 = ABR.fonts.norm(src.family);
		var list = [];
		for (var k in state.fonts) {
			var o = state.fonts[k];
			if (k === src.key || ABR.fonts.norm(o.family) !== fam0) continue;
			var cur = ABR.fonts.get((state.map[k] || {}).ps);
			if (cur && cur.family === family) continue;
			var pick = styleFor(o, family);
			if (pick) list.push({ key: k, font: pick });
		}
		if (!list.length) return;
		var h = document.createElement('div');
		h.className = 'family-hint';
		h.innerHTML = '<p>' + icon('wand') + 'trocar também os outros estilos de ' + esc(src.family) + '?</p><ul>' +
			list.map(function (x) { return '<li>' + esc(x.key) + ' ' + icon('arrow') + ' <b>' + esc(x.font.family + ' ' + x.font.style) + '</b></li>'; }).join('') +
			'</ul><div class="row-btns"><button class="yes">aplicar' + (list.length > 1 ? ' nos ' + list.length : '') + '</button><button class="no">agora não</button></div>';
		row.querySelector('.font-edit-inner').appendChild(h);
		function dismiss() {
			h.classList.add('out');
			setTimeout(function () { if (h.parentNode) h.parentNode.removeChild(h); }, 200);
		}
		h.querySelector('.no').onclick = dismiss;
		h.querySelector('.yes').onclick = function () {
			list.forEach(function (x) {
				var mm = state.map[x.key] || (state.map[x.key] = { scale: 100 });
				mm.ps = x.font.ps;
				mm.manual = true;
				var r = state.fontRows && state.fontRows[x.key];
				if (r && r._refresh) r._refresh();
			});
			rememberMap();
			updateFontCounts();
			dismiss();
			status(list.length + ' estilo' + (list.length === 1 ? '' : 's') + ' de ' + src.family + ' trocado' + (list.length === 1 ? '' : 's') + ' para ' + family + '.', 'ok');
		};
	}

	// ------------------------------------------------------ seletor de fontes
	// fontes com as mesmas medidas (substitutas comuns)
	var EQUIV = {
		calibri: 'Carlito', carlito: 'Calibri', cambria: 'Caladea', caladea: 'Cambria',
		arial: 'Liberation Sans', helvetica: 'Liberation Sans', liberationsans: 'Arial',
		timesnewroman: 'Liberation Serif', times: 'Liberation Serif', liberationserif: 'Times New Roman',
		couriernew: 'Liberation Mono', liberationmono: 'Courier New'
	};

	function familyIndex() {
		var idx = {};
		ABR.fonts.list.forEach(function (f) { idx[f.family] = (idx[f.family] || 0) + 1; });
		return idx;
	}

	function openFontPicker(field, src, current, onPick) {
		closeFontPicker();
		var idx = familyIndex();
		var families = Object.keys(idx).sort(function (a, b) { return a.localeCompare(b); });
		var recents = load('recentFamilies', []).filter(function (f) { return idx[f]; });
		var equiv = EQUIV[ABR.fonts.norm(src.family)];
		if (equiv && !idx[equiv]) equiv = null;

		var box = document.createElement('div');
		box.className = 'picker';
		box.id = 'fontPicker';
		box.innerHTML = '<div class="picker-search">' + icon('search') + '<input type="text" spellcheck="false" placeholder="buscar fonte…"></div>' +
			'<div class="picker-list"></div>' +
			'<div class="picker-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> escolher</span><span><kbd>Esc</kbd> fechar</span></div>';
		document.body.appendChild(box);
		field.classList.add('active');

		var input = box.querySelector('input');
		var listEl = box.querySelector('.picker-list');
		var items = [], hl = 0;

		function itemHTML(f, i, q, note) {
			var name = esc(f);
			if (q) {
				var p = f.toLowerCase().indexOf(q);
				if (p >= 0) name = esc(f.slice(0, p)) + '<mark>' + esc(f.slice(p, p + q.length)) + '</mark>' + esc(f.slice(p + q.length));
			}
			return '<div class="picker-item' + (f === current ? ' cur' : '') + '" data-i="' + i + '"><span class="pf" style="font-family:\'' + f.replace(/'/g, '') + '\', sans-serif">' + name + '</span>' +
				'<span class="ps">' + (note ? esc(note) + ' · ' : '') + idx[f] + ' estilo' + (idx[f] === 1 ? '' : 's') + '</span></div>';
		}

		function render() {
			var q = input.value.trim().toLowerCase();
			var match = function (f) { return !q || f.toLowerCase().indexOf(q) >= 0; };
			items = [];
			var html = '';
			var sec = function (title, list, noteFn) {
				list = list.filter(match);
				if (!list.length) return;
				html += '<div class="picker-sec">' + title + '</div>';
				list.forEach(function (f) { html += itemHTML(f, items.length, q, noteFn && noteFn(f)); items.push(f); });
			};
			if (equiv) sec('sugestão', [equiv], function () { return 'medidas iguais à ' + src.family; });
			sec('recentes', recents.filter(function (f) { return f !== equiv; }));
			var rest = families.filter(function (f) { return match(f) && f !== equiv && recents.indexOf(f) < 0; });
			if (q) rest.sort(function (a, b) { return (a.toLowerCase().indexOf(q) === 0 ? 0 : 1) - (b.toLowerCase().indexOf(q) === 0 ? 0 : 1) || a.localeCompare(b); });
			var shown = rest.slice(0, 150);
			if (shown.length) {
				html += '<div class="picker-sec">' + (q ? 'todas · ' + rest.length + ' resultado' + (rest.length === 1 ? '' : 's') : 'todas · ' + families.length) + '</div>';
				shown.forEach(function (f) { html += itemHTML(f, items.length, q); items.push(f); });
				if (rest.length > shown.length) html += '<div class="picker-empty">e mais ' + (rest.length - shown.length) + ' — continue digitando</div>';
			}
			if (!items.length) html = '<div class="picker-empty">nenhuma fonte com “' + esc(input.value) + '”</div>';
			listEl.innerHTML = html;
			hl = Math.max(0, items.indexOf(current) >= 0 && !q ? items.indexOf(current) : 0);
			highlight(false);
		}

		function highlight(scroll) {
			each(listEl.querySelectorAll('.picker-item'), function (el) { el.classList.toggle('hl', +el.dataset.i === hl); });
			var el = listEl.querySelector('.picker-item.hl');
			if (el && scroll !== false) el.scrollIntoView({ block: 'nearest' });
		}

		function place() {
			var r = field.getBoundingClientRect();
			var h = box.offsetHeight;
			var below = window.innerHeight - r.bottom - 8;
			var above = below < h && r.top - 8 > below;
			box.classList.toggle('above', above);
			box.style.top = (above ? Math.max(6, r.top - h - 6) : r.bottom + 6) + 'px';
		}

		function pick(f) {
			if (!f) return;
			var rec = load('recentFamilies', []).filter(function (x) { return x !== f; });
			rec.unshift(f);
			store('recentFamilies', rec.slice(0, 6));
			closeFontPicker();
			onPick(f);
		}

		input.oninput = render;
		input.onkeydown = function (e) {
			if (e.key === 'ArrowDown') { e.preventDefault(); hl = Math.min(items.length - 1, hl + 1); highlight(); }
			if (e.key === 'ArrowUp') { e.preventDefault(); hl = Math.max(0, hl - 1); highlight(); }
			if (e.key === 'Enter') { e.preventDefault(); pick(items[hl]); }
			if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFontPicker(); }
		};
		listEl.onmousemove = function (e) {
			var it = e.target.closest('.picker-item');
			if (it && +it.dataset.i !== hl) { hl = +it.dataset.i; highlight(false); }
		};
		listEl.onclick = function (e) {
			var it = e.target.closest('.picker-item');
			if (it) pick(items[+it.dataset.i]);
		};
		render();
		place();
		setTimeout(function () { input.focus(); }, 20);
		state.picker = { box: box, field: field, place: place };
	}

	function closeFontPicker() {
		var p = state.picker;
		if (!p) return;
		state.picker = null;
		p.field.classList.remove('active');
		p.box.style.transition = 'opacity .15s';
		p.box.style.opacity = '0';
		setTimeout(function () { if (p.box.parentNode) p.box.parentNode.removeChild(p.box); }, 150);
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

	// ------------------------------------------------------ antes de criar ---
	function missingFonts() {
		var out = [];
		for (var k in state.fonts) if (fontState(k) === 'missing' && fontUseCount(state.fonts[k])) out.push(k);
		return out;
	}

	// algum texto das páginas selecionadas tem trechos com fontes/tamanhos/cores diferentes?
	function docHasMixed() {
		return selectedIndexes().some(function (i) {
			return state.doc.pages[i].texts.some(function (t) {
				var first = null;
				return t.paragraphs.some(function (p) {
					return p.runs.some(function (r) {
						if (!r.text || r.text === '\r') return false;
						var k = r.fontKey + '|' + r.size + '|' + r.color.join(',');
						if (first === null) { first = k; return false; }
						return k !== first;
					});
				});
			});
		});
	}

	function goToMissing() {
		var miss = missingFonts();
		showTab('fonts');
		if (!miss.length) return;
		setTimeout(function () {
			var row = state.fontRows && state.fontRows[miss[0]];
			if (!row) return;
			row.scrollIntoView({ block: 'center', behavior: 'smooth' });
			if (!row.classList.contains('open')) row.querySelector('.font-head').click();
		}, 380);
	}

	function requestBuild() {
		if (state.busy || !state.doc || $('btnBuild').disabled) return;
		var missing = missingFonts();
		ABR.callHostJSON('abridor_inspect', [state.name]).catch(function () { return {}; }).then(function (info) {
			var mixed = info.ranges === false && docHasMixed();
			if (!missing.length && !mixed && !info.existing) { build({ mode: 'new' }); return; }
			openPreflight(missing, info, mixed);
		});
	}

	function relTime(str) {
		var d = new Date(str);
		if (isNaN(d)) return '';
		var now = new Date(), hm = pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2);
		var mins = Math.floor((now - d) / 60000);
		if (mins < 1) return 'agora';
		if (mins < 60) return 'há ' + mins + ' min';
		var days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5);
		if (days <= 0) return 'hoje às ' + hm;
		if (days === 1) return 'ontem, ' + hm;
		return 'há ' + days + ' dias';
	}

	function openPreflight(missing, info, mixed) {
		var n = selectedIndexes().length;
		var choice = info.existing ? 'texts' : 'new';
		var wrap = document.createElement('div');
		wrap.id = 'preWrap';
		var html = '<div class="scrim"></div><div class="pre-sheet" role="dialog"><div class="sheet-grip"></div>' +
			'<h3>' + icon('sparkle') + 'antes de criar ' + n + ' comp' + (n === 1 ? '' : 's') + '</h3>';
		if (missing.length) {
			var names = missing.slice(0, 3).join(', ') + (missing.length > 3 ? ' e mais ' + (missing.length - 3) : '');
			html += '<div class="check-item warn">' + icon('alert') + '<div class="ci-body"><b>' + missing.length + ' fonte' + (missing.length === 1 ? '' : 's') + ' sem associação</b>' +
				'<small>' + esc(names) + ' — vão sair em ' + esc(S.fallbackFont) + '</small></div><button class="mini-btn" data-act="fonts">associar</button></div>';
		}
		if (mixed) {
			html += '<div class="check-item info">' + icon('info') + '<div class="ci-body"><b>After Effects ' + esc(String(info.version || '').replace(/x.*/, '')) + '</b>' +
				'<small>trechos com fontes diferentes na mesma linha recebem um estilo só (precisa do 2024.3)</small></div></div>';
		}
		if (info.existing) {
			var ex = info.existing;
			html += '<div class="check-item folder">' + icon('project') + '<div class="ci-body"><b>“' + esc(ex.name) + '” já existe no projeto</b>' +
				'<small>' + ex.comps + ' comp' + (ex.comps === 1 ? '' : 's') + (ex.created ? ' · criadas ' + relTime(ex.created) : '') + '</small>' +
				'<div class="choice">' +
				'<button data-mode="replace" title="substituir\napaga a pasta e as comps antigas do documento e cria de novo">' + icon('refresh') + 'substituir<small>apaga e cria de novo</small></button>' +
				'<button data-mode="side" title="criar ao lado\nmantém as antigas; as novas vão para “' + esc(state.name + ' ' + info.next) + '”">' + icon('plus') + 'criar ao lado<small>as novas ganham “' + info.next + '”</small></button>' +
				'<button data-mode="texts" title="só os textos\nmantém as comps, posições, animações e efeitos; troca só o conteúdo das camadas de texto">' + icon('type') + 'só os textos<small>mantém animações</small></button>' +
				'</div></div></div>';
		}
		html += '<div class="sheet-actions"><button class="btn" data-act="back">voltar</button><button class="btn primary" data-act="go">' + icon('sparkle') + '<span></span></button></div></div>';
		wrap.innerHTML = html;
		document.body.appendChild(wrap);

		var goLabel = wrap.querySelector('[data-act=go] span');
		function setChoice(m) {
			choice = m;
			each(wrap.querySelectorAll('.choice button'), function (b) { b.classList.toggle('on', b.dataset.mode === m); });
			goLabel.textContent = m === 'texts' ? 'atualizar os textos' : 'criar ' + n + ' comp' + (n === 1 ? '' : 's');
		}
		setChoice(choice);
		function close(cb) {
			document.removeEventListener('keydown', onKey, true);
			wrap.querySelector('.scrim').classList.add('out');
			wrap.querySelector('.pre-sheet').classList.add('out');
			setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); if (cb) cb(); }, 230);
		}
		function onKey(e) {
			if (e.key === 'Escape') { e.stopPropagation(); close(); }
			if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); go(); }
		}
		function go() {
			var opts = { mode: choice };
			if (choice === 'side') { opts.folderName = state.name + ' ' + info.next; opts.suffix = ' (' + info.next + ')'; }
			close(function () { build(opts); });
		}
		document.addEventListener('keydown', onKey, true);
		wrap.querySelector('.scrim').onclick = function () { close(); };
		wrap.addEventListener('click', function (e) {
			var b = e.target.closest('button');
			if (!b) return;
			if (b.dataset.mode) setChoice(b.dataset.mode);
			if (b.dataset.act === 'back') close();
			if (b.dataset.act === 'go') go();
			if (b.dataset.act === 'fonts') close(goToMissing);
		});
	}

	function build(opts) {
		opts = opts || { mode: 'new' };
		if (state.busy || !state.doc) return;
		var st = settings();
		var suffix = opts.suffix || '';
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
				master: st.master, masterName: st.prefix + ' MASTER' + suffix,
				mode: opts.mode,
				refImages: st.refImages, refOpacity: st.refOpacity,
				fallbackFont: st.fallbackFont,
				lines: S.layerMode === 'lines'
			},
			fontMap: fontMapForHost(),
			folderName: opts.folderName || '',
			pages: []
		};
		var totals = { updated: 0, added: 0, left: 0 };

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
					compName: compName(pg) + suffix,
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
					totals.updated += res.updated || 0;
					totals.added += res.isNew ? 0 : (res.added || 0);
					totals.left += res.left || 0;
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
			UI.replay($('logoMark'), 'pry');
			var msg;
			if (res.mode === 'texts') {
				msg = totals.updated + ' camada' + (totals.updated === 1 ? '' : 's') + ' de texto atualizada' + (totals.updated === 1 ? '' : 's') +
					(totals.added ? ', ' + totals.added + ' nova' + (totals.added === 1 ? '' : 's') : '') +
					(totals.left ? ', ' + totals.left + ' sem correspondente' : '') + '.';
			} else {
				msg = res.comps + ' comps criadas' + (res.master ? ' + “' + res.master + '”' : '') + '.';
			}
			if (log.length) msg += ' veja os avisos.';
			var actions = [];
			if (res.masterId) actions.push({ label: 'abrir master', icon: 'master', fn: function () { ABR.callHost('abridor_reveal', [res.masterId]); } });
			if (res.folderId) actions.push({ label: 'mostrar no projeto', icon: 'project', fn: function () { ABR.callHost('abridor_reveal', [res.folderId]); } });
			$('status').textContent = msg;
			UI.toast(msg, 'ok', false, actions);
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
		UI.tooltips();

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
		$('btnBuild').onclick = requestBuild;
		$('preChip').onclick = goToMissing;
		$('helpBtn').onclick = function () { if (ABR.tour && !state.busy) ABR.tour.start(false); };
		$('btnLog').onclick = function () { UI.collapse($('logBox'), !$('logBox').classList.contains('open')); };
		$('toast').onclick = UI.hideToast;

		global.addEventListener('resize', placeTabInk);
		document.addEventListener('mousedown', function (e) {
			if (state.picker && !e.target.closest('#fontPicker') && !e.target.closest('.picker-field.active')) closeFontPicker();
		}, true);
		$('fontList').addEventListener('scroll', function () { if (state.picker) closeFontPicker(); });
		global.addEventListener('resize', function () { if (state.picker) closeFontPicker(); });
		document.addEventListener('keydown', function (e) { if (e.key === 'Shift' && !state.shift) { state.shift = true; updateRangePreview(); } });
		document.addEventListener('keyup', function (e) { if (e.key === 'Shift') { state.shift = false; updateRangePreview(); } });
		global.addEventListener('blur', function () { state.shift = false; updateRangePreview(); });
		document.addEventListener('keydown', function (e) {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); pickDocument(); }
			if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); requestBuild(); }
			// 1 2 3 trocam de aba (fora de campos de texto)
			var typing = /^(input|select|textarea)$/i.test((document.activeElement || {}).tagName || '');
			if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && /^[123]$/.test(e.key)) showTab(TABS[+e.key - 1]);
		});
	}

	function init() {
		var saved = load('settings2', {});
		for (var k in DEFAULTS) S[k] = saved[k] !== undefined ? saved[k] : DEFAULTS[k];
		bind();
		renderRecents();
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
