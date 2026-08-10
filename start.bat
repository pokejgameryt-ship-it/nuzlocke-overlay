@echo off
title Nuzlocke Overlay
cd /d "%~dp0"
if exist "NuzlockeOverlay.exe" (
    start "" "NuzlockeOverlay.exe"
) else (
    echo Ejecutable no encontrado. Ejecuta setup.bat primero.
    echo.
    pause
)
