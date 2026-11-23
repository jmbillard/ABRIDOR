// Passeio de uso real: primeira vez (tour), PDF de verdade, painel estreito. Grava um print por passo e avisa de estouros de layout.
// uso: [W=340 H=640] node tests/ux_walk.js <saída>
// passeio de uso real: primeira vez, painel estreito, PDF de verdade
const { chromium } = require('./pw');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), OUT = path.resolve(process.argv[2] || 'out'); fs.mkdirSync(OUT, { recursive: true });
const W = +(process.env.W || 340), H = +(process.env.H || 640);
const FILES = { pdf: path.join(ROOT, 'test files/Template Dramaturgia Curta_Aumenta que é rock_150824.pdf'), pptx: path.join(ROOT, 'test files/exemplo_creditos.pptx'), pptx2: path.join(ROOT, 'test files/teste_abridor.pptx') };
const B64 = {}; for (const k in FILES) B64[FILES[k]] = fs.readFileSync(FILES[k]).toString('base64');
const FONTS = []; const fam = (f, st) => st.forEach(([s, p]) => FONTS.push({ f, s, p, n: f + ' ' + s, l: '' }));
fam('Inter', [['Light', 'Inter-Light'], ['Regular', 'Inter-Regular'], ['Bold', 'Inter-Bold'], ['Black', 'Inter-Black']]);
fam('Carlito', [['Regular', 'Carlito'], ['Bold', 'Carlito-Bold']]); fam('Liberation Sans', [['Regular', 'LiberationSans'], ['Bold', 'LiberationSans-Bold']]);
fam('Montserrat', [['Regular', 'Montserrat-Regular'], ['SemiBold', 'Montserrat-SemiBold'], ['Bold', 'Montserrat-Bold'], ['ExtraBold', 'Montserrat-ExtraBold']]);
for (let i = 0; i < 60; i++) fam('Fonte Teste ' + i, [['Regular', 'FonteTeste' + i + '-Regular'], ['Bold', 'FonteTeste' + i + '-Bold']]);
let n = 0;
(async () => {
	const b = await chromium.launch();
	const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: 'dark' });
	const errs = []; p.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR', e.message); });
	p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });
	await p.addInitScript(({ B64, FILES, FONTS }) => {
		const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
		window.__next = FILES.pdf; window.__calls = [];
		window.ABR_MOCK = {
			openFile: () => window.__next, exists: (pp) => !!B64[pp],
			readBinary: (pp) => { const bin = atob(B64[pp]); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; },
			writeText() { }, writeDataURL() { },
			callHost: (fn, args) => {
				window.__calls.push(fn);
				if (fn === 'abridor_getFonts') return JSON.stringify({ fonts: FONTS });
				if (fn === 'abridor_inspect') return JSON.stringify({ ok: true, version: '25.1x10', ranges: true, next: 2, existing: window.__existing || null });
				if (fn === 'abridor_buildPage') return delay(350, JSON.stringify({ ok: true, texts: 3, log: window.__warn ? ['fonte "Gotham" indisponível → ArialMT'] : [] }));
				if (fn === 'abridor_finish') return JSON.stringify({ ok: true, comps: 3, mode: 'new', master: 'X MASTER', masterId: 7, folderId: 3 });
				if (fn === 'abridor_scanFonts') return JSON.stringify({ ok: true, fonts: {} });
				return JSON.stringify({ ok: true });
			}
		};
	}, { B64, FILES, FONTS });
	const shot = async (name) => { const f = String(++n).padStart(2, '0') + '-' + name + '.png'; await p.screenshot({ path: path.join(OUT, f) }); return f; };
	const st = () => p.textContent('#status');
	const info = async (label) => console.log(label, '| status:', JSON.stringify(await st()), '| toast:', JSON.stringify(await p.evaluate(() => { const t = document.getElementById('toast'); return t.classList.contains('show') ? t.textContent : ''; })));
	// overflow horizontal?
	const overflow = async (label) => { const o = await p.evaluate(() => { const out = []; const vw = document.documentElement.clientWidth; document.querySelectorAll('body *').forEach((el) => { if (!el.offsetParent) return; const r = el.getBoundingClientRect(); if (r.width && (r.right > vw + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed') { let a = el, hid = false; while (a && a !== document.body) { const s = getComputedStyle(a); if (/hidden|auto|scroll|clip/.test(s.overflowX) && a !== el) { hid = true; break; } a = a.parentElement; } if (!hid) out.push((el.id ? '#' + el.id : el.className && el.className.baseVal === undefined ? '.' + String(el.className).split(' ')[0] : el.tagName) + ' ' + Math.round(r.left) + '..' + Math.round(r.right)); } }); return { vw, sw: document.documentElement.scrollWidth, out: out.slice(0, 8) }; }); if (o.sw > o.vw || o.out.length) console.log('OVERFLOW', label, JSON.stringify(o)); };

	await p.goto('file://' + ROOT + '/abridor-cep/index.html'); await p.waitForTimeout(800);
	await shot('vazio'); await overflow('vazio'); await info('início');

	// abre o PDF (1ª vez → tour)
	await p.click('#dropZone'); await p.waitForTimeout(600); await shot('lendo');
	await p.waitForFunction(() => document.querySelectorAll('.page').length > 0 && !document.querySelector('.skeleton'), null, { timeout: 120000 }); await p.waitForTimeout(1500);
	await shot('pdf-aberto'); await info('pdf aberto'); await overflow('pdf aberto');
	console.log('tour visível:', await p.evaluate(() => !!document.querySelector('.tour, .tour-card, #tour')), '| páginas:', await p.$$eval('.page', (e) => e.length));
	// tour: Enter avança até acabar
	for (let i = 0; i < 7; i++) { if (!(await p.evaluate(() => !!document.querySelector('.tour-card, .tour-welcome')))) break; await shot('tour-' + i); await overflow('tour ' + i); await p.keyboard.press('Enter'); await p.waitForTimeout(900); }
	await shot('depois-do-tour'); await info('depois do tour');

	// páginas
	await p.click('.tab[data-tab=pages]'); await p.waitForTimeout(500);
	await p.click('.page:nth-child(2) .thumb'); await p.waitForTimeout(300);
	await p.hover('.page:nth-child(5) .thumb'); await p.keyboard.down('Shift'); await p.waitForTimeout(400); await shot('shift-hover'); await p.click('.page:nth-child(5) .thumb'); await p.keyboard.up('Shift'); await p.waitForTimeout(400);
	await shot('paginas-desmarcadas'); console.log('sel:', await p.textContent('.sel-count'));
	await p.click('#rangeBtn'); await p.waitForTimeout(400); await p.keyboard.type('1-3, 9-'); await p.waitForTimeout(300); await shot('intervalo'); await overflow('intervalo aberto');
	await p.keyboard.press('Enter'); await p.waitForTimeout(400); console.log('sel após intervalo:', await p.textContent('.sel-count')); await info('intervalo');
	await p.keyboard.press('Escape'); await p.waitForTimeout(300);
	// duração de uma página
	await p.click('.page:nth-child(1) .dur'); await p.waitForTimeout(300); await p.keyboard.type('8'); await shot('dur-pagina'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
	await p.evaluate(() => document.querySelector('main').scrollTo(0, 99999)); await p.waitForTimeout(300); await shot('paginas-fim');
	await p.evaluate(() => document.querySelector('main').scrollTo(0, 0));

	// comps
	await p.keyboard.press('2'); await p.waitForTimeout(700); console.log('atalho 2 → aba', await p.evaluate(() => ABR.app.state.tab)); await shot('comps'); await overflow('comps');
	await p.click('#resSeg [data-value=custom]'); await p.waitForTimeout(500); await shot('comps-custom');
	await p.click('#resSeg [data-value="3840x2160"]'); await p.waitForTimeout(300);
	await p.click('#advBtn'); await p.waitForTimeout(600); await p.evaluate(() => document.querySelector('main').scrollTo(0, 99999)); await p.waitForTimeout(300); await shot('comps-fim'); await overflow('comps fim');
	await p.fill('#prefix', 'ABERTURA NOVELA DAS NOVE CAPITULO'); await p.waitForTimeout(300); await shot('comps-nome-longo');

	// fontes
	await p.keyboard.press('Escape'); await p.click('.tab[data-tab=fonts]'); await p.waitForTimeout(800); await shot('fontes'); await overflow('fontes'); await info('fontes');
	console.log('fontes:', await p.$$eval('.font', (e) => e.map((x) => x.className + ' | ' + x.querySelector('.src').textContent + ' → ' + x.querySelector('.dst').textContent)));
	const first = await p.$('.font.missing .font-head') || await p.$('.font .font-head');
	await first.click(); await p.waitForTimeout(600); await shot('fonte-aberta'); await overflow('fonte aberta');
	const fld = await p.$('.font.open .picker-field'); if (fld) { await fld.click(); await p.waitForTimeout(500); await shot('seletor'); await overflow('seletor'); await p.keyboard.type('mont'); await p.waitForTimeout(400); await shot('seletor-busca'); await p.keyboard.press('Enter'); await p.waitForTimeout(700); await shot('fonte-escolhida'); await info('fonte escolhida'); }
	await p.click('#previewBtn'); await p.waitForTimeout(500); await p.keyboard.type('Aumenta que é rock'); await p.waitForTimeout(400); await shot('preview'); await overflow('preview');
	await p.click('#searchBtn'); await p.waitForTimeout(400); await p.keyboard.type('zzz'); await p.waitForTimeout(400); await shot('filtro-vazio'); await p.click('.clear-btn[data-clear=fontFilter]'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);

	// criar
	await p.click('#btnBuild'); await p.waitForTimeout(700); await shot('criar-1'); await overflow('folha'); await info('clicou criar');
	const go = await p.$('.pre-sheet [data-act=go]'); if (go) { await go.click(); await p.waitForTimeout(700); }
	await shot('criando'); await p.waitForFunction(() => !document.getElementById('btnBuild').classList.contains('working'), null, { timeout: 60000 }); await p.waitForTimeout(600); await shot('criado'); await info('criado'); await overflow('criado');

	// idioma e tema no meio do uso
	await p.click('#langBtn'); await p.waitForTimeout(500); await shot('idioma-en'); await overflow('en');
	await p.click('.tab[data-tab=comps]'); await p.waitForTimeout(500); await shot('comps-en'); await overflow('comps en');
	await p.click('#langBtn'); await p.waitForTimeout(500); await p.click('.tab[data-tab=fonts]'); await p.waitForTimeout(500); await shot('fontes-es'); await overflow('fontes es');
	await p.click('#themeBtn'); await p.waitForTimeout(700); await shot('tema-claro');
	await p.click('#langBtn'); await p.waitForTimeout(400);

	// 2º documento com a aba fontes aberta; já existe no projeto
	await p.evaluate((f) => { window.__next = f; window.__existing = { name: 'exemplo_creditos', comps: 6, created: new Date(Date.now() - 3600e3).toString() }; window.__warn = true; }, FILES.pptx);
	await p.click('#docChip'); await p.waitForFunction(() => /exemplo/.test(document.getElementById('docName').textContent)); await p.waitForTimeout(2000); await shot('pptx-aberto'); await info('pptx');
	await p.click('.tab[data-tab=pages]'); await p.waitForTimeout(600); await shot('pptx-paginas');
	await p.keyboard.press('Control+Enter'); await p.waitForTimeout(800); await shot('folha-existente'); await overflow('folha existente');
	const go2 = await p.$('.pre-sheet [data-act=go]'); if (go2) { await go2.click(); await p.waitForFunction(() => !document.getElementById('btnBuild').classList.contains('working'), null, { timeout: 60000 }); await p.waitForTimeout(700); }
	await shot('criado-com-avisos'); await info('criado 2');
	const lg = await p.$('#btnLog:not(.hidden)'); if (lg) { await lg.click(); await p.waitForTimeout(600); await shot('avisos'); }
	console.log('erros de página:', errs.length);
	await b.close();
})();
