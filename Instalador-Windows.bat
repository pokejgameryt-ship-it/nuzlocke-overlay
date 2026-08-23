@echo off
title Nuzlocke Overlay - Instalador Windows v2.1.1
color 0F
setlocal enabledelayedexpansion

:: ============================================
:: CONFIGURACION
:: ============================================
set "GITHUB_REPO=pokejgameryt-ship-it/nuzlocke-overlay"
set "GITHUB_EXE_URL=https://github.com/%GITHUB_REPO%/releases/latest/download/NuzlockeOverlay-Windows-x64.exe"
set "MEGA_FOLDER=https://mega.nz/folder/hy9RmQ7Y#KYbD0vuNxh3CuMUJGPlmRg"
set "RECURSOS_ZIP=Recursos.zip"
set "DOTNET_VERSION=8.0"
set "DOTNET_INSTALLER=%TEMP%\dotnet-runtime-installer.exe"

:: Carpeta de instalacion por defecto
set "INSTALL_DIR=%LOCALAPPDATA%\NuzlockeOverlay"

echo.
echo  ============================================
echo    Nuzlocke Overlay - Instalador v2.1.1
echo    Soporte: Gen 1 a Gen 9
echo  ============================================
echo.
echo  Se instalara en: %INSTALL_DIR%
echo.

:: ============================================
:: Paso 1: Comprobar conexion a internet
:: ============================================
echo  [1/6] Comprobando conexion a internet...
ping -n 1 github.com >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  -------------------------------------------
    echo   ERROR: No hay conexion a internet.
    echo   Conectate y vuelve a intentar.
    echo  -------------------------------------------
    echo.
    pause
    exit /b 1
)
echo         Conexion OK.
echo.

:: ============================================
:: Paso 2: Crear carpeta de instalacion
:: ============================================
echo  [2/6] Preparando carpeta de instalacion...
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
echo  [3/6] Comprobando .NET %DOTNET_VERSION% Runtime...
set "DOTNET_FOUND=0"

:: Buscar en ubicaciones comunes
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

:: Buscar en PATH
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
    echo         .NET Runtime encontrado en: !DOTNET_PATH!
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

    del /f /q "%DOTNET_INSTALLER%" >nul 2>&1
    echo         .NET Runtime instalado correctamente.
)
echo.

:: ============================================
:: Paso 4: Descargar NuzlockeOverlay.exe
:: ============================================
echo  [4/6] Descargando NuzlockeOverlay.exe...
if exist "%INSTALL_DIR%\NuzlockeOverlay.exe" (
    echo         NuzlockeOverlay.exe ya existe. OK.
) else (
    where curl >nul 2>&1
    if %errorlevel% equ 0 (
        curl -L -o "%INSTALL_DIR%\NuzlockeOverlay.exe" "%GITHUB_EXE_URL%" --progress-bar
    ) else (
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%GITHUB_EXE_URL%' -OutFile '%INSTALL_DIR%\NuzlockeOverlay.exe'"
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
:: Paso 5: Descargar y extraer Recursos desde MEGA
:: ============================================
echo  [5/6] Descargando Sprites/Recursos desde MEGA...
if exist "%INSTALL_DIR%\Recursos\Sprites" (
    echo         Carpeta Recursos\Sprites ya existe. OK.
) else (
    :: Comprobar megacmd (mega-get)
    where mega-get >nul 2>&1
    if %errorlevel% neq 0 (
        echo.
        echo  -------------------------------------------
        echo   MEGA CMD no encontrado.
        echo.
        echo   Para descargar Recursos necesitas megacmd:
        echo.
        echo   1. Descarga: https://mega.io/cmd
        echo   2. Instala y reinicia la terminal
        echo   3. Ejecuta: mega-login TU_EMAIL TU_PASSWORD
        echo   4. Vuelve a ejecutar este archivo
        echo.
        echo   O descarga manualmente la carpeta "Recursos"
        echo   desde MEGA y colocala en:
        echo   %INSTALL_DIR%\Recursos
        echo  -------------------------------------------
        echo.
        pause
        exit /b 1
    )

    echo         Descargando carpeta Recursos desde MEGA...
    echo         (Esto puede tardar varios minutos segun tu conexion)
    echo.

    mega-get "%MEGA_FOLDER%" "%INSTALL_DIR%\%RECURSOS_ZIP%"
    if %errorlevel% neq 0 (
        echo.
        echo  ERROR: Fallo al descargar desde MEGA.
        echo  Verifica que megacmd esta instalado y logueado.
        echo.
        pause
        exit /b 1
    )

    if not exist "%INSTALL_DIR%\%RECURSOS_ZIP%" (
        echo.
        echo  ERROR: No se encontro el archivo descargado.
        echo.
        pause
        exit /b 1
    )

    echo         Descarga completada. Extrayendo archivos...
    echo.

    powershell -Command "Expand-Archive -Path '%INSTALL_DIR%\%RECURSOS_ZIP%' -DestinationPath '%INSTALL_DIR%' -Force"
    if %errorlevel% neq 0 (
        echo  ERROR: Fallo al extraer. Intentando con 7-Zip...
        where 7z >nul 2>&1
        if %errorlevel% equ 0 (
            7z x "%INSTALL_DIR%\%RECURSOS_ZIP%" -o"%INSTALL_DIR%"
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

    del /f /q "%INSTALL_DIR%\%RECURSOS_ZIP%" >nul 2>&1
    echo         Recursos extraidos correctamente.
)
echo.

:: ============================================
:: Paso 6: Crear acceso directo en escritorio
:: ============================================
echo  [6/6] Creando acceso directo en escritorio...
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
    echo         Acceso directo creado en el escritorio.
) else (
    echo         No se pudo crear el acceso directo.
)
echo.

:: ============================================
:: Verificar instalacion final
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
    echo   [!!] Recursos\Sprites - FALTA ^(necesita megacmd^)
)
echo.
echo   Para ejecutar:
echo     - Doble clic en el acceso directo del escritorio
echo     - O ejecuta: %INSTALL_DIR%\NuzlockeOverlay.exe
echo.
echo   Para configurar en OBS:
echo     1. Abre la app
echo     2. Crea un proyecto
echo     3. Selecciona tu save file
echo     4. Copia la URL de OBS
echo     5. En OBS: Fuente de navegador ^(1920x1080^)
echo.
echo   Juegos soportados: Gen 1 - Gen 9
echo.
echo  ============================================
echo.
pause
