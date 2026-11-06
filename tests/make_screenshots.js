// Gera os prints do README (docs/img) com o painel real rodando no Chromium e o After Effects simulado.
// uso: node tests/make_screenshots.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/img');
const PDF = path.join(ROOT, 'test files/Template Dramaturgia Curta_Aumenta que é rock_150824.pdf');
const PPTX = path.join(ROOT, 'test files/exemplo_creditos.pptx');
fs.mkdirSync(OUT, { recursive: true });

// fontes "instaladas" = fontes reais deste sistema, para o preview funcionar de verdade
const FONTS = [];
function fam(f, styles) { styles.forEach(([s, p]) => FONTS.push({ f, s, p, n: f + ' ' + s, l: '' })); }
fam('Inter', [['Thin', 'Inter-Thin'], ['Light', 'Inter-Light'], ['Regular', 'Inter-Regular'], ['Medium', 'Inter-Medium'], ['SemiBold', 'Inter-SemiBold'], ['Bold', 'Inter-Bold'], ['ExtraBold', 'Inter-ExtraBold'], ['Black', 'Inter-Black'], ['Italic', 'Inter-Italic']]);
fam('Carlito', [['Regular', 'Carlito'], ['Bold', 'Carlito-Bold'], ['Italic', 'Carlito-Italic'], ['Bold Italic', 'Carlito-BoldItalic']]);
fam('Caladea', [['Regular', 'Caladea-Regular'], ['Bold', 'Caladea-Bold']]);
fam('Liberation Sans', [['Regular', 'LiberationSans'], ['Bold', 'LiberationSans-Bold']]);
fam('Liberation Serif', [['Regular', 'LiberationSerif'], ['Bold', 'LiberationSerif-Bold']]);
fam('DejaVu Sans', [['Book', 'DejaVuSans'], ['Bold', 'DejaVuSans-Bold']]);
fam('DejaVu Serif', [['Book', 'DejaVuSerif'], ['Bold', 'DejaVuSerif-Bold']]);
fam('Bitstream Charter', [['Regular', 'CharterBT-Roman'], ['Bold', 'CharterBT-Bold']]);

const b64 = {};
b64[PDF] = fs.readFileSync(PDF).toString('base64');
b64[PPTX] = fs.readFileSync(PPTX).toString('base64');

async function annotate(page, marks) {
	await page.evaluate((marks) => {
		marks.forEach((m) => {
			let el = typeof m.sel === 'string' ? document.querySelectorAll(m.sel)[m.i || 0] : null;
			if (el && m.target) el = el.closest(m.target);
			if (!el) { console.warn('sem alvo: ' + m.sel); return; }
			const r = el.getBoundingClientRect();
			const pad = m.pad === undefined ? 3 : m.pad;
			if (m.box !== false) {
				const b = document.createElement('div');
				b.className = '__mark';
				Object.assign(b.style, {
					position: 'fixed', left: (r.left - pad) + 'px', top: (r.top - pad) + 'px',
					width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px',
					border: '2px solid #b44dff', borderRadius: '7px', boxShadow: '0 0 0 3px rgba(136,0,248,.25)',
					zIndex: 9998, pointerEvents: 'none'
				});
				document.body.appendChild(b);
			}
			const n = document.createElement('div');
			n.className = '__mark';
			n.textContent = m.n;
			const side = m.side || 'right';
			let x = side === 'right' ? r.right + pad - 4 : side === 'left' ? r.left - pad - 18 : r.left + r.width / 2 - 11;
			let y = side === 'top' ? r.top - pad - 18 : r.top - pad - 9;
			x = Math.max(2, Math.min(window.innerWidth - 24, x));
			y = Math.max(2, y);
			Object.assign(n.style, {
				position: 'fixed', left: x + 'px', top: y + 'px', width: '22px', height: '22px', borderRadius: '50%',
				background: '#8800f8', color: '#fff', font: '700 12px/22px Inter, sans-serif', textAlign: 'center',
				zIndex: 9999, boxShadow: '0 1px 4px rgba(0,0,0,.6)', pointerEvents: 'none'
			});
			document.body.appendChild(n);
		});
	}, marks);
}

