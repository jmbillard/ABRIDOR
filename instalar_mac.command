#!/bin/bash
# ABRIDOR - instalador da extensão CEP para After Effects (macOS)
# Copia a pasta abridor-cep para a pasta de extensões do usuário e
# habilita extensões não assinadas (PlayerDebugMode).

SRC="$(cd "$(dirname "$0")" && pwd)/abridor-cep"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/com.abridor.panel"

if [ ! -f "$SRC/CSXS/manifest.xml" ]; then
	echo "Pasta abridor-cep não encontrada ao lado deste arquivo."
	exit 1
fi

echo "Habilitando extensões não assinadas..."
for v in 9 10 11 12 13; do
	defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1
done

echo "Copiando para $DEST ..."
rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
cp -R "$SRC" "$DEST"

echo
echo "Pronto! Reinicie o After Effects e abra: Janela > Extensões > ABRIDOR"
