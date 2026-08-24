@echo off
title Nuzlocke Overlay - Instalador Windows v1.0.1
color 0F
setlocal enabledelayedexpansion

:: ============================================
:: CONFIGURACION
:: ============================================
set "GITHUB_REPO=pokejgameryt-ship-it/nuzlocke-overlay"
set "GITHUB_EXE_URL=https://github.com/%GITHUB_REPO%/releases/latest/download/NuzlockeOverlay-Windows-x64.exe"
set "DOTNET_VERSION=8.0"
set "DOTNET_INSTALLER=%TEMP%\dotnet-runtime-installer.exe"
set "INSTALL_DIR=%LOCALAPPDATA%\NuzlockeOverlay"

echo.
echo  ============================================
echo    Nuzlocke Overlay - Instalador v1.0.1
echo    Soporte: Gen 1 a Gen 9
echo  ============================================
echo.
echo  Se instalara en: %INSTALL_DIR%
echo.

:: ============================================
:: Paso 1: Comprobar conexion
:: ============================================
echo  [1/4] Comprobando conexion a internet...
ping -n 1 github.com >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo   ERROR: No hay conexion a internet.
    echo.
    pause
    exit /b 1
)
echo         Conexion OK.
echo.

:: ============================================
:: Paso 2: Crear carpeta
:: ============================================
echo  [2/4] Preparando carpeta de instalacion...
if not exist "%INSTALL_DIR%" (
    mkdir "%INSTALL_DIR%"
    echo         Carpeta creada: %INSTALL_DIR%
) else (
    echo         Carpeta ya existe: %INSTALL_DIR%
)
echo.

:: ============================================
:: Paso 3: Comprobar/Instalar .NET 8.0 Runtime
:: ============================================
echo  [3/4] Comprobando .NET %DOTNET_VERSION% Runtime...
set "DOTNET_FOUND=0"

for %%p in (
    "%ProgramFiles%\dotnet\dotnet.exe"
    "%ProgramFiles(x86)%\dotnet\dotnet.exe"
    "%USERPROFILE%\.dotnet\dotnet.exe"
    "%LOCALAPPDATA%\.dotnet\dotnet.exe"
) do (
    if exist "%%~p" (
        set "DOTNET_FOUND=1"
        set "DOTNET_PATH=%%~p"
        goto :dotnet_found
    )
)

where dotnet >nul 2>&1
if %errorlevel% equ 0 (
    set "DOTNET_FOUND=1"
    for /f "tokens=*" %%i in ('where dotnet') do (
        set "DOTNET_PATH=%%i"
        goto :dotnet_found
    )
)

:dotnet_found
if "%DOTNET_FOUND%"=="1" (
    echo         .NET Runtime encontrado.
) else (
    echo         .NET Runtime no encontrado. Instalando...
    echo         Esto puede tardar 1-3 minutos.
    echo.

    echo         Descargando .NET Runtime...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri 'https://download.visualstudio.microsoft.com/download/pr/8de8982c-f703-4dc7-a559-4d9714648785/8e115a48385064b23f2124438a26310a/windowsdesktop-runtime-8.0.20-win-x64.exe' -OutFile '%DOTNET_INSTALLER%'"

    if not exist "%DOTNET_INSTALLER%" (
        echo.
        echo   ERROR: Fallo al descargar .NET Runtime.
        echo   Descargalo manualmente desde:
        echo   https://dotnet.microsoft.com/download/dotnet/%DOTNET_VERSION%
        echo.
        pause
        exit /b 1
    )

    echo         Instalando .NET Runtime...
    "%DOTNET_INSTALLER%" /install /quiet /norestart
    if %errorlevel% neq 0 (
        echo.
        echo   ERROR: Fallo la instalacion de .NET.
        echo   Intenta instalarlo manualmente desde:
        echo   https://dotnet.microsoft.com/download/dotnet/%DOTNET_VERSION%
        echo.
        del /f /q "%DOTNET_INSTALLER%" >nul 2>&1
        pause
        exit /b 1
    )

    del /f /q "%DOTNET_INSTALLER%" >nul 2>&1
    echo         .NET Runtime instalado correctamente.
)
echo.

:: ============================================
:: Paso 4: Descargar NuzlockeOverlay.exe
:: ============================================
echo  [4/4] Descargando NuzlockeOverlay.exe...

:: Obtener tamanho del exe remoto
echo         Comprobando version remota...
set "REMOTE_SIZE=0"
for /f "tokens=*" %%a in ('powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (Invoke-WebRequest -Uri '%GITHUB_EXE_URL%' -Method Head -UseBasicParsing).Headers['Content-Length']"') do set "REMOTE_SIZE=%%a"

