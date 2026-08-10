@echo off
title Nuzlocke Overlay - Instalador
color 0F
echo ============================================
echo    Nuzlocke Overlay - Instalador v1.0
echo ============================================
echo.
echo [1/4] Verificando Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js no encontrado.
    echo     Descargalo desde: https://nodejs.org
    start https://nodejs.org
    echo     Instala Node.js y vuelve a ejecutar este script.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo     Node.js: %NODE_VER%
echo.
echo [2/4] Verificando npm...
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] npm no encontrado. Reinstala Node.js.
    pause
    exit /b 1
)
echo     npm OK
echo.
echo [3/4] Instalando dependencias...
call npm install
if %errorlevel% neq 0 (
    echo [!] Error al instalar dependencias.
    pause
    exit /b 1
)
echo     Dependencias instaladas.
echo.
echo [4/4] Compilando exe portable...
call npx electron-builder --win portable
if %errorlevel% neq 0 (
    echo [!] Error al compilar.
    pause
    exit /b 1
)
echo.
echo ============================================
echo    Listo! Exe en: dist\NuzlockeOverlay.exe
echo ============================================
echo.
echo IMPORTANTE: La carpeta "Recursos" debe estar junto al exe.
echo.
echo Para ejecutar: dist\NuzlockeOverlay.exe
echo Para modo desarrollo: npm start
echo.
pause
