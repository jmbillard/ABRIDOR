// Playwright com os padrões dos testes do ABRIDOR:
// - acesso a arquivos locais (o painel lê i18n/strings.csv ao lado do index.html);
// - idioma do navegador = ABR_LANG (padrão pt-BR), que o painel usa no modo "automático".
const pw = require('playwright');
const LOCALE = process.env.ABR_LANG || 'pt-BR';

function wrapBrowser(b) {
	const newContext = b.newContext.bind(b), newPage = b.newPage.bind(b);
	b.newContext = (o) => newContext(Object.assign({ locale: LOCALE }, o));
	b.newPage = (o) => newPage(Object.assign({ locale: LOCALE }, o));
	return b;
}

const chromium = Object.create(pw.chromium);
chromium.launch = async (o) => {
	o = Object.assign({}, o);
	o.args = (o.args || []).concat(['--allow-file-access-from-files', '--lang=' + LOCALE]);
	return wrapBrowser(await pw.chromium.launch(o));
};

module.exports = Object.assign({}, pw, { chromium, LOCALE });

// idioma de 2 letras e pasta dos prints do README: docs/img (pt) ou docs/img/<idioma>
const LANG = LOCALE.toLowerCase().slice(0, 2);
const DOCS_IMG = require('path').resolve(__dirname, '..', 'docs/img', LANG === 'pt' ? '' : LANG);

// para usar dentro de page.evaluate/waitForFunction: o texto da chave vira regex ({x} = qualquer coisa)
const I18N_HELPERS = () => {
	window.__rx = (key, vars) => new RegExp(ABR.t(key, vars).replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\w+\}/g, '.*?'));
	window.__has = (id, ...keys) => { if (!window.ABR || !ABR.t) return false; const s = document.getElementById(id).textContent; return keys.some((k) => window.__rx(k).test(s)); };
};

module.exports.LANG = LANG;
module.exports.DOCS_IMG = DOCS_IMG;
module.exports.I18N_HELPERS = I18N_HELPERS;
