// Prévia dos tooltips: node tests/tooltips_preview.js <saída>
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), OUT = path.resolve(process.argv[2] || 'out');
fs.mkdirSync(OUT, { recursive: true });
const PPTX = path.join(ROOT, 'test files/exemplo_creditos.pptx');
const FONTS = [['Inter', 'Bold', 'Inter-Bold'], ['Inter', 'Light', 'Inter-Light'], ['Inter', 'Black', 'Inter-Black']].map(([f, s, p]) => ({ f, s, p, n: f + ' ' + s, l: '' }));
(async () => {
	const b = await chromium.launch();
	for (const scheme of ['dark', 'light']) {
		const p = await b.newPage({ viewport: { width: 460, height: 860 }, deviceScaleFactor: 2, colorScheme: scheme });
		p.on('pageerror', (e) => console.log('ERR', e.message));
		const b64 = fs.readFileSync(PPTX).toString('base64');
		await p.addInitScript(({ b64, PPTX, FONTS }) => {
			window.ABR_MOCK = {
				openFile: () => PPTX,
				readBinary: () => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; },
				writeText() { }, writeDataURL() { },
				callHost: (fn) => fn === 'abridor_getFonts' ? JSON.stringify({ fonts: FONTS }) : JSON.stringify({ ok: true })
			};
			try { localStorage.clear(); } catch (e) { }
		}, { b64, PPTX, FONTS });
		await p.goto('file://' + path.join(ROOT, 'abridor-cep/index.html'));
		await p.waitForTimeout(500);
		await p.click('#dropZone');
		await p.waitForFunction(() => /carregado/.test(document.getElementById('status').textContent));
		await p.evaluate(() => ABR.ui.hideToast());
		await p.waitForTimeout(700);
		const shots = [];
		const hover = async (sel, name, clip) => {
			await p.mouse.move(1, 700);
			await p.waitForTimeout(650);
			await p.hover(sel);
			await p.waitForTimeout(700);
			const file = path.join(OUT, scheme + '-' + name + '.png');
			await p.screenshot({ path: file, clip });
			shots.push(file);
		};
		await hover('.page:nth-child(3) .thumb', 'thumb', { x: 0, y: 90, width: 460, height: 420 });
		await hover('#rangeBtn', 'range', { x: 0, y: 40, width: 460, height: 180 });
		await hover('.tab[data-tab=fonts]', 'tab', { x: 0, y: 30, width: 460, height: 180 });
		await p.click('.tab[data-tab=comps]'); await p.waitForTimeout(500);
		await hover('#fpsSeg button[data-value="29.97"]', 'fps', { x: 0, y: 120, width: 460, height: 230 });
		await p.click('.tab[data-tab=fonts]'); await p.waitForTimeout(500);
		await hover('.font.missing .dst', 'dst', { x: 0, y: 200, width: 460, height: 200 });
		await hover('#btnScan', 'scan', { x: 0, y: 100, width: 460, height: 200 });
		await p.close();
	}
	await b.close();
	console.log('ok');
})();
