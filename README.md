<p align="center">
  <img src="logo.png" alt="Nuzlocke Overlay" width="200">
</p>

<h1 align="center">Nuzlocke Overlay</h1>

<p align="center">
  <strong>Overlay para OBS con seguimiento en tiempo real de tu equipo Pokemon en runs Nuzlocke</strong>
</p>

<p align="center">
  <i>Gen 1-9 • PKHeX integration • Sprite styles • 6 idiomas • Instalador NSIS</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.3-blue" alt="Version">
  <img src="https://img.shields.io/badge/platform-Windows%2010%2F11-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/gen-1--9-brightgreen" alt="Gen 1-9">
  <img src="https://img.shields.io/badge/languages-ES%20%7C%20EN%20%7C%20FR%20%7C%20DE%20%7C%20JA%20%7C%20RU-brightgreen" alt="Languages">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

---

## ¿Qué hace esta app?

Nuzlocke Overlay es una aplicación de escritorio para Windows que conecta tus partidas Nuzlocke con OBS Studio. **Lee el archivo de guardado directamente desde el emulador** y muestra tu equipo actual en un **Browser Source** que se actualiza solo cuando guardas la partida.

Pensada para streamers de Twitch/YouTube que hacen Nuzlocke runs y quieren mostrar su equipo en pantalla sin configuraciones complejas. Funciona con **cualquier emulador** (mGBA, DeSmuME, Citra, Yuzu, Ryujinx, etc.) y **todas las generaciones** de Pokemon (1 a 9).

El motor de lectura usa **PKHeX** (la biblioteca estándar de la comunidad Pokemon) vía .NET 8.0, con un parser nativo como respaldo solo si .NET no está disponible.

---

## Instalación (30 segundos)

