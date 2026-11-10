/*
 * ABRIDOR · traduções
 *
 * Os textos ficam em i18n/strings.csv (uma linha por texto, uma coluna por idioma):
 *
 *   key,pt,en,es
 *   app.ready,pronto,ready,listo
 *
 * - separador vírgula ou ponto e vírgula (o do cabeçalho vale para o arquivo todo);
 *   valores com separador, aspas ou quebra de linha vão entre aspas ("" = aspas literal);
 * - \n dentro do valor vira quebra de linha;
 * - linhas vazias e começadas por # são ignoradas;
 * - {nome} é trocado pelo valor passado (ex.: t('app.pages', { n: 3 }));
 * - plural: chaves com .one e .other, usadas com tn('chave', n);
 * - célula vazia usa o português; chave sem tradução nenhuma aparece como a própria chave.
 *
 * Para um idioma novo basta acrescentar a coluna (ex.: fr) no CSV.
 *
 * HTML: data-i18n (texto), data-i18n-html (com marcação), data-i18n-title, data-i18n-placeholder.
 */
(function (global) {
	'use strict';

	var ABR = (global.ABR = global.ABR || {});
	var table = {}; // chave → { pt, en, es, … }
	var langs = [];
	var current = 'pt';
	var listeners = [];

	var NAMES = { pt: 'português', en: 'English', es: 'español' };

	/* --------------------------------------------------------------- CSV */

	function parseCSV(text) {
		text = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');

		var first = text.slice(0, text.indexOf('\n') < 0 ? text.length : text.indexOf('\n'));
		var sep = first.split(';').length > first.split(',').length ? ';' : ',';
		var rows = [];
		var row = [];
		var cell = '';
		var quoted = false;
		var i = 0;

		for (; i < text.length; i++) {
			var c = text.charAt(i);

			if (quoted) {
				if (c === '"') {
					if (text.charAt(i + 1) === '"') { cell += '"'; i++; } else quoted = false;
				} else cell += c;
			} else if (c === '"') quoted = true;
			else if (c === sep) { row.push(cell); cell = ''; }
			else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
			else cell += c;
		}

		if (cell !== '' || row.length) { row.push(cell); rows.push(row); }

		return rows;
	}

	function loadTable(text) {
		var rows = parseCSV(text);
		var head = null;

		table = {};
		langs = [];

		for (var r = 0; r < rows.length; r++) {
			var row = rows[r];
			var key = (row[0] || '').trim();

			if (!key || key.charAt(0) === '#') continue;

			if (!head) {
				head = row.map(function (h) { return h.trim().toLowerCase(); });
				langs = head.slice(1).filter(Boolean);
				continue;
			}

			var entry = {};

			for (var c = 1; c < head.length; c++) {
				if (head[c] && row[c] != null && row[c] !== '') entry[head[c]] = row[c].replace(/\\n/g, '\n');
			}

			table[key] = entry;
		}
	}

	/* --------------------------------------------------------------- leitura do arquivo */

	function readCSV() {
		// 1 · Node (CEP com --enable-nodejs)
		try {
			var req = global.require || (typeof require === 'function' ? require : null);

			if (req) {
				var fs = req('fs');
				var p = decodeURIComponent(global.location.pathname).replace(/^\/([A-Za-z]:)/, '$1');

				p = p.replace(/[^\/]*$/, '') + 'i18n/strings.csv';

				return fs.readFileSync(p, 'utf8');
			}
		} catch (e) { }

		// 2 · arquivo ao lado da página (CEP / navegador com acesso a arquivos)
		try {
			var x = new XMLHttpRequest();

			x.open('GET', 'i18n/strings.csv', false);
			x.overrideMimeType('text/plain; charset=utf-8');
			x.send(null);

			if (x.responseText) return x.responseText;
		} catch (e2) { }

		// 3 · testes
		if (global.ABR_MOCK && global.ABR_MOCK.strings) return global.ABR_MOCK.strings;

		return '';
	}

	/* --------------------------------------------------------------- idioma */

	function normalize(code) {
		code = String(code || '').toLowerCase().slice(0, 2);

		return langs.indexOf(code) >= 0 ? code : null;
	}

	// idioma do After Effects (appUILocale), senão o do sistema
	function detect() {
		var loc = '';

		try {
			if (global.__adobe_cep__) loc = JSON.parse(global.__adobe_cep__.getHostEnvironment()).appUILocale;
		} catch (e) { }

		return normalize(loc) || normalize(global.navigator && global.navigator.language) || (langs.indexOf('en') >= 0 ? 'en' : 'pt');
	}

	/* --------------------------------------------------------------- API */

	function fill(str, vars) {
		if (!vars) return str;

		return str.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? String(vars[k]) : m; });
	}

	function raw(key) {
		var e = table[key];

		if (!e) return null;

		return e[current] != null ? e[current] : e.pt != null ? e.pt : null;
	}

	// texto traduzido
	function t(key, vars) {
		var s = raw(key);

		return fill(s == null ? key : s, vars);
	}

	// plural: chave.one / chave.other ({n} já vem preenchido)
	function tn(key, n, vars) {
		var v = { n: n };

		for (var k in vars) v[k] = vars[k];

		var s = raw(key + (n === 1 ? '.one' : '.other'));

		return s == null ? t(key, v) : fill(s, v);
	}

	function has(key) { return raw(key) != null; }

	// aplica nos elementos marcados com data-i18n*
	function apply(root) {
		root = root || global.document;

		var each = function (attr, fn) {
			var list = root.querySelectorAll('[' + attr + ']');

			for (var i = 0; i < list.length; i++) fn(list[i], list[i].getAttribute(attr));
		};

		each('data-i18n', function (el, k) { el.textContent = t(k); });
		each('data-i18n-html', function (el, k) { el.innerHTML = t(k); });
		each('data-i18n-title', function (el, k) {
			el.setAttribute('title', t(k));
			if (el.hasAttribute('data-tip')) el.setAttribute('data-tip', t(k));
		});
		each('data-i18n-placeholder', function (el, k) { el.setAttribute('placeholder', t(k)); });

		if (root === global.document) global.document.documentElement.lang = current === 'pt' ? 'pt-BR' : current;
	}

	function setLang(code) {
		current = normalize(code) || detect();
		apply();

		for (var i = 0; i < listeners.length; i++) listeners[i](current);

		return current;
	}

	// só os textos do host (chaves host.*), no idioma atual, para mandar ao ExtendScript
	function hostStrings() {
		var out = {};

		for (var k in table) if (k.indexOf('host.') === 0) out[k.slice(5)] = raw(k);

		return out;
	}

	ABR.i18n = {
		load: function (text) { loadTable(text != null ? text : readCSV()); },
		parseCSV: parseCSV,
		setLang: setLang,
		detect: detect,
		apply: apply,
		has: has,
		hostStrings: hostStrings,
		onChange: function (fn) { listeners.push(fn); },
		get lang() { return current; },
		get langs() { return langs.slice(); },
		name: function (code) { return NAMES[code] || code; }
	};

	ABR.t = t;
	ABR.tn = tn;

	// carrega já: os outros scripts usam t() ao montar a interface
	ABR.i18n.load();
	current = detect();
})(window);
