// Executa "INSTALAR O ABRIDOR.jsx" em Node com File/Folder/ScriptUI simulados.
// uso: node tests/installer_mock.js <pasta userData temporária>
const fs = require('fs'), path = require('path'), vm = require('vm');
const userData = path.resolve(process.argv[2]);
const script = path.resolve(__dirname, '../INSTALAR O ABRIDOR.jsx');
fs.mkdirSync(userData, { recursive: true });

class Folder {
	constructor(p) { this.fsName = path.resolve(String(p)); }
	get exists() { return fs.existsSync(this.fsName) && fs.statSync(this.fsName).isDirectory(); }
	get name() { return encodeURI(path.basename(this.fsName)); }
	get parent() { return new Folder(path.dirname(this.fsName)); }
	create() { fs.mkdirSync(this.fsName, { recursive: true }); return true; }
	remove() { try { fs.rmdirSync(this.fsName); return true; } catch (e) { return false; } }
	getFiles() { return fs.readdirSync(this.fsName).map(n => { const p = path.join(this.fsName, n); return fs.statSync(p).isDirectory() ? new Folder(p) : new File(p); }); }
}
Folder.userData = new Folder(userData);
class File {
	constructor(p) { this.fsName = path.resolve(String(p)); }
	get exists() { return fs.existsSync(this.fsName); }
	get name() { return encodeURI(path.basename(this.fsName)); }
	get parent() { return new Folder(path.dirname(this.fsName)); }
	open() { return true; } close() { }
	read() { return fs.readFileSync(this.fsName, 'utf8'); }
	copy(t) { try { fs.copyFileSync(this.fsName, String(t)); return true; } catch (e) { return false; } }
	remove() { fs.unlinkSync(this.fsName); return true; }
}
// ScriptUI: qualquer controle aceita qualquer propriedade
let win, buttons = {};
function ctrl(type, text) {
	const o = {
		type, text: text || '', visible: true, enabled: true, value: false, children: [],
		preferredSize: { width: 0, height: 0 }, graphics: { newPen: () => ({}), PenType: {} },
		layout: { layout() { } },
		add(t, b, txt) { const c = ctrl(t, txt); this.children.push(c); if (t === 'button' || t === 'radiobutton') buttons[txt] = c; return c; },
		addEventListener() { }, center() { }, update() { }, close() { this.closed = true; }, show() { }
	};
	return o;
}
const calls = [];
const ctx = {
	$: { os: 'Windows', fileName: script }, File, Folder, decodeURI, encodeURI,
	app: { version: '25.1.0', isoLanguage: 'pt_BR', preferences: { getPrefAsLong: () => 1 }, executeCommand() { } },
	system: { callSystem: c => { calls.push(c); return ''; } },
	Window: function (t, title) { win = ctrl('window', title); return win; }
};
vm.createContext(ctx);
const run = () => vm.runInContext(fs.readFileSync(script, 'utf8').replace(/^﻿/, ''), ctx);
const next = () => { const b = Object.values(buttons).find(b => ['começar', 'próximo', 'instalar', 'atualizar', 'reinstalar', 'remover', 'concluir'].includes(b.text) && b.type === 'button' && b.onClick && b !== buttons['cancelar'] && b !== buttons['anterior']); b.onClick(); };
const result = () => win.children[1].children[3].children[0].text;

const nextText = () => Object.values(buttons).filter(b => b.type === 'button' && b !== buttons['cancelar'] && b !== buttons['anterior']).map(b => b.text).pop();

// AE 23: a checagem mostra o aviso das fontes, então a página aparece
ctx.app.version = '23.0.0'; buttons = {}; run(); next();
console.log('AE 23, após começar:', nextText() === 'próximo' ? 'checagem (com aviso)' : nextText());

// tudo certo: boas-vindas e instalar na mesma página
ctx.app.version = '25.1.0'; buttons = {}; run(); console.log('janela:', win.text);
console.log('AE 25, ao abrir:', nextText() === 'instalar' ? 'instalar (boas-vindas + ação juntas)' : nextText());
next();
console.log('resultado:', result().split('\n')[0]);
const dest = path.join(userData, 'Adobe/CEP/extensions/com.abridor.panel');
console.log('arquivos copiados:', fs.readdirSync(dest).join(', '), '| lib:', fs.readdirSync(path.join(dest, 'js/lib')).length);
console.log('debug mode:', calls.filter(c => /PlayerDebugMode/.test(c)).length, 'comandos');

buttons = {}; run();
console.log('2ª execução, opção:', buttons['reinstalar'] ? 'reinstalar' : buttons['atualizar'] ? 'atualizar' : '?');
buttons['instalar'] = undefined; buttons['remover'].value = true; buttons['reinstalar'].value = false;
next(); console.log('resultado:', result().split('\n')[0], '| existe:', fs.existsSync(dest));

// outros idiomas (textos de i18n/strings.csv, chaves inst.*)
['en_US', 'es_ES'].forEach((lang) => {
	ctx.app.isoLanguage = lang; buttons = {}; run();
	const btns = Object.values(buttons).filter(b => b.type === 'button').map(b => b.text);
	const radios = Object.values(buttons).filter(b => b.type === 'radiobutton').map(b => b.text);
	console.log(lang + ':', win.text, '| botões:', btns.join(' / '), '| opções:', radios.join(' / '));
	const main = Object.values(buttons).filter(b => b.type === 'button').pop();
	main.onClick(); console.log(lang + ' resultado:', result().split('\n')[0], '| botão:', main.text);
});
ctx.app.isoLanguage = 'pt_BR';
