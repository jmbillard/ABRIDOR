// Prévia das micro-interações: prancha com os ícones do painel (GIF) e gravação do painel real.
// uso: node tests/micro_preview.js <saída>
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), OUT = path.resolve(process.argv[2] || 'out');
fs.mkdirSync(OUT, { recursive: true });
const PPTX = path.join(ROOT, 'test files/exemplo_creditos.pptx');
const FONTS = [['Inter', 'Bold', 'Inter-Bold'], ['Inter', 'Light', 'Inter-Light']].map(([f, s, p]) => ({ f, s, p, n: f + ' ' + s, l: '' }));
const gif = (src, dst, w) => {
	execSync(`ffmpeg -y -loglevel error -i "${src}" -vf "fps=15,scale=${w}:-1:flags=lanczos,palettegen=max_colors=96:stats_mode=diff" "${OUT}/pal.png"`);
	execSync(`ffmpeg -y -loglevel error -i "${src}" -i "${OUT}/pal.png" -lavfi "fps=15,scale=${w}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle" "${dst}"`);
};
const newest = () => fs.readdirSync(OUT).filter((f) => f.endsWith('.webm')).map((f) => path.join(OUT, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

async function page(b, opts) {
	const ctx = await b.newContext(Object.assign({ viewport: { width: 460, height: 860 }, colorScheme: 'dark' }, opts));
	const p = await ctx.newPage();
	p.on('pageerror', (e) => console.log('ERR', e.message));
	const b64 = fs.readFileSync(PPTX).toString('base64');
	await p.addInitScript(({ b64, PPTX, FONTS }) => {
		const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
		window.ABR_MOCK = { openFile: () => PPTX, readBinary: () => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }, writeText() { }, writeDataURL() { },
			callHost: (fn) => fn === 'abridor_getFonts' ? JSON.stringify({ fonts: FONTS }) : fn === 'abridor_buildPage' ? delay(900, JSON.stringify({ ok: true, log: [] })) : fn === 'abridor_finish' ? JSON.stringify({ ok: true, comps: 5 }) : JSON.stringify({ ok: true }) };
		try { localStorage.clear(); localStorage.setItem('abridor.tourDone', '1'); } catch (e) { }
	}, { b64, PPTX, FONTS });
	await p.goto('file://' + path.join(ROOT, 'abridor-cep/index.html'));
	await p.addStyleTag({ content: '.tip{display:none!important}' });
	await p.waitForTimeout(500);
	return { ctx, p };
}

(async () => {
	const b = await chromium.launch();

	// 1 · prancha: cada ícone num botão, o hover passa de um em um
	{
		const { ctx, p } = await page(b, { viewport: { width: 640, height: 470 }, recordVideo: { dir: OUT, size: { width: 640, height: 470 } } });
		await p.evaluate(() => {
			const I = ABR.ui.icon;
			const list = [['swap', 'trocar documento'], ['sparkle', 'criar comps'], ['pages', 'páginas'], ['comps', 'comps'], ['fonts', 'fontes'], ['all', 'todas'], ['none', 'nenhuma'], ['invert', 'inverter'],
				['range', 'intervalo'], ['boxes', 'textos detectados'], ['image', 'imagens externas'], ['clock', 'duração'], ['search', 'filtrar'], ['type', 'preview'], ['wand', 'auto-associar'], ['project', 'ler do projeto'],
				['refresh', 'recarregar'], ['master', 'comp master'], ['tune', 'ajustes finos'], ['split', 'dividir em linhas'], ['help', 'tour'], ['sun', 'tema claro'], ['moon', 'tema escuro'], ['alert', 'avisos']];
			const box = document.createElement('div');
			box.id = 'board';
			box.style.cssText = 'position:fixed;inset:0;z-index:99;background:var(--bg);padding:20px;display:grid;grid-template-columns:repeat(6,1fr);gap:12px;align-content:start';
			box.innerHTML = '<div style="grid-column:1/-1;color:var(--muted);font-size:12px;margin-bottom:4px">micro-interações · hover em cada ícone</div>' +
				list.map(([n, l]) => '<button class="mi-tile" style="border:0;background:var(--surface);border-radius:12px;padding:12px 4px 10px;color:var(--muted);display:flex;flex-direction:column;align-items:center;gap:8px;font-size:10px;transition:background .2s,color .2s">' +
					I(n).replace('class="ico', 'style="width:26px;height:26px" class="ico') + '<span>' + l + '</span></button>').join('');
			document.body.appendChild(box);
			const st = document.createElement('style');
			st.textContent = '.mi-tile.hov{background:var(--surface-3)!important;color:var(--txt)!important}';
			document.head.appendChild(st);
			const tiles = Array.from(box.querySelectorAll('.mi-tile'));
			let k = 0;
			setInterval(() => {
				tiles.forEach((t) => t.classList.remove('hov'));
				const t = tiles[k % tiles.length];
				void t.offsetWidth;
				t.classList.add('hov');
				k++;
			}, 700);
		});
		await p.waitForTimeout(700 * 24 + 900);
		await p.screenshot({ path: path.join(OUT, 'board.png') });
		await ctx.close();
		gif(newest(), path.join(OUT, 'micro-icones.gif'), 640);
	}

	// 2 · painel real: pílula, setas do documento, x do preview, estrelas no hover e cintilando ao criar
	{
		const { ctx, p } = await page(b, { recordVideo: { dir: OUT, size: { width: 460, height: 860 } } });
		const move = async (sel) => { const r = await (await p.$(sel)).boundingBox(); await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2, { steps: 12 }); };
		await p.click('#dropZone');
		await p.waitForFunction(() => /carregado/.test(document.getElementById('status').textContent));
		await p.evaluate(() => ABR.ui.hideToast());
		await p.waitForTimeout(600);
		await move('#docChip'); await p.waitForTimeout(900); await p.mouse.move(230, 400, { steps: 8 }); await p.waitForTimeout(300);
		await move('#docChip'); await p.waitForTimeout(900);
		await move('.tab[data-tab=comps]'); await p.waitForTimeout(700);
		await move('.tab[data-tab=fonts]'); await p.waitForTimeout(500); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(500);
		await move('#previewBtn'); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(500);
		await p.keyboard.type('Créditos 2026', { delay: 70 }); await p.waitForTimeout(400);
		await move('.clear-btn[data-clear=sampleText]'); await p.waitForTimeout(500);
		{ const bb = await p.locator('#sampleText').boundingBox(); await p.screenshot({ path: path.join(OUT, 'clear.png'), clip: { x: 0, y: Math.max(0, bb.y - 50), width: 460, height: 110 } }); }
		await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(700);
		await move('#btnScan'); await p.waitForTimeout(800);
		await move('#btnAuto'); await p.waitForTimeout(800);
		await move('#btnBuild'); await p.waitForTimeout(900);
		await p.screenshot({ path: path.join(OUT, 'header.png'), clip: { x: 0, y: 0, width: 460, height: 60 } });
		await p.mouse.down(); await p.mouse.up();
		await p.waitForTimeout(600);
		if (await p.$('#preWrap [data-act=go]')) await p.click('#preWrap [data-act=go]');
		await p.waitForTimeout(1300);
		await p.screenshot({ path: path.join(OUT, 'twinkle.png'), clip: { x: 0, y: 790, width: 460, height: 70 } });
		await p.waitForTimeout(4200);
		await ctx.close();
		gif(newest(), path.join(OUT, 'micro-painel.gif'), 400);
	}
	await b.close();
	console.log('ok');
})();
