#!/bin/bash
# ============================================
# Nuzlocke Overlay - Instalador macOS
# ============================================

GITHUB_REPO="pokejgameryt-ship-it/nuzlocke-overlay"
MEGA_FOLDER="https://drive.google.com/drive/folders/1itRjBo1HfZI_dUCa5PptR3x-OiEXppQI?usp=drive_link"
RECURSOS_ZIP="Recursos.zip"
INSTALL_DIR="$HOME/.nuzlocke-overlay"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Nuzlocke Overlay - Instalador macOS v1.0.1  ║${NC}"
echo -e "${CYAN}║   Soporte: Gen 1 a Gen 9                 ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo "  Se instalara en: $INSTALL_DIR"
echo ""

# Detectar arquitectura
ARCH="$(uname -m)"
if [ "$ARCH" = "arm64" ]; then
    DMG_URL="https://github.com/${GITHUB_REPO}/releases/latest/download/NuzlockeOverlay-macOS-arm64.dmg"
    echo "  Arquitectura: Apple Silicon (arm64)"
else
    DMG_URL="https://github.com/${GITHUB_REPO}/releases/latest/download/NuzlockeOverlay-macOS-x64.dmg"
    echo "  Arquitectura: Intel (x64)"
fi
echo ""

# ============================================
# Paso 1: Comprobar conexion
# ============================================
echo -e "  ${YELLOW}[1/5]${NC} Comprobando conexion a internet..."
if ! ping -c 1 github.com &>/dev/null; then
    echo -e "  ${RED}ERROR: No hay conexion a internet.${NC}"
    exit 1
fi
echo -e "  ${GREEN}        Conexion OK.${NC}"
echo ""

# ============================================
# Paso 2: Crear carpeta de instalacion
# ============================================
echo -e "  ${YELLOW}[2/5]${NC} Preparando carpeta de instalacion..."
mkdir -p "$INSTALL_DIR"
echo -e "  ${GREEN}        Carpeta: $INSTALL_DIR${NC}"
echo ""

# ============================================
# Paso 3: Comprobar/Instalar .NET 8.0 Runtime
# ============================================
echo -e "  ${YELLOW}[3/5]${NC} Comprobando .NET 8.0 Runtime..."
DOTNET_FOUND=0

if command -v dotnet &>/dev/null; then
    DOTNET_FOUND=1
    echo -e "  ${GREEN}        dotnet encontrado: $(which dotnet)${NC}"
fi

if [ "$DOTNET_FOUND" -eq 0 ]; then
    echo "        .NET Runtime no encontrado."

    if command -v brew &>/dev/null; then
        echo "        Instalando via Homebrew..."
        brew install --cask dotnet
        if [ $? -ne 0 ]; then
            echo -e "  ${RED}        Fallo la instalacion via Homebrew.${NC}"
            echo "        Instala manualmente: https://dotnet.microsoft.com/download/dotnet/8.0"
            exit 1
        fi
    else
        echo -e "  ${RED}        Homebrew no encontrado.${NC}"
        echo "        Instala Homebrew: https://brew.sh"
        echo "        O instala .NET manualmente: https://dotnet.microsoft.com/download/dotnet/8.0"
        exit 1
    fi
    echo -e "  ${GREEN}        .NET Runtime instalado.${NC}"
fi
echo ""

# ============================================
# Paso 4: Descargar NuzlockeOverlay
# ============================================
echo -e "  ${YELLOW}[4/5]${NC} Descargando NuzlockeOverlay para macOS..."

# Obtener tamanho remoto
REMOTE_SIZE=$(curl -sI -L "$DMG_URL" 2>/dev/null | grep -i content-length | tail -1 | tr -d '\r' | awk '{print $2}')
LOCAL_SIZE=0
if [ -d "$INSTALL_DIR/NuzlockeOverlay.app" ]; then
    LOCAL_SIZE=$(du -sk "$INSTALL_DIR/NuzlockeOverlay.app" 2>/dev/null | awk '{print $1}')
fi

if [ "$LOCAL_SIZE" = "$REMOTE_SIZE" ] && [ "$LOCAL_SIZE" != "0" ] && [ -n "$LOCAL_SIZE" ]; then
    echo -e "  ${GREEN}        NuzlockeOverlay.app ya esta actualizado. OK.${NC}"
