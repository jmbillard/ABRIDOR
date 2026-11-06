// Testa o painel fora do After Effects (Chromium + mock do host/fs).
// uso: node tests/run_panel.js <arquivo.pptx|pdf> <pasta de saída>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const docPath = path.resolve(process.argv[2]);
const outDir = path.resolve(process.argv[3] || 'out');
fs.mkdirSync(outDir, { recursive: true });

const FONTS = [];
function fam(f, styles) { styles.forEach(([s, p]) => FONTS.push({ f, s, p, n: f + ' ' + s, l: '' })); }
fam('Arial', [['Regular', 'ArialMT'], ['Bold', 'Arial-BoldMT'], ['Italic', 'Arial-ItalicMT'], ['Bold Italic', 'Arial-BoldItalicMT']]);
fam('Georgia', [['Regular', 'Georgia'], ['Bold', 'Georgia-Bold']]);
fam('Times New Roman', [['Regular', 'TimesNewRomanPSMT'], ['Bold', 'TimesNewRomanPS-BoldMT']]);
fam('Montserrat', [['Regular', 'Montserrat-Regular'], ['Bold', 'Montserrat-Bold'], ['Black', 'Montserrat-Black'], ['SemiBold', 'Montserrat-SemiBold']]);
fam('DejaVu Sans', [['Book', 'DejaVuSans'], ['Bold', 'DejaVuSans-Bold']]);

(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 460, height: 860 } });
	page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text()); });
	page.on('pageerror', e => console.log('[pageerror]', e.message));
	const b64 = fs.readFileSync(docPath).toString('base64');

	await page.addInitScript(({ b64, docPath, FONTS }) => {
		const files = {};
		files[docPath] = b64;
		window.__hostCalls = [];
		window.__written = {};
		window.ABR_MOCK = {
			openFile: () => docPath,
			openFolder: () => null,
			readBinary: (p) => {
				const bin = atob(files[p]);
				const u = new Uint8Array(bin.length);
				for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
				return u;
			},
			writeText: (p, t) => { window.__written[p] = t; },
			writeDataURL: (p, d) => { window.__written[p] = d; },
			callHost: (fn, args) => {
				window.__hostCalls.push([fn, args]);
				if (fn === 'abridor_getFonts') return JSON.stringify({ fonts: FONTS });
				if (fn === 'abridor_buildPage') return JSON.stringify({ ok: true, texts: 1, log: [] });
				if (fn === 'abridor_finish') return JSON.stringify({ ok: true, comps: 3, master: 'X MASTER' });
				if (fn === 'abridor_applyFonts') return JSON.stringify({ ok: true, layers: 10, comps: 3, failed: [] });
				if (fn === 'abridor_scanProject') return JSON.stringify({ ok: true, map: {}, fonts: {} });
				return JSON.stringify({ ok: true });
			}
		};
	}, { b64, docPath, FONTS });

	await page.goto('file://' + path.resolve(__dirname, '../abridor-cep/index.html'));
	await page.waitForFunction(() => /pronto/.test(document.getElementById('status').textContent));
	await page.click('#dropZone');
	await page.waitForFunction(() => /carregado|erro/.test(document.getElementById('status').textContent), null, { timeout: 120000 });
	console.log('status:', await page.textContent('#status'));
	await page.waitForTimeout(500);
	await page.screenshot({ path: path.join(outDir, '1-paginas.png') });

	const summary = await page.evaluate(() => {
		const d = ABR.state.doc;
		return d.pages.map(p => ({
			n: p.number, hidden: p.hidden, w: p.width, h: p.height,
			texts: p.texts.map(t => ({
				mode: t.mode, align: t.align || t.paragraphs[0].align, v: t.vAlign,
				x: +(t.mode === 'point' ? t.ax : t.x).toFixed(1), y: +(t.mode === 'point' ? t.ay : t.y).toFixed(1),
				w: +(t.w || 0).toFixed(1), h: +(t.h || 0).toFixed(1), rot: t.rotation,
				p: t.paragraphs.map(p => p.runs.map(r => `[${r.fontKey} ${r.size} #${r.color.map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}]${r.text}`).join('') + ` {lead ${p.leading}}`)
			}))
		}));
	});
	fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 1));

	await page.click('.tab[data-tab=comps]');
	await page.screenshot({ path: path.join(outDir, '2-comps.png') });
	await page.click('.tab[data-tab=fonts]');
	await page.waitForTimeout(300);
	await page.screenshot({ path: path.join(outDir, '3-fontes.png') });

	await page.click('#btnBuild');
	await page.waitForFunction(() => /comps criadas|erro/.test(document.getElementById('status').textContent), null, { timeout: 120000 });
	console.log('status:', await page.textContent('#status'));
	const written = await page.evaluate(() => window.__written);
	const calls = await page.evaluate(() => window.__hostCalls.map(c => c[0] + '(' + c[1].join(',') + ')'));
	console.log(calls.join('\n'));
	for (const k in written) {
		if (/abridor_job\.json$/.test(k)) fs.writeFileSync(path.join(outDir, 'job.json'), written[k]);
		else if (/^data:/.test(written[k])) {
			fs.mkdirSync(path.join(outDir, 'refs'), { recursive: true });
			fs.writeFileSync(path.join(outDir, 'refs', path.basename(k)), Buffer.from(written[k].split(',')[1], 'base64'));
		}
	}
	// salva uma referência renderizada em tamanho real para conferência
	const ref = await page.evaluate(async () => {
		const d = ABR.state.doc;
		const pg = d.pages[1];
		if (d.type === 'pdf') return d.pdf.renderToSize(pg.index, 1920, 1080, 'fit');
		return (await ABR.renderPptxPage(pg, 1920, 1080, 'fit')).toDataURL('image/png');
	});
	fs.writeFileSync(path.join(outDir, 'ref-2.png'), Buffer.from(ref.split(',')[1], 'base64'));
	await browser.close();
})();