### Instalador NSIS (recomendado)
1. Descarga `NuzlockeOverlay-Setup-1.0.3.exe` desde [Releases](https://github.com/pokejgameryt-ship-it/nuzlocke-overlay/releases/latest)
2. Ejecuta el instalador, siguiente-siguiente-finalizar
3. Se instala en `C:\Program Files\Nuzlocke Overlay\` con desinstalador incluido
4. Si falta .NET 8.0, la app te avisará con botón de descarga directa

### Sin instalador (portable)
1. Descarga `NuzlockeOverlay.exe` desde Releases
2. Colócalo en una carpeta (ej: `C:\NuzlockeOverlay\`)
3. Ejecuta — al iniciar sin sprites te pregunta si descargarlos

### Requisitos
- Windows 10/11 (64-bit)
- .NET 8.0 Desktop Runtime (la app lo detecta y te guía)
- OBS Studio 28+

---

## Juegos compatibles (Gen 1 → 9)

| Generación | Juegos principales | Plataforma | Emuladores testados |
|------------|-------------------|------------|---------------------|
| **Gen 1** | Rojo, Azul, Amarillo | Game Boy | BGB, SameBoy, VisualBoyAdvance-M |
| **Gen 2** | Oro, Plata, Cristal | GBC | SameBoy, VisualBoyAdvance-M |
| **Gen 3** | Rubí, Zafiro, Esmeralda, RF/VF | GBA | **mGBA** (recomendado), VBA-M |
| **Gen 4** | Diamante, Perla, Platino, HG/SS | NDS | DeSmuME, melonDS |
| **Gen 5** | Negro/Blanco, N2/B2 | NDS | DeSmuME, melonDS |
| **Gen 6** | X/Y, RO/ZA | 3DS | Citra |
| **Gen 7** | Sol/Luna, US/UL | 3DS | Citra |
| **Gen 8** | Espada/Escudo, BDSP, Leyendas Arceus | Switch | Yuzu, Ryujinx, Sudachi, Suyu |
| **Gen 9** | Escarlata/Púrpura, Leyendas Z-A | Switch | Yuzu, Ryujinx, Sudachi, Suyu |

> La detección es automática. Si falla, selecciona el juego manualmente en el desplegable.

---

## Configuración en OBS (2 minutos)

1. **Abre la app** → crea proyecto → "Examinar" → selecciona tu `.sav` / `.dsv` / carpeta del emulador
2. La app detecta el juego y genera una URL local (`http://127.0.0.1:19876/overlay/...`)
3. **Copia la URL** (botón "Copiar URL")
4. En **OBS Studio**: Click derecho → Agregar → **Navegador**
   - URL: pega la copiada
   - Ancho: **1920**, Alto: **1080**
   - ✅ Controlar el URL via JavaScript
5. En la app, **Layout Editor** → arrastra sprites/nicknames a tu gusto

---

## Emuladores: configuración clave

| Emulador | Config importante |
|----------|-------------------|
| **mGBA** (Gen 3) | En *Preferences → Saving*: deja "Save game path" **vacío** (guarda junto a la ROM). Verifica `vbaBugCompat=1` y `gba.forceGbp=1` en `mGBA.ini` |
| **DeSmuME** (Gen 4-5) | Usa `.dsv` (formato nativo). La app recorta el footer automáticamente |
| **Citra** (Gen 6-7) | Selecciona la carpeta `00000001` → la app te deja elegir el archivo `main` |
| **Yuzu/Ryujinx** (Gen 8-9) | Exporta el save con **Checkpoint** o **JKSM** desde la consola (Ryujinx guarda encriptado) |
| **VisualBoyAdvance-M** (Gen 1-2) | `.sav` o `.sgb` estándar |

---

## Características principales

- **Lectura en tiempo real** — File watcher cada 500ms, actualiza overlay al guardar
- **PKHeX para todo** — Gen 1-9 con la misma biblioteca que usan los editores de saves
- **43+ estilos de sprites** — PNG/GIF, estáticos y animados, por generación
- **Layout Editor 1920×1080** — Drag & drop, multi-selección (Ctrl+Click, Shift+Click, Ctrl+A), snap, alineación
- **Nicknames completos** — Fuente del sistema (buscador con preview), color sólido/degradado, contorno (exterior/centrado/interior)
- **Placeholders** — Rellena slots vacíos con sprite por defecto (huevo/interrogación)
- **Proyectos ilimitados** — Buscador + orden (A-Z, Z-A, fecha) en barra lateral
- **Presets globales** — Guarda/carga layouts para reutilizar
- **6 idiomas** — ES, EN, FR, DE, JA, RU (selector en primera ejecución + ajustes)
- **Tour interactivo** — 11 pasos con spotlight para aprender la app
- **Cámara virtual** — Previsualiza tu webcam/OBS Virtual Camera sobre el layout (botón "Cam")
- **Descarga de sprites integrada** — Botón en Configuración → Recursos (desde GitHub Releases)
- **Auto-actualización** — Comprueba versiones al iniciar, changelog, opción "omitir versión"
- **Modo segundo plano** — Se queda en bandeja al cerrar; menú: Mostrar / Salir

---

## Estilos de sprites (cómo añadir los tuyos)

Los sprites viven en `%APPDATA%\nuzlocke-overlay\Recursos\Sprites\` organizados por generación:

```
Recursos/Sprites/
├── Gen1/
│   ├── estilo-clasico/
│   │   ├── 001.png  ← Bulbasaur
│   │   ├── 025.gif  ← Pikachu animado
│   │   └── ...
│   └── otro-estilo/
├── Gen2/
└── ...
```

**Formatos de nombre aceptados:**
- `025.png` / `25.gif` (numérico puro)
- `025-pikachu.png` (número + nombre)
- `25-alola.png` (forma regional)
- `BT025.png` (prefijos especiales)

La app escanea subcarpetas recursivamente. En el selector eliges estilo y se filtra por generación del proyecto.

---

## Atajos de teclado (Layout Editor)

| Tecla | Acción |
|-------|--------|
| `Ctrl+Z` / `Ctrl+Shift+Z` | Deshacer / Rehacer |
| `Ctrl+A` | Seleccionar todos los slots |
| `Escape` | Deseleccionar |
| `Ctrl+Click` | Multi-selección |
| `Shift+Click` | Rango de selección |
| `Arrows` | Mover selección (1px) / `Shift+Arrows` (10px) |

---

## Estructura de carpetas (tras instalar)

```
C:\Program Files\Nuzlocke Overlay\          # App (solo lectura)
├── NuzlockeOverlay.exe
├── resources\app\                          # Código Electron
└── resources\pkhex\                        # DLLs PKHeX incluidas

%APPDATA%\nuzlocke-overlay\                 # Datos de usuario
├── projects.json          # Proyectos
├── presets.json           # Layouts guardados
├── config.json            # Puerto, etc.
├── settings.json          # Idioma, modo background, versión vista
├── logs\                  # Logs diarios (nuzlocke-YYYY-MM-DD.log)
└── Recursos\Sprites\      # Sprites descargados (Gen1-Gen9)
```

---

## Solución de problemas

| Problema | Solución |
|----------|----------|
| **"Sin equipo detectado"** | 1) Verifica que el save path es correcto 2) Juego correcto en selector 3) Guarda en el juego 4) Revisa `logs/` |
| **"No detecta mi camara"** | OBS → Herramientas → Iniciar Cámara Virtual → Permite permiso en el navegador |
| **App no abre / crash** | Borra `%APPDATA%\nuzlocke-overlay\config.json` y reabre |
| **Fuentes no aparecen** | Configuración → "Abrir carpeta Recursos" → verifica estructura |
| **.NET no encontrado** | La app muestra diálogo con botón "Descargar .NET" directo a Microsoft |

---

## Logs (para depurar)

`%APPDATA%\nuzlocke-overlay\logs\nuzlocke-YYYY-MM-DD.log`

Busca líneas como:
- `[Watcher] PKHeX available: true`
- `[PKHeX] Found 6 Pokemon (E gen3)`
- `[Camera] Devices found: [...]`

---

## Redes sociales

| Plataforma | Enlace |
|------------|--------|
| Twitch | [pokejgamer](https://twitch.tv/pokejgamer) |
| YouTube | [PokeJgamer](https://youtube.com/@PokeJgamer) |
| TikTok | [@pokejgamer](https://tiktok.com/@pokejgamer) |
| Discord | [Servidor](https://discord.gg/upbhwavQas) |
| GitHub | [Repositorio](https://github.com/pokejgameryt-ship-it/nuzlocke-overlay) |

---

## Donar

Si la app te resulta útil y quieres apoyar el desarrollo:

[![Donar via StreamElements](https://img.shields.io/badge/Donar-StreamElements-yellow)](https://streamelements.com/pokejgamer-de2e0/tip)

---

## Tecnologías

- **Electron 28** — Desktop framework
- **PKHeX.Core** — Lectura de saves Pokemon (via .NET 8.0 runtime)
- **Express** — HTTP server para overlay (localhost)
- **Chokidar** — File watcher multiplataforma
- **NSIS** — Instalador gráfico Windows
- **i18n propio** — 6 idiomas sin dependencias externas

---

## Novedades v1.0.3

- **PKHeX para TODAS las generaciones** — Gen 1-9 usan PKHeX siempre; parser nativo solo como último recurso sin .NET
- **DLLs PKHeX en el instalador** — Ya no hace falta descarga aparte; todo va en `resources/pkhex/`
- **Comprobación .NET al inicio** — Diálogo con botón de descarga directa si falta runtime
- **Cámara virtual (OBS Virtual Camera)** — `mediastream:` en CSP, logging detallado, errores amigables
- **Fuentes del sistema sin filtro agresivo** — Todas las fuentes instaladas aparecen en el selector
- **Limpieza de código muerto** — Eliminado `getPartyCountDirectly` y validaciones que causaban falsos negativos
- **Mejor trimming de saves DSV/GBA** — Manejo robusto de footers DeSmuME y tamaños GBA

---

## Licencia

MIT — Libre para uso personal, comercial, modificar, distribuir.

---

<p align="center">
  Hecho para la comunidad Nuzlocke · 2024-2026
</p>