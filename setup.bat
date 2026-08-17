@echo off
title Nuzlocke Overlay - Instalador v2.0
color 0F
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

:: ============================================
:: CONFIGURACION
:: ============================================
set "GITHUB_REPO=pokejgameryt-ship-it/nuzlocke-overlay"
set "GITHUB_API=https://api.github.com/repos/%GITHUB_REPO%/releases/latest"
set "GITHUB_EXE_URL=https://github.com/%GITHUB_REPO%/releases/latest/download/NuzlockeOverlay.exe"
set "RECURSOS_URL=https://www.mediafire.com/file/PEGA_TU_LINK_AQUI"
set "DOTNET_VERSION=8.0"
set "DOTNET_INSTALLER=%TEMP%\dotnet-runtime-installer.exe"
set "DOTNET_CHECK=%ProgramFiles%\dotnet\dotnet.exe"

echo.
echo  ╔═══════════════════════════════════════════╗
echo  ║   Nuzlocke Overlay - Instalador v2.0     ║
echo  ║   Soporte: Gen 1 a Gen 9                 ║
echo  ╚═══════════════════════════════════════════╝
echo.

:: ============================================
:: Paso 1: Comprobar conexion a internet
:: ============================================
echo  [1/6] Comprobando conexion a internet...
ping -n 1 github.com >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ┌─────────────────────────────────────────┐
    echo  │  ERROR: No hay conexion a internet.     │
    echo  │  Conectate y vuelve a intentar.         │
    echo  └─────────────────────────────────────────┘
    echo.
    pause
    exit /b 1
echo         Conexion OK.
echo.
)

:: ============================================
:: Paso 2: Comprobar/Instalar .NET 8.0 Runtime
:: ============================================
echo  [2/6] Comprobando .NET %DOTNET_VERSION% Runtime...
if exist "%DOTNET_CHECK%" (
    for /f "tokens=*" %%i in ('"%DOTNET_CHECK%" --list-runtimes 2^>nul ^| findstr "Microsoft.NETCore.App"') do (
        echo         %%i
    )
    echo         .NET Runtime encontrado.
) else (
    echo         .NET Runtime no encontrado. Instalando...
    echo         Esto puede tardar 1-3 minutos.
    echo.

    :: Descargar instalador de .NET
    where curl >nul 2>&1
    if %errorlevel% equ 0 (
        curl -L -o "%DOTNET_INSTALLER%" "https://download.visualstudio.microsoft.com/download/pr/8de8982c-f703-4dc7-a559-4d9714648785/8e115a48385064b23f2124438a26310a/windowsdesktop-runtime-8.0.20-win-x64.exe" --progress-bar
    ) else (
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://download.visualstudio.microsoft.com/download/pr/8de8982c-f703-4dc7-a559-4d9714648785/8e115a48385064b23f2124438a26310a/windowsdesktop-runtime-8.0.20-win-x64.exe' -OutFile '%DOTNET_INSTALLER%'"
    )

    if %errorlevel% neq 0 (
        echo.
        echo  ERROR: Fallo al descargar .NET Runtime.
        echo  Descargalo manualmente desde:
        echo  https://dotnet.microsoft.com/download/dotnet/%DOTNET_VERSION%
        echo.
        pause
        exit /b 1
    )

    :: Instalar .NET silenciosamente
    echo         Instalando .NET Runtime...
    "%DOTNET_INSTALLER%" /install /quiet /norestart
    if %errorlevel% neq 0 (
        echo.
        echo  ERROR: Fallo la instalacion de .NET.
        echo  Intenta instalarlo manualmente desde:
        echo  https://dotnet.microsoft.com/download/dotnet/%DOTNET_VERSION%
        echo.
        del /f /q "%DOTNET_INSTALLER%" >nul 2>&1
        pause
        exit /b 1
    )

    :: Limpiar instalador
    del /f /q "%DOTNET_INSTALLER%" >nul 2>&1
    echo         .NET Runtime instalado correctamente.
)
echo.