:: Obtener tamanho del exe local
set "LOCAL_SIZE=0"
if exist "%INSTALL_DIR%\NuzlockeOverlay.exe" (
    for /f "tokens=*" %%a in ('powershell -Command "(Get-Item '%INSTALL_DIR%\NuzlockeOverlay.exe').Length"') do set "LOCAL_SIZE=%%a"
)

if "%LOCAL_SIZE%"=="%REMOTE_SIZE%" (
    echo         NuzlockeOverlay.exe ya esta actualizado. OK.
) else (
    if exist "%INSTALL_DIR%\NuzlockeOverlay.exe" (
        echo         NuzlockeOverlay.exe desactualizado. Actualizando...
    ) else (
        echo         NuzlockeOverlay.exe no encontrado. Descargando...
    )
    echo         (Puede tardar 1-2 minutos)
    echo.

    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '%GITHUB_EXE_URL%' -OutFile '%INSTALL_DIR%\NuzlockeOverlay.exe'"

    if not exist "%INSTALL_DIR%\NuzlockeOverlay.exe" (
        echo.
        echo   ERROR: Fallo al descargar el exe.
        echo   Descargalo manualmente desde:
        echo   https://github.com/%GITHUB_REPO%/releases
        echo.
        pause
        exit /b 1
    )

    :: Verificar que no sea un HTML (error de descarga)
    powershell -Command "$f = Get-Item '%INSTALL_DIR%\NuzlockeOverlay.exe'; if ($f.Length -lt 10000000) { Write-Host 'ERROR: Archivo muy pequeno, posible error de descarga' } else { Write-Host 'OK' }" | findstr /i "OK" >nul 2>&1
    if %errorlevel% neq 0 (
        echo.
        echo   ERROR: El archivo descargado es muy pequeno.
        echo   Puede ser un error de GitHub. Intenta descargar manualmente:
        echo   https://github.com/%GITHUB_REPO%/releases
        echo.
        del /f /q "%INSTALL_DIR%\NuzlockeOverlay.exe" >nul 2>&1
        pause
        exit /b 1
    )

    echo         NuzlockeOverlay.exe descargado correctamente.
)
echo.

:: ============================================
:: Crear acceso directo
:: ============================================
echo  Creando acceso directo en el escritorio...
set "DESKTOP=%USERPROFILE%\Desktop"
(
    echo Set oWS = WScript.CreateObject^("WScript.Shell"^)
    echo sLinkFile = "%DESKTOP%\Nuzlocke Overlay.lnk"
    echo Set oLink = oWS.CreateShortcut^(sLinkFile^)
    echo oLink.TargetPath = "%INSTALL_DIR%\NuzlockeOverlay.exe"
    echo oLink.WorkingDirectory = "%INSTALL_DIR%"
    echo oLink.Description = "Nuzlocke Overlay - OBS overlay para Pokemon"
    echo oLink.Save
) > "%TEMP%\create_shortcut.vbs"
cscript //nologo "%TEMP%\create_shortcut.vbs" >nul 2>&1
del /f /q "%TEMP%\create_shortcut.vbs" >nul 2>&1
if exist "%DESKTOP%\Nuzlocke Overlay.lnk" (
    echo         Acceso directo creado.
) else (
    echo         No se pudo crear el acceso directo.
)
echo.

:: ============================================
:: Verificacion final
:: ============================================
echo  ============================================
echo           INSTALACION COMPLETADA
echo  ============================================
echo.
echo   Carpeta: %INSTALL_DIR%
echo.
if exist "%INSTALL_DIR%\NuzlockeOverlay.exe" (
    echo   [OK] NuzlockeOverlay.exe
) else (
    echo   [!!] NuzlockeOverlay.exe - FALTA
)
if exist "%INSTALL_DIR%\Recursos\Sprites" (
    echo   [OK] Recursos\Sprites
) else (
    echo   [--] Recursos\Sprites - FALTA
)
echo.
echo   IMPORTANTE: Necesitas la carpeta "Recursos" con los sprites.
echo   Descargala desde: https://drive.google.com/drive/folders/1itRjBo1HfZI_dUCa5PptR3x-OiEXppQI?usp=drive_link
echo   Coloca la carpeta "Recursos" en: %INSTALL_DIR%
echo.
echo   Ver instrucciones completas en:
echo   https://github.com/%GITHUB_REPO%#instalacion-rapida
echo.
echo  ============================================
echo.
pause
