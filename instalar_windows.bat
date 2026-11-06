@echo off
REM ABRIDOR - instalador da extensao CEP para After Effects (Windows)
REM Copia a pasta abridor-cep para a pasta de extensoes do usuario e
REM habilita extensoes nao assinadas (PlayerDebugMode).

setlocal
set "SRC=%~dp0abridor-cep"
set "DEST=%APPDATA%\Adobe\CEP\extensions\com.abridor.panel"

if not exist "%SRC%\CSXS\manifest.xml" (
	echo Pasta abridor-cep nao encontrada ao lado deste arquivo.
	pause
	exit /b 1
)

echo Habilitando extensoes nao assinadas...
for %%V in (9 10 11 12 13) do (
	reg add "HKCU\Software\Adobe\CSXS.%%V" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
)

echo Copiando para "%DEST%"...
if exist "%DEST%" rmdir /s /q "%DEST%"
xcopy "%SRC%" "%DEST%\" /e /i /q /y >nul

echo.
echo Pronto! Reinicie o After Effects e abra: Janela ^> Extensoes ^> ABRIDOR
pause
