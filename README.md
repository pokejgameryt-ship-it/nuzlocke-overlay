<p align="center">
  <img src="logo.png" alt="Nuzlocke Overlay" width="200">
</p>

<h1 align="center">Nuzlocke Overlay</h1>

<p align="center">
  <b>Overlay para OBS con seguimiento en tiempo real de tu equipo Pokemon en runs Nuzlocke</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.1.0-blue" alt="Version">
  <img src="https://img.shields.io/badge/platform-Windows%2010%2F11-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/gen-1--9-brightgreen" alt="Gen 1-9">
  <img src="https://img.shields.io/badge/languages-ES%20%7C%20EN%20%7C%20FR%20%7C%20DE%20%7C%20JA%20%7C%20RU-brightgreen" alt="Languages">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

---

## Que es Nuzlocke Overlay?

Una aplicacion de escritorio para Windows que detecta automaticamente el equipo de Pokemon de tu partida guardada y muestra los sprites en un overlay para OBS Browser Source. Ideal para streamers y creadores de contenido que hacen runs Nuzlocke.

**Soporte completo para todas las generaciones: Gen 1 a Gen 9** mediante PKHeX (la libreria estandar de Pokemon) con parser nativo como fallback.

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
| **Gen 9** | Escarlata, Púrpura | Switch | Yuzu, Ryujinx, Sudachi, Suyu, ... |

> La deteccion del juego es automatica. Si falla, selecciona el juego manualmente en el selector.

---

## Caracteristicas principales

- **Deteccion automatica de save files** - Selecciona el archivo o carpeta del emulador y la app detecta el juego y equipo solamente
- **PKHeX integration** - Usa la libreria PKHeX (.NET 8.0) para leer saves de Gen 1-9 con maxima compatibilidad
- **Parser nativo fallback** - Si PKHeX no esta disponible, un parser interno maneja Gen 1-7
- **Sprites en tiempo real** - Se actualiza automaticamente cada 500ms cuando guardas en el juego
- **43+ estilos de sprites** - Gen 1-9, animados (GIF) y estaticos (PNG), incluyendo Artworks, Home, Mystery Dungeon, etc.
- **Layout editor** - Arrastra y redimensiona los slots en un canvas 1920x1080
- **Nickname personalizado** - Fuente, color, degradado, contorno, tamano auto
- **Placeholder** - Rellena slots vacios con un sprite por defecto
- **Presets globales** - Guarda y carga layouts para reutilizar
- **Multiple proyectos** - Crea tantos proyectos como necesites
- **Modo segundo plano** - La app se queda en la bandeja del sistema al cerrar
- **6 idiomas** - Espanol, Ingles, Frances, Aleman, Japones, Ruso
- **Tour interactivo** - Guia paso a paso con spotlight para aprender a usar la app
- **Busqueda de proyectos** - Filtra y ordena proyectos en la barra lateral
- **Social links** - Acceso rapido a Twitch, YouTube, TikTok y Discord desde ajustes

---

## Configuracion en OBS

1. Abre Nuzlocke Overlay y selecciona o crea un proyecto
2. Haz clic en "Examinar" y selecciona tu save file o la carpeta del emulador
   - Si seleccionas una carpeta, se abrira un segundo dialogo para elegir el archivo save especifico
3. La app detecta automaticamente el juego y genera el URL del overlay
4. Copia la URL y en OBS Studio:
   - Click derecho en Fuentes -> **Agregar** -> **Navegador**
   - Pegar la URL copiada
   - Ancho: **1920**, Alto: **1080**
   - Marca **Controlar el URL via JavaScript**
5. Ajusta los slots en el editor de layout de la app

---

## Emuladores recomendados

| Generacion | Emulador | Formato | Notas |
|------------|----------|---------|-------|
| Gen 1-2 | VisualBoyAdvance / SameBoy | .sav / .sgb | |
| Gen 3 | **mGBA** | .sav | savegamePath vacio en config |
| Gen 4-5 | DeSmuME / melonDS | .dsv | |
| Gen 6-7 | Citra | .citra / main | Selecciona carpeta 00000001 |
| Gen 8-9 | Yuzu / Ryujinx / Sudachi | .nx | |

