<p align="center">
  <img src="logo.png" alt="Nuzlocke Overlay" width="200">
</p>

<h1 align="center">Nuzlocke Overlay</h1>

<p align="center">
  <b>Overlay para OBS con seguimiento en tiempo real de tu equipo Pokemon en runs Nuzlocke</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue" alt="Version">
  <img src="https://img.shields.io/badge/platform-Windows-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

---

## Que es Nuzlocke Overlay?

Una aplicacion de escritorio para Windows que detecta automaticamente el equipo de Pokemon de tu partida guardada y muestra los sprites en un overlay para OBS Browser Source. Ideal para streamers y creadores de contenido que hacen runs Nuzlocke.

### Juegos compatibles (V1)

| Juego | Generacion | Soporte |
|-------|-----------|---------|
| Pokemon Diamante Brillante | Gen 8 (BDSP) | Completo |
| Pokemon Perla Reluciente | Gen 8 (BDSP) | Completo |
| Pokemon Espada | Gen 8 (Sw/Sh) | Completo |
| Pokemon Escudo | Gen 8 (Sw/Sh) | Completo |
| Pokemon Blanco | Gen 5 | Completo |
| Pokemon Blanco 2 | Gen 5 | Completo |
| Pokemon Negro | Gen 5 | Completo |
| Pokemon Negro 2 | Gen 5 | Completo |

> Soporte para Gen 1, 2, 3, 4, 6, 7 y 9 disponible en el parser, pero optimizado para los juegos listados arriba.

---

## Caracteristicas principales

- **Deteccion automatica de save files** - No necesitas seleccionar el juego, la app lo detecta solo
- **Sprites en tiempo real** - Se actualiza automaticamente cuando cambias Pokemon en el juego
- **28 estilos de sprites** - Gen 1-9, animados (GIF) y estaticos (PNG)
- **Layout editor** - Arrastra y redimensiona los slots en un canvas 1920x1080
- **Nickname personalizado** - Fuente, color, degradado, contorno, tamano auto
- **Presets globales** - Guarda y carga layouts para reutilizar
- **Multiple proyectos** - Crea tantos projetos como necesites
- **Modo segundo plano** - La app se queda en la bandeja del sistema al cerrar (como Discord)
- **Idiomas** - Español e ingles

---

## Requisitos previos

- **Windows 10/11** (x64)
- **Node.js 18+** (solo para compilar desde el codigo fuente)
- **OBS Studio** (para el overlay)

---

## Instalacion

### Opcion 1: Descargar exe precompilado (rapido)

1. Descarga `NuzlockeOverlay.exe` desde [Releases](https://github.com/pokejgameryt-ship-it/nuzlocke-overlay/releases)
2. Necesitas tambien la carpeta `Recursos/Sprites/` con los sprites de Pokemon
3. Coloca el exe junto a la carpeta `Recursos/` (misma carpeta)
4. Ejecuta `NuzlockeOverlay.exe`

### Opcion 2: Instalar desde el codigo fuente (completo)

```bash
# 1. Clona el repositorio
git clone https://github.com/pokejgameryt-ship-it/nuzlocke-overlay.git
cd nuzlocke-overlay

# 2. Ejecuta el instalador automatico
setup.bat
```

O manualmente:
```bash
npm install
npm run build:portable
```

El exe se generara en `dist/` y se copiara a la carpeta raiz.

### Opcion 3: Ejecutar sin compilar (desarrollo)

```bash
git clone https://github.com/pokejgameryt-ship-it/nuzlocke-overlay.git
cd nuzlocke-overlay
npm install
npm start
```

---

## Estructura de carpetas

```
NUZLOCKE APP/
├── logo.png              # Logo de la app
├── logo.svg              # Logo vectorial
├── main.js               # Process principal de Electron
├── preload.js            # Bridge IPC renderer<->main
├── settings.html         # Ventana de configuracion
├── config.json           # Puerto del servidor overlay (se crea automaticamente)
├── package.json
├── app/
│   ├── index.html        # UI principal
│   ├── app.js            # Logica del renderer
│   └── app.css           # Estilos
├── src/
│   ├── save-parser.js    # Parser de saves Gen 1-9
│   ├── swish-crypto.js   # Desencriptado Sw/Sh
│   ├── detect-save.js    # Auto-deteccion de formato
│   ├── sprite-scanner.js # Scanner y resolver de sprites
│   ├── file-watcher.js   # Watcher con chokidar
│   ├── project-manager.js
│   ├── preset-manager.js
│   ├── pokemon-data.js   # 1025 Pokemon + datos de forms
│   └── logger.js
├── public/
│   ├── overlay.html      # HTML del overlay para OBS
│   ├── js/overlay.js     # Logica del overlay
│   └── css/overlay.css   # Estilos del overlay
└── Recursos/
    └── Sprites/          # Carpetas de sprites por generacion
        ├── Gen1/
        ├── Gen2/
        ├── ...
        └── Gen9/
```

> **Importante:** La carpeta `Recursos/Sprites/` debe estar junto al exe para que los sprites se carguen.

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

## Estilos de sprites

Los sprites se organizan por generacion en `Recursos/Sprites/`. La app escanea subcarpetas automaticamente.

Para agregar un nuevo estilo:
1. Crea una carpeta en `Recursos/Sprites/GenX/`
2. Pon los archivos PNG o GIF con el numero del Pokemon como nombre (ej: `025.png` para Pikachu)
3. Haz click en "Refrescar" en la app

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