:: ============================================
:: Paso 3: Descargar NuzlockeOverlay.exe
:: ============================================
echo  [3/6] Descargando NuzlockeOverlay.exe...
if exist "NuzlockeOverlay.exe" (
    echo         NuzlockeOverlay.exe ya existe. OK.
) else (
    where curl >nul 2>&1
    if %errorlevel% equ 0 (
        curl -L -o "NuzlockeOverlay.exe" "%GITHUB_EXE_URL%" --progress-bar
    ) else (
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%GITHUB_EXE_URL%' -OutFile 'NuzlockeOverlay.exe'"
    )

    if %errorlevel% neq 0 (
        echo.
        echo  ERROR: Fallo al descargar el exe.
        echo  Descargalo manualmente desde:
        echo  https://github.com/%GITHUB_REPO%/releases
        echo.
        pause
        exit /b 1
    )
    echo         NuzlockeOverlay.exe descargado.
)
echo.

:: ============================================
:: Paso 4: Comprobar carpeta de sprites
:: ============================================
echo  [4/6] Comprobando carpeta de sprites...
if exist "Recursos\Sprites" (
    echo         Carpeta Recursos\Sprites encontrada. OK.
) else (
    echo.
    echo  ┌─────────────────────────────────────────────────┐
    echo  │  AVISO: Carpeta Recursos no encontrada.         │
    echo  │                                                 │
    echo  │  Sin esta carpeta no se veran los sprites.      │
    echo  │                                                 │
    echo  │  Opciones:                                      │
    echo  │  1. Descarga desde MediaFire y extrae aqui      │
    echo  │  2. Copia la carpeta "Recursos" junto al exe    │
    echo  │                                                 │
    echo  │  Link de descarga (ponlo en setup.bat):         │
    echo  │  %RECURSOS_URL%
    echo  └─────────────────────────────────────────────────┘
    echo.
)
echo.

:: ============================================
:: Paso 5: Crear acceso directo en escritorio
:: ============================================
echo  [5/6] Creando acceso directo en escritorio...
set "DESKTOP=%USERPROFILE%\Desktop"
set "SCRIPT_DIR=%~dp0"
(
    echo Set oWS = WScript.CreateObject^("WScript.Shell"^)
    echo sLinkFile = "%DESKTOP%\Nuzlocke Overlay.lnk"
    echo Set oLink = oWS.CreateShortcut^(sLinkFile^)
    echo oLink.TargetPath = "%SCRIPT_DIR%NuzlockeOverlay.exe"
    echo oLink.WorkingDirectory = "%SCRIPT_DIR%"
    echo oLink.Description = "Nuzlocke Overlay - OBS overlay para Pokemon"
    echo oLink.Save
) > "%TEMP%\create_shortcut.vbs"
cscript //nologo "%TEMP%\create_shortcut.vbs" >nul 2>&1
del /f /q "%TEMP%\create_shortcut.vbs" >nul 2>&1
if exist "%DESKTOP%\Nuzlocke Overlay.lnk" (
    echo         Acceso directo creado en el escritorio.
) else (
    echo         No se pudo crear el acceso directo.
)
echo.

:: ============================================
:: Paso 6: Limpiar archivos temporales
:: ============================================
echo  [6/6] Limpiando archivos temporales...
if exist "dist" rd /s /q "dist" >nul 2>&1
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
echo  ║    - O desde el acceso directo del escritorio         ║
echo  ║                                                       ║
echo  ║  Para configurar en OBS:                              ║
echo  ║    1. Abre la app                                     ║
echo  ║    2. Crea un proyecto                                ║
echo  ║    3. Selecciona tu save file                         ║
echo  ║    4. Copia la URL de OBS                             ║
echo  ║    5. En OBS: Fuente de navegador (1920x1080)         ║
echo  ║                                                       ║
echo  ║  Juegos soportados: Gen 1 - Gen 9                    ║
echo  ║                                                       ║
echo  ╚═══════════════════════════════════════════════════════╝
echo.
pause
