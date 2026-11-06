// Exercita os recursos de "uso mais intuitivo" no painel real (AE simulado) e grava prints.
// uso: node tests/features_check.js <saída>
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), OUT = path.resolve(process.argv[2] || 'out');
fs.mkdirSync(OUT, { recursive: true });
const PPTX = path.join(ROOT, 'test files/exemplo_creditos.pptx');
const FONTS = [];
const fam = (f, st) => st.forEach(([s, p]) => FONTS.push({ f, s, p, n: f + ' ' + s, l: '' }));
fam('Inter', [['Light', 'Inter-Light'], ['Regular', 'Inter-Regular'], ['Bold', 'Inter-Bold'], ['Black', 'Inter-Black']]);
fam('Carlito', [['Regular', 'Carlito'], ['Bold', 'Carlito-Bold'], ['Italic', 'Carlito-Italic']]);
fam('Caladea', [['Regular', 'Caladea-Regular'], ['Bold', 'Caladea-Bold']]);
fam('Liberation Sans', [['Regular', 'LiberationSans'], ['Bold', 'LiberationSans-Bold']]);
const check = (cond, msg) => console.log((cond ? '✓ ' : '✗ ') + msg);

(async () => {
	const b = await chromium.launch();
	const p = await b.newPage({ viewport: { width: 460, height: 860 }, deviceScaleFactor: 2, colorScheme: 'dark' });
	p.on('pageerror', (e) => console.log('ERR', e.message));
	const b64 = fs.readFileSync(PPTX).toString('base64');
	await p.addInitScript(({ b64, PPTX, FONTS }) => {
		const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
		window.__calls = [];
		window.ABR_MOCK = {
			openFile: () => PPTX,
			exists: (pp) => pp === PPTX || /Template/.test(pp),
			readBinary: () => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; },
			writeText() { }, writeDataURL() { },
			callHost: (fn, args) => {
				window.__calls.push(fn + '(' + args.join(',') + ')');
				if (fn === 'abridor_getFonts') return JSON.stringify({ fonts: FONTS });
				if (fn === 'abridor_inspect') return JSON.stringify({ ok: true, version: '23.6x15', ranges: false, next: 2, existing: { name: 'exemplo_creditos', comps: 6, created: new Date(Date.now() - 3 * 3600e3).toString() } });
				if (fn === 'abridor_buildPage') return delay(150, JSON.stringify({ ok: true, texts: 3, updated: 3, added: 0, left: 0, isNew: false, log: [] }));
				if (fn === 'abridor_finish') return JSON.stringify({ ok: true, comps: 5, mode: 'texts', master: 'EXEMPLO CREDITOS MASTER', masterId: 77, folderId: 12 });
				return JSON.stringify({ ok: true });
			}
		};
		if (!sessionStorage.getItem('seeded')) {
			sessionStorage.setItem('seeded', '1');
			localStorage.clear();
			localStorage.setItem('abridor.recents', JSON.stringify([
				{ path: PPTX, name: 'exemplo_creditos.pptx', type: 'pptx', pages: 6, t: Date.now() - 26 * 3600e3 },
				{ path: '/x/Template Dramaturgia Curta.pdf', name: 'Template Dramaturgia Curta.pdf', type: 'pdf', pages: 14, t: Date.now() - 3 * 864e5 },
				{ path: '/x/abertura_novela_v3.pptx', name: 'abertura_novela_v3.pptx', type: 'pptx', pages: 9, t: Date.now() - 9 * 864e5 }
			]));
		}
	}, { b64, PPTX, FONTS });
	await p.goto('file://' + path.join(ROOT, 'abridor-cep/index.html'));
	await p.addStyleTag({ content: '.tip{display:none!important}' });
	await p.waitForTimeout(700);
	// com --docs, grava com os nomes usados no README
	const DOCS = { 'f8-recentes.png': '19-recentes.png', 'f1-aviso.png': '43-aviso-fontes.png', 'f6-intervalo.png': '15-intervalo-shift.png',
		'f1-folha.png': '44-antes-de-criar.png', 'f2-seletor.png': '33-seletor-fontes.png', 'f3-familia.png': '34-familia.png', 'f7-concluido.png': '45-concluido-acoes.png' };
	const shot = (n, clip) => p.screenshot({ path: path.join(OUT, process.argv[3] === '--docs' ? DOCS[n] : n), clip });

	// 8 · recentes
	check(await p.$$eval('.recent-item', (e) => e.length) === 3, 'recentes: 3 itens na tela vazia');
	check(await p.$$eval('.recent-item.missing', (e) => e.length) === 1, 'recentes: arquivo sumido aparece apagado');
	await p.hover('.recent-item:nth-of-type(1)'); await p.waitForTimeout(300);
	await p.setViewportSize({ width: 460, height: 700 }); await shot('f8-recentes.png'); await p.setViewportSize({ width: 460, height: 860 });
	await p.click('.recent-item:not(.missing) >> nth=0');
	await p.waitForFunction(() => /carregado/.test(document.getElementById('status').textContent));
	await p.evaluate(() => ABR.ui.hideToast());
	await p.waitForTimeout(800);
	check(await p.$eval('#docName', (e) => e.textContent) === 'exemplo_creditos.pptx', 'recentes: clique reabre o documento');

	// 1 · aviso no rodapé
	check(!(await p.$eval('#preChip', (e) => e.classList.contains('hidden'))), 'aviso no rodapé visível com fontes faltando: "' + (await p.$eval('#preChip', (e) => e.textContent)) + '"');
	await p.mouse.move(1, 700);
	await shot('f1-aviso.png', { x: 0, y: 640, width: 460, height: 220 });

	// 6 · shift + clique
	await p.click('.page:nth-child(2) .thumb'); await p.click('.page:nth-child(2) .thumb'); // âncora na página 2
	await p.keyboard.down('Shift');
	await p.hover('.page:nth-child(5) .thumb'); await p.waitForTimeout(300);
	check(await p.$$eval('.page.range', (e) => e.length) === 4, 'shift: prévia destaca as páginas 2–5');
	await shot('f6-intervalo.png', { x: 0, y: 90, width: 460, height: 600 });
	await p.click('.page:nth-child(5) .thumb');
	await p.keyboard.up('Shift');
	const sel = await p.evaluate(() => ABR.state.selected.map((v) => v ? 1 : 0).join(''));
	check(sel === '100001', 'shift+clique desmarcou 2–5 (seleção ' + sel + ')');
	await p.click('#selAll'); await p.click('.page:nth-child(4) .thumb');

	// 1 + 4 + 9 · antes de criar
	await p.click('#btnBuild'); await p.waitForTimeout(700);
	const items = await p.$$eval('#preWrap .check-item b', (e) => e.map((x) => x.textContent));
	check(items.length === 3, 'folha: ' + items.join(' | '));
	check(await p.$eval('#preWrap .choice button.on', (e) => e.dataset.mode) === 'texts', 'folha: "só os textos" marcado por padrão');
	await shot('f1-folha.png');
	await p.click('#preWrap [data-act=fonts]'); await p.waitForTimeout(900);
	check(await p.evaluate(() => ABR.state.tab) === 'fonts', 'associar: leva para a aba fontes');
	check(!!(await p.$('.font.open')), 'associar: abre a 1ª fonte faltando (' + (await p.$eval('.font.open', (e) => e.dataset.key)) + ')');

	// 2 · seletor
	await p.click('.font[data-key="Calibri"] .font-head'); await p.waitForTimeout(500);
	await p.click('.font[data-key="Calibri"] .picker-field.family'); await p.waitForTimeout(300);
	check(await p.$eval('#fontPicker .picker-sec', (e) => e.textContent) === 'sugestão', 'seletor: sugestão de fonte com as mesmas medidas (' + (await p.$eval('#fontPicker .picker-item .ps', (e) => e.textContent)) + ')');
	await p.keyboard.type('ca', { delay: 60 }); await p.waitForTimeout(300);
	await shot('f2-seletor.png');
	await p.keyboard.press('Escape'); await p.waitForTimeout(300);
	check(!(await p.$('#fontPicker')), 'seletor: Esc fecha');
	await p.click('.font[data-key="Calibri"] .picker-field.family'); await p.waitForTimeout(200);
	await p.keyboard.type('carl'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
	check(await p.evaluate(() => ABR.state.map['Calibri'].ps) === 'Carlito', 'seletor: Enter escolhe Carlito');

	// 3 · família inteira
	check(!!(await p.$('.font[data-key="Calibri"] .family-hint')), 'família: oferece ' + (await p.$eval('.family-hint ul', (e) => e.textContent)));
	await p.mouse.move(1, 700); await p.waitForTimeout(400);
	const hb = await (await p.$('.font[data-key="Calibri"]')).boundingBox();
	await shot('f3-familia.png', { x: 0, y: Math.max(0, hb.y - 20), width: 460, height: Math.min(460, 860 - hb.y + 20) });
	await p.click('.family-hint .yes'); await p.waitForTimeout(400);
	check(await p.evaluate(() => ABR.state.map['Calibri Bold'].ps) === 'Carlito-Bold', 'família: Calibri Bold → Carlito Bold aplicado');

	// recentes da busca no seletor
	await p.click('.font[data-key="Gotham Black"] .font-head'); await p.waitForTimeout(400);
	await p.click('.font[data-key="Gotham Black"] .picker-field.family'); await p.waitForTimeout(200);
	check((await p.$$eval('#fontPicker .picker-sec', (e) => e.map((x) => x.textContent))).indexOf('recentes') >= 0, 'seletor: Carlito aparece em "recentes"');
	await p.keyboard.type('inter'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
	check(await p.evaluate(() => ABR.state.map['Gotham Black'].ps) === 'Inter-Black', 'seletor: Gotham Black → Inter Black (peso mantido)');
	check(await p.$eval('#preChip', (e) => e.classList.contains('hidden')), 'aviso no rodapé some quando não falta fonte');

	// 7 · concluído com ações
	await p.click('#btnBuild'); await p.waitForTimeout(700);
	check(await p.$$eval('#preWrap .check-item', (e) => e.length) === 2, 'folha sem o item de fontes depois de associar');
	check(await p.$eval('#preWrap [data-act=go]', (e) => e.textContent) === 'atualizar os textos', 'botão da folha: "atualizar os textos"');
	await p.click('#preWrap [data-act=go]');
	await p.waitForFunction(() => document.getElementById('btnBuild').classList.contains('done'), null, { timeout: 30000 });
	await p.waitForTimeout(500);
	check(await p.$$eval('#toast .t-actions button', (e) => e.length) === 2, 'aviso final: ' + (await p.$eval('#toast .t-body > span', (e) => e.textContent)));
	await shot('f7-concluido.png', { x: 0, y: 600, width: 460, height: 260 });
	await p.click('#toast .t-actions button >> nth=0');
	check((await p.evaluate(() => window.__calls)).indexOf('abridor_reveal(77)') >= 0, 'abrir master chama o AE');
	await b.close();
})();
