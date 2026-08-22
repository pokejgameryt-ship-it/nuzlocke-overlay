#!/bin/bash
# ============================================
# Nuzlocke Overlay - Instalador macOS/Linux
# ============================================

GITHUB_REPO="pokejgameryt-ship-it/nuzlocke-overlay"
GITHUB_EXE_URL="https://github.com/${GITHUB_REPO}/releases/latest/download"
MEGA_FOLDER="https://mega.nz/folder/hy9RmQ7Y#KYbD0vuNxh3CuMUJGPlmRg"
RECURSOS_ZIP="Recursos.zip"
INSTALL_DIR="$HOME/.nuzlocke-overlay"

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Nuzlocke Overlay - Instalador v2.1     ║${NC}"
echo -e "${CYAN}║   Soporte: Gen 1 a Gen 9                 ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo "  Se instalara en: $INSTALL_DIR"
echo ""

# Detectar SO
OS="$(uname -s)"
ARCH="$(uname -m)"
case "$OS" in
    Linux*)   PLATFORM="linux"; EXE_NAME="NuzlockeOverlay"; DOTNET_CHECK="/usr/share/dotnet/dotnet" ;;
    Darwin*)  PLATFORM="mac";   EXE_NAME="NuzlockeOverlay"; DOTNET_CHECK="/usr/local/share/dotnet/dotnet" ;;
    MINGW*|MSYS*|CYGWIN*) PLATFORM="win"; EXE_NAME="NuzlockeOverlay.exe"; DOTNET_CHECK="$PROGRAMFILES/dotnet/dotnet.exe" ;;
    *) echo "SO no soportado: $OS"; exit 1 ;;
esac

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
# Paso 3: Comprobar/Instalar .NET Runtime
# ============================================
echo -e "  ${YELLOW}[3/5]${NC} Comprobando .NET 8.0 Runtime..."
DOTNET_FOUND=0

if command -v dotnet &>/dev/null; then
    DOTNET_FOUND=1
    echo -e "  ${GREEN}        dotnet encontrado en: $(which dotnet)${NC}"
elif [ -f "$DOTNET_CHECK" ]; then
    DOTNET_FOUND=1
    echo -e "  ${GREEN}        dotnet encontrado en: $DOTNET_CHECK${NC}"
fi

if [ "$DOTNET_FOUND" -eq 0 ]; then
    echo "        .NET Runtime no encontrado. Instalando..."

    if [ "$PLATFORM" = "mac" ]; then
        if command -v brew &>/dev/null; then
            echo "        Instalando via Homebrew..."
            brew install --cask dotnet
        else
            echo "        Necesitas instalar .NET manualmente."
            echo "        https://dotnet.microsoft.com/download/dotnet/8.0"
            echo "        O instala Homebrew: https://brew.sh"
            exit 1
        fi
    elif [ "$PLATFORM" = "linux" ]; then
        if command -v apt &>/dev/null; then
            echo "        Instalando via apt..."
            wget https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb -O /tmp/packages-microsoft-prod.deb
            sudo dpkg -i /tmp/packages-microsoft-prod.deb
            sudo apt update && sudo apt install -y dotnet-runtime-8.0
        elif command -v dnf &>/dev/null; then
            echo "        Instalando via dnf..."
            sudo rpm -Uvh https://packages.microsoft.com/config/centos/8/packages-microsoft-prod.rpm
            sudo dnf install -y dotnet-runtime-8.0
        else
            echo "        Instalador no automatizado para tu distro."
            echo "        Descarga manualmente: https://dotnet.microsoft.com/download/dotnet/8.0"
            exit 1
        fi
    fi

    if ! command -v dotnet &>/dev/null; then
        echo -e "  ${RED}        Fallo la instalacion de .NET${NC}"
        exit 1
    fi
    echo -e "  ${GREEN}        .NET Runtime instalado.${NC}"
fi
echo ""

# ============================================
# Paso 4: Descargar NuzlockeOverlay
# ============================================
echo -e "  ${YELLOW}[4/5]${NC} Descargando NuzlockeOverlay..."

if [ -f "$INSTALL_DIR/$EXE_NAME" ]; then
    echo -e "  ${GREEN}        Ya existe. OK.${NC}"
