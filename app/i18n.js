const translations = {
  es: {
    app: { title: "Nuzlocke Overlay", version: "Versión" },
    sidebar: { projects: "Proyectos", newProject: "Nuevo proyecto", settings: "Configuración", help: "Ayuda", donate: "Donar" },
    project: { name: "Nombre del proyecto", saveFile: "Archivo de partida", browse: "Examinar", spriteStyle: "Estilo de sprites", gameVersion: "Versión del juego", autoDetect: "Auto-detectar generación", overlayUrl: "URL para OBS Browser Source", copyUrl: "Copiar URL", urlCopied: "¡URL copiada!", startServer: "Iniciar servidor overlay", stopServer: "Detener servidor overlay", serverRunning: "Servidor corriendo en puerto", serverStopped: "Servidor detenido", team: "Equipo", noTeam: "No hay equipo detectado", encryptedError: "El archivo de partida está encriptado o no es compatible" },
    layout: { title: "Editor de Layout", canvasSize: "Tamaño del canvas: 1920x1080", slot: "Slot", sprite: "Sprite", nickname: "Nickname", position: "Posición", size: "Tamaño", scale: "Escala", x: "X", y: "Y", width: "Ancho", height: "Alto", alignment: "Alinear", alignLeft: "Izquierda", alignCenter: "Centro H", alignRight: "Derecha", alignTop: "Arriba", alignMiddle: "Centro V", alignBottom: "Abajo", distributeH: "Distribuir H", distributeV: "Distribuir V", undo: "Deshacer (Ctrl+Z)", redo: "Rehacer (Ctrl+Shift+Z)", selectAll: "Seleccionar todo (Ctrl+A)", presets: "Presets", savePreset: "Guardar preset", loadPreset: "Cargar preset", deletePreset: "Eliminar preset", presetName: "Nombre del preset" },
    nicknameStyle: { title: "Estilo de Nickname", fontFamily: "Fuente", fontSize: "Tamaño", color: "Color", gradient: "Gradiente", gradientType: "Tipo", linear: "Lineal", radial: "Radial", angle: "Ángulo", stroke: "Contorno", strokeWidth: "Grosor", strokeAlign: "Alineación", inside: "Interior", center: "Centro", outside: "Exterior", autoSize: "Auto-ajustar al slot", independent: "Posición/tamaño independiente por Pokémon" },
    settings: { title: "Configuración", language: "Idioma", backgroundMode: "Modo segundo plano", backgroundModeDesc: "Al cerrar la ventana, la app se queda en la bandeja del sistema (como Discord)", enabled: "Activado", disabled: "Desactivado", save: "Guardar", cancel: "Cancelar", restartRequired: "Requiere reinicio para aplicar cambios de idioma" },
    help: { title: "Ayuda", search: "Buscar...", topics: { gettingStarted: "Primeros pasos", projects: "Gestión de proyectos", saveFiles: "Archivos de partida", spriteStyles: "Estilos de sprites", layoutEditor: "Editor de layout", nicknames: "Nicknames y estilos", obsSetup: "Configuración OBS", shortcuts: "Atajos de teclado" } },
    common: { ok: "Aceptar", cancel: "Cancelar", save: "Guardar", delete: "Eliminar", edit: "Editar", close: "Cerrar", yes: "Sí", no: "No", loading: "Cargando...", error: "Error", success: "Éxito" },
    tray: { show: "Mostrar", hide: "Ocultar", quit: "Salir", overlayRunning: "Overlay activo" }
  },
  en: {
    app: { title: "Nuzlocke Overlay", version: "Version" },
    sidebar: { projects: "Projects", newProject: "New Project", settings: "Settings", help: "Help", donate: "Donate" },
    project: { name: "Project Name", saveFile: "Save File", browse: "Browse", spriteStyle: "Sprite Style", gameVersion: "Game Version", autoDetect: "Auto-detect Generation", overlayUrl: "URL for OBS Browser Source", copyUrl: "Copy URL", urlCopied: "URL copied!", startServer: "Start Overlay Server", stopServer: "Stop Overlay Server", serverRunning: "Server running on port", serverStopped: "Server stopped", team: "Team", noTeam: "No team detected", encryptedError: "Save file is encrypted or not supported" },
    layout: { title: "Layout Editor", canvasSize: "Canvas size: 1920x1080", slot: "Slot", sprite: "Sprite", nickname: "Nickname", position: "Position", size: "Size", scale: "Scale", x: "X", y: "Y", width: "Width", height: "Height", alignment: "Align", alignLeft: "Left", alignCenter: "Center H", alignRight: "Right", alignTop: "Top", alignMiddle: "Middle V", alignBottom: "Bottom", distributeH: "Distribute H", distributeV: "Distribute V", undo: "Undo (Ctrl+Z)", redo: "Redo (Ctrl+Shift+Z)", selectAll: "Select All (Ctrl+A)", presets: "Presets", savePreset: "Save Preset", loadPreset: "Load Preset", deletePreset: "Delete Preset", presetName: "Preset Name" },
    nicknameStyle: { title: "Nickname Style", fontFamily: "Font", fontSize: "Size", color: "Color", gradient: "Gradient", gradientType: "Type", linear: "Linear", radial: "Radial", angle: "Angle", stroke: "Stroke", strokeWidth: "Width", strokeAlign: "Alignment", inside: "Inside", center: "Center", outside: "Outside", autoSize: "Auto-fit to slot", independent: "Independent position/size per Pokémon" },
    settings: { title: "Settings", language: "Language", backgroundMode: "Background Mode", backgroundModeDesc: "When closing window, app stays in system tray (like Discord)", enabled: "Enabled", disabled: "Disabled", save: "Save", cancel: "Cancel", restartRequired: "Restart required to apply language changes" },
    help: { title: "Help", search: "Search...", topics: { gettingStarted: "Getting Started", projects: "Project Management", saveFiles: "Save Files", spriteStyles: "Sprite Styles", layoutEditor: "Layout Editor", nicknames: "Nicknames & Styles", obsSetup: "OBS Setup", shortcuts: "Keyboard Shortcuts" } },
    common: { ok: "OK", cancel: "Cancel", save: "Save", delete: "Delete", edit: "Edit", close: "Close", yes: "Yes", no: "No", loading: "Loading...", error: "Error", success: "Success" },
    tray: { show: "Show", hide: "Hide", quit: "Quit", overlayRunning: "Overlay active" }
  }
};

let currentLang = 'es';

function setLanguage(lang) {
  if (translations[lang]) currentLang = lang;
}

function t(key) {
  const parts = key.split('.');
  let obj = translations[currentLang];
  for (const part of parts) {
    if (!obj) return key;
    obj = obj[part];
  }
  return obj || key;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const translation = t(key);
    if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit' || el.type === 'reset')) {
      el.value = translation;
    } else if (el.tagName === 'OPTION') {
      el.textContent = translation;
    } else {
      el.textContent = translation;
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
}

function updateUIText() {
  applyTranslations();
}

window.I18n = { setLanguage, t, applyTranslations: updateUIText };