**Configuracion mGBA:** En Preferences > Saving, deja "Save game path" vacio para guardar en la misma carpeta que la ROM. Asegurate de tener `vbaBugCompat=1` y `gba.forceGbp=1`.

**Citra:** La app puede navegar directamente a la carpeta del save (e.g. `00000001`) y te permite elegir el archivo especifico.

---

## Estructura de carpetas

```
NUZLOCKE APP/
├── NuzlockeOverlay.exe         # Ejecutable principal
├── setup.bat                   # Instalador automatico
├── start.bat                   # Lanzador rapido
├── logo.png                    # Logo de la app
├── main.js                     # Process principal de Electron
├── preload.js                  # Bridge IPC renderer<->main
├── settings.html               # Ventana de configuracion
├── config.json                 # Puerto del servidor overlay
├── package.json
├── app/
│   ├── index.html              # UI principal
│   ├── app.js                  # Logica del renderer
│   ├── app.css                 # Estilos
│   └── i18n.js                 # Traducciones (ES, EN, FR, DE, JA, RU)
├── src/
│   ├── save-parser.js          # Parser de saves Gen 1-9
│   ├── pkhex-reader.js         # Wrapper de PKHeX (.NET)
│   ├── swish-crypto.js         # Desencriptado Sw/Sh
│   ├── detect-save.js          # Auto-deteccion de formato
│   ├── sprite-scanner.js       # Scanner y resolver de sprites
│   ├── file-watcher.js         # Watcher con chokidar
│   ├── project-manager.js
│   ├── preset-manager.js
│   ├── pokemon-data.js         # 1025+ Pokemon + datos de forms
│   └── logger.js
├── PkHexReader/                 # Wrapper .NET de PKHeX
│   ├── Program.cs
│   ├── PkHexReader.csproj
│   └── bin/Release/net8.0/
├── public/
│   ├── overlay.html            # HTML del overlay para OBS
│   ├── js/overlay.js           # Logica del overlay
│   └── css/overlay.css         # Estilos del overlay
└── Recursos/
    └── Sprites/                # Carpetas de sprites por generacion
        ├── Gen1/               # 4 estilos
        ├── Gen2/               # 3 estilos
        ├── Gen3/               # 8 estilos
        ├── Gen4/               # 7 estilos
        ├── Gen5/               # 4 estilos
        ├── Gen6/               # 3 estilos
        ├── Gen7/               # 3 estilos
        ├── Gen8/               # 3 estilos
        ├── Gen9/               # 6 estilos
        └── LEGENDS ARCEUS/     # 2 estilos
```

> **Importante:** La carpeta `Recursos/Sprites/` debe estar junto al exe para que los sprites se carguen. La app escanea subcarpetas automaticamente.

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
| Twitch | [pokejgamer](https://www.twitch.tv/pokejgamer) |
| YouTube | [PokeJgamer](https://www.youtube.com/channel/UCY-yUwAx1C0ApRHWKdo8o0Q) |
| TikTok | [@pokejgamer](https://www.tiktok.com/@pokejgamer) |
| Discord | [Unirse al servidor](https://discord.gg/upbhwavQas) |

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
- **i18n** - Sistema de internacionalizacion con 6 idiomas

---

## Que hay nuevo en v2.1

- **6 idiomas** - Espanol, Ingles, Frances, Aleman, Japones y Ruso con traduccion completa de la UI
- **Tour interactivo** - Guia paso a paso con spotlight que te enseña a usar la app al primer inicio
- **Social links** - Acceso rapido a Twitch, YouTube, TikTok y Discord desde ajustes
- **Busqueda y orden de proyectos** - Filtra proyectos por nombre y ordena por fecha o alfabeticamente
- **Seleccion de carpeta** - Puedes seleccionar una carpeta del emulador y la app te permite elegir el archivo save especifico dentro
- **Mejor deteccion de saves** - PKHeX como fallback para deteccion de juego cuando el parser nativo no reconoce el formato
- **PKHeX timeout extendido** - 30 segundos para JIT warmup en primer uso
- **Fixes** - Corregido parsing de JSON con caracteres especiales en nombres de OT, fix de i18n en window, fix de Snap->Magnet

---

## Licencia

MIT License - Libre para uso personal y comercial.

---

<p align="center">
  Creado con carino para la comunidad Pokemon Nuzlocke
</p>
