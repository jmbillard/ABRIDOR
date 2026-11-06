// Executa o jsx/host.jsx em Node com um mock mínimo do After Effects
// e desenha o resultado (camadas de texto) num SVG sobre a imagem de referência.
// uso: node tests/host_mock.js <job.json> <pasta de saída> [refDir]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const jobPath = path.resolve(process.argv[2]);
const outDir = path.resolve(process.argv[3]);
const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
if (process.env.LINES) { job.settings.lines = process.env.LINES === '1'; fs.writeFileSync(jobPath, JSON.stringify(job)); }
let nextId = 1;

class Prop {
	constructor(v) { this.v = v; this.numKeys = 0; }
	setValue(v) { this.v = v; }
	get value() { return this.v; }
}
class Group {
	constructor(map) { this.map = map; }
	property(n) { return this.map[n]; }
}
class TextDocument {
	constructor(text, box) {
		this.text = text; this.font = 'ArialMT'; this.fontSize = 36; this.leading = 43; this.autoLeading = true;
		this.justification = 'L'; this.tracking = 0; this.fillColor = [1, 1, 1]; this.ranges = [];
		if (box) { this.boxText = true; this.boxTextSize = box; this.boxTextPos = [-box[0] / 2, -box[1] / 2]; }
	}
	resetCharStyle() { } resetParagraphStyle() { }
	characterRange(a, b) {
		// como no AE: lê o estilo atual do trecho (doc + trechos aplicados) e grava alterações
		const doc = this, r = { a, b };
		const props = ['font', 'fontSize', 'fillColor', 'tracking', 'leading', 'autoLeading', 'applyFill'];
		props.forEach((p) => {
			let v = doc[p];
			doc.ranges.forEach((x) => { if (!x.para && x.a <= a && a < x.b && x['_' + p] !== undefined) v = x['_' + p]; });
			r['_' + p] = undefined;
			Object.defineProperty(r, p, { get() { return r['_' + p] !== undefined ? r['_' + p] : v; }, set(nv) { r['_' + p] = nv; }, enumerable: true });
		});
		this.ranges.push(r);
		return r;
	}
	paragraphRange(a, b) { const r = { a, b, para: true }; this.ranges.push(r); return r; }
	get baselineLocs() {
		if (!this.boxText) throw new Error('n/a');
		const lines = this.text.split('\r').length;
		const out = [];
		for (let i = 0; i < lines; i++) {
			const y = this.boxTextPos[1] + this.fontSize * 0.8 + i * this.leading;
			out.push(this.boxTextPos[0], y, this.boxTextPos[0] + this.boxTextSize[0], y);
		}
		return out;
	}
}
const INSTALLED = ['ArialMT', 'Arial-BoldMT', 'Georgia', 'Calibri', 'Calibri-Bold'];
class Layer {
	constructor(comp, type, arg) {
		this.comp = comp; this.type = type; this.name = ''; this.comment = ''; this.locked = false;
		const tr = { 'ADBE Anchor Point': new Prop([0, 0, 0]), 'ADBE Position': new Prop([comp.width / 2, comp.height / 2, 0]),
			'ADBE Rotate Z': new Prop(0), 'ADBE Scale': new Prop([100, 100, 100]), 'ADBE Opacity': new Prop(100) };
		this.tr = new Group(tr);
		if (type !== 'av') {
			const td = new TextDocument(type === 'box' ? '' : arg, type === 'box' ? arg : null);
			const p = new Prop(td);
			const self = this;
			// o AE devolve uma cópia; o mock rejeita fontes não instaladas
			p.setValue = function (v) {
				const c = Object.assign(Object.create(TextDocument.prototype), v);
				if (INSTALLED.indexOf(c.font) < 0) c.font = 'ArialMT';
				c.ranges = v.ranges.slice();
				this.v = c;
			};
			Object.defineProperty(p, 'value', { get() { const c = Object.assign(Object.create(TextDocument.prototype), this.v); c.ranges = this.v.ranges.slice(); return c; } });
			this.text = new Group({ 'ADBE Text Document': p });
			this.__proto__ = TextLayer.prototype;
		}
		this.selected = false;
		this.parent = null; this.label = 0; this.threeDLayer = false; this.startTime = 0; this.outPoint = 10;
	}
	property(n) { return n === 'ADBE Transform Group' ? this.tr : this.text; }
	get containingComp() { return this.comp; }
	get inPoint() { return 0; }
	moveToEnd() { const L = this.comp._layers; L.splice(L.indexOf(this), 1); L.push(this); }
	moveBefore(o) { const L = this.comp._layers; L.splice(L.indexOf(this), 1); L.splice(L.indexOf(o), 0, this); }
	remove() { const L = this.comp._layers; L.splice(L.indexOf(this), 1); }
	// largura aproximada: 0,5 x tamanho por caractere
	sourceRectAtTime() { const td = this.text.property('ADBE Text Document').value; return { left: 0, top: -td.fontSize, width: td.text.length * td.fontSize * 0.5, height: td.fontSize }; }
}
class TextLayer extends Layer { }
class CompItem {
	constructor(name, w, h, par, dur, fps) {
		Object.assign(this, { name, width: w, height: h, pixelAspect: par, duration: dur, frameRate: fps, id: nextId++ });
		this._layers = [];
		const self = this;
		this.layers = {
			addBoxText(sz) { const l = new Layer(self, 'box', sz); self._layers.unshift(l); return l; },
			addText(t) { const l = new Layer(self, 'point', t); self._layers.unshift(l); return l; },
			add(item) { const l = new Layer(self, 'av'); l.source = item; self._layers.unshift(l); return l; }
		};
		this.markerProperty = { setValueAtTime(t, m) { (self.markers = self.markers || []).push([t, m.name]); } };
	}
	get numLayers() { return this._layers.length; }
	layer(i) { return this._layers[i - 1]; }
	openInViewer() { this.opened = true; }
	remove() { const k = items.indexOf(this); if (k >= 0) items.splice(k, 1); }
}
class FolderItem {
	constructor(name) { this.name = name; this.id = nextId++; this.comment = ''; this.parentFolder = null; this.selected = false; }
	get numItems() { return items.filter((i) => i.parentFolder === this).length; }
	item(i) { return items.filter((x) => x.parentFolder === this)[i - 1]; }
	remove() { const k = items.indexOf(this); if (k >= 0) items.splice(k, 1); }
}
const items = [];
const root = new FolderItem('root');
const project = {
	rootFolder: root,
	get numItems() { return items.length; },
	item(i) { return items[i - 1]; },
	items: {
		addFolder(n) { const f = new FolderItem(n); f.parentFolder = root; items.push(f); return f; },
		addComp(...a) { const c = new CompItem(...a); items.push(c); return c; }
	},
	importFile(opt) { const f = { name: path.basename(opt.file.path), width: job.settings.width, height: job.settings.height, id: nextId++, file: opt.file.path, remove() { items.splice(items.indexOf(this), 1); } }; items.push(f); return f; },
	selection: [],
	activeItem: null
};
class File {
	constructor(p) { this.path = p; }
	get exists() { return fs.existsSync(this.path) || /ref_/.test(this.path); }
	open() { } close() { }
	read() { return fs.readFileSync(this.path, 'utf8'); }
}
const ctx = {
	app: { project, version: '25.0x50', fonts: null, beginUndoGroup() { }, endUndoGroup() { }, executeCommand() { }, findMenuCommandId() { return 0; } },
	File, FolderItem, CompItem, TextLayer, TextDocument,
	ImportOptions: function (f) { this.file = f; },
	MarkerValue: function (n) { this.name = n; },
	ParagraphJustification: { LEFT_JUSTIFY: 'L', CENTER_JUSTIFY: 'C', RIGHT_JUSTIFY: 'R', FULL_JUSTIFY_LASTLINE_LEFT: 'J' },
	$: {}
};
ctx.$.global = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../abridor-cep/jsx/host.jsx'), 'utf8'), ctx);

