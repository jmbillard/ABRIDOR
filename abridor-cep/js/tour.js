/*
 * ABRIDOR - tour guiado
 *
 * Aparece sozinho na primeira vez que um documento é aberto (usa os dados dele)
 * e pode ser revisto pelo botão "?" do topo. Destaque recortado no elemento real,
 * balão com passo atual, voltar / próximo / pular. Teclado: → Enter ← Esc.
 */
(function (global) {
	'use strict';

	var ABR = global.ABR;
	var UI = ABR.ui;
	var icon = UI.icon;
	var KEY = 'abridor.tourDone';

	var T = ABR.tour = { active: false, pending: false };
	var steps = [], cur = 0, spot = null, card = null, blocker = null, welcome = null;

	function done() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
	function markDone() { try { localStorage.setItem(KEY, '1'); } catch (e) { } }
	function $(s) { return document.querySelector(s); }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

	// passos montados com os dados do documento aberto
	function buildSteps() {
		var st = ABR.state;
		var out = [];
		if (!st.doc) {
			out.push({ tab: 'pages', sel: '#dropZone', icon: 'open', title: 'comece por aqui',
				text: 'abra um <b>PPTX</b> ou <b>PDF</b> (ou arraste o arquivo). o tour continua com o documento aberto.', last: true, pend: true });
			return out;
		}
		var n = st.doc.pages.length;
		out.push({ tab: 'pages', sel: '#grid', icon: 'pages', title: 'escolha as páginas',
			text: 'este documento tem <b>' + n + ' página' + (n === 1 ? '' : 's') + '</b>. cada miniatura vira uma comp: <b>clique</b> para tirar as que não precisa. com <kbd>shift</kbd>, marca um intervalo.' });
		var firstSel = st.selected.indexOf(true);
		if (firstSel >= 0) {
			out.push({ tab: 'pages', sel: '.page[data-i="' + firstSel + '"] .dur', pad: 5, icon: 'clock', title: 'duração por página', showDur: firstSel,
				text: 'o relógio muda a duração <b>só desta página</b>. a duração padrão fica na aba comps.' });
		}
		out.push({ tab: 'comps', sel: '#tab-comps .block', icon: 'comps', title: 'formato das comps',
			text: 'resolução e frame rate. o padrão é <b>Full HD 29,97</b>; 4K está a um clique.' });
		var missing = Array.prototype.map.call(document.querySelectorAll('#fontList .font-group.used .font.missing'), function (e) { return e.dataset.key; });
		if (missing.length) {
			var names = missing.slice(0, 3).join(', ') + (missing.length > 3 ? ' e mais ' + (missing.length - 3) : '');
			out.push({ tab: 'fonts', sel: '#fontList .font-group.used .font.missing', all: true, icon: 'fonts',
				title: missing.length + ' fonte' + (missing.length === 1 ? '' : 's') + ' não instalada' + (missing.length === 1 ? '' : 's'),
				text: '<b>' + esc(names) + '</b> ' + (missing.length === 1 ? 'não está' : 'não estão') + ' neste computador. clique numa fonte para escolher a substituta.' });
		} else if ($('#fontList .font')) {
			out.push({ tab: 'fonts', sel: '#fontList .font-group.used .font', icon: 'fonts', title: 'fontes encontradas',
				text: 'todas as fontes do documento foram associadas. clique numa fonte para trocar por outra.' });
		}
		out.push({ tab: ABR.state.tab === 'pages' ? 'pages' : 'fonts', keepTab: true, sel: '#btnBuild', pad: 4, radius: 16, icon: 'sparkle', title: 'tudo pronto',
			text: 'crie as comps aqui. as fontes podem ser trocadas depois, mesmo com as comps prontas. para rever este tour, use o <b>?</b> lá em cima.', last: true });
		return out;
	}

	function rectOf(s) {
		var els = Array.prototype.slice.call(document.querySelectorAll(s.sel), 0, s.all ? 99 : 1);
		if (!els.length) return null;
		var r = { left: 1e9, top: 1e9, right: -1e9, bottom: -1e9 };
		els.forEach(function (e) {
			var b = e.getBoundingClientRect();
			r.left = Math.min(r.left, b.left); r.top = Math.min(r.top, b.top);
			r.right = Math.max(r.right, b.right); r.bottom = Math.max(r.bottom, b.bottom);
		});
		return r;
	}

	function place() {
		var s = steps[cur];
		if (!s) return;
		var r = rectOf(s);
		if (!r) { next(); return; }
		var pad = s.pad || 8, vw = global.innerWidth, vh = global.innerHeight;
		var L = Math.max(4, r.left - pad), R = Math.min(vw - 4, r.right + pad);
		var Tp = Math.max(4, r.top - pad), B = Math.min(vh - 4, r.bottom + pad);
		Object.assign(spot.style, { left: L + 'px', top: Tp + 'px', width: (R - L) + 'px', height: (B - Tp) + 'px', borderRadius: (s.radius || 14) + 'px' });

		var h = card.offsetHeight;
		var cls = 'below', top = B + 14;
		if (top + h > vh - 8) {
			if (Tp - 14 - h > 8) { cls = 'above'; top = Tp - 14 - h; }
			else { cls = 'inside'; top = vh - h - 12; }
		}
		card.className = 'tour-card ' + cls;
		card.style.top = Math.round(top) + 'px';
		var cb = card.getBoundingClientRect();
		var ax = Math.max(24, Math.min(cb.width - 24, (L + R) / 2 - cb.left - 7));
		card.querySelector('.t-arrow').style.left = ax + 'px';
	}

	function render() {
		var s = steps[cur];
		if (UI.tip) UI.tip.hide();
		UI.hideToast();
		Array.prototype.forEach.call(document.querySelectorAll('.page.tour-show'), function (e) { e.classList.remove('tour-show'); });
		if (s.showDur !== undefined) {
			var pg = $('.page[data-i="' + s.showDur + '"]');
			if (pg) pg.classList.add('tour-show');
		}
		var total = steps.length;
		card.innerHTML = '<i class="t-arrow"></i>' +
			'<div class="tour-top"><span class="tour-step">' + (total > 1 ? 'passo ' + (cur + 1) + ' de ' + total : 'tour') + '</span><button class="tour-skip">' + (s.pend ? 'fechar' : 'pular tour') + '</button></div>' +
			'<h4>' + icon(s.icon) + s.title + '</h4><p>' + s.text + '</p>' +
			'<div class="tour-foot"><div class="tour-dots">' + (total > 1 ? steps.map(function (x, k) { return '<i class="' + (k === cur ? 'on' : '') + '"></i>'; }).join('') : '') + '</div>' +
			(cur ? '<button class="back">voltar</button>' : '') +
			'<button class="next">' + (s.pend ? 'entendi' : (s.last ? 'concluir' : 'próximo ' + icon('arrow'))) + '</button></div>';
		card.style.animation = 'none';
		void card.offsetWidth;
		card.style.animation = '';
		card.querySelector('.next').onclick = next;
		card.querySelector('.tour-skip').onclick = function () { finish(!s.pend); };
		var back = card.querySelector('.back');
		if (back) back.onclick = prev;
		var needTab = !s.keepTab && ABR.state.tab !== s.tab;
		if (needTab) ABR.app.showTab(s.tab);
		var el = $(s.sel);
		if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
		setTimeout(place, needTab ? 420 : 30);
		setTimeout(function () { var b = card.querySelector('.next'); if (b) b.focus(); }, 60);
	}

	function next() {
		if (cur >= steps.length - 1) { finish(!steps[cur].pend); return; }
		cur++;
		render();
	}

	function prev() {
		if (cur > 0) { cur--; render(); }
	}

	function onKey(e) {
		if (!T.active) return;
		if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (welcome) begin(); else next(); }
		else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); prev(); }
		else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(true); }
		else if (!/^(Shift|Control|Meta|Alt|Tab)$/.test(e.key)) e.stopPropagation();
	}

	function onResize() { if (T.active && !welcome) place(); }

	function mount() {
		T.active = true;
		document.body.classList.add('touring');
		blocker = document.createElement('div');
		blocker.className = 'tour-block';
		document.body.appendChild(blocker);
		document.addEventListener('keydown', onKey, true);
		global.addEventListener('resize', onResize);
	}

	function begin() {
		if (welcome) { welcome.parentNode.removeChild(welcome); welcome = null; }
		spot = document.createElement('div');
		spot.className = 'tour-spot';
		document.body.appendChild(spot);
		card = document.createElement('div');
		card.className = 'tour-card';
		document.body.appendChild(card);
		cur = 0;
		render();
	}

	function finish(mark) {
		if (mark) markDone();
		T.active = false;
		document.body.classList.remove('touring');
		document.removeEventListener('keydown', onKey, true);
		global.removeEventListener('resize', onResize);
		Array.prototype.forEach.call(document.querySelectorAll('.page.tour-show'), function (e) { e.classList.remove('tour-show'); });
		[spot, card, blocker, welcome].forEach(function (el) {
			if (!el) return;
			el.classList.add('tour-out');
			setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
		});
		spot = card = blocker = welcome = null;
		if (steps[cur] && steps[cur].pend) T.pending = true;
	}

	// boas-vindas + passos (withWelcome = primeira vez)
	T.start = function (withWelcome) {
		if (T.active) return;
		steps = buildSteps();
		if (!steps.length) return;
		UI.hideToast();
		mount();
		if (!withWelcome || !ABR.state.doc) { begin(); return; }
		welcome = document.createElement('div');
		welcome.className = 'tour-welcome';
		var logo = $('#logoMark svg');
		welcome.innerHTML = '<div class="tour-card"><div class="w-logo">' + (logo ? logo.outerHTML : '') + '</div>' +
			'<h4>bem-vindo ao ABRIDOR</h4><p>em <b>' + steps.length + ' passos rápidos</b> você vê onde fica cada coisa, usando o documento que acabou de abrir.</p>' +
			'<div class="tour-foot"><button class="back">agora não</button><button class="next">começar o tour ' + icon('arrow') + '</button></div></div>';
		document.body.appendChild(welcome);
		welcome.querySelector('.next').onclick = begin;
		welcome.querySelector('.back').onclick = function () { finish(true); };
		setTimeout(function () { var b = welcome && welcome.querySelector('.next'); if (b) b.focus(); }, 60);
	};

	// chamado quando um documento termina de carregar
	T.documentReady = function () {
		if (T.active) return;
		if (T.pending) { T.pending = false; setTimeout(function () { T.start(false); }, 700); return; }
		if (!done()) setTimeout(function () { if (!T.active) T.start(true); }, 900);
	};

})(window);
