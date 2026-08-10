@echo off
title Nuzlocke Overlay - Instalador
color 0F
chcp 65001 >nul 2>&1

echo.
echo  ╔═══════════════════════════════════════╗
echo  ║   Nuzlocke Overlay - Instalador v1.0  ║
echo  ╚═══════════════════════════════════════╝
echo.

:: ============================================
:: Paso 1: Comprobar Node.js
:: ============================================
echo  [1/6] Comprobando Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ┌─────────────────────────────────────┐
    echo  │  ERROR: Node.js no encontrado.      │
    echo  │                                     │
    echo  │  Descargalo desde:                  │
    echo  │  https://nodejs.org/                │
    echo  │                                     │
    echo  │  Instala la version LTS y vuelve   │
    echo  │  a ejecutar este script.            │
    echo  └─────────────────────────────────────┘
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo         Node.js %NODE_VER% encontrado.
echo.

:: ============================================
:: Paso 2: Comprobar npm
:: ============================================
echo  [2/6] Comprobando npm...
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: npm no encontrado. Reinstala Node.js.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('npm --version') do set NPM_VER=%%i
echo         npm v%NPM_VER% encontrado.
echo.

:: ============================================
:: Paso 3: Instalar dependencias de Node
:: ============================================
echo  [3/6] Instalando dependencias...
echo         Esto puede tardar 1-2 minutos la primera vez.
echo.
call npm install --production=false
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Fallo al instalar dependencias.
    echo  Intenta ejecutar: npm install manualmente.
    pause
    exit /b 1
)
echo.
echo         Dependencias instaladas.
echo.

:: ============================================
:: Paso 4: Verificar carpeta Recursos
:: ============================================
echo  [4/6] Comprobando carpeta de sprites...
if exist "Recursos\Sprites" (
    echo         Carpeta Recursos\Sprites encontrada.
) else (
    echo.
    echo  ┌─────────────────────────────────────────────────┐
    echo  │  AVISO: Carpeta Recursos\Sprites no encontrada. │
    echo  │                                                 │
    echo  │  Sin esta carpeta no se veran los sprites.      │
    echo  │  Coloca la carpeta "Recursos" junto al exe.     │
    echo  │                                                 │
    echo  │  La app funcionara pero sin imagenes hasta que  │
    echo  │  pongas la carpeta en la raiz del proyecto.     │
    echo  └─────────────────────────────────────────────────┘
    echo.
)
echo.

:: ============================================
:: Paso 5: Compilar executable
:: ============================================
echo  [5/6] Compilando executable portable...
echo         Esto puede tardar 3-5 minutos.
echo.
call npx electron-builder --win portable
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Fallo al compilar. Intenta manualmente:
    echo    npx electron-builder --win portable
    pause
    exit /b 1
)
echo.
echo         Executable compilado: dist\NuzlockeOverlay.exe
echo.

:: ============================================
:: Paso 6: Copiar a carpeta raiz
:: ============================================
echo  [6/6] Copiando executable a carpeta raiz...
if exist "dist\NuzlockeOverlay.exe" (
    copy /Y "dist\NuzlockeOverlay.exe" "NuzlockeOverlay.exe" >nul 2>&1
    echo         Copiado: NuzlockeOverlay.exe
) else (
    echo         No se pudo copiar. Buscalo en dist\
)
echo.

:: ============================================
:: Completado
:: ============================================
echo  ╔═══════════════════════════════════════════════╗
echo  ║          INSTALACION COMPLETADA               ║
echo  ╠═══════════════════════════════════════════════╣
echo  ║                                               ║
echo  ║  Para ejecutar la app:                        ║
echo  ║    - Doble clic en NuzlockeOverlay.exe        ║
echo  ║    - O ejecuta start.bat                      ║
echo  ║    - O ejecuta: npm start                     ║
echo  ║                                               ║
echo  ║  Para configurar en OBS:                      ║
echo  ║    1. Abre la app                             ║
echo  ║    2. Crea un proyecto                        ║
echo  ║    3. Copia la URL de OBS                     ║
echo  ║    4. En OBS: Fuente de navegador             ║
echo  ║    5. Pega la URL (1920x1080)                 ║
echo  ║                                               ║
echo  ╚═══════════════════════════════════════════════╝
echo.
pause