else
    # Detectar arquitectura para la descarga correcta
    case "$PLATFORM" in
        mac)
            if [ "$ARCH" = "arm64" ]; then
                DL_URL="${GITHUB_EXE_URL}/NuzlockeOverlay-mac-arm64.zip"
            else
                DL_URL="${GITHUB_EXE_URL}/NuzlockeOverlay-mac-x64.zip"
            fi
            ;;
        linux)
            DL_URL="${GITHUB_EXE_URL}/NuzlockeOverlay-linux-x64.zip"
            ;;
        win)
            DL_URL="${GITHUB_EXE_URL}/NuzlockeOverlay.exe"
            ;;
    esac

    echo "        Descargando desde: $DL_URL"
    curl -L -o "$INSTALL_DIR/download.zip" "$DL_URL" --progress-bar 2>/dev/null
    if [ $? -ne 0 ]; then
        # Fallback a wget
        wget -q --show-progress -O "$INSTALL_DIR/download.zip" "$DL_URL"
    fi

    if [ $? -ne 0 ] || [ ! -f "$INSTALL_DIR/download.zip" ]; then
        echo -e "  ${RED}        Fallo al descargar.${NC}"
        echo "        Descarga manualmente desde:"
        echo "        https://github.com/${GITHUB_REPO}/releases"
        exit 1
    fi

    if [ "$PLATFORM" = "win" ]; then
        # El .exe no necesita extraerse
        mv "$INSTALL_DIR/download.zip" "$INSTALL_DIR/$EXE_NAME"
    else
        # Extraer ZIP en macOS/Linux
        unzip -o "$INSTALL_DIR/download.zip" -d "$INSTALL_DIR/" >/dev/null 2>&1
        rm -f "$INSTALL_DIR/download.zip"
        chmod +x "$INSTALL_DIR/$EXE_NAME" 2>/dev/null
        # Buscar el ejecutable dentro de carpetas extraidas
        FOUND=$(find "$INSTALL_DIR" -name "$EXE_NAME" -type f 2>/dev/null | head -1)
        if [ -n "$FOUND" ] && [ "$FOUND" != "$INSTALL_DIR/$EXE_NAME" ]; then
            mv "$FOUND" "$INSTALL_DIR/$EXE_NAME"
            # Limpiar carpetas vacias
            find "$INSTALL_DIR" -maxdepth 1 -type d ! -name "$(basename $INSTALL_DIR)" ! -name "." -exec rm -rf {} + 2>/dev/null
        fi
    fi

    echo -e "  ${GREEN}        NuzlockeOverlay descargado.${NC}"
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
        echo "  ┌────────────────────────────────────────────────────────┐"
        echo "  │  MEGA CMD no encontrado.                               │"
        echo "  │                                                        │"
        echo "  │  Para descargar Recursos necesitas megacmd:            │"
        echo "  │                                                        │"
        echo "  │  macOS:   brew install megacmd                         │"
        echo "  │  Linux:   https://mega.io/cmd                          │"
        echo "  │                                                        │"
        echo "  │  Despues de instalar:                                  │"
        echo "  │    mega-login TU_EMAIL TU_PASSWORD                     │"
        echo "  │    Vuelve a ejecutar este script.                      │"
        echo "  │                                                        │"
        echo "  │  O descarga manualmente la carpeta "Recursos"          │"
        echo "  │  desde MEGA y colocala en:                             │"
        echo "  │  $INSTALL_DIR/Recursos                                 │"
        echo "  └────────────────────────────────────────────────────────┘"
        echo ""
        read -p "  Pulsa Enter para continuar sin Recursos..."
        echo ""
    else
        echo "        Descargando desde MEGA..."
        mega-get "$MEGA_FOLDER" "$INSTALL_DIR/$RECURSOS_ZIP" 2>/dev/null

        if [ -f "$INSTALL_DIR/$RECURSOS_ZIP" ]; then
            echo "        Extrayendo archivos..."
            unzip -o "$INSTALL_DIR/$RECURSOS_ZIP" -d "$INSTALL_DIR/" >/dev/null 2>&1
            rm -f "$INSTALL_DIR/$RECURSOS_ZIP"
            echo -e "  ${GREEN}        Recursos descargados.${NC}"
        else
            echo -e "  ${YELLOW}        No se pudieron descargar los Recursos.${NC}"
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

if [ -f "$INSTALL_DIR/$EXE_NAME" ]; then
    echo -e "${CYAN}║${NC}  ${GREEN}[OK]${NC} NuzlockeOverlay                              ${CYAN}║${NC}"
else
    echo -e "${CYAN}║${NC}  ${RED}[!!]${NC} NuzlockeOverlay - FALTA                        ${CYAN}║${NC}"
fi

if [ -d "$INSTALL_DIR/Recursos/Sprites" ]; then
    echo -e "${CYAN}║${NC}  ${GREEN}[OK]${NC} Recursos/Sprites                               ${CYAN}║${NC}"
else
    echo -e "${CYAN}║${NC}  ${YELLOW}[--]${NC} Recursos/Sprites (opcional, necesita megacmd)   ${CYAN}║${NC}"
fi

echo -e "${CYAN}║${NC}                                                       ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  Para ejecutar:                                       ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}    $INSTALL_DIR/$EXE_NAME"
echo -e "${CYAN}║${NC}                                                       ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  Juegos soportados: Gen 1 - Gen 9                    ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                       ${CYAN}║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
