// Exporta os ícones do painel (abridor-cep/js/ui.js) como SVG para o README (docs/img/icons).
const fs = require('fs');
const path = require('path');
global.window = global;
global.matchMedia = () => ({ matches: false });
global.addEventListener = () => { };
require('../abridor-cep/js/ui.js');
const out = path.resolve(__dirname, '../docs/img/icons');
fs.mkdirSync(out, { recursive: true });
const names = { 'eye-off': 'eyeOff', clock: 'clock', type: 'type', image: 'image', boxes: 'boxes', range: 'range', wand: 'wand', project: 'project', refresh: 'refresh', search: 'search' };
for (const file in names) {
	const svg = ABR.ui.icon(names[file])
		.replace(/class="[^"]*"/, '')
		.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="#8b949e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ')
		.replace(/currentColor/g, '#8b949e');
	fs.writeFileSync(path.join(out, file + '.svg'), svg + '\n');
}
console.log(fs.readdirSync(out).join(' '));
