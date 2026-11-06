// prévia rápida do tema claro: node tests/light_preview.js <saída>
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), OUT = path.resolve(process.argv[2]);
fs.mkdirSync(OUT, { recursive: true });
const PPTX = path.join(ROOT, 'test files/exemplo_creditos.pptx');
const FONTS = [['Inter', 'Bold', 'Inter-Bold'], ['Inter', 'Light', 'Inter-Light'], ['Inter', 'Black', 'Inter-Black'], ['Carlito', 'Regular', 'Carlito']].map(([f, s, p]) => ({ f, s, p, n: f + ' ' + s, l: '' }));
(async () => {
	const b = await chromium.launch();
	const ctx = await b.newContext({ viewport: { width: 460, height: 860 }, deviceScaleFactor: 1, colorScheme: 'light' });
	const p = await ctx.newPage();
	p.on('pageerror', (e) => console.log('ERR', e.message));
	const b64 = fs.readFileSync(PPTX).toString('base64');
	await p.addInitScript(({ b64, PPTX, FONTS }) => {
		window.ABR_MOCK = {
			openFile: () => PPTX,
			readBinary: () => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; },
			writeText() { }, writeDataURL() { },
			callHost: (fn) => fn === 'abridor_getFonts' ? JSON.stringify({ fonts: FONTS }) : fn === 'abridor_finish' ? JSON.stringify({ ok: true, comps: 5, master: 'X' }) : JSON.stringify({ ok: true, log: fn === 'abridor_buildPage' ? ['aviso de exemplo'] : [] })
		};
		try { localStorage.clear(); } catch (e) { }
	}, { b64, PPTX, FONTS });
	await p.goto('file://' + path.join(ROOT, 'abridor-cep/index.html'));
	await p.waitForTimeout(700);
	await p.screenshot({ path: path.join(OUT, 'l0.png') });
	await p.click('#dropZone');
	await p.waitForFunction(() => /carregado/.test(document.getElementById('status').textContent));
	await p.waitForTimeout(900);
	await p.click('.page:nth-child(2) .thumb');
	await p.hover('.page:nth-child(3) .thumb');
	await p.waitForTimeout(400);
	await p.screenshot({ path: path.join(OUT, 'l1.png') });
	await p.click('.tab[data-tab=comps]'); await p.click('#advBtn'); await p.waitForTimeout(700);
	await p.mouse.move(1, 700);
	await p.screenshot({ path: path.join(OUT, 'l2.png') });
	await p.click('.tab[data-tab=fonts]'); await p.waitForTimeout(500);
	await p.click('.font .font-head'); await p.waitForTimeout(600);
	await p.click('#btnBuild');
	await p.waitForFunction(() => document.getElementById('btnBuild').classList.contains('done'));
	await p.waitForTimeout(600);
	await p.screenshot({ path: path.join(OUT, 'l3.png') });
	await p.click('#themeBtn'); await p.waitForTimeout(100);
	await p.screenshot({ path: path.join(OUT, 'l4-mid.png') });
	console.log(await p.evaluate(() => [document.documentElement.dataset.theme, document.getElementById('themeBtn').dataset.mode]));
	await b.close();
})();
