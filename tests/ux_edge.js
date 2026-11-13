// Caminhos de erro e entradas inválidas: arquivo corrompido ou sumido, falha no After Effects, limites dos campos, reabrir o painel.
// uso: node tests/ux_edge.js <saída>
const { chromium } = require('./pw');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), OUT = path.resolve(process.argv[2] || 'out'); fs.mkdirSync(OUT, { recursive: true });
const PPTX = path.join(ROOT, 'test files/exemplo_creditos.pptx'), b64 = fs.readFileSync(PPTX).toString('base64');
const FONTS = [['Inter', 'Light', 'Inter-Light'], ['Inter', 'Bold', 'Inter-Bold'], ['Carlito', 'Regular', 'Carlito'], ['Carlito', 'Bold', 'Carlito-Bold']].map(([f, s, p]) => ({ f, s, p, n: f + ' ' + s, l: '' }));
let n = 0;
(async () => {
	const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 380, height: 640 }, colorScheme: 'dark' });
	const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('PAGEERR', e.message));
	await ctx.addInitScript(({ b64, PPTX, FONTS }) => {
		const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
		const bytes = () => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
		window.__mode = {}; window.__calls = [];
		window.ABR_MOCK = {
			openFile: () => window.__mode.cancel ? null : (window.__mode.path || PPTX), exists: () => true,
			readBinary: (pp) => { if (/quebrado/.test(pp)) return new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]); if (/sumiu/.test(pp)) throw new Error('ENOENT: no such file'); return bytes(); },
			writeText() { }, writeDataURL() { },
			callHost: (fn, args) => {
				window.__calls.push(fn);
				if (fn === 'abridor_getFonts') return JSON.stringify({ fonts: FONTS });
				if (fn === 'abridor_inspect') return JSON.stringify({ ok: true, version: '25.1x1', ranges: true, next: 2, existing: null });
				if (fn === 'abridor_buildPage') { if (window.__mode.fail && window.__calls.filter((c) => c === fn).length === 2) return delay(200).then(() => { throw new Error('After Effects error: Unable to execute script at line 512'); }); return delay(200, JSON.stringify({ ok: true, texts: 3, log: [] })); }
				if (fn === 'abridor_finish') return JSON.stringify({ ok: true, comps: 5, mode: 'new', master: 'M', masterId: 1, folderId: 2 });
				if (fn === 'abridor_scanFonts' || fn === 'abridor_scanProject') return JSON.stringify({ ok: true, fonts: {} });
				if (fn === 'abridor_applyFonts') return JSON.stringify({ ok: true, layers: 0, comps: 0 });
				if (fn === 'abridor_splitLines') return JSON.stringify({ ok: true, layers: 0, lines: 0 });
				return JSON.stringify({ ok: true });
			}
		};
		if (!sessionStorage.s) { sessionStorage.s = 1; localStorage.clear(); localStorage.setItem('abridor.tourDone', '1'); }
	}, { b64, PPTX, FONTS });
	const shot = (name) => p.screenshot({ path: path.join(OUT, String(++n).padStart(2, '0') + '-' + name + '.png') });
	const st = async (label) => console.log(label.padEnd(34), '→', JSON.stringify(await p.textContent('#status')), '| toast:', await p.evaluate(() => { const t = document.getElementById('toast'); return t.classList.contains('show') ? JSON.stringify(t.className + ': ' + t.textContent) : '(nenhum)'; }), '| busy:', await p.evaluate(() => ABR.app.state.busy), '| cta:', JSON.stringify(await p.evaluate(() => { const c = document.getElementById('btnBuild'); return c.className + (c.disabled ? ' [disabled]' : '') + ' ' + c.textContent.trim(); })));
	const mode = (m) => p.evaluate((m) => { window.__mode = m; }, m);
	await p.goto('file://' + ROOT + '/abridor-cep/index.html'); await p.waitForTimeout(700);

	await mode({ cancel: true }); await p.click('#dropZone'); await p.waitForTimeout(600); await st('abrir e cancelar');
	await mode({ path: '/x/quebrado.pptx' }); await p.click('#dropZone'); await p.waitForTimeout(1500); await st('pptx corrompido'); await shot('corrompido');
	await mode({ path: '/x/sumiu.pdf' }); await p.click(await p.$('#dropZone:not(.hidden)') ? '#dropZone' : '#docChip'); await p.waitForTimeout(1500); await st('arquivo sumiu'); await shot('sumiu');
	console.log('  tela depois do erro: body.is-empty =', await p.evaluate(() => document.body.classList.contains('is-empty')), '| docName =', JSON.stringify(await p.textContent('#docName')));
	// arrastar um .docx
	await p.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['x'], 'roteiro.docx')); document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }); await p.waitForTimeout(600); await st('arrastar .docx');
	// criar sem documento
	await p.keyboard.press('Control+Enter'); await p.waitForTimeout(500); await st('ctrl+enter sem documento');

	await mode({}); await p.click(await p.$('#dropZone:not(.hidden)') ? '#dropZone' : '#docChip'); await p.waitForTimeout(2500); await st('pptx bom');
	await mode({ path: '/x/quebrado.pptx' }); await p.click('#docChip'); await p.waitForTimeout(1500); await st('ruim por cima de um bom');
	console.log('  continua o bom?', await p.textContent('#docName'), '|', await p.textContent('#docMeta'), '| prefixo', await p.inputValue('#prefix'), '| páginas', await p.$$eval('.page', (e) => e.length), '| state.name', await p.evaluate(() => ABR.app.state.name)); await mode({});
	await p.click('#selNone'); await p.waitForTimeout(400); await st('nenhuma página'); await shot('nenhuma');
	await p.click('#btnBuild', { force: true }).catch(() => { }); await p.keyboard.press('Control+Enter'); await p.waitForTimeout(600); await st('criar com 0 páginas');
	await p.click('.tab[data-tab=fonts]'); await p.waitForTimeout(600); await shot('fontes-0-paginas');
	console.log('  fontes com 0 páginas:', await p.evaluate(() => ({ usadas: document.querySelectorAll('.font-group.used .font').length, naoUsadas: document.querySelectorAll('.font-group.unused .font').length, badge: document.getElementById('fontBadge').className + ' ' + document.getElementById('fontBadge').textContent })));
	await p.click('.tab[data-tab=pages]'); await p.click('#selAll'); await p.waitForTimeout(300);
	// intervalo inválido
	await p.click('#rangeBtn'); await p.waitForTimeout(300); await p.keyboard.type('abc'); await p.keyboard.press('Enter'); await p.waitForTimeout(500); await st('intervalo "abc"');
	await p.fill('#selRange', '99'); await p.keyboard.press('Enter'); await p.waitForTimeout(500); await st('intervalo "99" (fora)'); console.log('  sel:', await p.textContent('.sel-count'));
	await p.fill('#selRange', ''); await p.keyboard.press('Escape'); await p.click('#selAll');
	// duração inválida
	await p.click('.tab[data-tab=comps]'); await p.waitForTimeout(500);
	for (const v of ['0', '-3', 'abc', '2,5', '9999']) { await p.fill('#duration', v); await p.keyboard.press('Tab'); await p.waitForTimeout(250); console.log('  duração', JSON.stringify(v), '→ campo', JSON.stringify(await p.inputValue('#duration')), '| tc', JSON.stringify(await p.textContent('#durTC')), '| resumo', JSON.stringify(await p.textContent('#summary'))); }
	await p.fill('#duration', '5'); await p.keyboard.press('Tab');
	await p.click('#resSeg [data-value=custom]'); await p.waitForTimeout(400);
	for (const [w, h] of [['0', '0'], ['99999', '5'], ['', '']]) { await p.fill('#compW', w); await p.fill('#compH', h); await p.keyboard.press('Tab'); await p.waitForTimeout(250); console.log('  tamanho', w + 'x' + h, '→', await p.inputValue('#compW') + 'x' + await p.inputValue('#compH'), '| resumo', JSON.stringify(await p.textContent('#summary'))); }
	await shot('custom-vazio');
	await p.click('#resSeg [data-value="1920x1080"]');
	await p.fill('#prefix', ''); await p.keyboard.press('Tab'); await p.waitForTimeout(300); console.log('  prefixo vazio → sufixo', JSON.stringify(await p.textContent('#nameSuffix')), '| nomes:', await p.evaluate(() => ABR.app.state.doc.pages.slice(0, 2).map((x) => x.compName)));
	await p.click('#btnSplit'); await p.waitForTimeout(600); await st('dividir sem seleção');

	// falha no meio da criação
	await mode({ fail: true }); await p.fill('#prefix', 'TESTE'); await p.keyboard.press('Tab');
	await p.keyboard.press('Control+Enter'); await p.waitForTimeout(600); const go = await p.$('.pre-sheet [data-act=go]'); if (go) await go.click();
	await p.waitForTimeout(2500); await st('falha no AE durante a criação'); await shot('falha');
	// tenta de novo: deve funcionar
	await mode({}); await p.evaluate(() => { window.__calls = []; });
	await p.keyboard.press('Control+Enter'); await p.waitForTimeout(600); const go2 = await p.$('.pre-sheet [data-act=go]'); if (go2) await go2.click();
	await p.waitForTimeout(600); await st('criando (2ª tentativa)');
	// durante a criação: tenta abrir outro doc, trocar aba, idioma
	await p.click('#docChip').catch(() => { }); await p.click('#langBtn').catch(() => { }); await p.waitForTimeout(300); await st('cliques durante a criação'); await shot('durante');
	await p.waitForFunction(() => !ABR.app.state.busy, null, { timeout: 30000 }); await p.waitForTimeout(700); await st('fim da 2ª tentativa'); await shot('fim');
	// fontes: aplicar depois sem nada, ler do projeto vazio
	await p.click('.tab[data-tab=fonts]'); await p.waitForTimeout(500); await p.click('#btnScan'); await p.waitForTimeout(800); await st('ler do projeto (vazio)'); await shot('scan-vazio');
	// reabrir o painel: preferências e recentes
	const before = await p.evaluate(() => JSON.stringify(ABR.app.settings));
	await p.reload(); await p.waitForTimeout(900); await shot('reaberto');
	console.log('  reaberto: idioma', await p.textContent('#langBtn'), '| recentes', await p.$$eval('.recent-item', (e) => e.map((x) => x.textContent.trim().slice(0, 50))), '| prefs iguais:', before === await p.evaluate(() => JSON.stringify(ABR.app.settings)));
	await p.click('.recent-item'); await p.waitForTimeout(2500); await st('abrir pelo recente');
	console.log('  prefixo depois de reabrir o doc:', await p.inputValue('#prefix'));
	await b.close();
})();
