@echo off
title Nuzlocke Overlay - Instalador v2.0
color 0F
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

:: ============================================
:: CONFIGURACION
:: ============================================
set "GITHUB_REPO=pokejgameryt-ship-it/nuzlocke-overlay"
set "GITHUB_EXE_URL=https://github.com/%GITHUB_REPO%/releases/latest/download/NuzlockeOverlay.exe"
set "MEGA_FOLDER=https://mega.nz/folder/hy9RmQ7Y#KYbD0vuNxh3CuMUJGPlmRg"
set "RECURSOS_ZIP=Recursos.zip"
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
echo  [1/7] Comprobando conexion a internet...
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
)
echo         Conexion OK.
echo.

:: ============================================
:: Paso 2: Comprobar/Instalar .NET 8.0 Runtime
:: ============================================
echo  [2/7] Comprobando .NET %DOTNET_VERSION% Runtime...
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
echo  [3/7] Descargando NuzlockeOverlay.exe...
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
:: Paso 4: Descargar y extraer Recursos desde MEGA
:: ============================================
echo  [4/7] Descargando Recursos desde MEGA...
if exist "Recursos\Sprites" (
    echo         Carpeta Recursos\Sprites ya existe. OK.
) else (
    :: Comprobar megacmd (mega-get)
    where mega-get >nul 2>&1
    if %errorlevel% neq 0 (
        echo.
        echo  ┌────────────────────────────────────────────────────────┐
        echo  │  MEGA CMD no encontrado.                               │
        echo  │                                                        │
        echo  │  Para descargar la carpeta Recursos desde MEGA,        │
        echo  │  necesitas instalar megacmd:                           │
        echo  │                                                        │
        echo  │  1. Descarga: https://mega.io/cmd                      │
        echo  │  2. Instala y reinicia la terminal                     │
        echo  │  3. Ejecuta: mega-login TU_EMAIL TU_PASSWORD           │
        echo  │  4. Vuelve a ejecutar setup.bat                        │
        echo  │                                                        │
        echo  │  O descarga manualmente la carpeta "Recursos"          │
        echo  │  desde MEGA y colocalas junto al exe.                  │
        echo  └────────────────────────────────────────────────────────┘
        echo.
        pause
        exit /b 1
    )

    echo         Descargando carpeta Recursos desde MEGA...
    echo         (Esto puede tardar varios minutos segun tu conexion)
    echo.

    :: Descargar con mega-get (descarga la carpeta como ZIP)
    mega-get "%MEGA_FOLDER%" "%RECURSOS_ZIP%"
    if %errorlevel% neq 0 (
        echo.
        echo  ERROR: Fallo al descargar desde MEGA.
        echo  Verifica que:
        echo    - Tenes megacmd instalado (mega-get)
        echo    - Estás logueado en MEGA (mega-login)
        echo    - El enlace de la carpeta es correcto
        echo.
        pause
        exit /b 1
    )

    :: Verificar que se descargo el ZIP
    if not exist "%RECURSOS_ZIP%" (
        echo.
        echo  ERROR: No se encontro el archivo descargado.
        echo  El nombre puede variar. Busca un archivo .zip o .rar.
        echo.
        pause
        exit /b 1
    )

    echo         Descarga completada. Extrayendo archivos...
    echo.

    :: Extraer con PowerShell (maneja ZIP y RAR si tiene 7zip/WinRAR en PATH)
    powershell -Command "Expand-Archive -Path '%RECURSOS_ZIP%' -DestinationPath '.' -Force"
    if %errorlevel% neq 0 (
        echo.
        echo  ERROR: Fallo al extraer. Intentando con 7-Zip si esta instalado...
        where 7z >nul 2>&1
        if %errorlevel% equ 0 (
            7z x "%RECURSOS_ZIP%" -o"."
            if %errorlevel% neq 0 (
                echo  ERROR: 7-Zip tambien fallo.
                pause
                exit /b 1
            )
        ) else (
            echo  7-Zip no encontrado. Instalalo o extrae manualmente.
            pause
            exit /b 1
        )
    )

    :: Limpiar archivo comprimido
    del /f /q "%RECURSOS_ZIP%" >nul 2>&1
    echo         Recursos extraidos y archivo temporal eliminado.
)
echo.

:: ============================================
:: Paso 5: Crear acceso directo en escritorio
:: ============================================
echo  [5/7] Creando acceso directo en escritorio...
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
:: Paso 6: Verificar estructura final
:: ============================================
echo  [6/7] Verificando instalacion...
if exist "NuzlockeOverlay.exe" (
    echo         NuzlockeOverlay.exe: OK
) else (
    echo         NuzlockeOverlay.exe: FALTA
)
if exist "Recursos\Sprites" (
    echo         Recursos\Sprites: OK
) else (
    echo         Recursos\Sprites: FALTA
)
echo.

:: ============================================
:: Paso 7: Limpiar archivos temporales
:: ============================================
echo  [7/7] Limpiando archivos temporales...
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