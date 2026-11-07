// Verifica o tour guiado no painel real (AE simulado) e grava os prints.
// uso: node tests/tour_check.js <saída> [--docs]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), OUT = path.resolve(process.argv[2] || 'out');
const DOCS = process.argv[3] === '--docs';
fs.mkdirSync(OUT, { recursive: true });
const PPTX = path.join(ROOT, 'test files/exemplo_creditos.pptx');
const FONTS = [];
const fam = (f, st) => st.forEach(([s, p]) => FONTS.push({ f, s, p, n: f + ' ' + s, l: '' }));
fam('Inter', [['Light', 'Inter-Light'], ['Regular', 'Inter-Regular'], ['Bold', 'Inter-Bold'], ['Black', 'Inter-Black']]);
fam('Carlito', [['Regular', 'Carlito'], ['Bold', 'Carlito-Bold']]);
const check = (c, m) => console.log((c ? '✓ ' : '✗ ') + m);

(async () => {
	const b = await chromium.launch();
	const p = await b.newPage({ viewport: { width: 460, height: 860 }, deviceScaleFactor: 2, colorScheme: 'dark' });
	p.on('pageerror', (e) => console.log('ERR', e.message));
	const b64 = fs.readFileSync(PPTX).toString('base64');
	await p.addInitScript(({ b64, PPTX, FONTS }) => {
		window.ABR_MOCK = { openFile: () => PPTX, readBinary: () => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }, writeText() { }, writeDataURL() { }, callHost: (fn) => fn === 'abridor_getFonts' ? JSON.stringify({ fonts: FONTS }) : JSON.stringify({ ok: true }) };
		if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.clear(); }
	}, { b64, PPTX, FONTS });
	const go = async () => { await p.goto('file://' + path.join(ROOT, 'abridor-cep/index.html')); await p.waitForTimeout(600); };
	const open = async () => { await p.evaluate(() => document.getElementById(document.body.classList.contains('is-empty') ? 'dropZone' : 'docChip').click()); await p.waitForFunction(() => /carregado/.test(document.getElementById('status').textContent)); };
	const shot = (name) => p.screenshot({ path: path.join(OUT, name) });
	const stepTitle = () => p.evaluate(() => { const h = document.querySelector('.tour-card:not(.tour-out) h4'); return h ? h.textContent : null; });

	await go();
	await open();
	await p.waitForTimeout(1600);
	check(!!(await p.$('.tour-welcome')), '1º documento: boas-vindas aparecem sozinhas');
	await shot(DOCS ? '46-tour-boas-vindas.png' : 't0.png');
	await p.keyboard.press('Enter'); await p.waitForTimeout(900);
	const titles = [];
	for (let i = 0; i < 6; i++) {
		const t = await stepTitle();
		if (!t) break;
		titles.push(t);
		if (i === 3) await shot(DOCS ? '47-tour-passo.png' : 't4.png');
		await p.keyboard.press('ArrowRight'); await p.waitForTimeout(800);
	}
	check(titles.length === 5, 'passos: ' + titles.join(' → '));
	check(!(await p.$('.tour-spot')) && !(await p.$('.tour-block')), 'concluir fecha o tour');
	check(await p.evaluate(() => localStorage.getItem('abridor.tourDone')) === '1', 'tour marcado como visto');
	// ← volta
	await p.click('#helpBtn'); await p.waitForTimeout(600);
	check(!(await p.$('.tour-welcome')) && (await stepTitle()) === 'escolha as páginas', 'botão ? começa direto no passo 1');
	await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(500);
	check((await stepTitle()) === 'escolha as páginas', '← volta um passo');
	// cliques fora do balão não atingem o painel
	const before = await p.evaluate(() => ABR.state.selected.join());
	await p.mouse.click(120, 260); await p.waitForTimeout(200);
	check(await p.evaluate(() => ABR.state.selected.join()) === before, 'clique fora do balão não mexe no painel');
	await p.keyboard.press('Escape'); await p.waitForTimeout(400);
	check(!(await p.$('.tour-card:not(.tour-out)')), 'Esc fecha');
	// documento seguinte não mostra o tour de novo
	await open(); await p.waitForTimeout(1600);
	check(!(await p.$('.tour-welcome')), '2º documento: tour não aparece de novo');
	// "?" sem documento: aponta para a área de abrir e continua depois
	await p.evaluate(() => localStorage.removeItem('abridor.recents'));
	await go();
	await p.click('#helpBtn'); await p.waitForTimeout(600);
	check((await stepTitle()) === 'comece por aqui', '? sem documento aponta para a área de abrir');
	await p.keyboard.press('Enter'); await p.waitForTimeout(400);
	await open(); await p.waitForTimeout(1500);
	check((await stepTitle()) === 'escolha as páginas', 'ao abrir o documento, o tour continua');
	await b.close();
})();
