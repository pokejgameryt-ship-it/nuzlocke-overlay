@echo off
title Nuzlocke Overlay - Instalador
color 0F
chcp 65001 >nul 2>&1

:: ============================================
:: CONFIGURACION - Cambiar el link de MediaFire aqui
:: ============================================
set "MEDIAFIRE_URL=PEGA_TU_LINK_DE_MEDIAFIRE_AQUI"
set "RECURSOS_ZIP=Recursos.zip"
set "RECURSOS_DIR=Recursos"

echo.
echo  ╔═══════════════════════════════════════╗
echo  ║   Nuzlocke Overlay - Instalador v1.0  ║
echo  ╚═══════════════════════════════════════╝
echo.

:: ============================================
:: Paso 1: Comprobar Node.js
:: ============================================
echo  [1/7] Comprobando Node.js...
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
echo  [2/7] Comprobando npm...
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
:: Paso 3: Descargar sprites de MediaFire
:: ============================================
echo  [3/7] Comprobando carpeta de sprites...
if exist "%RECURSOS_DIR%\Sprites" (
    echo         Carpeta Recursos\Sprites ya existe. OK.
) else (
    if "%MEDIAFIRE_URL%"=="PEGA_TU_LINK_DE_MEDIAFIRE_AQUI" (
        echo.
        echo  ┌─────────────────────────────────────────────────┐
        echo  │  AVISO: Carpeta Recursos no encontrada.         │
        echo  │                                                 │
        echo  │  Sin esta carpeta no se veran los sprites.      │
        echo  │  Coloca la carpeta "Recursos" junto al exe.     │
        echo  └─────────────────────────────────────────────────┘
        echo.
    ) else (
        echo         Descargando sprites desde MediaFire...
        echo         Esto puede tardar varios minutos (~8.5 GB).
        echo.
        
        :: Intentar descargar con curl (incluido en Windows 10+)
        where curl >nul 2>&1
        if %errorlevel% equ 0 (
            curl -L -o "%RECURSOS_ZIP%" "%MEDIAFIRE_URL%" --progress-bar
        ) else (
            :: Fallback a PowerShell
            powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'Continue'; Invoke-WebRequest -Uri '%MEDIAFIRE_URL%' -OutFile '%RECURSOS_ZIP%'"
        )
        
        if %errorlevel% neq 0 (
            echo.
            echo  ERROR: Fallo al descargar. Intenta manualmente:
            echo    1. Descarga el ZIP desde: %MEDIAFIRE_URL%
            echo    2. Renombralo a: %RECURSOS_ZIP%
            echo    3. Ponlo en esta carpeta
            echo    4. Vuelve a ejecutar setup.bat
            echo.
            pause
            exit /b 1
        )
        
        echo         Descarga completada. Extrayendo archivos...
        
        :: Extraer con PowerShell
        powershell -Command "Expand-Archive -Path '%RECURSOS_ZIP%' -DestinationPath '.' -Force"
        
        if %errorlevel% neq 0 (
            echo  ERROR: Fallo al extraer el ZIP.
            pause
            exit /b 1
        )
        
        :: Limpiar ZIP
        del /f /q "%RECURSOS_ZIP%" >nul 2>&1
        echo         Sprites extraidos correctamente.
    )
)
echo.

:: ============================================
:: Paso 4: Instalar dependencias de Node
:: ============================================
echo  [4/7] Instalando dependencias...
echo         Esto puede tardar 1-2 minutos.
echo.
call npm install
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Fallo al instalar dependencias.
    pause
    exit /b 1
)
echo.
echo         Dependencias instaladas.
echo.

:: ============================================
:: Paso 5: Compilar executable
:: ============================================
echo  [5/7] Compilando executable...
echo         Esto puede tardar 3-5 minutos.
echo.
call npx electron-builder --win portable
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Fallo al compilar.
    pause
    exit /b 1
)
echo.
echo         Executable compilado: dist\NuzlockeOverlay.exe
echo.

:: ============================================
:: Paso 6: Copiar exe a carpeta raiz
:: ============================================
echo  [6/7] Preparando archivos finales...
if exist "dist\NuzlockeOverlay.exe" (
    copy /Y "dist\NuzlockeOverlay.exe" "NuzlockeOverlay.exe" >nul 2>&1
    echo         NuzlockeOverlay.exe listo en la carpeta raiz.
)
echo.

:: ============================================
:: Paso 7: Limpiar archivos temporales
:: ============================================
echo  [7/7] Limpiando archivos temporales...
if exist "node_modules\.cache" rd /s /q "node_modules\.cache" >nul 2>&1
echo         Limpieza completada.
echo.

:: ============================================
:: Completado
:: ============================================
echo  ╔═══════════════════════════════════════════════════════╗
echo  ║              INSTALACION COMPLETADA                   ║
echo  ╠═══════════════════════════════════════════════════════╣
echo  ║                                                       ║
echo  ║  Para ejecutar la app:                                ║
echo  ║    - Doble clic en NuzlockeOverlay.exe                ║
echo  ║    - O ejecuta start.bat                              ║
echo  ║                                                       ║
echo  ║  Para configurar en OBS:                              ║
echo  ║    1. Abre la app                                     ║
echo  ║    2. Crea un proyecto                                ║
echo  ║    3. Selecciona tu save file                         ║
echo  ║    4. Copia la URL de OBS                             ║
echo  ║    5. En OBS: Fuente de navegador (1920x1080)         ║
echo  ║                                                       ║
echo  ╚═══════════════════════════════════════════════════════╝
echo.
pause
