/*
 * ABRIDOR - ponte entre o painel (HTML/JS) e o After Effects (ExtendScript)
 * Usa a API nativa window.__adobe_cep__ (a mesma usada pelo CSInterface.js)
 * e o Node.js embutido no CEP para acesso a arquivos.
 *
 * Fora do After Effects (teste no navegador) é possível injetar
 * window.ABR_MOCK com as mesmas funções.
 */
(function (global) {
	'use strict';

	var ABR = global.ABR = global.ABR || {};

	var cep = global.__adobe_cep__;
	var hasNode = typeof global.require === 'function' || typeof require === 'function';
	var nodeRequire = hasNode ? (global.require || require) : null;

	var fs = null, path = null, os = null;
	if (nodeRequire) {
		try {
			fs = nodeRequire('fs');
			path = nodeRequire('path');
			os = nodeRequire('os');
		} catch (e) { fs = null; }
	}

	ABR.isCEP = !!cep;
	ABR.hasFS = !!fs;

	// ---------------------------------------------------------------- host --
	function escapeForJSX(str) {
		return String(str)
			.replace(/\\/g, '\\\\')
			.replace(/'/g, "\\'")
			.replace(/\r/g, '\\r')
			.replace(/\n/g, '\\n');
	}

	// Executa uma função do host.jsx e devolve uma Promise com o retorno (string).
	ABR.callHost = function (fnName, args) {
		args = args || [];
		var call = fnName + '(' + args.map(function (a) {
			if (typeof a === 'number' || typeof a === 'boolean') return String(a);
			return "'" + escapeForJSX(a) + "'";
		}).join(',') + ')';

		return new Promise(function (resolve, reject) {
			if (cep) {
				cep.evalScript(call, function (res) {
					if (res === 'EvalScript error.') reject(new Error('Erro no ExtendScript: ' + call));
					else resolve(res);
				});
			} else if (global.ABR_MOCK && global.ABR_MOCK.callHost) {
				Promise.resolve(global.ABR_MOCK.callHost(fnName, args)).then(resolve, reject);
			} else {
				reject(new Error('After Effects não encontrado (painel fora do CEP).'));
			}
		});
	};

	// Chama o host e interpreta a resposta como JSON.
	ABR.callHostJSON = function (fnName, args) {
		return ABR.callHost(fnName, args).then(function (res) {
			var obj;
			try { obj = JSON.parse(res); } catch (e) {
				throw new Error('Resposta inválida do After Effects: ' + String(res).slice(0, 300));
			}
			if (obj && obj.error) throw new Error(obj.error);
			return obj;
		});
	};

	// ----------------------------------------------------------------- fs --
	ABR.fs = {
		tmpDir: function () {
			if (os) return path.join(os.tmpdir(), 'ABRIDOR');
			return '/tmp/ABRIDOR';
		},
		join: function () {
			if (path) return path.join.apply(path, arguments);
			return Array.prototype.join.call(arguments, '/');
		},
		dirname: function (p) {
			if (path) return path.dirname(p);
			return p.replace(/[\\/][^\\/]*$/, '');
		},
		basename: function (p, ext) {
			if (path) return path.basename(p, ext);
			var b = p.replace(/^.*[\\/]/, '');
			if (ext && b.slice(-ext.length) === ext) b = b.slice(0, -ext.length);
			return b;
		},
		mkdirp: function (dir) {
			if (!fs) return;
			if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
		},
		exists: function (p) {
			if (fs) return fs.existsSync(p);
			return false;
		},
		readBinary: function (p) {
			if (fs) {
				var buf = fs.readFileSync(p);
				return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
			}
			if (global.ABR_MOCK && global.ABR_MOCK.readBinary) return global.ABR_MOCK.readBinary(p);
			throw new Error('Sem acesso ao sistema de arquivos.');
		},
		writeText: function (p, text) {
			if (fs) { fs.writeFileSync(p, text, 'utf8'); return; }
			if (global.ABR_MOCK && global.ABR_MOCK.writeText) return global.ABR_MOCK.writeText(p, text);
		},
		writeDataURL: function (p, dataURL) {
			var b64 = dataURL.replace(/^data:[^,]+,/, '');
			if (fs) { fs.writeFileSync(p, Buffer.from(b64, 'base64')); return; }
			if (global.ABR_MOCK && global.ABR_MOCK.writeDataURL) return global.ABR_MOCK.writeDataURL(p, dataURL);
		},
		remove: function (p) {
			if (fs && fs.existsSync(p)) fs.unlinkSync(p);
		},
		listImages: function (dir) {
			if (!fs) return [];
			return fs.readdirSync(dir).filter(function (f) {
				return /\.(png|jpe?g)$/i.test(f);
			}).map(function (f) { return path.join(dir, f); });
		}
	};

	// ------------------------------------------------------------ dialogs --
	ABR.dialog = {
		// Retorna o caminho de um arquivo (ou null).
		openFile: function (title, exts) {
			if (global.cep && global.cep.fs && global.cep.fs.showOpenDialogEx) {
				var r = global.cep.fs.showOpenDialogEx(false, false, title, '', exts);
				if (r && r.err === 0 && r.data && r.data.length) return Promise.resolve(r.data[0]);
				return Promise.resolve(null);
			}
			if (global.ABR_MOCK && global.ABR_MOCK.openFile) return Promise.resolve(global.ABR_MOCK.openFile(title, exts));
			return Promise.resolve(null);
		},
		// Retorna o caminho de uma pasta (ou null).
		openFolder: function (title) {
			if (global.cep && global.cep.fs && global.cep.fs.showOpenDialogEx) {
				var r = global.cep.fs.showOpenDialogEx(false, true, title, '', []);
				if (r && r.err === 0 && r.data && r.data.length) return Promise.resolve(r.data[0]);
				return Promise.resolve(null);
			}
			if (global.ABR_MOCK && global.ABR_MOCK.openFolder) return Promise.resolve(global.ABR_MOCK.openFolder(title));
			return Promise.resolve(null);
		}
	};

	// Abre um link no navegador do sistema.
	ABR.openURL = function (url) {
		if (global.cep && global.cep.util && global.cep.util.openURLInDefaultBrowser) {
			global.cep.util.openURLInDefaultBrowser(url);
		} else {
			global.open(url, '_blank');
		}
	};

	// Lê o tema do After Effects para ajustar as cores do painel.
	ABR.hostSkin = function () {
		if (!cep) return null;
		try {
			var env = JSON.parse(cep.getHostEnvironment());
			return env.appSkinInfo;
		} catch (e) { return null; }
	};

})(window);
