#!/bin/bash
# ============================================
# Nuzlocke Overlay - Instalador Linux
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
echo -e "${CYAN}║   Nuzlocke Overlay - Instalador Linux v1.0.0  ║${NC}"
echo -e "${CYAN}║   Soporte: Gen 1 a Gen 9                 ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo "  Se instalara en: $INSTALL_DIR"
echo ""

# Detectar distro
if command -v apt &>/dev/null; then
    PKG_MANAGER="apt"
elif command -v dnf &>/dev/null; then
    PKG_MANAGER="dnf"
elif command -v pacman &>/dev/null; then
    PKG_MANAGER="pacman"
else
    PKG_MANAGER="unknown"
fi
echo "  Distro detectada: $PKG_MANAGER"
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
    echo "        .NET Runtime no encontrado. Instalando..."

    case "$PKG_MANAGER" in
        apt)
            wget -q https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb -O /tmp/packages-microsoft-prod.deb 2>/dev/null
            sudo dpkg -i /tmp/packages-microsoft-prod.deb 2>/dev/null
            sudo apt update -qq && sudo apt install -y dotnet-runtime-8.0
            ;;
        dnf)
            sudo rpm -Uvh https://packages.microsoft.com/config/centos/8/packages-microsoft-prod.rpm 2>/dev/null
            sudo dnf install -y dotnet-runtime-8.0
            ;;
        pacman)
            echo "        Para Arch/Manjaro instala manualmente:"
            echo "        yay -S dotnet-runtime-bin"
            echo "        O descarga desde: https://dotnet.microsoft.com/download/dotnet/8.0"
            read -p "  Pulsa Enter cuando .NET este instalado..."
            ;;
        *)
            echo -e "  ${RED}        Instalador no automatizado para tu distro.${NC}"
            echo "        Descarga: https://dotnet.microsoft.com/download/dotnet/8.0"
            exit 1
            ;;
    esac

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
echo -e "  ${YELLOW}[4/5]${NC} Descargando NuzlockeOverlay para Linux..."
ARCH="$(uname -m)"
if [ "$ARCH" = "x86_64" ]; then
    TAR_URL="https://github.com/${GITHUB_REPO}/releases/latest/download/NuzlockeOverlay-Linux-x64.tar.gz"
else
    TAR_URL="https://github.com/${GITHUB_REPO}/releases/latest/download/NuzlockeOverlay-Linux-arm64.tar.gz"
fi

if [ -f "$INSTALL_DIR/NuzlockeOverlay" ]; then
    echo -e "  ${GREEN}        NuzlockeOverlay ya existe. OK.${NC}"
else
    echo "        Descargando..."
    curl -L -o "$INSTALL_DIR/$RECURSOS_ZIP" "$TAR_URL" --progress-bar 2>/dev/null

    if [ ! -f "$INSTALL_DIR/$RECURSOS_ZIP" ]; then
        echo -e "  ${RED}        Fallo al descargar.${NC}"
        echo "        Descarga manualmente desde:"
        echo "        https://github.com/${GITHUB_REPO}/releases"
        exit 1
    fi

    echo "        Extrayendo..."
    tar -xzf "$INSTALL_DIR/$RECURSOS_ZIP" -C "$INSTALL_DIR/" 2>/dev/null
    rm -f "$INSTALL_DIR/$RECURSOS_ZIP"
    chmod +x "$INSTALL_DIR/NuzlockeOverlay" 2>/dev/null
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
if [ -f "$INSTALL_DIR/NuzlockeOverlay" ]; then
    echo -e "${CYAN}║${NC}  ${GREEN}[OK]${NC} NuzlockeOverlay                                ${CYAN}║${NC}"
else
    echo -e "${CYAN}║${NC}  ${RED}[!!]${NC} NuzlockeOverlay - FALTA                        ${CYAN}║${NC}"
fi
if [ -d "$INSTALL_DIR/Recursos/Sprites" ]; then
    echo -e "${CYAN}║${NC}  ${GREEN}[OK]${NC} Recursos/Sprites                               ${CYAN}║${NC}"
else
    echo -e "${CYAN}║${NC}  ${YELLOW}[--]${NC} Recursos/Sprites (opcional)                    ${CYAN}║${NC}"
fi
echo -e "${CYAN}║${NC}                                                       ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  Para ejecutar:                                       ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}    cd $INSTALL_DIR && ./NuzlockeOverlay"
echo -e "${CYAN}║${NC}                                                       ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  Juegos soportados: Gen 1 - Gen 9                    ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                       ${CYAN}║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