function call(expr) {
	const r = vm.runInContext(expr, ctx);
	const o = JSON.parse(r);
	if (o.error) throw new Error(expr + ' -> ' + o.error);
	return o;
}
const jp = JSON.stringify(jobPath);
function runJob(mode) {
	job.settings.mode = mode;
	delete job.folderName;
	if (mode === 'side') {
		const ins = call(`abridor_inspect(${JSON.stringify(job.docName)})`);
		job.folderName = job.docName + ' ' + ins.next;
	}
	fs.writeFileSync(jobPath, JSON.stringify(job));
	call(`abridor_begin(${jp})`);
	const sum = { updated: 0, added: 0, left: 0, isNew: 0 };
	job.pages.forEach((p, i) => {
		const r = call(`abridor_buildPage(${jp}, ${i})`);
		if (r.log.length && !process.env.QUIET) console.log(p.compName, r.log);
		['updated', 'added', 'left'].forEach((k) => { sum[k] += r[k] || 0; });
		if (r.isNew) sum.isNew++;
	});
	const fin = call(`abridor_finish(${jp})`);
	return Object.assign(sum, { master: fin.master, reused: fin.reused, masterId: fin.masterId, folderId: fin.folderId });
}
const MODES = (process.env.MODES || 'new').split(',');
MODES.forEach((m) => {
	const r = runJob(m);
	const comps = items.filter((i) => i instanceof CompItem).length;
	const folders = items.filter((i) => i instanceof FolderItem && i.parentFolder && i.parentFolder.name === 'ABRIDOR').map((f) => f.name);
	console.log('modo', m.padEnd(7), '| comps novas', r.isNew, '| atualizadas', r.updated, '| acrescentadas', r.added, '| sobraram', r.left, '| master', r.master, r.reused ? '(mantida)' : '', '| total comps no projeto', comps, '| pastas', folders.join(' / '));
	if (m === MODES[0]) console.log('inspect depois:', JSON.stringify(call(`abridor_inspect(${JSON.stringify(job.docName)})`)));
	// simula um ajuste à mão antes da rodada "só os textos" seguinte
	if (m === MODES[0]) {
		const c = items.find((i) => i instanceof CompItem && /02$/.test(i.name));
		const l = c._layers.find((x) => x instanceof TextLayer);
		l.tr.property('ADBE Position').setValue([111, 222, 0]);
		const p = l.text.property('ADBE Text Document'); const d = p.value; d.text = 'EDITADO À MÃO'; p.setValue(d);
		global.__probe = l;
	}
	if (m === 'texts' && global.__probe && !global.__probed) {
		global.__probed = true;
		const l = global.__probe;
		console.log('   camada ajustada à mão → posição', JSON.stringify(l.tr.property('ADBE Position').value), '| texto', JSON.stringify(l.text.property('ADBE Text Document').value.text), '| ainda no projeto:', l.comp._layers.includes(l));
	}
});
console.log('reveal master', JSON.stringify(call(`abridor_reveal(${items.find((i) => i instanceof CompItem && /MASTER/.test(i.name)).id})`)));
// passo extra: dividir em linhas as comps selecionadas no painel Project
if (process.env.SPLIT) {
	project.selection = items.filter((i) => i instanceof CompItem && !/MASTER/.test(i.name));
	console.log('splitLines', call('abridor_splitLines()'));
}

