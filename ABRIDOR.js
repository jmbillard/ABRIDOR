var scriptName = 'ABRIDOR';
var scriptVersion = '0.1b';

var lClick = '◖  →  ';
var rClick = ' ◗  →  ';
var dClick = '◖◖ →  ';

var txtColor = '#F2F2F2';
var monoColor1 = '#C7C8CA';
var monoColor2 = '#939598';
var monoColor3 = '#4B4C4E';
var bgColor1 = '#0B0D0E';
var bgColor2 = '#060F13';
var divColor1 = '#002133';
var divColor2 = '#004266';
var normalColor1 = '#05A6FF';
var normalColor2 = '#80D2FF';
var highlightColor1 = '#8800f8';
var highlightColor2 = '#8640BF';

// Determina o sistema operacional atual: 'Win' para Windows, 'Mac' para macOS.
var appOs = $.os.indexOf('Win') >= 0 ? 'Win' : 'Mac';

function readFileContent(file) {
	var fileContent;

	file.open('r');
	file.encoding = 'UTF-8'; // → file encoding
	fileContent = file.read();
	file.close();

	return fileContent.toString();
}

// Converte um array RGB normalizado [0-1] para uma string hexadecimal (ex: '#FF0000').
function rgbToHEX(rgbArray) {
	// Converte os componentes RGB normalizados de volta para valores de 0 a 255.
	const r = Math.round(rgbArray[0] * 255);
	const g = Math.round(rgbArray[1] * 255);
	const b = Math.round(rgbArray[2] * 255);

	// Converte os componentes para hexadecimal e junta em uma string.
	return ('#' + componentToHex(r) + componentToHex(g) + componentToHex(b)).toUpperCase();
}

// Converte uma string hexadecimal (com ou sem '#') para um array RGB normalizado.
function hexToRGB(hex) {
	// Remove o caractere '#' se estiver presente
	hex = hex.replace('#', '');

	// Extrai os componentes RGB do hexadecimal e converte para valores de 0 a 255
	var r = parseInt(hex.substring(0, 2), 16);
	var g = parseInt(hex.substring(2, 4), 16);
	var b = parseInt(hex.substring(4, 6), 16);

	// Retorna o array com os valores RGB normalizados
	return [r / 255, g / 255, b / 255];
}

// Altera a cor de fundo da janela.
function setBgColor(w, hex) {
	var color = hexToRGB(hex);                    // Converte a cor hexadecimal em RGB.
	var bType = w.graphics.BrushType.SOLID_COLOR; // Define o tipo do pincel como cor sólida.
	w.graphics.backgroundColor = w.graphics.newBrush(bType, color); // Aplica o pincel com a nova cor à janela.
}

function themeButton(sectionGrp, ctrlProperties) {
	var newUiCtrlObj = {};
	var tipTxt = ctrlProperties.tips.join('\n\n'); // Dica de ajuda;
	var newBtnGrp = sectionGrp.add('group');
	newBtnGrp.orientation = 'stack';

	newUiCtrlObj.leftClick = newBtnGrp.add('button', undefined, '');
	newUiCtrlObj.leftClick.size = [0, 0];
	newUiCtrlObj.leftClick.visible = false;
	newUiCtrlObj.rightClick = newBtnGrp.add('button', undefined, '');
	newUiCtrlObj.rightClick.size = [0, 0];
	newUiCtrlObj.rightClick.visible = false;

	newUiCtrlObj.label = newBtnGrp.add('customButton');
	newUiCtrlObj.label.width = ctrlProperties.width;
	newUiCtrlObj.label.height = ctrlProperties.height;
	newUiCtrlObj.label.text = ctrlProperties.labelTxt;
	newUiCtrlObj.label.buttonColor = divColor1;
	newUiCtrlObj.label.textColor = normalColor1;

	if (ctrlProperties.buttonColor != undefined) newUiCtrlObj.label.buttonColor = ctrlProperties.buttonColor;
	if (ctrlProperties.textColor != undefined) newUiCtrlObj.label.textColor = ctrlProperties.textColor;

	newUiCtrlObj.label.preferredSize = [
		newUiCtrlObj.label.width,
		newUiCtrlObj.label.height,
	];
	newUiCtrlObj.label.minimumSize = [68, 34];
	newUiCtrlObj.label.helpTip = tipTxt;

	drawThemeButton(newUiCtrlObj.label, false);

	newUiCtrlObj.label.addEventListener('mouseover', function () {
		drawThemeButton(this, true);
	});

	newUiCtrlObj.label.addEventListener('mouseout', function () {
		drawThemeButton(this, false);
	});

	newUiCtrlObj.label.onClick = function () {
		this.parent.children[0].notify();
	};

	newUiCtrlObj.label.addEventListener('click', function (c) {
		if (c.button == 2) this.parent.children[1].notify();
	});

	return newUiCtrlObj;
}

