// Grava um vídeo curto das animações do painel e converte em GIF (docs/img/demo.gif).
// uso: node tests/make_demo.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PPTX = path.join(ROOT, 'test files/exemplo_creditos.pptx');
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'abridor-demo-'));
const FONTS = [];
function fam(f, styles) { styles.forEach(([s, p]) => FONTS.push({ f, s, p, n: f + ' ' + s, l: '' })); }
fam('Inter', [['Light', 'Inter-Light'], ['Regular', 'Inter-Regular'], ['Bold', 'Inter-Bold'], ['Black', 'Inter-Black']]);
fam('Carlito', [['Regular', 'Carlito'], ['Bold', 'Carlito-Bold']]);
fam('Liberation Sans', [['Regular', 'LiberationSans'], ['Bold', 'LiberationSans-Bold']]);

(async () => {
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 400, height: 720 }, recordVideo: { dir: TMP, size: { width: 400, height: 720 } }, colorScheme: 'dark' });
	const page = await ctx.newPage();
	const b64 = fs.readFileSync(PPTX).toString('base64');
	await page.addInitScript(({ b64, PPTX, FONTS }) => {
		const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
		window.ABR_MOCK = {
			openFile: () => PPTX,
			readBinary: () => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; },
			writeText: () => { }, writeDataURL: () => { },
			callHost: (fn) => {
				if (fn === 'abridor_getFonts') return JSON.stringify({ fonts: FONTS });
				if (fn === 'abridor_buildPage') return delay(380, JSON.stringify({ ok: true, log: [] }));
				if (fn === 'abridor_finish') return delay(200, JSON.stringify({ ok: true, comps: 5, master: 'O SOM DO MAR MASTER' }));
				return JSON.stringify({ ok: true });
			}
		};
		try { localStorage.clear(); } catch (e) { }
	}, { b64, PPTX, FONTS });

	const w = (ms) => page.waitForTimeout(ms);
	const move = async (sel, steps) => { const b = await (await page.$(sel)).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: steps || 12 }); };
	const click = async (sel, pause) => { await move(sel); await w(150); await page.mouse.down(); await w(80); await page.mouse.up(); await w(pause || 500); };

	await page.goto('file://' + path.join(ROOT, 'abridor-cep/index.html'));
	await w(900);
	await move('#dropZone', 20); await w(700);
	await click('#dropZone', 2200);
	await page.evaluate(() => ABR.ui.hideToast());
	await click('.page:nth-child(2) .thumb', 450);
	await click('.page:nth-child(5) .thumb', 450);
	await click('.page:nth-child(2) .thumb', 600);
	await click('#showBoxes', 600);
	await click('#showBoxes', 500);
	await click('.page:nth-child(1) .dur', 300);
	await page.keyboard.type('8', { delay: 120 }); await page.keyboard.press('Enter'); await w(600);
	await click('.tab[data-tab=comps]', 700);
	await click('#resSeg button[data-value="3840x2160"]', 500);
	await click('#fpsSeg button[data-value="25"]', 450);
	await click('#fpsSeg button[data-value="29.97"]', 450);
	await click('#durPlus', 250); await click('#durPlus', 450);
	await click('#refImages + .switch', 700);
	await click('#refImages + .switch', 700);
	await click('#advBtn', 900);
	await click('#advBtn', 500);
	await click('.tab[data-tab=fonts]', 800);
	await click('.font[data-key="Gotham Black"] .font-head', 800);
	await click('.font[data-key="Gotham Black"] .picker-field.family', 400);
	await page.keyboard.type('Inter', { delay: 90 }); await w(400); await page.keyboard.press('Enter'); await w(700);
	await click('.font[data-key="Gotham Black"] .s-minus', 600);
	await click('.font[data-key="Calibri Bold"] .font-head', 800);
	await click('.font[data-key="Calibri Bold"] .picker-field.family', 400);
	await page.keyboard.type('Carl', { delay: 90 }); await w(400); await page.keyboard.press('Enter'); await w(900);
	await click('#btnAuto', 900);
	await click('#btnBuild', 900);
	if (await page.$('#preWrap [data-act=go]')) await click('#preWrap [data-act=go]', 3600);
	await w(800);
	await ctx.close();
	await browser.close();

	const video = fs.readdirSync(TMP).find((f) => f.endsWith('.webm'));
	const src = path.join(TMP, video);
	const out = path.join(ROOT, 'docs/img/demo.gif');
	const pal = path.join(TMP, 'pal.png');
	execSync(`ffmpeg -y -loglevel error -i "${src}" -vf "fps=9,scale=340:-1:flags=lanczos,palettegen=max_colors=96:stats_mode=diff" "${pal}"`);
	execSync(`ffmpeg -y -loglevel error -i "${src}" -i "${pal}" -lavfi "fps=9,scale=340:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle" "${out}"`);
	fs.copyFileSync(src, path.join(TMP, 'demo.webm'));
	console.log('gif:', out, (fs.statSync(out).size / 1024 / 1024).toFixed(2) + ' MB');
	console.log('webm:', path.join(TMP, 'demo.webm'));
})();
