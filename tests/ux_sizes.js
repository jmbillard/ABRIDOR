// Painel em tamanhos extremos (muito estreito, muito baixo, largo): prints e aviso do que ficou fora da tela.
// uso: node tests/ux_sizes.js <saída>
const { chromium } = require('./pw');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), OUT = path.resolve(process.argv[2] || 'out'); fs.mkdirSync(OUT, { recursive: true });
const PPTX = path.join(ROOT, 'test files/exemplo_creditos.pptx'), b64 = fs.readFileSync(PPTX).toString('base64');
const FONTS = []; const fam = (f, st) => st.forEach(([s, p]) => FONTS.push({ f, s, p, n: f + ' ' + s, l: '' }));
fam('Inter', [['Light', 'Inter-Light'], ['Bold', 'Inter-Bold']]); fam('Carlito', [['Regular', 'Carlito'], ['Bold', 'Carlito-Bold']]); for (let i = 0; i < 30; i++) fam('Fonte ' + i, [['Regular', 'F' + i]]);
(async () => {
	const b = await chromium.launch();
	for (const [W, H, tour] of [[260, 420, false], [300, 380, true], [900, 640, false], [420, 300, false]]) {
		const p = await b.newPage({ viewport: { width: W, height: H }, colorScheme: 'dark' });
		p.on('pageerror', (e) => console.log('PAGEERR', e.message));
		await p.addInitScript(({ b64, PPTX, FONTS, tour }) => {
			window.ABR_MOCK = { openFile: () => PPTX, exists: () => true, readBinary: () => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }, writeText() { }, writeDataURL() { },
				callHost: (fn) => fn === 'abridor_getFonts' ? JSON.stringify({ fonts: FONTS }) : fn === 'abridor_inspect' ? JSON.stringify({ ok: true, version: '23.6x1', ranges: false, next: 2, existing: { name: 'exemplo_creditos', comps: 6, created: new Date(Date.now() - 36e5).toString() } }) : JSON.stringify({ ok: true }) };
			if (!sessionStorage.s) { sessionStorage.s = 1; localStorage.clear(); if (!tour) localStorage.setItem('abridor.tourDone', '1'); }
		}, { b64, PPTX, FONTS, tour });
		const tag = W + 'x' + H; let n = 0;
		const shot = (name) => p.screenshot({ path: path.join(OUT, tag + '-' + String(++n).padStart(2, '0') + '-' + name + '.png') });
		const clipped = async (label, sel) => { const r = await p.evaluate((sel) => { const out = []; const vw = innerWidth, vh = innerHeight; document.querySelectorAll(sel).forEach((el) => { const r = el.getBoundingClientRect(); if (!r.width) return; if (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1 || r.top < -1) out.push((el.id || el.className) + ' [' + [r.left, r.top, r.right, r.bottom].map(Math.round) + ']'); }); return out; }, sel); if (r.length) console.log(tag, 'FORA DA TELA', label, r); };
		await p.goto('file://' + ROOT + '/abridor-cep/index.html'); await p.waitForTimeout(600); await shot('vazio');
		await clipped('vazio', '#dropZone, #btnBuild, .top > *');
		await p.click('#dropZone'); await p.waitForTimeout(2500);
		if (tour) { await shot('tour-boas-vindas'); await clipped('tour', '.tour-card, .tour-welcome, .tour-card button, .tour-welcome button'); await p.keyboard.press('Enter'); await p.waitForTimeout(900); await shot('tour-1'); await clipped('tour1', '.tour-card, .tour-card button'); await p.keyboard.press('Enter'); await p.waitForTimeout(900); await shot('tour-2'); await clipped('tour2', '.tour-card, .tour-card button'); await p.keyboard.press('Enter'); await p.waitForTimeout(900); await shot('tour-3'); await clipped('tour3', '.tour-card, .tour-card button'); await p.keyboard.press('Escape'); await p.waitForTimeout(600); await p.click('.tab[data-tab=pages]'); await p.waitForTimeout(500); }
		await shot('paginas'); await clipped('paginas', '.top > *, .tab, #pagesTools > *, #btnBuild, .summary > *');
		await p.click('#rangeBtn'); await p.waitForTimeout(500); await p.keyboard.type('1-3'); await shot('intervalo'); await clipped('intervalo', '#pagesTools > *'); await p.keyboard.press('Escape'); await p.fill('#selRange', ''); await p.waitForTimeout(300);
		await p.click('.tab[data-tab=comps]'); await p.waitForTimeout(600); await shot('comps'); await clipped('comps', '#tab-comps .seg button, #tab-comps .stepper > *, #tab-comps input');
		await p.click('.tab[data-tab=fonts]'); await p.waitForTimeout(600); await (await p.$('.font .font-head')).click(); await p.waitForTimeout(600); await shot('fontes'); await clipped('fontes', '#tab-fonts .bar > *, .font.open .font-edit *');
		const f = await p.$('.font.open .picker-field'); await f.click(); await p.waitForTimeout(500); await shot('seletor'); await clipped('seletor', '#fontPicker'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
		await p.click('#btnBuild'); await p.waitForTimeout(800); await shot('folha'); await clipped('folha', '.pre-sheet, .pre-sheet button');
		await p.close();
	}
	await b.close();
})();
