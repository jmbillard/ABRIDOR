// Gera o banner (PNG 360x84) do instalador com o logo e grava a string ExtendScript em "INSTALAR O ABRIDOR.jsx".
// uso: node tests/make_banner.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const OPENER = '<g transform="rotate(-40 12 12)"><path fill="#fff" fill-rule="evenodd" d="M9.6 1.2h4.8a2.6 2.6 0 0 1 2.6 2.6v16.4a2.6 2.6 0 0 1-2.6 2.6H9.6A2.6 2.6 0 0 1 7 20.2V3.8a2.6 2.6 0 0 1 2.6-2.6z M10.2 3.9h3.6a1 1 0 0 1 1 1v4.6h-1.9V8.1h-1.8v1.4H9.2V4.9a1 1 0 0 1 1-1z M12 17.2a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z"/></g>';

(async () => {
	const b = await chromium.launch();
	const p = await b.newPage({ viewport: { width: 360, height: 84 }, deviceScaleFactor: 1 });
	await p.setContent(`<body style="margin:0;width:360px;height:84px;background:#0e0f11;font-family:Inter,sans-serif;position:relative;overflow:hidden">
		<div style="position:absolute;left:18px;top:17px;width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#4c9dff,#8f7cff);display:grid;place-items:center;box-shadow:0 6px 16px rgba(76,157,255,.35)">
			<svg viewBox="0 0 24 24" width="30" height="30">${OPENER}</svg></div>
		<div style="position:absolute;left:74px;top:16px;color:#fff;font-weight:700;font-size:22px;letter-spacing:5px">ABRIDOR</div>
		<div style="position:absolute;left:75px;top:46px;color:#9aa0a8;font-size:11.5px">layouts de PPTX e PDF no After Effects</div>
		<div style="position:absolute;left:0;right:0;bottom:0;height:3px;background:linear-gradient(90deg,#4c9dff,#8f7cff)"></div>
	</body>`);
	const png = await p.screenshot({ type: 'png' });
	await b.close();
	fs.writeFileSync(path.join(ROOT, 'docs/img/banner.png'), png);

	let lit = "'";
	for (const byte of png) {
		const c = String.fromCharCode(byte);
		if (c === "'" || c === '\\') lit += '\\' + c;
		else if (byte >= 32 && byte < 127) lit += c;
		else lit += '\\x' + byte.toString(16).toUpperCase().padStart(2, '0');
	}
	lit += "'";
	const file = path.join(ROOT, 'INSTALAR O ABRIDOR.jsx');
	let src = fs.readFileSync(file, 'utf8');
	src = src.replace(/var BANNER = '(?:[^'\\]|\\.)*';/, () => 'var BANNER = ' + lit + ';');
	fs.writeFileSync(file, src);
	console.log('banner:', png.length, 'bytes');
})();
