@echo off
title Nuzlocke Overlay - Updater Windows v1.0.2
color 0F
setlocal enabledelayedexpansion

:: ============================================
:: CONFIGURACION
:: ============================================
set "GITHUB_REPO=pokejgameryt-ship-it/nuzlocke-overlay"
set "GITHUB_EXE_URL=https://github.com/%GITHUB_REPO%/releases/latest/download/NuzlockeOverlay-Setup.exe"
set "GITHUB_PPORTABLE_URL=https://github.com/%GITHUB_REPO%/releases/latest/download/NuzlockeOverlay.exe"
set "DOTNET_VERSION=8.0"
set "DOTNET_INSTALLER=%TEMP%\dotnet-runtime-installer.exe"
set "INSTALL_DIR=%LOCALAPPDATA%\NuzlockeOverlay"
set "GDRIVE_FOLDER_ID=1itRjBo1HfZI_dUCa5PptR3x-OiEXppQI"

echo.
echo  ============================================
echo    Nuzlocke Overlay - Updater v1.0.2
echo    Descarga/actualiza exe + Sprites (Recursos)
echo  ============================================
echo.
echo  Se instalara en: %INSTALL_DIR%
echo.

:: ============================================
:: Paso 1: Comprobar conexion
:: ============================================
echo  [1/5] Comprobando conexion a internet...
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
echo  [2/5] Preparando carpeta de instalacion...
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
echo  [3/5] Comprobando .NET %DOTNET_VERSION% Runtime...
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
echo  [4/5] Comprobando NuzlockeOverlay...

:: Obtener tamanho del exe remoto
set "REMOTE_SIZE=0"
for /f "tokens=*" %%a in ('powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; try { (Invoke-WebRequest -Uri '%GITHUB_PPORTABLE_URL%' -Method Head -UseBasicParsing -ErrorAction Stop).Headers['Content-Length'] } catch { '' }"') do set "REMOTE_SIZE=%%a"

:: Obtener tamanho del exe local
set "LOCAL_SIZE=0"
if exist "%INSTALL_DIR%\NuzlockeOverlay.exe" (
    for /f "tokens=*" %%a in ('powershell -Command "(Get-Item '%INSTALL_DIR%\NuzlockeOverlay.exe').Length"') do set "LOCAL_SIZE=%%a"
)

