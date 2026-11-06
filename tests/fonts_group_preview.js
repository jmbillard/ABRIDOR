// Prévia do grupo de fontes não usadas: grava quadros da animação.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), OUT = path.resolve(process.argv[2] || 'out');
fs.mkdirSync(OUT, { recursive: true });
const PPTX = path.join(ROOT, 'test files/exemplo_creditos.pptx');
const FONTS = [['Inter', 'Bold', 'Inter-Bold'], ['Inter', 'Light', 'Inter-Light'], ['Inter', 'Black', 'Inter-Black'], ['Carlito', 'Regular', 'Carlito']].map(([f, s, p]) => ({ f, s, p, n: f + ' ' + s, l: '' }));
(async () => {
	const b = await chromium.launch();
	const p = await b.newPage({ viewport: { width: 460, height: 760 }, deviceScaleFactor: 1, colorScheme: 'dark' });
	p.on('pageerror', (e) => console.log('ERR', e.message));
	const b64 = fs.readFileSync(PPTX).toString('base64');
	await p.addInitScript(({ b64, PPTX, FONTS }) => {
		window.ABR_MOCK = { openFile: () => PPTX, readBinary: () => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }, writeText() { }, writeDataURL() { }, callHost: (fn) => fn === 'abridor_getFonts' ? JSON.stringify({ fonts: FONTS }) : JSON.stringify({ ok: true }) };
		try { localStorage.clear(); } catch (e) { }
	}, { b64, PPTX, FONTS });
	await p.goto('file://' + path.join(ROOT, 'abridor-cep/index.html'));
	await p.waitForTimeout(400);
	await p.click('#dropZone');
	await p.waitForFunction(() => /carregado/.test(document.getElementById('status').textContent));
	await p.evaluate(() => ABR.ui.hideToast());
	await p.click('.tab[data-tab=fonts]'); await p.waitForTimeout(800);
	const frames = [];
	const snap = async () => frames.push(await p.screenshot({ clip: { x: 0, y: 100, width: 460, height: 640 } }));
	await snap();
	// desmarca o slide 6 (único com Calibri / Calibri Bold) na aba páginas e volta para fontes
	await p.click('.tab[data-tab=pages]'); await p.waitForTimeout(400);
	await p.click('.page:nth-child(6) .thumb'); await p.waitForTimeout(300);
	await p.click('.tab[data-tab=fonts]');
	for (const t of [320, 120, 150, 500]) { await p.waitForTimeout(t); await snap(); }
	await p.click('#unusedHead'); await p.waitForTimeout(600); await snap();
	// marca de novo: as fontes sobem
	await p.click('.tab[data-tab=pages]'); await p.waitForTimeout(400);
	await p.click('.page:nth-child(6) .thumb'); await p.waitForTimeout(300);
	await p.click('.tab[data-tab=fonts]'); await p.waitForTimeout(450); await snap();
	await p.waitForTimeout(600); await snap();
	console.log(await p.evaluate(() => [document.querySelectorAll('.font-group.used .font').length, document.querySelectorAll('.font-group.unused .font').length, document.getElementById('fontBadge').textContent]));
	frames.forEach((f, i) => fs.writeFileSync(path.join(OUT, 'g' + i + '.png'), f));
	await b.close();
})();