function drawThemeButton(button, hover) {
	var g = button.graphics;
	var textPen = g.newPen(
		g.PenType.SOLID_COLOR,
		hexToRGB(button.textColor),
		1,
	);
	var fillBrush = g.newBrush(
		g.BrushType.SOLID_COLOR,
		hexToRGB(button.buttonColor),
	);
	var textSize = g.measureString(button.text);

	if (hover) {
		textPen = g.newPen(g.PenType.SOLID_COLOR, [1, 1, 1, 1], 1);
		fillBrush = g.newBrush(
			g.BrushType.SOLID_COLOR,
			hexToRGB(highlightColor1),
		);
	}

	button.onDraw = function () {
		if (!this.enabled) {
			textPen = g.newPen(g.PenType.SOLID_COLOR, hexToRGB(divColor1), 1);
			fillBrush = g.newBrush(g.BrushType.SOLID_COLOR, hexToRGB(bgColor));
		}
		g.newPath();
		g.ellipsePath(0, 0, this.height, this.height);
		g.fillPath(fillBrush);
		g.ellipsePath(this.width - this.height, 0, this.height, this.height);
		g.rectPath(this.height / 2, 0, this.width - this.height, this.height);
		// g.strokePath(textPen);
		g.fillPath(fillBrush);
		// drawRoundedRect(g, fillBrush, this.width, this.height, 30);

		g.drawString(this.text, textPen, (this.width - textSize.width) / 2, 0);
	};
}

function drawRoundedRect(g, brush, width, height, cornerRadius) {
	g.newPath();
	g.ellipsePath(0, 0, cornerRadius, cornerRadius);
	g.fillPath(brush);
	g.ellipsePath(width - cornerRadius, 0, cornerRadius, cornerRadius);
	g.fillPath(brush);
	g.ellipsePath(width - cornerRadius, height - cornerRadius, cornerRadius, cornerRadius);
	g.fillPath(brush);
	g.ellipsePath(0, height - cornerRadius, cornerRadius, cornerRadius);
	g.fillPath(brush);
	g.newPath();

	var coords = [
		0,
		(cornerRadius / 2),
		(cornerRadius / 2),
		0,
		width - (cornerRadius / 2),
		0,
		width,
		(cornerRadius / 2),
		width,
		height - (cornerRadius / 2),
		width - (cornerRadius / 2),
		height,
		(cornerRadius / 2),
		height,
		0,
		height - (cornerRadius / 2)
	];

	for (var i = 0; i <= coords.length - 1; i += 2) {
		if (i === 0) {
			g.moveTo(coords[i], coords[i + 1]);
		} else {
			g.lineTo(coords[i], coords[i + 1]);
		}
	}
	g.fillPath(brush);
}

// Função para desenhar o botão personalizado.
function customDraw() {
	with (this) {                                  // Refere-se ao próprio botão (this).
		graphics.drawOSControl();                  // Desenha o contorno padrão do botão.
		graphics.rectPath(0, 0, size[0], size[1]); // Define o caminho de um retângulo no tamanho do botão.
		graphics.fillPath(fillBrush);              // Preenche o retângulo com a cor definida em 'fillBrush'.
	}
}

// Define a cor de um botão.
function setUiCtrlColor(ctrl, hex) {
	var color = hexToRGB(hex);                           // Converte a cor hexadecimal em RGB.
	var bType = ctrl.graphics.BrushType.SOLID_COLOR;        // Define o tipo do pincel como cor sólida.
	ctrl.fillBrush = ctrl.graphics.newBrush(bType, color); // Cria um novo pincel com a cor e o aplica ao botão.
}

// Adiciona um divisor visual na seção 'sectionGrp'
function themeDivider(sectionGrp) {
	var newDiv = sectionGrp.add("customButton", [0, 0, 1, 1]);
	setUiCtrlColor(newDiv, divColor1);
	newDiv.onDraw = customDraw;

	return newDiv;
}

// Abre um URL no navegador padrão do sistema operacional (Windows ou macOS).
function openURL(url) {
	if (appOs === 'Win') {
		// Comando para abrir o URL no Windows Explorer (que também pode abrir URLs)
		system.callSystem('explorer ' + url);

	} else if (appOs === 'Mac') {
		// Comando para abrir o URL no navegador padrão do macOS
		system.callSystem('open ' + url);
	}
}

