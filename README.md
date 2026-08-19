<p align="center">
  <img src="logo.png" alt="Nuzlocke Overlay" width="200">
</p>

<h1 align="center">Nuzlocke Overlay</h1>

<p align="center">
  <b>Overlay para OBS con seguimiento en tiempo real de tu equipo Pokemon en runs Nuzlocke</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.0.0-blue" alt="Version">
  <img src="https://img.shields.io/badge/platform-Windows%2010%2F11-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/gen-1--9-brightgreen" alt="Gen 1-9">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

---

## Que es Nuzlocke Overlay?

Una aplicacion de escritorio para Windows que detecta automaticamente el equipo de Pokemon de tu partida guardada y muestra los sprites en un overlay para OBS Browser Source. Ideal para streamers y creadores de contenido que hacen runs Nuzlocke.

**Soporte completo para todas las generaciones: Gen 1 a Gen 9.**

---

## Instalacion rapida (1 minuto)

### Opcion 1: Instalador automatico (recomendado)

1. Descarga `setup.bat` desde [Releases](https://github.com/pokejgameryt-ship-it/nuzlocke-overlay/releases)
2. Ejecuta `setup.bat` (descarga el exe, .NET Runtime y sprites automaticamente)
3. Ejecuta `NuzlockeOverlay.exe`

> **Nota sobre los sprites (MEGA):** Los sprites ocupan ~8.5 GB y no caben en GitHub. El instalador los descarga automaticamente desde MEGA usando `megacmd`.
> **Solo la primera vez:** Necesitas instalar megacmd (ver instrucciones abajo). Despues, `setup.bat` hace todo solo: descarga exe + .NET Runtime + sprites + crea acceso directo.

### Opcion 2: Descarga directa

1. Descarga `NuzlockeOverlay.exe` desde [Releases](https://github.com/pokejgameryt-ship-it/nuzlocke-overlay/releases)
2. Necesitas tambien la carpeta `Recursos/Sprites/` con los sprites de Pokemon
3. Coloca el exe junto a la carpeta `Recursos/` (misma carpeta)
4. Ejecuta `NuzlockeOverlay.exe`

### Requisitos

- **Windows 10/11** (x64)
- **.NET 8.0 Runtime** (el instalador lo descarga automaticamente)
- **OBS Studio** (para el overlay)

---

### Configuracion de MEGA (solo primera vez)

El instalador usa MEGA para descargar la carpeta `Recursos/Sprites/` (~8.5 GB). Necesitas `megacmd` instalado:

1. **Instala megacmd:** Descarga desde <https://mega.io/cmd> (elige Windows x64)
2. **Reinicia la terminal** (cmd/PowerShell) despues de instalar
3. **Inicia sesion en MEGA:**
   ```cmd
   mega-login TU_EMAIL TU_PASSWORD
   ```
   (Solo se hace una vez. La sesion persiste entre reinicios)

4. **Ejecuta `setup.bat`** — Ahora descargara todo automaticamente:
   - `NuzlockeOverlay.exe` (desde GitHub Releases)
   - `.NET 8.0 Runtime` (si no esta instalado)
   - `Recursos/Sprites/` (desde MEGA, extrae y limpia)
   - Acceso directo en el escritorio

> **No quieres usar MEGA?** Descarga manualmente la carpeta `Recursos` desde MEGA y colocalas junto al exe. El instalador detectara que ya existe y no la descargara.

---

## Juegos compatibles (Gen 1 - Gen 9)

| Generacion | Juegos | Plataforma | Emuladores |
|------------|--------|------------|------------|
| **Gen 1** | Rojo, Azul, Amarillo | Game Boy | VisualBoyAdvance, BGB, ... |
| **Gen 2** | Oro, Plata, Cristal | Game Boy Color | VisualBoyAdvance, SameBoy, ... |
| **Gen 3** | Rubi, Zafiro, Esmeralda, Rojo Fuego, Verde Hoja | GBA | mGBA, VisualBoyAdvance-M |
| **Gen 4** | Diamante, Perla, Platino, HeartGold, SoulSilver | NDS | DeSmuME, melonDS, ... |
| **Gen 5** | Blanco, Negro, Blanco 2, Negro 2 | NDS | DeSmuME, melonDS, ... |
| **Gen 6** | X, Y, Rubi Omega, Zafiro Alfa | 3DS | Citra |
| **Gen 7** | Sol, Luna, Ultra Sol, Ultra Luna | 3DS | Citra |
| **Gen 8** | Espada, Escudo, Brilliant Diamond, Shining Pearl | Switch | Yuzu, Ryujinx, Sudachi, Suyu, ... |
| **Gen 9** | Escarlata, Violeta | Switch | Yuzu, Ryujinx, Sudachi, Suyu, ... |

> La deteccion del juego es automatica. Si falla, selecciona el juego manualmente en el selector.

---

## Caracteristicas principales

- **Deteccion automatica de save files** - No necesitas seleccionar el juego, la app lo detecta solo
- **Parser PKHeX** - Usa la libreria estandar de Pokemon para maxima compatibilidad (Gen 1-9)
- **Sprites en tiempo real** - Se actualiza automaticamente cada 500ms cuando guardas en el juego
- **28+ estilos de sprites** - Gen 1-9, animados (GIF) y estaticos (PNG)
- **Layout editor** - Arrastra y redimensiona los slots en un canvas 1920x1080
- **Nickname personalizado** - Fuente, color, degradado, contorno, tamano auto
- **Placeholder** - Rellena slots vacios con un sprite por defecto
- **Presets globales** - Guarda y carga layouts para reutilizar
- **Multiple proyectos** - Crea tantos proyectos como necesites
- **Modo segundo plano** - La app se queda en la bandeja del sistema al cerrar
- **Idiomas** - Espanol e Ingles

---

## Configuracion en OBS

1. Abre Nuzlocke Overlay y selecciona tu proyecto
2. Copia la URL de OBS que aparece en el panel del proyecto
3. En OBS Studio:
   - Click derecho en Fuentes -> **Agregar** -> **Navegador**
   - Pegar la URL copiada
   - Ancho: **1920**, Alto: **1080**
   - Marca **Controlar el URL via JavaScript**
4. Ajusta los slots en el editor de layout de la app

---

## Emuladores recomendados

| Generacion | Emulador | Notas |
|------------|----------|-------|
| Gen 1-2 | VisualBoyAdvance / SameBoy | Formato .sav o .sgb |
| Gen 3 | **mGBA** | Recomendado. Config: savegamePath vacio |
| Gen 4-5 | DeSmuME / melonDS | Formato .dsv |
| Gen 6-7 | Citra | Formato .citra |
| Gen 8-9 | Yuzu / Ryujinx | Formato .nx |

**Configuracion mGBA:** En Preferences > Saving, deja "Save game path" vacio para guardar en la misma carpeta que la ROM.

---

## Estructura de carpetas

```
NUZLOCKE APP/
├── NuzlockeOverlay.exe     # Ejecutable principal
├── setup.bat               # Instalador automatico
├── start.bat               # Lanzador rapido
├── logo.png                # Logo de la app
├── main.js                 # Process principal de Electron
├── preload.js              # Bridge IPC renderer<->main
├── settings.html           # Ventana de configuracion
├── config.json             # Puerto del servidor overlay
├── package.json
├── app/
│   ├── index.html          # UI principal
│   ├── app.js              # Logica del renderer
│   └── app.css             # Estilos
├── src/
│   ├── save-parser.js      # Parser de saves Gen 1-9
│   ├── pkhex-reader.js     # Wrapper de PKHeX (.NET)
│   ├── swish-crypto.js     # Desencriptado Sw/Sh
│   ├── detect-save.js      # Auto-deteccion de formato
│   ├── sprite-scanner.js   # Scanner y resolver de sprites
│   ├── file-watcher.js     # Watcher con chokidar
│   ├── project-manager.js
│   ├── preset-manager.js
│   ├── pokemon-data.js     # 1025+ Pokemon + datos de forms
│   └── logger.js
├── PkHexReader/             # Wrapper .NET de PKHeX
│   ├── Program.cs
│   ├── PkHexReader.csproj
│   └── bin/Release/net8.0/
├── public/
│   ├── overlay.html        # HTML del overlay para OBS
│   ├── js/overlay.js       # Logica del overlay
│   └── css/overlay.css     # Estilos del overlay
└── Recursos/
    └── Sprites/            # Carpetas de sprites por generacion
        ├── Gen1/
        ├── Gen2/
        ├── ...
        └── Gen9/
```

> **Importante:** La carpeta `Recursos/Sprites/` debe estar junto al exe para que los sprites se carguen.

---

## Estilos de sprites

Los sprites se organizan por generacion en `Recursos/Sprites/`. La app escanea subcarpetas automaticamente.

Para agregar un nuevo estilo:
1. Crea una carpeta en `Recursos/Sprites/GenX/`
2. Pon los archivos PNG o GIF con el numero del Pokemon como nombre (ej: `025.png` para Pikachu)
3. Selecciona el estilo en el selector de la app

**Formatos de nombre soportados:**
- `025.png` / `25.gif` (numerico)
- `025-pikachu.png` (numerico + nombre)
- `25-alola.png` (formas regionales)
- `BT025.png` (Battle Trozei)

---

## Atajos de teclado

| Atajo | Accion |
|-------|--------|
| `Ctrl+Z` | Deshacer |
| `Ctrl+Shift+Z` | Rehacer |
| `Ctrl+A` | Seleccionar todos los slots |
| `Escape` | Deseleccionar |
| `Ctrl+Click` | Seleccion multi |
| `Shift+Click` | Rango de seleccion |

---

## Redes sociales

Sigueme en mis redes para estar al dia del proyecto y mas contenido Pokemon:

| Plataforma | Enlace |
|------------|--------|
| YouTube | [PokeJgamer](https://www.youtube.com/channel/UCY-yUwAx1C0ApRHWKdo8o0Q) |
| Twitch | [pokejgamer](https://www.twitch.tv/pokejgamer) |
| Twitter/X | [@P0keJgamer](https://x.com/P0keJgamer) |
| TikTok | [@pokejgamer](https://www.tiktok.com/@pokejgamer) |
| Discord | [Unirse al servidor](https://discord.gg/GSBKCBDsh5) |

---

## Donar

Si te gusta la app y quieres apoyar el proyecto:

[![Donar](https://img.shields.io/badge/Donar-StreamElements-yellow)](https://streamelements.com/pokejgamer-de2e0/tip)

---

## Tecnologias

- **Electron 28** - Framework de escritorio
- **PKHeX.Core** - Libreria de lectura de saves Pokemon (via .NET 8.0)
- **Express** - Servidor HTTP para el overlay
- **Chokidar** - File watcher para detectar cambios en saves
- **Node.js** - Runtime

---

## Licencia

MIT License - Libre para uso personal y comercial.

---

<p align="center">
  Creado con carino para la comunidad Pokemon Nuzlocke
</p>
