#!/bin/bash
# ============================================
# Nuzlocke Overlay - Instalador macOS v1.0.2
# ============================================

GITHUB_REPO="pokejgameryt-ship-it/nuzlocke-overlay"
GDRIVE_FOLDER_ID="1itRjBo1HfZI_dUCa5PptR3x-OiEXppQI"
RECURSOS_ZIP="Recursos.zip"
INSTALL_DIR="$HOME/.nuzlocke-overlay"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}║   Nuzlocke Overlay - Instalador macOS v1.0.2  ║${NC}"
echo -e "${CYAN}║   Soporte: Gen 1 a Gen 9                    ║${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "  Se instalara en: ${YELLOW}$INSTALL_DIR${NC}"
echo ""

# ============================================
# Paso 1: Comprobar conexion
# ============================================
echo -e "  ${YELLOW}[1/5]${NC} Comprobando conexion a internet..."
if ! ping -c 1 github.com &>/dev/null; then
    echo -e "  ${RED}  ERROR: No hay conexion a internet.${NC}"
    exit 1
fi
echo -e "  ${GREEN}        Conexion OK.${NC}"
echo ""

# ============================================
# Paso 2: Crear carpeta
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
elif [ -f "$HOME/.dotnet/dotnet" ]; then
    DOTNET_FOUND=1
elif [ -f "/usr/local/share/dotnet/dotnet" ]; then
    DOTNET_FOUND=1
fi

if [ "$DOTNET_FOUND" = "1" ]; then
    echo -e "  ${GREEN}        .NET Runtime encontrado.${NC}"
else
    echo "        .NET Runtime no encontrado. Instalando..."
    if command -v brew &>/dev/null; then
        brew install --cask dotnet
        echo -e "  ${GREEN}        .NET Runtime instalado.${NC}"
    else
        echo ""
        echo "  --------------------------------------------------"
        echo "  Necesitas instalar .NET 8.0 Runtime manualmente."
        echo "  Descargalo desde: https://dotnet.microsoft.com/download/dotnet/8.0"
        echo "  O instala Homebrew: https://brew.sh"
        echo "  --------------------------------------------------"
        echo ""
        echo "  Sin .NET, el overlay no funcionara."
        echo "  Pulsa Enter para continuar sin .NET..."
        read
    fi
fi
echo ""

# ============================================
# Paso 4: Descargar NuzlockeOverlay
# ============================================
echo -e "  ${YELLOW}[4/5]${NC} Descargando NuzlockeOverlay para macOS..."

DMG_URL="https://github.com/${GITHUB_REPO}/releases/latest/download/NuzlockeOverlay.dmg"

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
# Paso 5: Descargar Sprites desde Google Drive
# ============================================
echo -e "  ${YELLOW}[5/5]${NC} Comprobando Sprites (Recursos)..."
if [ -d "$INSTALL_DIR/Recursos/Sprites" ]; then
    echo -e "  ${GREEN}        Sprites ya descargados. OK.${NC}"
else
    echo "        Sprites no encontrados. Descargando desde Google Drive..."
    echo "        Esto puede tardar varios minutos."
    echo ""

    mkdir -p "$INSTALL_DIR/Recursos/Sprites"

    # Descargar carpeta de Google Drive
    curl -sL "https://drive.google.com/drive/folders/${GDRIVE_FOLDER_ID}" -o /tmp/gdrive_page.html 2>/dev/null

    # Extraer IDs de archivos
    FILE_IDS=$(grep -oP 'data-id="\K[^"]+' /tmp/gdrive_page.html 2>/dev/null | sort -u)

    if [ -n "$FILE_IDS" ]; then
        TOTAL=$(echo "$FILE_IDS" | wc -l | tr -d ' ')
        COUNT=0
        for FILE_ID in $FILE_IDS; do
            COUNT=$((COUNT + 1))
            # Obtener metadata del archivo
            META=$(curl -s "https://www.googleapis.com/drive/v3/files/${FILE_ID}?fields=name,mimeType" 2>/dev/null)
            FILE_NAME=$(echo "$META" | grep -oP '"name":\s*"\K[^"]+' | head -1)
            MIME_TYPE=$(echo "$META" | grep -oP '"mimeType":\s*"\K[^"]+' | head -1)

            if [ -n "$FILE_NAME" ]; then
                echo "  [$COUNT/$TOTAL] $FILE_NAME"
                if [ "$MIME_TYPE" = "application/vnd.google-apps.folder" ]; then
                    SUB_DIR="$INSTALL_DIR/Recursos/Sprites/$FILE_NAME"
                    mkdir -p "$SUB_DIR"
                    # Descargar contenido de subcarpeta
                    curl -sL "https://drive.google.com/drive/folders/${FILE_ID}" -o /tmp/gdrive_sub.html 2>/dev/null
                    SUB_IDS=$(grep -oP 'data-id="\K[^"]+' /tmp/gdrive_sub.html 2>/dev/null | sort -u)
                    for SUB_ID in $SUB_IDS; do
                        SUB_META=$(curl -s "https://www.googleapis.com/drive/v3/files/${SUB_ID}?fields=name,mimeType" 2>/dev/null)
                        SUB_NAME=$(echo "$SUB_META" | grep -oP '"name":\s*"\K[^"]+' | head -1)
                        SUB_MIME=$(echo "$SUB_META" | grep -oP '"mimeType":\s*"\K[^"]+' | head -1)
                        if [ -n "$SUB_NAME" ] && [ "$SUB_MIME" != "application/vnd.google-apps.folder" ]; then
                            curl -sL "https://drive.google.com/uc?export=download&id=${SUB_ID}" -o "$SUB_DIR/$SUB_NAME" 2>/dev/null
                        fi
                    done
                else
                    curl -sL "https://drive.google.com/uc?export=download&id=${FILE_ID}" -o "$INSTALL_DIR/Recursos/Sprites/$FILE_NAME" 2>/dev/null
                fi
            fi
        done
        echo -e "  ${GREEN}        Sprites descargados.${NC}"
    else
        echo -e "  ${RED}        No se pudieron descargar los sprites automaticamente.${NC}"
        echo "        Descargalos manualmente desde:"
        echo "        https://drive.google.com/drive/folders/${GDRIVE_FOLDER_ID}"
        echo "        Y coloca la carpeta Sprites en: $INSTALL_DIR/Recursos/"
    fi
fi
echo ""

# ============================================
# Verificacion final
# ============================================
echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}        INSTALACION COMPLETADA${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "  Carpeta: ${YELLOW}$INSTALL_DIR${NC}"
echo ""
if [ -d "$INSTALL_DIR/NuzlockeOverlay.app" ]; then
    echo -e "  ${GREEN}[OK]${NC} NuzlockeOverlay.app"
else
    echo -e "  ${RED}[!!]${NC} NuzlockeOverlay.app - FALTA"
fi
if [ -d "$INSTALL_DIR/Recursos/Sprites" ]; then
    echo -e "  ${GREEN}[OK]${NC} Recursos/Sprites"
else
    echo -e "  ${YELLOW}[--]${NC} Recursos/Sprites - FALTA (descargalos manualmente)"
fi
echo ""
echo -e "  Ver instrucciones en:"
echo -e "  https://github.com/${GITHUB_REPO}#instalacion-rapida"
echo ""
echo -e "${CYAN}============================================${NC}"