if "%LOCAL_SIZE%"=="%REMOTE_SIZE%" if not "%REMOTE_SIZE%"=="" if not "%REMOTE_SIZE%"=="" (
    echo         NuzlockeOverlay ya esta actualizado. OK.
) else (
    if exist "%INSTALL_DIR%\NuzlockeOverlay.exe" (
        echo         NuzlockeOverlay desactualizado. Actualizando...
    ) else (
        echo         NuzlockeOverlay no encontrado. Descargando...
    )
    echo         (Puede tardar 1-2 minutos)
    echo.

    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '%GITHUB_PPORTABLE_URL%' -OutFile '%INSTALL_DIR%\NuzlockeOverlay.exe'"

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
    powershell -Command "$f = Get-Item '%INSTALL_DIR%\NuzlockeOverlay.exe'; if ($f.Length -lt 10000000) { Write-Host 'ERROR' } else { Write-Host 'OK' }" | findstr /i "OK" >nul 2>&1
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
:: Paso 5: Descargar Recursos (Sprites) desde Google Drive
:: ============================================
echo  [5/5] Comprobando Sprites (Recursos)...
if exist "%INSTALL_DIR%\Recursos\Sprites" (
    echo         Sprites ya descargados. OK.
) else (
    echo         Sprites no encontrados. Descargando desde Google Drive...
    echo         Esto puede tardar varios minutos segun tu conexion.
    echo.

    :: Crear carpeta temporal para sprites
    if not exist "%TEMP%\nuzlocke-sprites" mkdir "%TEMP%\nuzlocke-sprites"

    :: Descargar sprites usando PowerShell + Google Drive
    echo         Descargando desde Google Drive (puede tardar)...
    echo.

    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
      "$ErrorActionPreference = 'SilentlyContinue';" ^
      "$folderId = '%GDRIVE_FOLDER_ID%';" ^
      "$destDir = '%INSTALL_DIR%\Recursos\Sprites';" ^
      "if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null };" ^
      "try {" ^
      "  $resp = Invoke-WebRequest -Uri ('https://drive.google.com/drive/folders/' + $folderId) -UseBasicParsing;" ^
      "  $matches = [regex]::Matches($resp.Content, 'data-id=""([^""]+)""');" ^
      "  $ids = $matches | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique;" ^
      "  Write-Host ('  Found ' + $ids.Count + ' items in Google Drive folder');" ^
      "  $i = 0;" ^
      "  foreach ($id in $ids) {" ^
      "    $i++;" ^
      "    try {" ^
      "      $meta = Invoke-WebRequest -Uri ('https://www.googleapis.com/drive/v3/files/' + $id + '?fields=name,mimeType') -UseBasicParsing;" ^
      "      $json = $meta.Content | ConvertFrom-Json;" ^
      "      Write-Host ('  [' + $i + '/' + $ids.Count + '] ' + $json.name);" ^
      "      if ($json.mimeType -eq 'application/vnd.google-apps.folder') {" ^
      "        $subDir = Join-Path $destDir $json.name;" ^
      "        if (-not (Test-Path $subDir)) { New-Item -ItemType Directory -Path $subDir -Force | Out-Null };" ^
      "        $subResp = Invoke-WebRequest -Uri ('https://drive.google.com/drive/folders/' + $id) -UseBasicParsing;" ^
      "        $subMatches = [regex]::Matches($subResp.Content, 'data-id=""([^""]+)""');" ^
      "        $subIds = $subMatches | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique;" ^
      "        foreach ($subId in $subIds) {" ^
      "          try {" ^
      "            $subMeta = Invoke-WebRequest -Uri ('https://www.googleapis.com/drive/v3/files/' + $subId + '?fields=name,mimeType,size') -UseBasicParsing;" ^
      "            $subJson = $subMeta.Content | ConvertFrom-Json;" ^
      "            if ($subJson.mimeType -ne 'application/vnd.google-apps.folder') {" ^
      "              $dlUrl = 'https://drive.google.com/uc?export=download&id=' + $subId;" ^
      "              $outFile = Join-Path $subDir $subJson.name;" ^
      "              Invoke-WebRequest -Uri $dlUrl -OutFile $outFile -UseBasicParsing;" ^
      "              Write-Host ('    Downloaded: ' + $subJson.name);" ^
      "            }" ^
      "          } catch {}" ^
      "        }" ^
      "      }" ^
      "    } catch {}" ^
      "  }" ^
      "  Write-Host '  Sprites descargados correctamente.'" ^
      "} catch {" ^
      "  Write-Host '  No se pudieron descargar los sprites automaticamente.';" ^
      "  Write-Host '  Descargalos manualmente desde:';" ^
      "  Write-Host '  https://drive.google.com/drive/folders/1itRjBo1HfZI_dUCa5PptR3x-OiEXppQI';" ^
      "  Write-Host ('  Y coloca la carpeta Sprites en: ' + $destDir);" ^
      "}"

    :: Verificar si se descargaron sprites
    set "SPRITE_COUNT=0"
    for /f %%a in ('dir /s /b "%INSTALL_DIR%\Recursos\Sprites\*.png" 2^>nul ^| find /c /v ""') do set "SPRITE_COUNT=%%a"

    if "%SPRITE_COUNT%"=="0" (
        echo.
        echo   No se pudieron descargar los sprites automaticamente.
        echo.
        echo   Descargalos manualmente desde:
        echo   https://drive.google.com/drive/folders/1itRjBo1HfZI_dUCa5PptR3x-OiEXppQI
        echo.
        echo   Coloca la carpeta "Sprites" dentro de:
        echo   %INSTALL_DIR%\Recursos\
        echo.
        echo   Sin los sprites, el overlay no mostrara imagenes de Pokemon.
        echo   Puedes agregarlos mas tarde.
    ) else (
        echo         Sprites descargados: %SPRITE_COUNT% archivos.
    )
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
    echo   [--] Recursos\Sprites - FALTA (descargalos manualmente)
)
echo.
echo   Ver instrucciones completas en:
echo   https://github.com/%GITHUB_REPO%#instalacion-rapida
echo.
echo  ============================================
echo.
pause