async function shot(page, name, marks, opts) {
	opts = opts || {};
	if (!opts.noMouse) await page.mouse.move(1, 700);
	delete opts.noMouse;
	if (marks && marks.length) await annotate(page, marks);
	await page.waitForTimeout(150);
	await page.screenshot(Object.assign({ path: path.join(OUT, name) }, opts || {}));
	await page.evaluate(() => document.querySelectorAll('.__mark').forEach((e) => e.remove()));
	console.log('✓', name);
}

async function openDoc(page, file) {
	await page.evaluate((f) => { window.__nextFile = f; }, file);
	await page.evaluate(() => { document.getElementById('status').textContent = ''; });
	await page.evaluate(() => { if (document.body.classList.contains('is-empty')) document.getElementById('dropZone').click(); else document.getElementById('docChip').click(); });
	await page.waitForFunction(() => /carregado|erro/.test(document.getElementById('status').textContent), null, { timeout: 120000 });
	await page.waitForTimeout(900);
}

async function tab(page, t) {
	await page.click('.tab[data-tab=' + t + ']');
	await page.waitForTimeout(500);
}

(async () => {
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 460, height: 860 }, deviceScaleFactor: 2, colorScheme: 'dark' });
	const page = await ctx.newPage();
	page.on('pageerror', (e) => console.log('[pageerror]', e.message));

	await page.addInitScript(({ b64, FONTS }) => {
		const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
		window.__written = {};
		window.ABR_MOCK = {
			openFile: () => window.__nextFile,
			openFolder: () => null,
			readBinary: (p) => {
				const bin = atob(b64[p]);
				const u = new Uint8Array(bin.length);
				for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
				return u;
			},
			writeText: (p, t) => { window.__written[p] = t; },
			writeDataURL: () => { },
			callHost: (fn, args) => {
				if (fn === 'abridor_getFonts') return JSON.stringify({ fonts: FONTS });
				if (fn === 'abridor_buildPage') {
					const n = args[1];
					const log = n === 1 ? ['estilos mistos simplificados (AE sem characterRange): "direção ANA BEATRIZ LIMA"'] : [];
					return delay(window.__buildDelay || 300, JSON.stringify({ ok: true, texts: 2, log }));
				}
				if (fn === 'abridor_finish') return delay(200, JSON.stringify({ ok: true, comps: 5, master: 'O SOM DO MAR MASTER' }));
				if (fn === 'abridor_applyFonts') return delay(500, JSON.stringify({ ok: true, layers: 14, comps: 6, failed: [] }));
				if (fn === 'abridor_scanProject') {
					return delay(300, JSON.stringify({
						ok: true,
						map: { 'Gotham Black': { ps: 'Inter-Black', scale: 95, family: 'Gotham Black' }, 'Inter Light': { ps: 'Inter-Light', scale: 100 } },
						fonts: {
							'Gotham Black': { count: 1, sample: 'O SOM DO MAR' },
							'Inter Light': { count: 6, sample: 'direção' },
							'Inter Bold': { count: 9, sample: 'ANA BEATRIZ LIMA' },
							'Calibri Bold': { count: 1, sample: 'ESTÚDIO HORIZONTE' }
						}
					}));
				}
				return JSON.stringify({ ok: true });
			}
		};
		try { localStorage.clear(); } catch (e) { }
	}, { b64, FONTS });

	const hideToast = () => page.evaluate(() => ABR.ui.hideToast());
	const settle = (ms) => page.waitForTimeout(ms || 500);

	await page.goto('file://' + path.join(ROOT, 'abridor-cep/index.html'));
	await page.waitForFunction(() => /pronto/.test(document.getElementById('status').textContent));
	await settle(700);

	// 10 · painel vazio
	await page.setViewportSize({ width: 460, height: 560 });
	await settle(200);
	await shot(page, '10-painel.png', [
		{ sel: '#dropZone', n: 1, side: 'right', pad: 2 },
		{ sel: '.tabs', n: 2, side: 'left', pad: 1 },
		{ sel: '#btnBuild', n: 3, side: 'left' }
	]);
	await page.setViewportSize({ width: 460, height: 860 });

	// 11 · PDF
	await openDoc(page, PDF);
	await page.click('.page:nth-child(1) .thumb');
	await hideToast(); await settle(600);
	await shot(page, '11-paginas-pdf.png', [
		{ sel: '#docChip', n: 1, side: 'left', pad: 2 },
		{ sel: '.sel-count', n: 2, side: 'left', pad: 3 },
		{ sel: '#showBoxes', n: 3, side: 'left', pad: 1 },
		{ sel: '.page:nth-child(1) .thumb', n: 4, side: 'right', pad: 2 }
	]);

	// 12 · PPTX (oculto, duração individual, hover)
	await openDoc(page, PPTX);
	await page.click('.page:nth-child(1) .dur');
	await page.fill('.page:nth-child(1) .dur input', '8');
	await page.press('.page:nth-child(1) .dur input', 'Enter');
	await hideToast(); await settle(500);
	await page.hover('.page:nth-child(3) .thumb');
	await settle(350);
	await shot(page, '12-paginas-pptx.png', [
		{ sel: '.page:nth-child(4) .chip.flag', n: 1, side: 'left', pad: 2 },
		{ sel: '.page:nth-child(1) .dur', n: 2, side: 'top', pad: 2 },
		{ sel: '.page:nth-child(3) .chip.texts', n: 3, side: 'top', pad: 2 },
		{ sel: '.page:nth-child(3) .dur', n: 4, side: 'top', pad: 2 },
		{ sel: '.iconbar', n: 5, side: 'top', pad: 2 },
		{ sel: '#btnExtImages', n: 6, side: 'top', pad: 1 }
	], { noMouse: true });

	// 13 · intervalo
	await page.click('#rangeBtn');
	await settle(400);
	await page.fill('#selRange', '1-3, 5');
	await page.press('#selRange', 'Enter');
	await settle(600);
	await shot(page, '13-intervalo.png', [
		{ sel: '#rangeBox', n: 1, side: 'top', pad: 2 },
		{ sel: '.sel-count', n: 2, side: 'left', pad: 3 }
	], { clip: { x: 0, y: 0, width: 460, height: 420 } });

	// 14 · edição da duração (detalhe)
	await page.click('.page:nth-child(2) .dur');
	await page.fill('.page:nth-child(2) .dur input', '6,5');
	await settle(400);
	const card = await page.$('.page:nth-child(2)');
	await card.screenshot({ path: path.join(OUT, '14-duracao.png') });
	console.log('✓ 14-duracao.png');
	await page.press('.page:nth-child(2) .dur input', 'Escape');
	await page.click('#selAll');
	await page.click('.page:nth-child(4) .thumb');
	await settle(300);

	// 20 · comps
	await tab(page, 'comps');
	await page.click('#resSeg button[data-value="3840x2160"]');
	await page.fill('#prefix', 'O SOM DO MAR');
	await page.dispatchEvent('#prefix', 'input');
	await hideToast(); await settle(500);
	await shot(page, '20-comps.png', [
		{ sel: '#resSeg', n: 1, side: 'right', pad: 2 },
		{ sel: '#fpsSeg', n: 2, side: 'right', pad: 2 },
		{ sel: '.stepper', n: 3, side: 'right', pad: 3 },
		{ sel: '#layerSeg', n: 4, side: 'right', pad: 2 },
		{ sel: '#btnSplit', n: 5, side: 'right', pad: 1 }
	]);

	// 21 · ajustes finos abertos
	await page.click('#resSeg button[data-value="1920x1080"]');
	await page.click('#advBtn');
	await settle(600);
	await page.evaluate(() => { document.getElementById('tab-comps').scrollTop = 9999; });
	await settle(300);
	await shot(page, '21-ajustes.png', [
		{ sel: '#advBtn', n: 1, side: 'right', pad: 1 },
		{ sel: '#fitSeg', n: 2, side: 'right', pad: 2 },
		{ sel: '#master', n: 3, side: 'right', pad: 3, target: '.switch-row' },
		{ sel: '#keepAutofit', n: 4, side: 'right', pad: 3, target: '.switch-row' },
		{ sel: '#fallbackFont', n: 5, side: 'right', pad: 2 }
	]);
	await page.click('#advBtn');

	// 30 · fontes
	await tab(page, 'fonts');
	await settle(500);
	await shot(page, '30-fontes.png', [
		{ sel: '#fontBadge', n: 1, side: 'right', pad: 2 },
		{ sel: '.font.missing .dot', n: 2, side: 'left', pad: 4 },
		{ sel: '.font.ok .dot', n: 3, side: 'left', pad: 4 },
		{ sel: '.font.ok .font-preview', n: 4, side: 'right', pad: 0 },
		{ sel: '#btnAuto', n: 5, side: 'top', pad: 1 },
		{ sel: '#btnScan', n: 6, side: 'top', pad: 1 }
	]);

	// 31 · editando uma fonte
	async function pick(key, family, ps, scaleClicks) {
		const row = `.font[data-key="${key}"]`;
		if (!(await page.$(row + '.open'))) { await page.click(row + ' .font-head'); await settle(450); }
		await page.selectOption(row + ' select.family', family);
		if (ps) await page.selectOption(row + ' select.style', ps);
		for (let i = 0; i < (scaleClicks || 0); i++) await page.click(row + ' .s-minus');
		await settle(300);
	}
	await pick('Calibri', 'Carlito', 'Carlito');
	await pick('Calibri Bold', 'Carlito', 'Carlito-Bold');
	await pick('Gotham Black', 'Inter', 'Inter-Black', 1);
	await page.evaluate(() => document.querySelector('.font[data-key="Gotham Black"]').scrollIntoView({ block: 'center' }));
	await settle(600);
	await shot(page, '31-fontes-editar.png', [
		{ sel: '.font[data-key="Gotham Black"] .font-head', n: 1, side: 'right', pad: 2 },
		{ sel: '.font[data-key="Gotham Black"] select.family', n: 2, side: 'left', pad: 2 },
		{ sel: '.font[data-key="Gotham Black"] select.style', n: 3, side: 'top', pad: 2 },
		{ sel: '.font[data-key="Gotham Black"] .scale-step', n: 4, side: 'top', pad: 2 },
		{ sel: '.font[data-key="Gotham Black"] .orig', n: 5, side: 'left', pad: 2 }
	]);

	// 32 · texto do preview
	await page.click('.font[data-key="Gotham Black"] .font-head');
	await page.click('#previewBtn');
	await settle(400);
	await page.fill('#sampleText', 'Créditos 2026 — ÁÉÍÓÚ 0123');
	await page.dispatchEvent('#sampleText', 'input');
	await page.evaluate(() => document.getElementById('fontList').scrollTop = 0);
	await settle(700);
	await shot(page, '32-preview.png', [
		{ sel: '#previewBtn', n: 1, side: 'top', pad: 1 },
		{ sel: '#sampleText', n: 2, side: 'left', pad: 2 },
		{ sel: '#previewSize', n: 3, side: 'top', pad: 4 }
	], { clip: { x: 0, y: 0, width: 460, height: 470 } });
	await page.fill('#sampleText', '');
	await page.dispatchEvent('#sampleText', 'input');
	await page.click('#previewBtn');

	// 40 · criando / concluído / avisos
	const footerClip = async () => { const fb = await (await page.$('footer')).boundingBox(); return { x: 0, y: fb.y - 70, width: 460, height: fb.height + 70 }; };
	await page.evaluate(() => { window.__buildDelay = 700; });
	await page.click('#btnBuild');
	await page.waitForFunction(() => /criando 3\//.test(document.getElementById('ctaText').textContent), null, { timeout: 60000 });
	await settle(250);
	await shot(page, '40-criando.png', [{ sel: '#btnBuild', n: 1, side: 'top', pad: 2 }], { clip: await footerClip() });
	await page.waitForFunction(() => document.getElementById('btnBuild').classList.contains('done'), null, { timeout: 60000 });
	await settle(700);
	await shot(page, '41-concluido.png', [
		{ sel: '#toast', n: 1, side: 'top', pad: 2 },
		{ sel: '#btnLog', n: 2, side: 'top', pad: 2 },
		{ sel: '#btnBuild', n: 3, side: 'top', pad: 2 }
	], { clip: await footerClip() });
	await settle(1500);
	await hideToast();
	await page.click('#btnLog');
	await settle(500);
	await shot(page, '42-avisos.png', [
		{ sel: '#btnLog', n: 1, side: 'left', pad: 2 },
		{ sel: '#log', n: 2, side: 'left', pad: 2 }
	], { clip: await footerClip() });
	await page.click('#btnLog');

	// 50 · trocar fontes depois (sem documento aberto)
	await page.reload();
	await page.waitForFunction(() => /pronto/.test(document.getElementById('status').textContent));
	await tab(page, 'fonts');
	await settle(400);
	await shot(page, '50-fontes-vazio.png', [{ sel: '#emptyScan', n: 1, side: 'right', pad: 2 }], { clip: { x: 0, y: 0, width: 460, height: 420 } });
	await page.click('#emptyScan');
	await page.waitForFunction(() => /fontes encontradas/.test(document.getElementById('status').textContent));
	await hideToast();
	await pick('Calibri Bold', 'Liberation Sans', 'LiberationSans-Bold');
	await page.click('#scopeSeg button[data-value="all"]');
	await page.click('#btnApplyFonts');
	await page.waitForFunction(() => /camadas atualizadas/.test(document.getElementById('status').textContent));
	await settle(650);
	await shot(page, '51-trocar-depois.png', [
		{ sel: '.font[data-key="Calibri Bold"] .font-head', n: 1, side: 'right', pad: 2 },
		{ sel: '#scopeSeg', n: 2, side: 'top', pad: 2 },
		{ sel: '#btnApplyFonts', n: 3, side: 'top', pad: 2 }
	]);

	// 15 · tema claro (o modo automático segue o sistema fora do After Effects)
	{
		const lctx = await browser.newContext({ viewport: { width: 460, height: 860 }, deviceScaleFactor: 2, colorScheme: 'light' });
		const lp = await lctx.newPage();
		lp.on('pageerror', (e) => console.log('[pageerror]', e.message));
		await lp.addInitScript(({ b64, FONTS, PPTX }) => {
			window.__nextFile = PPTX;
			window.ABR_MOCK = {
				openFile: () => window.__nextFile,
				readBinary: (p) => { const bin = atob(b64[p]); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; },
				writeText() { }, writeDataURL() { },
				callHost: (fn) => fn === 'abridor_getFonts' ? JSON.stringify({ fonts: FONTS }) : JSON.stringify({ ok: true })
			};
			try { localStorage.clear(); } catch (e) { }
		}, { b64, FONTS, PPTX });
		await lp.goto('file://' + path.join(ROOT, 'abridor-cep/index.html'));
		await lp.waitForFunction(() => /pronto/.test(document.getElementById('status').textContent));
		await lp.click('#dropZone');
		await lp.waitForFunction(() => /carregado/.test(document.getElementById('status').textContent));
		await lp.evaluate(() => ABR.ui.hideToast());
		await lp.waitForTimeout(900);
		await lp.mouse.move(1, 700);
		await shot(lp, '15-claro-paginas.png', [{ sel: '#themeBtn', n: 1, side: 'left', pad: 1 }]);
		await lp.click('.tab[data-tab=fonts]');
		await lp.waitForTimeout(500);
		await lp.click('.font[data-key="Gotham Black"] .font-head');
		await lp.waitForTimeout(450);
		await lp.selectOption('.font[data-key="Gotham Black"] select.family', 'Inter');
		await lp.waitForTimeout(600);
		await shot(lp, '16-claro-fontes.png', []);
		// detalhe do botão nos três modos
		const modes = [];
		for (const m of ['auto', 'light', 'dark']) {
			await lp.evaluate((m) => { ABR.app.settings.theme = m === 'auto' ? 'dark' : (m === 'light' ? 'auto' : 'light'); document.getElementById('themeBtn').click(); }, m);
			await lp.waitForTimeout(700);
			await lp.mouse.move(1, 700);
			const bb = await (await lp.$('#themeBtn')).boundingBox();
			modes.push(await lp.screenshot({ clip: { x: bb.x - 6, y: bb.y - 10, width: bb.width + 16, height: bb.height + 20 } }));
		}
		await lctx.close();
		// monta a faixa com os três estados do botão
		const sp = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();
		const labels = ['automático', 'claro', 'escuro'];
		await sp.setContent('<body style="margin:0;background:transparent;font:600 22px Inter,sans-serif;color:#8b949e"><div id="s" style="display:inline-flex;gap:28px;padding:14px">' +
			modes.map((m, i) => '<figure style="margin:0;text-align:center"><img src="data:image/png;base64,' + m.toString('base64') + '" style="width:96px;border-radius:14px;display:block;box-shadow:0 2px 10px rgba(0,0,0,.15)"><figcaption style="margin-top:8px">' + labels[i] + '</figcaption></figure>').join('') + '</div></body>');
		await (await sp.$('#s')).screenshot({ path: path.join(OUT, '17-tema-botao.png'), omitBackground: true });
		await sp.close();
		console.log('✓ 17-tema-botao.png');
	}

	// 60 · detecção dos textos (página do PDF, em tamanho grande, com rótulos)
	await openDoc(page, PDF);
	const det = await page.evaluate(async () => {
		const d = ABR.state.doc;
		const out = [];
		for (const idx of [8, 2]) {
			const pg = d.pages[idx];
			const W = 1600, H = 900;
			const url = await d.pdf.renderToSize(pg.index, W, H, 'fit');
			const img = await ABR.loadImage(url);
			const c = document.createElement('canvas');
			c.width = W; c.height = H;
			const g = c.getContext('2d');
			g.drawImage(img, 0, 0);
			ABR.drawTextBoxes(g, pg, W, H, 'fit');
			const s = Math.min(W / pg.width, H / pg.height);
			g.font = '600 15px Inter, sans-serif';
			pg.texts.forEach((t) => {
				const r = t.paragraphs[0].runs[0];
				const al = { left: 'esquerda', center: 'centro', right: 'direita' }[t.align] || t.align;
				const label = r.fontKey + ' · ' + Math.round(r.size * s * 10) / 10 + ' px · ' + al + ' · ' + t.paragraphs.length + (t.paragraphs.length > 1 ? ' linhas' : ' linha');
				const x = t.align === 'right' ? (t.x + t.w) * s - g.measureText(label).width - 12 : t.x * s;
				const y = Math.max(22, t.y * s - 10);
				const w = g.measureText(label).width + 12;
				g.fillStyle = 'rgba(11,13,14,.88)';
				g.fillRect(x, y - 17, w, 22);
				g.fillStyle = '#80D2FF';
				g.fillText(label, x + 6, y - 1);
			});
			out.push(c.toDataURL('image/png'));
		}
		return out;
	});
	fs.writeFileSync(path.join(OUT, '60-deteccao-pdf.png'), Buffer.from(det[0].split(',')[1], 'base64'));
	fs.writeFileSync(path.join(OUT, '61-deteccao-pdf.png'), Buffer.from(det[1].split(',')[1], 'base64'));
	console.log('✓ 60/61-deteccao-pdf.png');

	await openDoc(page, PPTX);
	const ref = await page.evaluate(async () => {
		const pg = ABR.state.doc.pages[2];
		const c = await ABR.renderPptxPage(pg, 1600, 900, 'fit');
		const g = c.getContext('2d');
		ABR.drawTextBoxes(g, pg, 1600, 900, 'fit');
		return c.toDataURL('image/png');
	});
	fs.writeFileSync(path.join(OUT, '62-deteccao-pptx.png'), Buffer.from(ref.split(',')[1], 'base64'));
	console.log('✓ 62-deteccao-pptx.png');

	// 70 · ilustrações (instalador e projeto do After Effects)
	const ill = await browser.newContext({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 2 });
	const ip = await ill.newPage();
	const illus = 'file://' + path.join(__dirname, 'illustrations.html');
	for (const [hash, name] of [['inst-0', '01-instalador-boas-vindas.png'], ['inst-1', '02-instalador-checagem.png'], ['inst-2', '03-instalador-acao.png'], ['inst-3', '04-instalador-concluido.png'], ['menu', '05-menu-extensoes.png'], ['projeto', '70-projeto.png']]) {
		await ip.goto(illus + '#' + hash);
		await ip.waitForTimeout(300);
		const el = await ip.$('#stage');
		await el.screenshot({ path: path.join(OUT, name), omitBackground: true });
		console.log('✓', name);
	}

	await browser.close();
})();
