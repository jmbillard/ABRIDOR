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
