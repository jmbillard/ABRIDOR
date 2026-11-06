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
			const el = typeof m.sel === 'string' ? document.querySelectorAll(m.sel)[m.i || 0] : null;
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
	await page.mouse.move(1, 700);
	if (marks && marks.length) await annotate(page, marks);
	await page.waitForTimeout(150);
	await page.screenshot(Object.assign({ path: path.join(OUT, name) }, opts || {}));
	await page.evaluate(() => document.querySelectorAll('.__mark').forEach((e) => e.remove()));
	console.log('✓', name);
}

async function openDoc(page, file) {
	await page.evaluate((f) => { window.__nextFile = f; }, file);
	await page.click('#btnOpen');
	await page.waitForFunction(() => /carregado|erro/.test(document.getElementById('status').textContent), null, { timeout: 120000 });
	await page.waitForTimeout(400);
}

async function tab(page, t) {
	await page.click('.tab[data-tab=' + t + ']');
	await page.waitForTimeout(200);
}

(async () => {
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 460, height: 860 }, deviceScaleFactor: 2 });
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
				if (fn === 'abridor_finish') return delay(200, JSON.stringify({ ok: true, comps: window.__nComps || 5, master: window.__master || 'O SOM DO MAR MASTER' }));
				if (fn === 'abridor_applyFonts') return delay(400, JSON.stringify({ ok: true, layers: 14, comps: 6, failed: [] }));
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

	await page.goto('file://' + path.join(ROOT, 'abridor-cep/index.html'));
	await page.waitForFunction(() => /pronto/.test(document.getElementById('status').textContent));

	// 10 · painel vazio
	await page.setViewportSize({ width: 460, height: 520 });
	await shot(page, '10-painel.png', [
		{ sel: '#btnOpen', n: 1, side: 'left' },
		{ sel: '.tabs', n: 2, side: 'left', pad: 1 },
		{ sel: '#btnBuild', n: 3, side: 'left' }
	]);
	await page.setViewportSize({ width: 460, height: 860 });

	// 11 · PDF
	await openDoc(page, PDF);
	await page.click('#grid .card:nth-child(1) .thumb');
	await shot(page, '11-paginas-pdf.png', [
		{ sel: '#docInfo', n: 1, side: 'right' },
		{ sel: '#tab-pages .check', n: 2, side: 'right', pad: 2 },
		{ sel: '#selCount', n: 3, side: 'right', pad: 1 },
		{ sel: '#grid .card', i: 0, n: 4, side: 'right' },
		{ sel: '#grid .card:nth-child(3) .thumb', n: 5, side: 'right', box: false }
	]);

	// 12 · PPTX (slide oculto já desmarcado, duração individual)
	await openDoc(page, PPTX);
	await page.fill('#grid .card:nth-child(1) .meta input[type=number]', '8');
	await page.dispatchEvent('#grid .card:nth-child(1) .meta input[type=number]', 'change');
	await shot(page, '12-paginas-pptx.png', [
		{ sel: '#grid .card:nth-child(4) .tag', n: 1, side: 'left', pad: 2 },
		{ sel: '#grid .card:nth-child(1) .meta input[type=number]', n: 2, side: 'right', pad: 2 },
		{ sel: '#btnExtImages', n: 3, side: 'left' }
	]);

	// 13 · intervalo
	await page.fill('#selRange', '1-3, 5');
	await page.click('#selRangeApply');
	await shot(page, '13-intervalo.png', [
		{ sel: '#selRange', n: 1, side: 'left' },
		{ sel: '#selRangeApply', n: 2, side: 'right' },
		{ sel: '#selCount', n: 3, side: 'right', pad: 1 }
	], { clip: { x: 0, y: 0, width: 460, height: 560 } });
	await page.click('#selAll');
	await page.click('#grid .card:nth-child(4) .thumb');

	// 14 · detalhe da miniatura (textos detectados)
	await page.hover('#grid .card:nth-child(3) .thumb');
	const card = await page.$('#grid .card:nth-child(3)');
	await card.screenshot({ path: path.join(OUT, '14-miniatura.png') });
	console.log('✓ 14-miniatura.png');

	// 20 · comps
	await tab(page, 'comps');
	await page.selectOption('#preset', '3840x2160');
	await page.dispatchEvent('#preset', 'change');
	await page.fill('#prefix', 'O SOM DO MAR');
	await page.dispatchEvent('#prefix', 'input');
	await shot(page, '20-comps.png', [
		{ sel: '#preset', n: 1, side: 'left', pad: 2 },
		{ sel: '#fps', n: 2, side: 'left', pad: 2 },
		{ sel: '#duration', n: 3, side: 'right', pad: 2 },
		{ sel: '#totalTC', n: 4, side: 'right', pad: 2 },
		{ sel: '#prefix', n: 5, side: 'left', pad: 2 },
		{ sel: '#master', n: 6, side: 'left', pad: 3 },
		{ sel: '#refImages', n: 7, side: 'left', pad: 3 }
	]);
	await page.selectOption('#preset', '1920x1080');
	await page.dispatchEvent('#preset', 'change');

	// 30 · fontes (antes)
	await tab(page, 'fonts');
	await shot(page, '30-fontes.png', [
		{ sel: '.tab[data-tab=fonts] .badge', n: 1, side: 'right', pad: 2 },
		{ sel: '.font-row.missing', n: 2, side: 'left', pad: 1 },
		{ sel: '.font-row.ok', n: 3, side: 'left', pad: 1 }
	]);

	// 31 · fontes (depois: troca manual + escala)
	async function pick(key, family, ps, scale) {
		const row = `.font-row[data-key="${key}"]`;
		await page.selectOption(row + ' select.family', family);
		if (ps) await page.selectOption(row + ' select.style', ps);
		if (scale) { await page.fill(row + ' input.scale', String(scale)); await page.dispatchEvent(row + ' input.scale', 'change'); }
		await page.waitForTimeout(150);
	}
	await pick('Gotham Black', 'Inter', 'Inter-Black', 95);
	await pick('Calibri', 'Carlito', 'Carlito');
	await pick('Calibri Bold', 'Carlito', 'Carlito-Bold');
	await page.evaluate(() => document.querySelector('.font-row[data-key="Gotham Black"]').scrollIntoView({ block: 'center' }));
	await shot(page, '31-fontes-trocadas.png', [
		{ sel: '.font-row[data-key="Gotham Black"] select.family', n: 1, side: 'left', pad: 2 },
		{ sel: '.font-row[data-key="Gotham Black"] select.style', n: 2, side: 'top', pad: 2 },
		{ sel: '.font-row[data-key="Gotham Black"] input.scale', n: 3, side: 'top', pad: 2 },
		{ sel: '.font-row[data-key="Gotham Black"] .preview.target', n: 4, side: 'left', pad: 1 },
		{ sel: '.font-row[data-key="Gotham Black"] .preview.orig', n: 5, side: 'left', pad: 1 }
	]);

	// 32 · texto do preview personalizado
	await page.fill('#sampleText', 'Créditos 2026 — ÁÉÍÓÚ áéíóú 0123');
	await page.dispatchEvent('#sampleText', 'input');
	await page.evaluate(() => document.querySelector('.font-list').scrollTop = 0);
	await page.waitForTimeout(200);
	await shot(page, '32-preview.png', [
		{ sel: '#sampleText', n: 1, side: 'left', pad: 2 },
		{ sel: '#previewSize', n: 2, side: 'top', pad: 2 }
	], { clip: { x: 0, y: 0, width: 460, height: 520 } });
	await page.fill('#sampleText', '');
	await page.dispatchEvent('#sampleText', 'input');

	// 40 · criando
	await page.evaluate(() => { window.__buildDelay = 700; });
	await page.click('#btnBuild');
	await page.waitForFunction(() => /criando .* \(3\//.test(document.getElementById('status').textContent), null, { timeout: 60000 });
	await shot(page, '40-criando.png', [
		{ sel: '.progress', n: 1, side: 'right', pad: 4 },
		{ sel: '#status', n: 2, side: 'right', pad: 2 }
	], { clip: { x: 0, y: 700, width: 460, height: 160 } });
	await page.waitForFunction(() => /comps criadas|erro/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
	await page.click('#btnLog');
	await page.waitForTimeout(150);
	const footer = await page.$('footer');
	const fb = await footer.boundingBox();
	await shot(page, '41-concluido.png', [
		{ sel: '#status', n: 1, side: 'top', pad: 2 },
		{ sel: '#btnLog', n: 2, side: 'right', pad: 2 },
		{ sel: '#log', n: 3, side: 'left', pad: 2 }
	], { clip: { x: 0, y: fb.y - 10, width: 460, height: fb.height + 10 } });
	await page.click('#btnLog');

	// 50 · ler fontes do projeto e aplicar (outra sessão, sem documento aberto)
	await page.reload();
	await page.waitForFunction(() => /pronto/.test(document.getElementById('status').textContent));
	await tab(page, 'fonts');
	await page.click('#btnScan');
	await page.waitForFunction(() => /fontes encontradas/.test(document.getElementById('status').textContent));
	await pick('Calibri Bold', 'Liberation Sans', 'LiberationSans-Bold');
	await page.selectOption('#applyScope', 'all');
	await page.click('#btnApplyFonts');
	await page.waitForFunction(() => /camadas atualizadas/.test(document.getElementById('status').textContent));
	await shot(page, '50-trocar-depois.png', [
		{ sel: '#btnScan', n: 1, side: 'left', pad: 2 },
		{ sel: '.font-row[data-key="Calibri Bold"] select.family', n: 2, side: 'left', pad: 2 },
		{ sel: '#applyScope', n: 3, side: 'left', pad: 2 },
		{ sel: '#btnApplyFonts', n: 4, side: 'top', pad: 2 },
		{ sel: '#status', n: 5, side: 'right', pad: 2 }
	]);

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
