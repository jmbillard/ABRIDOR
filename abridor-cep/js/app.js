/*
 * ABRIDOR - painel principal
 */
(function (global) {
	'use strict';

	var ABR = global.ABR;
	var VERSION = '1.0.0';
	var THUMB_W = 320;

	var state = {
		doc: null,
		path: null,
		name: '',
		bytes: null,
		selected: [],
		durations: [],
		extImages: [],
		fonts: {},     // fontes de origem: key -> {key, family, bold, italic, type, count, sample}
		map: {},       // key -> {ps, scale, manual}
		busy: false,
		log: []
	};

	ABR.state = state;

	function $(id) { return document.getElementById(id); }

	function esc(s) {
		return String(s).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}

	function pad(n, l) { n = String(n); while (n.length < l) n = '0' + n; return n; }

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

	// ------------------------------------------------------ status ----------
	function status(msg, isError) {
		var el = $('status');
		el.textContent = msg;
		el.classList.toggle('error', !!isError);
	}

	function progress(v) {
		$('progressBar').style.width = Math.round(Math.max(0, Math.min(1, v)) * 100) + '%';
	}

	function setLog(lines) {
		state.log = lines;
		$('log').textContent = lines.join('\n');
		$('btnLog').classList.toggle('hidden', !lines.length);
		$('btnLog').textContent = 'avisos (' + lines.length + ')';
	}

	function setBusy(b) {
		state.busy = b;
		$('btnBuild').disabled = b || !state.doc || !selectedIndexes().length;
		$('btnOpen').disabled = b;
		$('btnApplyFonts').disabled = b;
	}

	// ------------------------------------------------------ configurações ---
	var SETTINGS_IDS = ['preset', 'compW', 'compH', 'fps', 'fit', 'duration', 'master', 'refImages', 'refOpacity', 'groupMode', 'ignoreAutofit', 'fallbackFont', 'applyScope', 'previewSize'];

	function saveSettings() {
		var s = {};
		SETTINGS_IDS.forEach(function (id) {
			var el = $(id);
			s[id] = el.type === 'checkbox' ? el.checked : el.value;
		});
		store('settings', s);
	}

	function restoreSettings() {
		var s = load('settings', {});
		SETTINGS_IDS.forEach(function (id) {
			if (s[id] === undefined) return;
			var el = $(id);
			if (el.type === 'checkbox') el.checked = s[id];
			else el.value = s[id];
		});
	}

	function settings() {
		var preset = $('preset').value;
		var w, h;
		if (preset === 'custom') {
			w = Math.max(16, parseInt($('compW').value, 10) || 1920);
			h = Math.max(16, parseInt($('compH').value, 10) || 1080);
		} else {
			var p = preset.split('x');
			w = parseInt(p[0], 10); h = parseInt(p[1], 10);
		}
		return {
			width: w,
			height: h,
			par: 1,
			fps: parseFloat($('fps').value),
			fit: $('fit').value,
			duration: Math.max(0.04, parseFloat($('duration').value) || 5),
			master: $('master').checked,
			refImages: $('refImages').checked,
			refOpacity: parseInt($('refOpacity').value, 10),
			prefix: $('prefix').value.replace(/^\s+|\s+$/g, '') || 'LAYOUT',
			fallbackFont: $('fallbackFont').value.replace(/^\s+|\s+$/g, '') || 'ArialMT'
		};
	}

	function timecode(sec, fps) {
		var fr = Math.round(sec * fps);
		var base = Math.round(fps);
		var f = fr % base, s = Math.floor(fr / base);
		return pad(Math.floor(s / 3600), 2) + ':' + pad(Math.floor(s / 60) % 60, 2) + ':' + pad(s % 60, 2) + (Math.abs(fps - base) > 0.001 ? ';' : ':') + pad(f, 2) +
			'  (' + fr + ' fr)';
	}

	function pageDuration(i) {
		var d = state.durations[i];
		return d && d > 0 ? d : settings().duration;
	}

	function compName(page, idx, total) {
		var S = settings();
		return S.prefix + ' ' + pad(page.number, Math.max(2, String(total).length));
	}

	function updateCompsInfo() {
		var S = settings();
		$('customRow').classList.toggle('hidden', $('preset').value !== 'custom');
		$('durTC').textContent = timecode(S.duration, S.fps);
		var total = 0;
		selectedIndexes().forEach(function (i) { total += Math.round(pageDuration(i) * S.fps); });
		$('totalTC').textContent = state.doc ? timecode(total / S.fps, S.fps) + ' — ' + selectedIndexes().length + ' comps' : '—';
		$('namePreview').textContent = S.prefix + ' 01';
		$('refOpacityVal').textContent = $('refOpacity').value + '%';
	}

	// ------------------------------------------------------ documento -------
	function openDocument() {
		ABR.dialog.openFile('abrir PPTX ou PDF', ['pptx', 'pdf']).then(function (p) {
			if (!p) return;
			var bytes;
			try {
				bytes = ABR.fs.readBinary(p);
			} catch (e) {
				status('não foi possível ler o arquivo: ' + e.message, true);
				return;
			}
			state.path = p;
			state.bytes = bytes;
			state.name = ABR.fs.basename(p).replace(/\.(pptx|pdf)$/i, '');
			state.extImages = [];
			$('prefix').value = state.name.toUpperCase().replace(/[_\s]+/g, ' ').slice(0, 24).replace(/\s+$/, '') || 'LAYOUT';
			parseDocument(true);
		});
	}

	function parseDocument(fresh) {
		if (!state.bytes) return;
		var isPdf = /\.pdf$/i.test(state.path);
		setBusy(true);
		status('lendo ' + (isPdf ? 'PDF' : 'PPTX') + '…');
		progress(0);
		var onProgress = function (i, n) {
			status('lendo página ' + (i + 1) + ' de ' + n + '…');
			progress(i / n);
		};
		// pdf.js pode transferir o buffer: passa uma cópia
		var bytes = state.bytes.slice();
		var p = isPdf
			? ABR.parsePDF(bytes, { groupMode: $('groupMode').value }, onProgress)
			: ABR.parsePPTX(bytes, { ignoreAutofit: $('ignoreAutofit').checked }, onProgress);

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
			document.body.classList.toggle('doc-pdf', doc.type === 'pdf');
			document.body.classList.toggle('doc-pptx', doc.type === 'pptx');
			var nTexts = doc.pages.reduce(function (n, pg) { return n + pg.texts.length; }, 0);
			$('docInfo').classList.remove('empty');
			$('docInfo').innerHTML = '<b>' + esc(ABR.fs.basename(state.path)) + '</b> — ' + doc.pages.length + ' páginas, ' +
				nTexts + ' textos, ' + Math.round(doc.width) + '×' + Math.round(doc.height) + ' pt';
			collectFonts();
			renderGrid();
			renderFonts();
			updateCompsInfo();
			progress(1);
			status('documento carregado. desmarque as páginas que não devem ser processadas.');
		}).catch(function (e) {
			console.error(e);
			status('erro ao ler o documento: ' + e.message, true);
		}).then(function () {
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

	function updateSelectionInfo() {
		if (!state.doc) { $('selCount').textContent = ''; return; }
		var n = selectedIndexes().length;
		$('selCount').textContent = n + ' de ' + state.doc.pages.length + ' páginas selecionadas';
		var cards = $('grid').querySelectorAll('.card');
		for (var i = 0; i < cards.length; i++) {
			cards[i].classList.toggle('off', !state.selected[i]);
			cards[i].querySelector('input[type=checkbox]').checked = !!state.selected[i];
		}
		$('btnBuild').disabled = state.busy || !n;
		updateCompsInfo();
		updateFontCounts();
	}

	function renderGrid() {
		var grid = $('grid');
		grid.innerHTML = '';
		if (!state.doc) return;
		var showBoxes = $('showBoxes').checked;

		state.doc.pages.forEach(function (pg, i) {
			var card = document.createElement('div');
			card.className = 'card';
			card.innerHTML =
				'<div class="thumb"><img alt=""></div>' +
				(pg.hidden ? '<span class="tag">oculto</span>' : '') +
				(state.extImages[i] ? '<span class="tag ext" title="' + esc(state.extImages[i]) + '">IMG</span>' : '') +
				'<div class="meta">' +
				'<input type="checkbox">' +
				'<b>' + pg.number + '</b>' +
				'<span class="count">' + pg.texts.length + ' textos</span>' +
				'<input type="number" min="0.1" step="0.5" title="duração desta página (seg). vazio = padrão" placeholder="' + settings().duration + '">' +
				'</div>';

			var img = card.querySelector('img');
			var thumb = card.querySelector('.thumb');
			img.src = pg.thumb || '';
			if (showBoxes) {
				img.onload = function () {
					var c = document.createElement('canvas');
					c.className = 'overlay';
					c.width = img.naturalWidth;
					c.height = img.naturalHeight;
					ABR.drawTextBoxes(c.getContext('2d'), pg, c.width, c.height, 'fit');
					thumb.appendChild(c);
				};
			}
			thumb.title = pg.name + (pg.texts.length ? '\n\n' + pg.texts.slice(0, 12).map(function (t) {
				return '• ' + t.paragraphs.map(function (p) { return p.runs.map(function (r) { return r.text; }).join(''); }).join(' / ').slice(0, 60);
			}).join('\n') : '');
			thumb.onclick = function () {
				state.selected[i] = !state.selected[i];
				updateSelectionInfo();
			};
			var cb = card.querySelector('input[type=checkbox]');
			cb.onchange = function () {
				state.selected[i] = cb.checked;
				updateSelectionInfo();
			};
			var dur = card.querySelector('input[type=number]');
			if (state.durations[i]) dur.value = state.durations[i];
			dur.onchange = function () {
				var v = parseFloat(dur.value);
				state.durations[i] = v > 0 ? v : null;
				updateCompsInfo();
			};
			grid.appendChild(card);
		});
		updateSelectionInfo();
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
		// mantém fontes lidas do projeto
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
									type: state.doc.type, count: 0, pages: {}, sample: ''
								};
							}
							f.pages[pi] = (f.pages[pi] || 0) + 1;
							if (f.sample.length < 30 && r.text.replace(/\s/g, '').length > 1) {
								f.sample = (f.sample ? f.sample + ' ' : '') + r.text.replace(/[\r\n]+/g, ' ').trim();
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

	function updateFontCounts() {
		var rows = $('fontList').querySelectorAll('.font-row');
		var missing = 0;
		for (var i = 0; i < rows.length; i++) {
			var f = state.fonts[rows[i].dataset.key];
			if (!f) continue;
			var n = fontUseCount(f);
			rows[i].querySelector('.uses').textContent = n + '×' + (f.type === 'project' ? ' no projeto' : '');
			rows[i].style.opacity = n || f.type === 'project' ? 1 : 0.4;
		}
		for (var k in state.fonts) {
			var m = state.map[k];
			if ((!m || !m.ps || !ABR.fonts.get(m.ps)) && fontUseCount(state.fonts[k])) missing++;
		}
		var badge = $('fontBadge');
		badge.textContent = missing;
		badge.classList.toggle('hidden', !missing || !ABR.fonts.supported);
	}

	var familyOptionsHTML = null;

	function familyOptions() {
		if (familyOptionsHTML !== null) return familyOptionsHTML;
		var seen = {}, html = ['<option value="">— escolher fonte —</option>'];
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
		var keys = Object.keys(state.fonts).sort(function (a, b) {
			return fontUseCount(state.fonts[b]) - fontUseCount(state.fonts[a]) || a.localeCompare(b);
		});
		var filter = $('fontFilter').value.toLowerCase();
		if (filter) keys = keys.filter(function (k) { return k.toLowerCase().indexOf(filter) >= 0; });

		if (!keys.length) {
			list.innerHTML = '<div class="placeholder">' + (Object.keys(state.fonts).length ? 'nenhuma fonte com esse filtro.' :
				'as fontes do documento aparecem aqui depois de abrir um arquivo<br>(ou use <b>ler do projeto</b> para trocar fontes de comps já criadas).') + '</div>';
			updateFontCounts();
			return;
		}
		list.innerHTML = '';
		keys.forEach(function (k) { list.appendChild(fontRow(state.fonts[k])); });
		updateFontCounts();
	}

	function fontRow(src) {
		var row = document.createElement('div');
		row.className = 'font-row';
		row.dataset.key = src.key;
		var supported = ABR.fonts.supported;
		row.innerHTML =
			'<div class="head">' +
			'<span class="src" title="' + esc(src.key) + '">' + esc(src.key) + '</span>' +
			'<span class="uses"></span>' +
			'<span class="state"></span>' +
			'</div>' +
			'<div class="preview orig" title="fonte original do documento (se instalada)"></div>' +
			'<div class="pick">' +
			(supported
				? '<select class="family">' + familyOptions() + '</select><select class="style"></select>'
				: '<input type="text" class="ps" placeholder="nome PostScript (ex: Montserrat-Bold)">') +
			'<input type="number" class="scale" min="10" max="400" step="1" title="escala do tamanho (%)">' +
			'</div>' +
			'<div class="preview target"></div>';

		var m = state.map[src.key] || (state.map[src.key] = { ps: '', scale: 100, manual: false });
		var fam = row.querySelector('select.family');
		var sty = row.querySelector('select.style');
		var psIn = row.querySelector('input.ps');
		var scale = row.querySelector('input.scale');
		scale.value = m.scale || 100;

		function fillStyles(family, selectedPS) {
			if (!sty) return;
			var styles = stylesOf(family);
			sty.innerHTML = styles.map(function (f) {
				return '<option value="' + esc(f.ps) + '"' + (f.ps === selectedPS ? ' selected' : '') + '>' + esc(f.style || f.ps) + '</option>';
			}).join('');
		}

		function refresh() {
			var f = ABR.fonts.get(m.ps);
			var st = row.querySelector('.state');
			row.classList.remove('ok', 'manual', 'missing');
			if (supported) {
				if (!f) { row.classList.add('missing'); st.textContent = m.ps ? 'não instalada: ' + m.ps : 'sem fonte — usa reserva'; }
				else if (m.manual) { row.classList.add('manual'); st.textContent = 'manual'; }
				else { row.classList.add('ok'); st.textContent = 'automático'; }
			} else {
				row.classList.add(m.ps ? 'manual' : 'missing');
				st.textContent = m.ps ? 'PostScript' : 'sem fonte — usa reserva';
			}
			var sample = $('sampleText').value || src.sample || src.key;
			var size = $('previewSize').value + 'px';
			var tgt = row.querySelector('.preview.target');
			var orig = row.querySelector('.preview.orig');
			tgt.textContent = sample;
			orig.textContent = sample;
			tgt.style.fontSize = size;
			orig.style.fontSize = Math.round(parseInt($('previewSize').value, 10) * 0.7) + 'px';
			ABR.fonts.applyPreview(tgt, f, f ? null : (m.ps ? { family: m.ps } : { family: $('fallbackFont').value }));
			ABR.fonts.applyPreview(orig, ABR.fonts.autoMatch(src), src);
			tgt.title = f ? f.family + ' ' + f.style + ' (' + f.ps + ')' : (m.ps || 'fonte reserva');
			updateFontCounts();
		}

		if (fam) {
			var cur = ABR.fonts.get(m.ps);
			if (cur) { fam.value = cur.family; fillStyles(cur.family, cur.ps); }
			fam.onchange = function () {
				var styles = stylesOf(fam.value);
				// mantém o estilo mais parecido com o original
				var pick = styles.length ? (ABR.fonts.autoMatch({ key: fam.value, family: fam.value, bold: src.bold, italic: src.italic, type: 'pptx' }) || styles[0]) : null;
				fillStyles(fam.value, pick ? pick.ps : '');
				m.ps = pick ? pick.ps : '';
				m.manual = true;
				rememberMap();
				refresh();
			};
			sty.onchange = function () {
				m.ps = sty.value;
				m.manual = true;
				rememberMap();
				refresh();
			};
		}
		if (psIn) {
			psIn.value = m.ps || '';
			psIn.onchange = function () {
				m.ps = psIn.value.trim();
				m.manual = true;
				rememberMap();
				refresh();
			};
		}
		scale.onchange = function () {
			m.scale = Math.max(10, Math.min(400, parseFloat(scale.value) || 100));
			scale.value = m.scale;
			m.manual = m.manual || !!m.ps;
			rememberMap();
		};
		row.querySelector('.src').ondblclick = function () {
			ABR.callHost('abridor_selectLayers', [src.key]);
		};
		refresh();
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
				sample: (src.sample || '').slice(0, 60)
			};
		}
		return out;
	}

	function loadInstalledFonts() {
		familyOptionsHTML = null;
		ABR.fonts.previewCache = {};
		return ABR.fonts.load().then(function () {
			if (!ABR.fonts.supported) {
				status('esta versão do After Effects não lista as fontes (necessário AE 2024+). digite os nomes PostScript.');
			}
		}).catch(function (e) {
			ABR.fonts.supported = false;
			status('não foi possível ler as fontes do After Effects: ' + e.message, true);
		});
	}

	function scanProject() {
		setBusy(true);
		status('lendo fontes das camadas do projeto…');
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
			renderFonts();
			status(n ? n + ' fontes encontradas nas camadas do projeto.' : 'nenhuma camada criada pelo ABRIDOR no projeto.');
		}).catch(function (e) {
			status('erro: ' + e.message, true);
		}).then(function () { setBusy(false); });
	}

	function applyFonts() {
		var scope = $('applyScope').value;
		var path = ABR.fs.join(ABR.fs.tmpDir(), 'abridor_fontmap.json');
		try {
			ABR.fs.mkdirp(ABR.fs.tmpDir());
			ABR.fs.writeText(path, JSON.stringify({ map: fontMapForHost() }));
		} catch (e) {
			status('erro ao gravar arquivo temporário: ' + e.message, true);
			return;
		}
		setBusy(true);
		status('aplicando fontes…');
		ABR.callHostJSON('abridor_applyFonts', [path, scope]).then(function (res) {
			status(res.layers + ' camadas atualizadas em ' + res.comps + ' comps.');
			setLog(res.failed || []);
		}).catch(function (e) {
			status('erro: ' + e.message, true);
		}).then(function () { setBusy(false); });
	}

	// ------------------------------------------------------ criação ---------
	function refFolder() {
		var dir = ABR.fs.join(ABR.fs.dirname(state.path), state.name + '_ABRIDOR');
		try {
			ABR.fs.mkdirp(dir);
			var probe = ABR.fs.join(dir, '.abridor');
			ABR.fs.writeText(probe, 'ok');
			ABR.fs.remove(probe);
			return dir;
		} catch (e) {
			dir = ABR.fs.join(ABR.fs.tmpDir(), state.name + '_ABRIDOR');
			ABR.fs.mkdirp(dir);
			return dir;
		}
	}

	function renderRef(pg, S) {
		if (state.doc.type === 'pdf') return state.doc.pdf.renderToSize(pg.index, S.width, S.height, S.fit);
		return ABR.renderPptxPage(pg, S.width, S.height, S.fit).then(function (c) { return c.toDataURL('image/png'); });
	}

	function stripPage(pg) {
		return pg.texts.map(function (t) {
			var o = {};
			for (var k in t) if (k !== 'source') o[k] = t[k];
			return o;
		});
	}

	function build() {
		if (state.busy || !state.doc) return;
		var S = settings();
		var idx = selectedIndexes();
		if (!idx.length) { status('nenhuma página selecionada.', true); return; }
		saveSettings();
		setBusy(true);
		setLog([]);
		var log = [];
		var job = {
			docName: state.name,
			settings: {
				width: S.width, height: S.height, par: 1, fps: S.fps, fit: S.fit,
				master: S.master, masterName: S.prefix + ' MASTER',
				refImages: S.refImages, refOpacity: S.refOpacity,
				fallbackFont: S.fallbackFont
			},
			fontMap: fontMapForHost(),
			pages: []
		};

		var jobPath = ABR.fs.join(ABR.fs.tmpDir(), 'abridor_job.json');
		var dir = null;
		var chain = Promise.resolve();

		if (S.refImages) {
			dir = refFolder();
			idx.forEach(function (i, n) {
				chain = chain.then(function () {
					var pg = state.doc.pages[i];
					status('gerando imagem de referência ' + (n + 1) + ' de ' + idx.length + '…');
					progress(n / idx.length * 0.3);
					if (state.extImages[i]) return state.extImages[i];
					var file = ABR.fs.join(dir, 'ref_' + pad(pg.number, 3) + '_' + S.width + 'x' + S.height + '.png');
					return renderRef(pg, S).then(function (dataURL) {
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
					compName: compName(pg, i, state.doc.pages.length),
					duration: pageDuration(i),
					width: pg.width, height: pg.height,
					refImage: S.refImages ? (pg._ref || '') : '',
					refFit: state.extImages[i] ? S.fit : 'fit',
					texts: stripPage(pg)
				});
			});
			ABR.fs.mkdirp(ABR.fs.tmpDir());
			ABR.fs.writeText(jobPath, JSON.stringify(job));
			status('preparando o projeto…');
			return ABR.callHostJSON('abridor_begin', [jobPath]);
		}).then(function () {
			var c = Promise.resolve();
			job.pages.forEach(function (pg, n) {
				c = c.then(function () {
					status('criando ' + pg.compName + ' (' + (n + 1) + '/' + job.pages.length + ')…');
					progress(0.3 + n / job.pages.length * 0.65);
					return ABR.callHostJSON('abridor_buildPage', [jobPath, n]);
				}).then(function (res) {
					(res.log || []).forEach(function (l) { log.push(pg.compName + ': ' + l); });
				});
			});
			return c;
		}).then(function () {
			status('finalizando…');
			return ABR.callHostJSON('abridor_finish', [jobPath]);
		}).then(function (res) {
			progress(1);
			// remove avisos repetidos de fonte
			var seen = {};
			log = log.filter(function (l) {
				var k = l.replace(/^[^:]+: /, '');
				if (/^fonte /.test(k)) { if (seen[k]) return false; seen[k] = 1; }
				return true;
			});
			setLog(log);
			status(res.comps + ' comps criadas' + (res.master ? ' + "' + res.master + '"' : '') + '.' + (log.length ? ' veja os avisos.' : ''));
		}).catch(function (e) {
			console.error(e);
			status('erro: ' + e.message, true);
			setLog(log);
		}).then(function () {
			setBusy(false);
		});
	}

	// ------------------------------------------------------ imagens externas -
	function pickExternalImages() {
		if (!state.doc) return;
		ABR.dialog.openFolder('pasta com as imagens exportadas dos slides').then(function (dir) {
			if (!dir) return;
			var files = ABR.fs.listImages(dir);
			files.sort(function (a, b) {
				var na = parseInt((ABR.fs.basename(a).match(/\d+/g) || ['0']).pop(), 10);
				var nb = parseInt((ABR.fs.basename(b).match(/\d+/g) || ['0']).pop(), 10);
				return na - nb || a.localeCompare(b);
			});
			if (!files.length) { status('nenhuma imagem PNG/JPG na pasta.', true); return; }
			state.extImages = state.doc.pages.map(function (pg, i) { return files[i] || null; });
			if (files.length !== state.doc.pages.length) {
				status('atenção: ' + files.length + ' imagens para ' + state.doc.pages.length + ' páginas (associadas por ordem).', true);
			} else {
				status(files.length + ' imagens associadas às páginas.');
			}
			$('btnClearExt').classList.remove('hidden');
			renderGrid();
		});
	}

	// ------------------------------------------------------ eventos ---------
	function bind() {
		$('version').textContent = VERSION;

		Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
			t.onclick = function () {
				Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (x) { x.classList.toggle('active', x === t); });
				Array.prototype.forEach.call(document.querySelectorAll('.panel'), function (p) {
					p.classList.toggle('active', p.id === 'tab-' + t.dataset.tab);
				});
			};
		});

		$('btnOpen').onclick = openDocument;
		$('btnBuild').onclick = build;
		$('btnLog').onclick = function () { $('log').classList.toggle('hidden'); };

		$('selAll').onclick = function () { state.selected = state.selected.map(function () { return true; }); updateSelectionInfo(); };
		$('selNone').onclick = function () { state.selected = state.selected.map(function () { return false; }); updateSelectionInfo(); };
		$('selInvert').onclick = function () { state.selected = state.selected.map(function (s) { return !s; }); updateSelectionInfo(); };
		function applyRange() {
			if (!state.doc) return;
			var r = parseRange($('selRange').value, state.doc.pages.length);
			state.selected = state.doc.pages.map(function (p, i) { return r.indexOf(i) >= 0; });
			updateSelectionInfo();
		}
		$('selRangeApply').onclick = applyRange;
		$('selRange').onkeydown = function (e) { if (e.key === 'Enter') applyRange(); };
		$('showBoxes').onchange = renderGrid;
		$('btnExtImages').onclick = pickExternalImages;
		$('btnClearExt').onclick = function () {
			state.extImages = [];
			$('btnClearExt').classList.add('hidden');
			renderGrid();
		};

		['preset', 'compW', 'compH', 'fps', 'fit', 'duration', 'master', 'refImages', 'refOpacity', 'prefix', 'fallbackFont', 'applyScope'].forEach(function (id) {
			$(id).addEventListener('input', function () { updateCompsInfo(); saveSettings(); });
			$(id).addEventListener('change', function () { updateCompsInfo(); saveSettings(); });
		});
		$('duration').addEventListener('change', function () {
			Array.prototype.forEach.call(document.querySelectorAll('.card input[type=number]'), function (el) {
				el.placeholder = settings().duration;
			});
		});
		$('groupMode').onchange = function () { saveSettings(); parseDocument(false); };
		$('ignoreAutofit').onchange = function () { saveSettings(); parseDocument(false); };

		$('btnScan').onclick = scanProject;
		$('btnAuto').onclick = function () { autoMatch(true); renderFonts(); status('fontes associadas automaticamente.'); };
		$('btnReloadFonts').onclick = function () {
			status('recarregando fontes…');
			loadInstalledFonts().then(function () { collectFontsKeep(); renderFonts(); status(ABR.fonts.list.length + ' fontes instaladas.'); });
		};
		$('btnApplyFonts').onclick = applyFonts;
		$('fontFilter').oninput = renderFonts;
		$('sampleText').oninput = renderFonts;
		$('previewSize').oninput = function () { saveSettings(); renderFonts(); };
	}

	function collectFontsKeep() {
		for (var k in state.map) if (!state.map[k].manual) delete state.map[k];
		autoMatch(false);
	}

	function init() {
		restoreSettings();
		bind();
		updateCompsInfo();
		if (!ABR.isCEP && !global.ABR_MOCK) {
			status('abra este painel pelo After Effects (Janela > Extensões > ABRIDOR).', true);
			return;
		}
		status('carregando fontes instaladas…');
		loadInstalledFonts().then(function () {
			if (ABR.fonts.supported) status('pronto — ' + ABR.fonts.list.length + ' fontes instaladas.');
		});
	}

	ABR.app = { state: state, parseRange: parseRange, build: build, renderFonts: renderFonts, timecode: timecode };

	document.addEventListener('DOMContentLoaded', init);

})(window);