// SVG de conferência (antes da troca de fontes não guardamos; usa o estado atual)
const comps = items.filter(i => i instanceof CompItem && !/MASTER/.test(i.name)).slice(0, job.pages.length);
fs.mkdirSync(outDir, { recursive: true });
comps.forEach((c, ci) => {
	const W = c.width, H = c.height;
	let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
	const ref = job.pages[ci].refImage && path.join(process.argv[4] || path.join(path.dirname(jobPath), "refs"), path.basename(job.pages[ci].refImage));
	if (ref && fs.existsSync(ref)) svg += `<image href="file://${ref}" width="${W}" height="${H}" opacity="0.5"/>`;
	else svg += `<rect width="${W}" height="${H}" fill="#222"/>`;
	c._layers.filter(l => l instanceof TextLayer).forEach(l => {
		const td = l.text.property('ADBE Text Document').value;
		const pos = l.tr.property('ADBE Position').value, an = l.tr.property('ADBE Anchor Point').value;
		const rot = l.tr.property('ADBE Rotate Z').value;
		const ox = pos[0] - an[0], oy = pos[1] - an[1];
		const lines = td.text.split('\r');
		const anchor = { L: 'start', C: 'middle', R: 'end', J: 'start' }[td.justification];
		const col = 'rgb(' + td.fillColor.map(v => Math.round(v * 255)).join(',') + ')';
		svg += `<g transform="rotate(${rot} ${pos[0]} ${pos[1]})">`;
		let x0 = ox, y0 = oy;
		if (td.boxText) {
			const [bx, by] = td.boxTextPos, [bw, bh] = td.boxTextSize;
			svg += `<rect x="${ox + bx}" y="${oy + by}" width="${bw}" height="${bh}" fill="none" stroke="#0af" stroke-dasharray="4"/>`;
			x0 = ox + bx + (anchor === 'middle' ? bw / 2 : anchor === 'end' ? bw : 0);
			y0 = oy + by + td.fontSize * 0.8;
		}
		lines.forEach((t, i) => {
			svg += `<text x="${x0}" y="${y0 + i * td.leading}" font-family="Arial" font-size="${td.fontSize}" fill="${col}" text-anchor="${anchor}">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`;
		});
		svg += `<circle cx="${pos[0]}" cy="${pos[1]}" r="4" fill="red"/></g>`;
	});
	svg += '</svg>';
	fs.writeFileSync(path.join(outDir, `comp_${ci + 1}.svg`), svg);
});
// re-aplica fontes trocando tudo para Georgia com 90%
const mapPath = path.join(outDir, 'map.json');
const map = {};
for (const k in job.fontMap) map[k] = { ps: 'Georgia', scale: 90 };
fs.writeFileSync(mapPath, JSON.stringify({ map }));
console.log('applyFonts', call(`abridor_applyFonts(${JSON.stringify(mapPath)}, 'all')`));
console.log('scan', JSON.stringify(call('abridor_scanProject()')).slice(0, 300));

const last = comps[1]._layers.filter(l => l instanceof TextLayer)[0];
console.log('exemplo comment:', last.comment);
console.log('exemplo ranges:', JSON.stringify(last.text.property('ADBE Text Document').value.ranges).slice(0, 400));

// converte os SVGs em PNG para conferência
(async () => {
	const { chromium } = require('playwright');
	const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
	const pg = await b.newPage({ viewport: { width: comps[0].width, height: comps[0].height } });
	for (let i = 0; i < comps.length; i++) {
		await pg.goto('file://' + path.join(outDir, `comp_${i + 1}.svg`));
		await pg.screenshot({ path: path.join(outDir, `comp_${i + 1}.png`) });
	}
	await b.close();
})();
