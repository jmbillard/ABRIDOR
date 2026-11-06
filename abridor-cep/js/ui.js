/*
 * ABRIDOR - ícones e utilitários de interface
 *
 * - ícones em SVG (traço, 24x24) gerados como string
 * - expandir / recolher com animação de altura (sem depender de CSS novo do Chromium do CEP)
 * - controles segmentados com marcador deslizante
 * - toasts
 */
(function (global) {
	'use strict';

	var ABR = global.ABR = global.ABR || {};
	var UI = ABR.ui = {};

	// ------------------------------------------------------------ ícones ---
	var P = {
		open: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 17v-6"/><path d="M9.5 13.5 12 11l2.5 2.5"/>',
		doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
		pages: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
		comps: '<path d="M12 3 21 8l-9 5-9-5z"/><path d="m3 12.5 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
		fonts: '<path d="M3 7V5h11v2"/><path d="M8.5 5v14"/><path d="M6.5 19h4"/><path d="M17 9v8.5a1.5 1.5 0 0 0 1.5 1.5h1.5"/><path d="M15 12h5"/>',
		check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
		x: '<path d="M6 6l12 12M18 6 6 18"/>',
		eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
		eyeOff: '<path d="M9.9 5.2A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.6 3.4M6.6 6.6C3.7 8.5 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="m3 3 18 18"/>',
		clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
		image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-9 9"/>',
		wand: '<path d="m4 20 11-11"/><path d="m13.5 7.5 3 3"/><path d="M18 2.5v3M16.5 4h3M20 10v2M19 11h2M9 3v2M8 4h2"/>',
		refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/>',
		search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
		chevron: '<path d="m6 9 6 6 6-6"/>',
		plus: '<path d="M12 5v14M5 12h14"/>',
		minus: '<path d="M5 12h14"/>',
		master: '<rect x="3" y="14" width="10" height="6" rx="1.5"/><rect x="7.5" y="9" width="10" height="6" rx="1.5"/><rect x="11" y="4" width="10" height="6" rx="1.5"/>',
		alert: '<path d="M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>',
		project: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10.5v6M9.5 14l2.5 2.5 2.5-2.5"/>',
		sparkle: '<path d="M12 3c.6 4.2 2.3 6.4 6.5 7-4.2.6-5.9 2.8-6.5 7-.6-4.2-2.3-6.4-6.5-7 4.2-.6 5.9-2.8 6.5-7z"/><path d="M19 15.5c.25 1.6.9 2.25 2.5 2.5-1.6.25-2.25.9-2.5 2.5-.25-1.6-.9-2.25-2.5-2.5 1.6-.25 2.25-.9 2.5-2.5z"/>',
		swap: '<path d="M4 8h14l-3.5-3.5"/><path d="M20 16H6l3.5 3.5"/>',
		all: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="m8 12.3 2.8 2.7L16.5 9"/>',
		none: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/>',
		invert: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M20.5 3.5 3.5 20.5V6.5a3 3 0 0 1 3-3z" fill="currentColor" stroke="none" opacity=".55"/>',
		range: '<path d="M4 9h16M4 15h16M10 4 8 20M16 4l-2 16"/>',
		boxes: '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="6.5" y="7.5" width="7" height="3.5" rx=".6" stroke-dasharray="2 1.6"/><rect x="10.5" y="13" width="7" height="3.5" rx=".6" stroke-dasharray="2 1.6"/>',
		monitor: '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8.5 21h7M12 17v4"/>',
		tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
		tune: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
		fit: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><rect x="6.5" y="8" width="11" height="8" rx="1"/>',
		fill: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M6 3v4M18 3v4M6 17v4M18 17v4" opacity=".6"/><rect x="5" y="7.5" width="14" height="9" rx="1" fill="currentColor" stroke="none" opacity=".35"/>',
		para: '<path d="M4 6h16M4 10h16M4 14h10"/><path d="M4 19h16" opacity=".35"/>',
		line: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/><circle cx="2" cy="7" r=".1"/>',
		autofit: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/><path d="m17 14 2 2 2-2" />',
		type: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/>',
		layers: '<path d="M12 3 21 8l-9 5-9-5z"/><path d="m3 12.5 9 5 9-5"/>',
		info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
		arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
		split: '<path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h13"/><path d="m18 10 3 2-3 2"/>',
		sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
		moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
		themeAuto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>'
	};

	UI.icon = function (name, cls) {
		return '<svg class="ico ' + (cls || '') + ' ico-' + name + '" viewBox="0 0 24 24" aria-hidden="true">' + (P[name] || '') + '</svg>';
	};

	// substitui <i data-icon="nome"></i> pelo SVG
	UI.hydrateIcons = function (root) {
		Array.prototype.forEach.call((root || document).querySelectorAll('i[data-icon]'), function (i) {
			var wrap = document.createElement('span');
			wrap.innerHTML = UI.icon(i.dataset.icon, i.className);
			i.parentNode.replaceChild(wrap.firstChild, i);
		});
	};

	// ------------------------------------------------- movimento reduzido --
	UI.reduced = function () {
		return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
	};

	// ------------------------------------------------------ expandir -------
	// anima a altura entre 0 e o conteúdo; o estado fica na classe "open"
	UI.collapse = function (el, open, instant) {
		if (!el) return;
		open = !!open;
		if (el.classList.contains('open') === open && el.dataset.ready) return;
		el.dataset.ready = '1';
		el.classList.toggle('open', open);
		if (instant || UI.reduced()) {
			el.style.height = open ? 'auto' : '0px';
			el.style.opacity = open ? '1' : '0';
			return;
		}
		var start = el.getBoundingClientRect().height;
		el.style.height = 'auto';
		var end = open ? el.scrollHeight : 0;
		el.style.height = start + 'px';
		el.style.opacity = open ? '0' : '1';
		// força o layout antes da transição
		void el.offsetHeight;
		el.style.height = end + 'px';
		el.style.opacity = open ? '1' : '0';
		var done = function (e) {
			if (e && e.target !== el) return;
			el.removeEventListener('transitionend', done);
			if (el.classList.contains('open')) el.style.height = 'auto';
		};
		el.addEventListener('transitionend', done);
	};

	// ------------------------------------------------------ segmentado -----
	// <div class="seg" data-value=".."><button data-value="a">..</button>...</div>
	UI.seg = function (el, onChange) {
		var ink = document.createElement('span');
		ink.className = 'seg-ink';
		el.insertBefore(ink, el.firstChild);
		var api = {
			el: el,
			get value() { return el.dataset.value; },
			set: function (v, silent) {
				el.dataset.value = v;
				var active = null;
				Array.prototype.forEach.call(el.querySelectorAll('button'), function (b) {
					var on = b.dataset.value === String(v);
					b.classList.toggle('on', on);
					b.setAttribute('aria-pressed', on ? 'true' : 'false');
					if (on) active = b;
				});
				api.place(active);
				if (!silent && onChange) onChange(v);
			},
			place: function (b) {
				b = b || el.querySelector('button.on');
				if (!b || !el.offsetWidth) { ink.style.opacity = '0'; return; }
				ink.style.opacity = '1';
				ink.style.width = b.offsetWidth + 'px';
				ink.style.height = b.offsetHeight + 'px';
				ink.style.transform = 'translate(' + b.offsetLeft + 'px,' + b.offsetTop + 'px)';
			}
		};
		el.addEventListener('click', function (e) {
			var b = e.target.closest('button');
			if (b && el.contains(b) && !b.disabled) api.set(b.dataset.value);
		});
		UI.segs.push(api);
		return api;
	};
	UI.segs = [];
	UI.relayout = function () { UI.segs.forEach(function (s) { s.place(); }); };
	global.addEventListener('resize', function () { UI.relayout(); });

	// ------------------------------------------------------ toast ----------
	var toastTimer = null;
	UI.toast = function (msg, kind, sticky) {
		var t = document.getElementById('toast');
		if (!t) return;
		clearTimeout(toastTimer);
		t.className = 'toast ' + (kind || 'info');
		t.innerHTML = UI.icon(kind === 'error' ? 'alert' : (kind === 'ok' ? 'check' : 'info')) + '<span></span>';
		t.querySelector('span').textContent = msg;
		void t.offsetWidth;
		t.classList.add('show');
		if (!sticky) toastTimer = setTimeout(function () { t.classList.remove('show'); }, kind === 'error' ? 7000 : 3200);
	};
	UI.hideToast = function () {
		var t = document.getElementById('toast');
		if (t) t.classList.remove('show');
	};

	// reinicia uma animação CSS (classe) num elemento
	UI.replay = function (el, cls) {
		if (!el) return;
		el.classList.remove(cls);
		void el.offsetWidth;
		el.classList.add(cls);
	};

})(window);