function buildComp(structureObj) {

	var imagesArray = app.project.importFileWithDialog();

	if (imagesArray == null) {
		imagesArray = [];

		alert('a comp \'LAYOUT ABERTURA\' será criada sem imagens de referência');
	}

	var pageCount = structureObj.extended_metadata.page_count;
	var textArray = [];

	var compDuration = 60; // em segundos
	var compW = 1920;
	var compH = 1080;
	var compAspect = 1;
	var compFPS = 29.97;
	var comp = app.project.items.addComp('LAYOUT ABERTURA', compW, compH, compAspect, compDuration, compFPS);
	var f = 1;

	var layerDuration = compDuration / pageCount;
	var layerInPoint;
	var layerOutPoint;

	for (var i = 0; i < structureObj.elements.length; i++) {

		var element = structureObj.elements[i];

		if (!element.Text) continue;
		if (element.Path.match(/Figure/i)) continue;

		// alert (element.Text);
		var page = element.Page;
		var bounds = element.Bounds;
		var pageW = structureObj.pages[page].width;
		var pageH = structureObj.pages[page].height;
		var fW = compW / pageW;
		var fH = compH / pageH;
		f = Math.min(fW, fH);

		var currentText = comp.layers.addBoxText([(bounds[2] - bounds[0]) * fW, (bounds[3] - bounds[1]) * fH]);

		var textProp = currentText.property("ADBE Text Properties").property("ADBE Text Document");
		var textDoc = textProp.value;
		textDoc.resetCharStyle();

		var txtProp = {
			text: element.Text,
			fontSize: element.TextSize * f,
			justification: 7413,
			tracking: 0
		};
		if (element.attributes.TextAlign == 'Center') txtProp.justification = 7415;
		if (element.attributes.TextAlign == 'End') txtProp.justification = 7414;
		if (element.attributes.LineHeight != undefined) txtProp.leading = element.attributes.LineHeight * fH;

		for (var p in txtProp) {

			textDoc[p] = txtProp[p];
			textProp.setValue(textDoc);
		}

		try {
			textDoc.font = element.Font.name.replace(/^.+\+/, '');
			textProp.setValue(textDoc);
		} catch (err) {
			textDoc.font = 'ArialMT';
			textProp.setValue(textDoc);
			textDoc.fontSize *= 0.8;
			textProp.setValue(textDoc);
		}

		// transformations...
		var transform = currentText.property('ADBE Transform Group');

		var posX = (bounds[0] + (bounds[2] - bounds[0]) / 2) * fW;
		var posY = (pageH - bounds[1] - (bounds[3] - bounds[1]) / 2) * fH;
		transform.property('ADBE Position').setValue([posX, posY, 0]);

		currentText.moveToEnd();

		layerInPoint = page * layerDuration;
		layerOutPoint = layerInPoint + layerDuration;
		currentText.inPoint = layerInPoint;
		currentText.outPoint = layerOutPoint;
		textArray.push(currentText);
	}

	var refFolder = app.project.items.addFolder('ABERTURA REF'); // Cria uma pasta no projeto.

	for (var l = 0; l < imagesArray.length; l++) {

		imagesArray[l].parentFolder = refFolder; // Move o novo logo para a pasta criada anteriormente.
		var refImage = comp.layers.add(imagesArray[l]);
		refImage.moveToEnd();
		f = compW / refImage.width * 100;

		var transform = refImage.property('ADBE Transform Group');
		transform.property('ADBE Scale').setValue([f, f, f]);
		layerInPoint = l * layerDuration;
		layerOutPoint = layerInPoint + layerDuration;

		refImage.inPoint = layerInPoint;
		refImage.outPoint = layerOutPoint;
		refImage.guideLayer = true;
		refImage.locked = true;
	}
	comp.openInViewer();
}

function ABRIDOR_UI() {

	// window...
	var ABRIDOR_w = new Window('palette', scriptName + ' - ' + scriptVersion, undefined);
	ABRIDOR_w.orientation = 'column';
	ABRIDOR_w.alignChildren = ['center', 'top'];
	ABRIDOR_w.spacing = 12;
	ABRIDOR_w.margins = 16;

	var mainGrp = ABRIDOR_w.add('group');
	mainGrp.orientation = 'row';
	mainGrp.alignChildren = ['left', 'top'];
	mainGrp.spacing = 12;

	var siteBtn = new themeButton(mainGrp, {
		width: 120,
		height: 32,
		labelTxt: 'abrir site',
		tips: [lClick + 'abrir o site para extrair a estrutura do pdf']
	});

	var newDiv = new themeDivider(mainGrp);
	newDiv.alignment = ['center', 'fill'];

	var structureBtn = new themeButton(mainGrp, {
		width: 120,
		height: 32,
		textColor: bgColor1,
		buttonColor: normalColor1,
		labelTxt: 'criar abertura',
		tips: [lClick + 'cria uma comp \'LAYOUT ABERTURA\' com a estrutura do pdf salva em um arquivo .json']
	});

	setBgColor(ABRIDOR_w, bgColor1); // Cor de fundo da janela

	structureBtn.leftClick.onClick = function () {

		var structureFile = File.openDialog('selecione o arquivo de estrutura', '*.json', false);

		if (structureFile == null) {
			alert('não é possível criar uma abertura sem um arquivo de estrutura');
			return;
		}
		var structureContent = readFileContent(structureFile);
		var structureObj = JSON.parse(structureContent);

		app.project.setDefaultImportFolder(structureFile.parent);
		
		if (!structureObj.elements) return;
		if (!structureObj.extended_metadata.page_count) return;

		app.beginUndoGroup('criar comp de abertura');
	
		buildComp(structureObj);

		app.endUndoGroup();
	}

	siteBtn.leftClick.onClick = function () {

		openURL('https://acrobatservices.adobe.com/dc-visualizer-app/index.html');

	}
	ABRIDOR_w.show();
}

ABRIDOR_UI();