else
    if [ -d "$INSTALL_DIR/NuzlockeOverlay.app" ]; then
        echo "        NuzlockeOverlay.app desactualizado. Actualizando..."
    else
        echo "        NuzlockeOverlay.app no encontrado. Descargando..."
    fi
    echo "        Descargando DMG..."
    curl -L -o "$INSTALL_DIR/$RECURSOS_ZIP" "$DMG_URL" --progress-bar 2>/dev/null

    if [ ! -f "$INSTALL_DIR/$RECURSOS_ZIP" ]; then
        echo -e "  ${RED}        Fallo al descargar.${NC}"
        echo "        Descarga manualmente desde:"
        echo "        https://github.com/${GITHUB_REPO}/releases"
        exit 1
    fi

    echo "        Montando DMG..."
    hdiutil attach "$INSTALL_DIR/$RECURSOS_ZIP" -nobrowse -quiet

    # Copiar .app
    APP_PATH=$(find /Volumes -name "NuzlockeOverlay.app" -maxdepth 2 2>/dev/null | head -1)
    if [ -n "$APP_PATH" ]; then
        rm -rf "$INSTALL_DIR/NuzlockeOverlay.app"
        cp -R "$APP_PATH" "$INSTALL_DIR/"
        hdiutil detach /Volumes/NuzlockeOverlay* -quiet 2>/dev/null
    fi

    rm -f "$INSTALL_DIR/$RECURSOS_ZIP"
    echo -e "  ${GREEN}        NuzlockeOverlay instalado.${NC}"
fi
echo ""

# ============================================
# Paso 5: Descargar Recursos desde MEGA
# ============================================
echo -e "  ${YELLOW}[5/5]${NC} Descargando Sprites/Recursos desde MEGA..."
if [ -d "$INSTALL_DIR/Recursos/Sprites" ]; then
    echo -e "  ${GREEN}        Recursos ya existen. OK.${NC}"
else
    if ! command -v mega-get &>/dev/null; then
        echo ""
        echo "  -------------------------------------------"
        echo "  Sprites no descargados automaticamente."
        echo "  Descargalos desde:"
        echo "  https://drive.google.com/drive/folders/1itRjBo1HfZI_dUCa5PptR3x-OiEXppQI?usp=drive_link"
        echo "  Y coloca la carpeta Recursos en: $INSTALL_DIR/Recursos"
        echo "  -------------------------------------------"
        echo ""
        read -p "  Pulsa Enter para continuar sin Recursos..."
    else
        echo "        Descargando desde MEGA..."
        mega-get "$MEGA_FOLDER" "$INSTALL_DIR/$RECURSOS_ZIP" 2>/dev/null
        if [ -f "$INSTALL_DIR/$RECURSOS_ZIP" ]; then
            unzip -o "$INSTALL_DIR/$RECURSOS_ZIP" -d "$INSTALL_DIR/" >/dev/null 2>&1
            rm -f "$INSTALL_DIR/$RECURSOS_ZIP"
            echo -e "  ${GREEN}        Recursos descargados.${NC}"
        fi
    fi
fi
echo ""

# ============================================
# Verificacion final
# ============================================
echo -e "${CYAN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║              INSTALACION COMPLETADA                   ║${NC}"
echo -e "${CYAN}╠═══════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║${NC}                                                       ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  Carpeta: $INSTALL_DIR"
echo -e "${CYAN}║${NC}                                                       ${CYAN}║${NC}"
if [ -d "$INSTALL_DIR/NuzlockeOverlay.app" ]; then
    echo -e "${CYAN}║${NC}  ${GREEN}[OK]${NC} NuzlockeOverlay.app                            ${CYAN}║${NC}"
else
    echo -e "${CYAN}║${NC}  ${RED}[!!]${NC} NuzlockeOverlay.app - FALTA                     ${CYAN}║${NC}"
fi
if [ -d "$INSTALL_DIR/Recursos/Sprites" ]; then
    echo -e "${CYAN}║${NC}  ${GREEN}[OK]${NC} Recursos/Sprites                               ${CYAN}║${NC}"
else
    echo -e "${CYAN}║${NC}  ${YELLOW}[--]${NC} Recursos/Sprites (opcional)                    ${CYAN}║${NC}"
fi
echo -e "${CYAN}║${NC}                                                       ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  Para ejecutar:                                       ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}    Abre NuzlockeOverlay.app desde la carpeta           ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                       ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  Juegos soportados: Gen 1 - Gen 9                    ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                       ${CYAN}║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
