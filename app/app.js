(function() {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let projects = [];
  let currentId = null;
  let styles = [];
  let games = [];
  let dragState = null;
  let selectedSlots = new Set();
  let selectedNicknameSlots = new Set();
  let history = [];
  let historyIndex = -1;
  const MAX_HISTORY = 80;
  let currentTeam = [];
  let currentLang = 'es';
  let projectSearchQuery = '';
  let projectSortMode = 'name-asc';

  function showModal(title, defaultValue) {
    return new Promise(resolve => {
      const overlay = document.getElementById('modalOverlay');
      const input = document.getElementById('modalInput');
      document.getElementById('modalTitle').textContent = title;
      input.value = defaultValue || '';
      overlay.style.display = 'flex';
      input.focus();
      input.select();
      function cleanup(result) {
        overlay.style.display = 'none';
        document.getElementById('modalOk').removeEventListener('click', onOk);
        document.getElementById('modalCancel').removeEventListener('click', onCancel);
        input.removeEventListener('keydown', onKey);
        overlay.removeEventListener('click', onBg);
        resolve(result);
      }
      function onOk() { cleanup(input.value.trim()); }
      function onCancel() { cleanup(null); }
      function onKey(e) { if (e.key === 'Enter') cleanup(input.value.trim()); if (e.key === 'Escape') cleanup(null); }
      function onBg(e) { if (e.target === overlay) cleanup(null); }
      document.getElementById('modalOk').addEventListener('click', onOk);
      document.getElementById('modalCancel').addEventListener('click', onCancel);
      input.addEventListener('keydown', onKey);
      overlay.addEventListener('click', onBg);
    });
  }

  function showConfirm(title, message) {
    return new Promise(resolve => {
      const overlay = document.getElementById('confirmOverlay');
      document.getElementById('confirmTitle').textContent = title;
      document.getElementById('confirmMessage').textContent = message;
      overlay.style.display = 'flex';
      function cleanup(result) {
        overlay.style.display = 'none';
        document.getElementById('confirmOk').removeEventListener('click', onOk);
        document.getElementById('confirmCancel').removeEventListener('click', onCancel);
        resolve(result);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }
      document.getElementById('confirmOk').addEventListener('click', onOk);
      document.getElementById('confirmCancel').addEventListener('click', onCancel);
    });
  }

  function cloneSlots() {
    const project = projects.find(p => p.id === currentId);
    if (!project) return null;
    return {
      sprites: (project.slots || getDefaultSlots()).map(s => ({ ...s })),
      nicknames: (project.nicknameSlots || getDefaultNicknameSlots(project.slots)).map(s => ({ ...s }))
    };
  }

  function pushHistory() {
    const snapshot = cloneSlots();
    if (!snapshot) return;
    history = history.slice(0, historyIndex + 1);
    history.push(snapshot);
    if (history.length > MAX_HISTORY) history.shift();
    historyIndex = history.length - 1;
    updateUndoRedoBtns();
  }

  function undo() {
    if (historyIndex <= 0) return;
    historyIndex--;
    restoreFromHistory();
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    historyIndex++;
    restoreFromHistory();
  }

  function restoreFromHistory() {
    const project = projects.find(p => p.id === currentId);
    if (!project) return;
    const snap = history[historyIndex];
    project.slots = snap.sprites.map(s => ({ ...s }));
    project.nicknameSlots = snap.nicknames.map(s => ({ ...s }));
    renderCanvasSlots(project.slots, project.nicknameSlots);
    updateUndoRedoBtns();
    saveProject();
  }

  function updateUndoRedoBtns() {
    const undoBtn = $('#undoBtn');
    const redoBtn = $('#redoBtn');
    if (undoBtn) undoBtn.disabled = historyIndex <= 0;
    if (redoBtn) redoBtn.disabled = historyIndex >= history.length - 1;
  }

  async function init() {
    setupListeners();
    try {
      styles = await window.api.getStyles();
    } catch (e) {
      console.error('[INIT] getStyles failed:', e);
      styles = [];
    }
    try {
      games = await window.api.getGames();
    } catch (e) {
      console.error('[INIT] getGames failed:', e);
      games = [];
    }
    try {
      await loadSystemFonts();
    } catch (e) {
      console.error('[INIT] loadSystemFonts failed:', e);
    }
    initFontPicker();
    try {
      projects = await window.api.listProjects();
    } catch (e) {
      console.error('[INIT] listProjects failed:', e);
      projects = [];
    }
    renderProjectList();
    if (projects.length > 0) selectProject(projects[0].id);
    await loadAndApplySettings();
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    window.api.onTeamUpdated((projectId, team, error) => {
      if (projectId === currentId) {
        if (error === 'encrypted') {
          currentTeam = [];
          const status = $('#teamStatus');
          status.className = 'team-status error';
          status.innerHTML = '<b>Save encriptado</b><br>Ryujinx almacena los saves de Sw/Sh encriptados.<br>Usa <b>Checkpoint</b> o <b>JKSM</b> para exportar el save desde el juego, o intenta con otro emulador.';
        } else {
          currentTeam = team;
          updateTeamStatus();
        }
        const project = projects.find(p => p.id === currentId);
        if (project) renderCanvasSlots(project.slots, project.nicknameSlots);
      }
    });

    window.api.onStylesRefreshed((newStyles) => {
      styles = newStyles;
      const project = projects.find(p => p.id === currentId);
      if (project) {
        populateStyleSelect(project.spriteStyle);
      }
    });

    setTimeout(() => {
      checkForUpdates();
      checkAndDownloadRecursos();
    }, 3000);
  }

  function renderProjectList() {
    const list = $('#projectList');
    list.innerHTML = '';

    let filtered = projects;
    if (projectSearchQuery) {
      const q = projectSearchQuery.toLowerCase();
      filtered = projects.filter(p => (p.name || 'Sin nombre').toLowerCase().includes(q));
    }

    const sorted = [...filtered].sort((a, b) => {
      switch (projectSortMode) {
        case 'name-asc': return (a.name || '').localeCompare(b.name || '');
        case 'name-desc': return (b.name || '').localeCompare(a.name || '');
        case 'date-new': return (b.createdAt || 0) - (a.createdAt || 0);
        case 'date-old': return (a.createdAt || 0) - (b.createdAt || 0);
        default: return 0;
      }
    });

    sorted.forEach(p => {
      const el = document.createElement('div');
      el.className = 'project-item' + (p.id === currentId ? ' active' : '');
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'project-item-name';
      nameSpan.textContent = p.name || 'Sin nombre';
      nameSpan.addEventListener('click', () => selectProject(p.id));
      el.appendChild(nameSpan);
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'project-delete-btn';
      deleteBtn.innerHTML = '&times;';
      deleteBtn.title = 'Eliminar proyecto';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        // Double confirmation
        const ok1 = await showConfirm('Eliminar proyecto', `Eliminar "${p.name || 'Sin nombre'}"?\n\nEsta accion no se puede deshacer.`);
        if (!ok1) return;
        const ok2 = await showConfirm('Confirmar eliminacion', `Seguro que quieres eliminar "${p.name || 'Sin nombre'}"?\n\nSe eliminaran todos los datos del proyecto.`);
        if (!ok2) return;
        await window.api.deleteProject(p.id);
        projects = projects.filter(pr => pr.id !== p.id);
        if (currentId === p.id) {
          currentId = projects.length > 0 ? projects[0].id : null;
        }
        renderProjectList();
        if (currentId) selectProject(currentId);
        else { $('#editor').style.display = 'none'; $('#emptyState').style.display = 'flex'; }
      });
      el.appendChild(deleteBtn);
      
      list.appendChild(el);
    });
  }

  async function selectProject(id) {
    currentId = id;
    selectedSlots.clear();
    selectedNicknameSlots.clear();
    activeSlotType = 'sprite';
    lastClickIndex = -1;
    history = [];
    historyIndex = -1;
    currentTeam = [];
    renderProjectList();
    const project = await window.api.getProject(id);
    if (!project) return;

    $('#editor').style.display = 'flex';
    $('#emptyState').style.display = 'none';
    $('#helpPanel').style.display = 'none';

    $('#projectName').value = project.name;
    $('#savePath').value = project.savePath || '';
    $('#showNames').checked = project.showNames !== false;
    $('#usePlaceholder').checked = project.usePlaceholder || false;

    populateGameSelect(project.game);
    populateStyleSelect(project.spriteStyle);
    updateSpritePreview(project.spriteStyle, project.spriteStylePath);
    loadNicknameStyle(project.nicknameStyle);
    updateObsUrl();
    await refreshTeam();
    if (!project.slots) project.slots = getDefaultSlots();
    if (!project.nicknameSlots) project.nicknameSlots = getDefaultNicknameSlots(project.slots);
    renderCanvasSlots(project.slots, project.nicknameSlots);
    pushHistory();
    loadPresets();
    loadPlaceholderSprites(project.spriteStylePath);
  }

  async function refreshTeam() {
    if (!currentId) { currentTeam = []; updateTeamStatus(); return; }
    currentTeam = await window.api.getTeam(currentId);
    updateTeamStatus();
  }

  function updateTeamStatus() {
    const el = $('#teamStatus');
    if (!el) return;
    if (!currentTeam || currentTeam.length === 0) {
      el.textContent = 'Sin equipo detectado';
      el.className = 'team-status empty';
    } else {
      const names = currentTeam.map(p => {
        if (p.nickname) return p.nickname;
        return '#' + p.speciesId;
      }).join(', ');
      el.textContent = `${currentTeam.length} Pokemon: ${names}`;
      el.className = 'team-status found';
    }
  }

  function populateGameSelect(selected) {
    const sel = $('#gameSelect');
    sel.innerHTML = '';
    // Auto-detect option
    const autoOpt = document.createElement('option');
    autoOpt.value = 'auto';
    autoOpt.textContent = '🔍 Auto-detectar generación';
    if (!selected || (selected && selected.version === 'auto')) autoOpt.selected = true;
    sel.appendChild(autoOpt);
    // Group games by generation
    const grouped = {};
    games.forEach(g => {
      if (!grouped[g.generation]) grouped[g.generation] = [];
      grouped[g.generation].push(g);
    });
    for (const gen of Object.keys(grouped).sort()) {
      const group = document.createElement('optgroup');
      group.label = `Gen ${gen}`;
      grouped[gen].forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = g.name;
        if (selected && selected.version === g.id) opt.selected = true;
        group.appendChild(opt);
      });
      sel.appendChild(group);
    }
  }

  function populateStyleSelect(selectedId) {
    const sel = $('#styleSelect');
    sel.innerHTML = '';

    const genGroups = {};
    styles.forEach(s => {
      const gens = s.generations && s.generations.length > 0 ? s.generations : [0];
      gens.forEach(g => {
        if (!genGroups[g]) genGroups[g] = [];
        genGroups[g].push(s);
      });
    });

    const genOrder = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0];
    const genLabels = {
      1: 'Gen 1 (Kanto)', 2: 'Gen 2 (Johto)', 3: 'Gen 3 (Hoenn)',
      4: 'Gen 4 (Sinnoh)', 5: 'Gen 5 (Teselia)', 6: 'Gen 6 (Kalos)',
      7: 'Gen 7 (Alola)', 8: 'Gen 8 (Galar)', 9: 'Gen 9 (Paldea)',
      10: 'Legends Arceus',
      0: 'Otras'
    };

    for (const g of genOrder) {
      const groupStyles = genGroups[g];
      if (!groupStyles || groupStyles.length === 0) continue;

      const group = document.createElement('optgroup');
      group.label = genLabels[g] || `Gen ${g}`;
      groupStyles.sort((a, b) => a.name.localeCompare(b.name));
      groupStyles.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name} (${s.fileCount})`;
        opt.dataset.path = s.path;
        opt.dataset.type = s.type;
        group.appendChild(opt);
      });
      sel.appendChild(group);
    }

    if (selectedId) sel.value = selectedId;
  }

  async function updateObsUrl() {
    if (!currentId) return;
    const url = await window.api.getOverlayUrl(currentId);
    $('#obsUrl').textContent = url || 'Iniciando servidor...';
  }

  async function updateSpritePreview(styleId, stylePath) {
    const preview = $('#spritePreview');
    if (!preview || !styleId) {
      if (preview) preview.innerHTML = '<p>Selecciona un estilo</p>';
      return;
    }
    let port = 19876;
    try { port = await window.api.getPort(); } catch(e) {}
    const baseUrl = `http://127.0.0.1:${port}/sprites`;
    const relPath = stylePath || styleId;
    try {
      const previewPath = await window.api.getPreviewSprite(relPath);
      if (previewPath) {
        const url = `${baseUrl}/${previewPath}?_t=${Date.now()}`;
        const img = new Image();
        img.onload = () => { preview.innerHTML = ''; preview.appendChild(img); };
        img.onerror = () => { preview.innerHTML = ''; };
        img.src = url;
        img.alt = 'Sprite preview';
        img.style.maxHeight = '80px';
        img.style.imageRendering = 'pixelated';
        return;
      }
    } catch (e) {}
    preview.innerHTML = '';
  }

  function getDefaultSlots() {
    const slots = [];
    const w = 120, h = 120;
    const totalW = 6 * w + 5 * 20;
    const startX = (1920 - totalW) / 2;
    for (let i = 0; i < 6; i++) {
      slots.push({ x: Math.round(startX + i * (w + 20)), y: 480, width: w, height: h });
    }
    return slots;
  }

  function getDefaultNicknameSlots(spriteSlots) {
    const slots = [];
    for (let i = 0; i < 6; i++) {
      const ss = spriteSlots && spriteSlots[i];
      if (ss) {
        slots.push({ x: ss.x, y: ss.y + ss.height + 5, width: ss.width, height: 30 });
      } else {
        slots.push({ x: i * 140 + 100, y: 605, width: 120, height: 30 });
      }
    }
    return slots;
  }

  function getDefaultNicknameStyle() {
    return {
      fontFamily: 'Arial',
      fontBold: false,
      fontItalic: false,
      colorMode: 'solid',
      color: '#ffffff',
      gradColor1: '#ffffff',
      gradColor2: '#000000',
      angle: 0,
      strokeWidth: 2,
      strokeColor: '#000000',
      strokePosition: 'exterior'
    };
  }

  const SYSTEM_FONTS = [];

  async function loadSystemFonts() {
    try {
      const fonts = await window.api.getSystemFonts();
      SYSTEM_FONTS.length = 0;
      SYSTEM_FONTS.push(...fonts);
    } catch (e) {
      SYSTEM_FONTS.push(
        'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Candara', 'Comic Sans MS',
        'Consolas', 'Constantia', 'Corbel', 'Courier New', 'Ebrima', 'Franklin Gothic',
        'Futura', 'Gabriola', 'Georgia', 'Haettenschweiler', 'Impact', 'Ink Free',
        'Leelawadee', 'Lucida Console', 'Lucida Sans', 'Malgun Gothic', 'Microsoft JhengHei',
        'Microsoft Sans Serif', 'Myanmar Text', 'Nirmala UI', 'Palatino Linotype',
        'Papyrus', 'Perpetua', 'Rockwell', 'Segoe UI', 'SimSun', 'Snap ITC',
        'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Viner Hand ITC'
      );
    }
  }

  let activeSlotType = 'sprite';
  let lastClickIndex = -1;
  let lastClickSlotType = 'sprite';

  function getActiveSlotData() {
    const project = projects.find(p => p.id === currentId);
    if (!project) return null;
    if (activeSlotType === 'nickname') {
      return { slots: project.nicknameSlots || getDefaultNicknameSlots(project.slots), type: 'nickname', typeKey: 'nicknameSlots' };
    }
    return { slots: project.slots || getDefaultSlots(), type: 'sprite', typeKey: 'slots' };
  }

  function renderCanvasSlots(slots, nicknameSlots) {
    const canvas = $('#layoutCanvas');
    const video = $('#cameraPreview');
    canvas.innerHTML = '';
    canvas.appendChild(video);
    const wrapper = $('#canvasWrapper');
    const scale = wrapper.clientWidth / 1920;
    canvas.style.transform = `scale(${scale})`;
    canvas.style.height = (1080 * scale) + 'px';

    slots.forEach((slot, i) => {
      const el = document.createElement('div');
      el.className = 'canvas-slot' + (selectedSlots.has(i) ? ' selected' : '');
      el.dataset.index = i;
      el.dataset.slotType = 'sprite';
      el.style.left = slot.x + 'px';
      el.style.top = slot.y + 'px';
      el.style.width = slot.width + 'px';
      el.style.height = slot.height + 'px';

      const pokemon = currentTeam && currentTeam[i];
      if (pokemon && pokemon.spriteUrl) {
        const img = document.createElement('img');
        img.src = pokemon.spriteUrl;
        img.alt = pokemon.nickname || ('#' + pokemon.speciesId);
        img.className = 'slot-sprite';
        img.draggable = false;
        el.appendChild(img);
      } else {
        el.textContent = `P${i + 1}`;
      }

      const handle = document.createElement('div');
      handle.className = 'resize-handle';
      el.appendChild(handle);

      el.addEventListener('mousedown', (e) => startDrag(e, i, 'move', 'sprite'));
      handle.addEventListener('mousedown', (e) => { e.stopPropagation(); startDrag(e, i, 'resize', 'sprite'); });
      el.addEventListener('click', (e) => { e.stopPropagation(); onSlotClick(e, i, 'sprite'); });

      canvas.appendChild(el);
    });

    if (nicknameSlots && nicknameSlots.length > 0) {
      nicknameSlots.forEach((slot, i) => {
        const el = document.createElement('div');
        el.className = 'canvas-slot nickname-slot' + (selectedNicknameSlots.has(i) ? ' selected' : '');
        el.dataset.index = i;
        el.dataset.slotType = 'nickname';
        el.style.left = slot.x + 'px';
        el.style.top = slot.y + 'px';
        el.style.width = slot.width + 'px';
        el.style.height = slot.height + 'px';

        const pokemon = currentTeam && currentTeam[i];
        const textEl = document.createElement('span');
        textEl.className = 'slot-nickname-text';
        const curProject = projects.find(p => p.id === currentId);
        const showNk = curProject && curProject.showNames !== false;
        textEl.textContent = (showNk && pokemon && pokemon.nickname) ? pokemon.nickname : '';
        if (!textEl.textContent) textEl.textContent = `N${i + 1}`;
        el.appendChild(textEl);

        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        el.appendChild(handle);

        el.addEventListener('mousedown', (e) => startDrag(e, i, 'move', 'nickname'));
        handle.addEventListener('mousedown', (e) => { e.stopPropagation(); startDrag(e, i, 'resize', 'nickname'); });
        el.addEventListener('click', (e) => { e.stopPropagation(); onSlotClick(e, i, 'nickname'); });

        canvas.appendChild(el);
      });
    }

    updatePropPanel();
  }

  function onSlotClick(e, index, slotType) {
    const isNick = slotType === 'nickname';
    const activeSel = isNick ? selectedNicknameSlots : selectedSlots;

    if (e.shiftKey && lastClickIndex >= 0 && lastClickSlotType === slotType) {
      const start = Math.min(lastClickIndex, index);
      const end = Math.max(lastClickIndex, index);
      if (!e.ctrlKey && !e.metaKey) activeSel.clear();
      activeSlotType = slotType;
      for (let i = start; i <= end; i++) activeSel.add(i);
    } else if (e.ctrlKey || e.metaKey) {
      activeSlotType = slotType;
      if (activeSel.has(index)) activeSel.delete(index);
      else activeSel.add(index);
      lastClickIndex = index;
      lastClickSlotType = slotType;
    } else {
      activeSlotType = slotType;
      selectedSlots.clear();
      selectedNicknameSlots.clear();
      activeSel.add(index);
      lastClickIndex = index;
      lastClickSlotType = slotType;
    }
    syncSlotSelection();
    updatePropPanel();
  }

  function selectAllSlots() {
    const project = projects.find(p => p.id === currentId);
    if (!project) return;
    selectedSlots.clear();
    selectedNicknameSlots.clear();
    const sSlots = project.slots || getDefaultSlots();
    for (let i = 0; i < sSlots.length; i++) selectedSlots.add(i);
    const nSlots = project.nicknameSlots || getDefaultNicknameSlots(project.slots);
    for (let i = 0; i < nSlots.length; i++) selectedNicknameSlots.add(i);
    syncSlotSelection();
    updatePropPanel();
  }

  function deselectAll() {
    selectedSlots.clear();
    selectedNicknameSlots.clear();
    activeSlotType = 'sprite';
    lastClickIndex = -1;
    lastClickSlotType = 'sprite';
    syncSlotSelection();
    updatePropPanel();
  }

  function syncSlotSelection() {
    $$('.canvas-slot').forEach(el => {
      const i = parseInt(el.dataset.index);
      const isNickname = el.dataset.slotType === 'nickname';
      if (isNickname) {
        el.classList.toggle('selected', selectedNicknameSlots.has(i));
      } else {
        el.classList.toggle('selected', selectedSlots.has(i));
      }
    });
  }

  function startDrag(e, slotIndex, mode, slotType) {
    e.preventDefault();
    const isNick = slotType === 'nickname';
    const activeSel = isNick ? selectedNicknameSlots : selectedSlots;

    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (!activeSel.has(slotIndex)) {
        selectedSlots.clear();
        selectedNicknameSlots.clear();
        activeSlotType = slotType;
        activeSel.add(slotIndex);
        lastClickIndex = slotIndex;
        lastClickSlotType = slotType;
        syncSlotSelection();
      } else {
        activeSlotType = slotType;
        lastClickIndex = slotIndex;
        lastClickSlotType = slotType;
      }
    } else {
      if (activeSel.has(slotIndex)) activeSel.delete(slotIndex);
      else activeSel.add(slotIndex);
      activeSlotType = slotType;
      lastClickSlotType = slotType;
      syncSlotSelection();
      updatePropPanel();
      return;
    }

    pushHistory();
    const project = projects.find(p => p.id === currentId);
    if (!project) return;

    const canvas = $('#layoutCanvas');
    const scale = canvas.parentElement.clientWidth / 1920;

    const slotArray = isNick
      ? (project.nicknameSlots || getDefaultNicknameSlots(project.slots))
      : (project.slots || getDefaultSlots());

    const originals = {};
    for (const si of activeSel) {
      const s = slotArray[si];
      if (s) originals[si] = { x: s.x, y: s.y, w: s.width, h: s.height };
    }

    dragState = {
      slotIndex, mode, slotType: slotType,
      startX: e.clientX, startY: e.clientY,
      originals, scale
    };

    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);
  }

  function onDrag(e) {
    if (!dragState) return;
    const project = projects.find(p => p.id === currentId);
    if (!project) return;

    const isNick = dragState.slotType === 'nickname';
    const slotArray = isNick
      ? (project.nicknameSlots || getDefaultNicknameSlots(project.slots))
      : (project.slots || getDefaultSlots());
    const activeSel = isNick ? selectedNicknameSlots : selectedSlots;

    const dx = (e.clientX - dragState.startX) / dragState.scale;
    const dy = (e.clientY - dragState.startY) / dragState.scale;

    const snapEnabled = $('#snapToggle').checked;
    const SNAP_DIST = 8;
    const guides = { h: new Set(), v: new Set() };

    const snapTargets = { v: [], h: [] };
    for (let i = 0; i < slotArray.length; i++) {
      if (activeSel.has(i)) continue;
      const s = slotArray[i];
      if (!s) continue;
      snapTargets.v.push(s.x, s.x + s.width, s.x + s.width / 2);
      snapTargets.h.push(s.y, s.y + s.height, s.y + s.height / 2);
    }
    snapTargets.v.push(0, 960, 1920);
    snapTargets.h.push(0, 540, 1080);

    for (const si of activeSel) {
      const slot = slotArray[si];
      const orig = dragState.originals[si];
      if (!orig) continue;

      if (dragState.mode === 'move') {
        let nx = orig.x + dx;
        let ny = orig.y + dy;

        if (snapEnabled) {
          let bestDx = SNAP_DIST + 1, bestDy = SNAP_DIST + 1;
          let snapX = null, snapY = null;

          for (const tx of snapTargets.v) {
            const d = Math.abs(nx - tx);
            if (d < bestDx && d < SNAP_DIST) { bestDx = d; snapX = tx; }
            const d2 = Math.abs((nx + orig.w) - tx);
            if (d2 < bestDx && d2 < SNAP_DIST) { bestDx = d2; snapX = tx - orig.w; }
            const d3 = Math.abs((nx + orig.w / 2) - tx);
            if (d3 < bestDx && d3 < SNAP_DIST) { bestDx = d3; snapX = tx - orig.w / 2; }
          }
          for (const ty of snapTargets.h) {
            const d = Math.abs(ny - ty);
            if (d < bestDy && d < SNAP_DIST) { bestDy = d; snapY = ty; }
            const d2 = Math.abs((ny + orig.h) - ty);
            if (d2 < bestDy && d2 < SNAP_DIST) { bestDy = d2; snapY = ty - orig.h; }
            const d3 = Math.abs((ny + orig.h / 2) - ty);
            if (d3 < bestDy && d3 < SNAP_DIST) { bestDy = d3; snapY = ty - orig.h / 2; }
          }

          if (snapX !== null) { nx = snapX; guides.v.add(snapX); if (snapX + orig.w <= 1920) guides.v.add(snapX + orig.w); }
          if (snapY !== null) { ny = snapY; guides.h.add(snapY); if (snapY + orig.h <= 1080) guides.h.add(snapY + orig.h); }
        }

        nx = Math.max(0, Math.min(1920 - orig.w, Math.round(nx)));
        ny = Math.max(0, Math.min(1080 - orig.h, Math.round(ny)));
        slot.x = nx;
        slot.y = ny;
      } else {
        slot.width = Math.max(20, Math.round(orig.w + dx));
        slot.height = Math.max(15, Math.round(orig.h + dy));
      }

      const slotTypeClass = isNick ? 'nickname-slot' : '';
      const elSel = `.canvas-slot[data-slot-type="${isNick ? 'nickname' : 'sprite'}"][data-index="${si}"]`;
      const el = $(elSel);
      if (el) {
        el.style.left = slot.x + 'px';
        el.style.top = slot.y + 'px';
        el.style.width = slot.width + 'px';
        el.style.height = slot.height + 'px';
      }
    }

    showSnapGuides(guides);
    updatePropPanel();
  }

  function showSnapGuides(guides) {
    clearSnapGuides();
    const canvas = $('#layoutCanvas');
    for (const y of guides.h) {
      const el = document.createElement('div');
      el.className = 'snap-guide h';
      el.style.top = y + 'px';
      canvas.appendChild(el);
    }
    for (const x of guides.v) {
      const el = document.createElement('div');
      el.className = 'snap-guide v';
      el.style.left = x + 'px';
      canvas.appendChild(el);
    }
  }

  function clearSnapGuides() {
    $$('.snap-guide').forEach(el => el.remove());
  }

  function endDrag() {
    clearSnapGuides();
    if (dragState) { saveProject(); dragState = null; }
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', endDrag);
  }

  function resizeCanvas() {
    const canvas = $('#layoutCanvas');
    if (!canvas) return;
    const wrapper = $('#canvasWrapper');
    const scale = wrapper.clientWidth / 1920;
    canvas.style.transform = `scale(${scale})`;
    canvas.style.height = (1080 * scale) + 'px';
  }

  async function saveProject() {
    if (!currentId) return;
    const project = projects.find(p => p.id === currentId);
    if (!project) return;
    await window.api.updateProject(currentId, project);
  }

  function updatePropPanel() {
    const footer = $('#canvasFooter');
    const info = $('#selectInfo');
    const activeSel = activeSlotType === 'nickname' ? selectedNicknameSlots : selectedSlots;
    if (activeSel.size === 0) {
      footer.style.display = 'none';
      return;
    }
    footer.style.display = 'flex';
    const project = projects.find(p => p.id === currentId);
    if (!project) return;

    const slotArray = activeSlotType === 'nickname'
      ? (project.nicknameSlots || getDefaultNicknameSlots(project.slots))
      : (project.slots || getDefaultSlots());

    const indices = [...activeSel];
    const first = slotArray[indices[0]];
    if (!first) return;

    const prefix = activeSlotType === 'nickname' ? 'N' : 'P';

    if (activeSel.size === 1) {
      $('#propX').value = first.x;
      $('#propY').value = first.y;
      $('#propW').value = first.width;
      $('#propH').value = first.height;
      const histSnap = history[historyIndex];
      const baseArr = activeSlotType === 'nickname' ? histSnap.nicknames : histSnap.sprites;
      const base = baseArr ? baseArr[indices[0]] : first;
      const scale = base ? (first.width / base.width) : 1;
      $('#propScale').value = scale.toFixed(1);
      info.textContent = `${prefix}${indices[0] + 1}`;
    } else {
      $('#propX').value = first.x;
      $('#propY').value = first.y;
      $('#propW').value = first.width;
      $('#propH').value = first.height;
      const histSnap = history[historyIndex];
      const baseArr = activeSlotType === 'nickname' ? histSnap.nicknames : histSnap.sprites;
      const base = baseArr ? baseArr[indices[0]] : first;
      const scale = base ? (first.width / base.width) : 1;
      $('#propScale').value = scale.toFixed(1);
      info.textContent = `${activeSel.size} slots`;
    }
  }

  function applyPropChange(prop, value) {
    const project = projects.find(p => p.id === currentId);
    if (!project) return;
    const activeSel = activeSlotType === 'nickname' ? selectedNicknameSlots : selectedSlots;
    if (activeSel.size === 0) return;
    pushHistory();

    const slotArray = activeSlotType === 'nickname'
      ? (project.nicknameSlots || getDefaultNicknameSlots(project.slots))
      : (project.slots || getDefaultSlots());

    const num = Number(value);
    if (isNaN(num)) return;

    const minSize = activeSlotType === 'nickname' ? 15 : 40;

    for (const si of activeSel) {
      const slot = slotArray[si];
      const histSnap = history[historyIndex];
      const baseArr = activeSlotType === 'nickname' ? histSnap.nicknames : histSnap.sprites;
      const base = baseArr ? baseArr[si] : slot;

      if (prop === 'x') {
        slot.x = Math.max(0, Math.min(1920 - slot.width, num));
      } else if (prop === 'y') {
        slot.y = Math.max(0, Math.min(1080 - slot.height, num));
      } else if (prop === 'width') {
        slot.width = Math.max(minSize, num);
      } else if (prop === 'height') {
        slot.height = Math.max(minSize, num);
      } else if (prop === 'scale') {
        if (base) {
          slot.width = Math.max(minSize, Math.round(base.width * num));
          slot.height = Math.max(minSize, Math.round(base.height * num));
        }
      }

      const elSel = `.canvas-slot[data-slot-type="${activeSlotType}"][data-index="${si}"]`;
      const el = $(elSel);
      if (el) {
        el.style.left = slot.x + 'px';
        el.style.top = slot.y + 'px';
        el.style.width = slot.width + 'px';
        el.style.height = slot.height + 'px';
      }
    }
    updatePropPanel();
    saveProject();
  }

  function alignSlots(mode) {
    const activeSel = activeSlotType === 'nickname' ? selectedNicknameSlots : selectedSlots;
    if (activeSel.size < 2) return;
    const project = projects.find(p => p.id === currentId);
    if (!project) return;
    pushHistory();

    const slotArray = activeSlotType === 'nickname'
      ? (project.nicknameSlots || getDefaultNicknameSlots(project.slots))
      : (project.slots || getDefaultSlots());

    const indices = [...activeSel].sort((a, b) => a - b);
    const slotData = indices.map(i => ({ i, slot: slotArray[i] }));

    if (mode === 'left') {
      const minX = Math.min(...slotData.map(s => s.slot.x));
      slotData.forEach(s => { s.slot.x = minX; });
    } else if (mode === 'right') {
      const maxR = Math.max(...slotData.map(s => s.slot.x + s.slot.width));
      slotData.forEach(s => { s.slot.x = maxR - s.slot.width; });
    } else if (mode === 'centerH') {
      const minX = Math.min(...slotData.map(s => s.slot.x));
      const maxR = Math.max(...slotData.map(s => s.slot.x + s.slot.width));
      const center = (minX + maxR) / 2;
      const avgW = slotData.reduce((a, s) => a + s.slot.width, 0) / slotData.length;
      const totalW = slotData.reduce((a, s) => a + s.slot.width, 0);
      const startX = center - totalW / 2;
      let cx = startX;
      slotData.forEach(s => { s.slot.x = Math.round(cx); cx += s.slot.width; });
    } else if (mode === 'top') {
      const minY = Math.min(...slotData.map(s => s.slot.y));
      slotData.forEach(s => { s.slot.y = minY; });
    } else if (mode === 'bottom') {
      const maxB = Math.max(...slotData.map(s => s.slot.y + s.slot.height));
      slotData.forEach(s => { s.slot.y = maxB - s.slot.height; });
    } else if (mode === 'centerV') {
      const minY = Math.min(...slotData.map(s => s.slot.y));
      const maxB = Math.max(...slotData.map(s => s.slot.y + s.slot.height));
      const totalH = slotData.reduce((a, s) => a + s.slot.height, 0);
      const startY = (minY + maxB) / 2 - totalH / 2;
      let cy = startY;
      slotData.forEach(s => { s.slot.y = Math.round(cy); cy += s.slot.height; });
    } else if (mode === 'distH') {
      if (slotData.length < 3) return;
      slotData.sort((a, b) => a.slot.x - b.slot.x);
      const first = slotData[0].slot.x;
      const last = slotData[slotData.length - 1];
      const lastEnd = last.slot.x + last.slot.width;
      const totalSlotW = slotData.reduce((a, s) => a + s.slot.width, 0);
      const gap = (lastEnd - first - totalSlotW) / (slotData.length - 1);
      let cx = first;
      slotData.forEach(s => { s.slot.x = Math.round(cx); cx += s.slot.width + gap; });
    } else if (mode === 'distV') {
      if (slotData.length < 3) return;
      slotData.sort((a, b) => a.slot.y - b.slot.y);
      const first = slotData[0].slot.y;
      const last = slotData[slotData.length - 1];
      const lastEnd = last.slot.y + last.slot.height;
      const totalSlotH = slotData.reduce((a, s) => a + s.slot.height, 0);
      const gap = (lastEnd - first - totalSlotH) / (slotData.length - 1);
      let cy = first;
      slotData.forEach(s => { s.slot.y = Math.round(cy); cy += s.slot.height + gap; });
    }

    renderCanvasSlots(project.slots, project.nicknameSlots);
    saveProject();
  }

  async function loadPresets() {
    const presets = await window.api.getPresets();
    const sel = $('#presetSelect');
    sel.innerHTML = '<option value="">-- Preset --</option>';
    presets.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      sel.appendChild(opt);
    });
  }

  const FONT_CATEGORIES = {
    'Arial': 'sans-serif', 'Arial Black': 'sans-serif', 'Calibri': 'sans-serif',
    'Cambria': 'serif', 'Candara': 'sans-serif', 'Comic Sans MS': 'handwriting',
    'Consolas': 'monospace', 'Constantia': 'serif', 'Corbel': 'sans-serif',
    'Courier New': 'monospace', 'Ebrima': 'sans-serif', 'Franklin Gothic': 'sans-serif',
    'Futura': 'sans-serif', 'Gabriola': 'display', 'Georgia': 'serif',
    'Haettenschweiler': 'sans-serif', 'Impact': 'display', 'Ink Free': 'handwriting',
    'Leelawadee': 'sans-serif', 'Lucida Console': 'monospace', 'Lucida Sans': 'sans-serif',
    'Malgun Gothic': 'sans-serif', 'Microsoft JhengHei': 'sans-serif',
    'Microsoft Sans Serif': 'sans-serif', 'Myanmar Text': 'sans-serif',
    'Nirmala UI': 'sans-serif', 'Palatino Linotype': 'serif',
    'Papyrus': 'handwriting', 'Perpetua': 'serif', 'Rockwell': 'serif',
    'Segoe UI': 'sans-serif', 'SimSun': 'serif', 'Snap ITC': 'display',
    'Tahoma': 'sans-serif', 'Times New Roman': 'serif', 'Trebuchet MS': 'sans-serif',
    'Verdana': 'sans-serif', 'Viner Hand ITC': 'handwriting'
  };

  function getFontCategory(font) {
    return FONT_CATEGORIES[font] || 'sans-serif';
  }

  function populateFontSelect(selectedFont) {
    const container = $('#fontPickerDropdown');
    const selected = $('#fontPickerSelected');
    const hidden = $('#nicknameFont');
    container.innerHTML = '';

    SYSTEM_FONTS.forEach(f => {
      const item = document.createElement('div');
      item.className = 'font-picker-item' + (f === selectedFont ? ' active' : '');
      item.dataset.font = f;
      item.dataset.tags = getFontCategory(f);

      const nameEl = document.createElement('span');
      nameEl.className = 'font-picker-item-name';
      nameEl.textContent = f;

      const previewEl = document.createElement('span');
      previewEl.className = 'font-picker-item-preview';
      previewEl.style.fontFamily = `"${f}", sans-serif`;
      previewEl.textContent = 'Aa Bb Cc 123';

      const tagsEl = document.createElement('span');
      tagsEl.className = 'font-picker-item-tags';
      tagsEl.textContent = getFontCategory(f);

      item.appendChild(nameEl);
      item.appendChild(previewEl);
      item.appendChild(tagsEl);

      item.addEventListener('click', () => {
        selected.textContent = f;
        hidden.value = f;
        container.querySelectorAll('.font-picker-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        container.classList.remove('open');
        hidden.dispatchEvent(new Event('change'));
      });

      container.appendChild(item);
    });

    if (selectedFont) {
      selected.textContent = selectedFont;
      hidden.value = selectedFont;
    }
  }

  function initFontPicker() {
    const picker = $('#fontPicker');
    const selected = $('#fontPickerSelected');
    const dropdown = $('#fontPickerDropdown');
    const search = $('#fontSearch');

    selected.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
      if (dropdown.classList.contains('open')) {
        search.value = '';
        filterFonts('');
        search.focus();
      }
    });

    search.addEventListener('input', (e) => {
      filterFonts(e.target.value.toLowerCase());
    });

    search.addEventListener('click', (e) => e.stopPropagation());

    document.addEventListener('click', (e) => {
      if (!picker.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });

    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') dropdown.classList.remove('open');
    });
  }

  function filterFonts(query) {
    const items = $('#fontPickerDropdown').querySelectorAll('.font-picker-item');
    items.forEach(item => {
      const font = item.dataset.font.toLowerCase();
      const tags = item.dataset.tags.toLowerCase();
      const match = !query || font.includes(query) || tags.includes(query);
      item.style.display = match ? '' : 'none';
    });
  }

  function loadNicknameStyle(style) {
    const s = style || getDefaultNicknameStyle();
    populateFontSelect(s.fontFamily);
    $('#nicknameBold').checked = s.fontBold || false;
    $('#nicknameItalic').checked = s.fontItalic || false;
    $('#nicknameColorMode').value = s.colorMode || 'solid';
    $('#nicknameColor').value = s.color || '#ffffff';
    $('#nicknameGradColor1').value = s.gradColor1 || '#ffffff';
    $('#nicknameGradColor2').value = s.gradColor2 || '#000000';
    $('#nicknameAngle').value = s.angle || 0;
    $('#nicknameAngleVal').textContent = s.angle || 0;
    $('#nicknameStrokeWidth').value = s.strokeWidth || 2;
    $('#nicknameStrokeColor').value = s.strokeColor || '#000000';
    $('#nicknameStrokePos').value = s.strokePosition || 'exterior';
    updateNicknameColorFields(s.colorMode || 'solid');
  }

  function updateNicknameColorFields(mode) {
    const isSolid = mode === 'solid';
    const isLinear = mode === 'linear';
    $('#nicknameSolidColorField').style.display = isSolid ? '' : 'none';
    $('#nicknameGradientFields').style.display = isSolid ? 'none' : '';
    $('#nicknameAngleField').style.display = isLinear ? '' : 'none';
  }

  function collectNicknameStyle() {
    return {
      fontFamily: $('#nicknameFont').value,
      fontBold: $('#nicknameBold').checked,
      fontItalic: $('#nicknameItalic').checked,
      colorMode: $('#nicknameColorMode').value,
      color: $('#nicknameColor').value,
      gradColor1: $('#nicknameGradColor1').value,
      gradColor2: $('#nicknameGradColor2').value,
      angle: parseInt($('#nicknameAngle').value) || 0,
      strokeWidth: parseInt($('#nicknameStrokeWidth').value) || 0,
      strokeColor: $('#nicknameStrokeColor').value,
      strokePosition: $('#nicknameStrokePos').value
    };
  }

  async function saveNicknameStyle() {
    const project = projects.find(p => p.id === currentId);
    if (!project) return;
    project.nicknameStyle = collectNicknameStyle();
    await saveProject();
  }

  function setupListeners() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); selectAllSlots(); }
      if (e.key === 'Escape') deselectAll();
    });

    $('#undoBtn').addEventListener('click', undo);
    $('#redoBtn').addEventListener('click', redo);

    ['propX', 'propY', 'propW', 'propH'].forEach(id => {
      const prop = { propX: 'x', propY: 'y', propW: 'width', propH: 'height' }[id];
      $('#' + id).addEventListener('change', (e) => applyPropChange(prop, e.target.value));
      $('#' + id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.target.blur(); applyPropChange(prop, e.target.value); }});
    });

    $('#propScale').addEventListener('change', (e) => applyPropChange('scale', e.target.value));
    $('#propScale').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.target.blur(); applyPropChange('scale', e.target.value); }});

    $$('.btn-tiny[data-align]').forEach(btn => {
      btn.addEventListener('click', () => alignSlots(btn.dataset.align));
    });

    $('#addProjectBtn').addEventListener('click', async () => {
      const project = await window.api.createProject({ name: 'Nuevo Nuzlocke', createdAt: Date.now() });
      projects.push(project);
      currentId = project.id;
      renderProjectList();
      selectProject(project.id);
    });

    $('#projectSearch').addEventListener('input', (e) => {
      projectSearchQuery = e.target.value;
      renderProjectList();
    });

    $('#projectSort').addEventListener('change', (e) => {
      projectSortMode = e.target.value;
      renderProjectList();
    });

    $('#donateBtn').addEventListener('click', () => {
      window.api.openExternal('https://streamelements.com/pokejgamer-de2e0/tip');
    });

    document.querySelectorAll('.social-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const url = link.getAttribute('href');
        if (url) window.api.openExternal(url);
      });
    });

    $('#deleteProjectBtn').addEventListener('click', async () => {
      if (!currentId) return;
      const ok = await showConfirm('Eliminar proyecto', 'Estas seguro de que quieres eliminar este proyecto?');
      if (!ok) return;
      await window.api.deleteProject(currentId);
      projects = projects.filter(p => p.id !== currentId);
      currentId = projects.length > 0 ? projects[0].id : null;
      renderProjectList();
      if (currentId) selectProject(currentId);
      else { $('#editor').style.display = 'none'; $('#emptyState').style.display = 'flex'; $('#helpPanel').style.display = 'none'; }
    });

    $('#projectName').addEventListener('input', async (e) => {
      const project = projects.find(p => p.id === currentId);
      if (project) { project.name = e.target.value; await saveProject(); renderProjectList(); }
    });

    $('#browseBtn').addEventListener('click', async () => {
      const file = await window.api.browseSaveFile();
      if (!file) return;
      $('#savePath').value = file;
      const project = projects.find(p => p.id === currentId);
      if (project) {
        project.savePath = file;
        // Auto-detect game from save file
        if (!project.game || project.game.version === 'auto') {
          const detected = await window.api.detectGame(file);
          if (detected) {
            project.game = { generation: detected.generation, saveType: detected.saveType, version: detected.version, autoDetected: true };
          } else {
            project.game = { generation: 0, saveType: 'unknown', version: 'auto', autoDetected: true };
          }
          populateGameSelect(project.game);
        }
        await saveProject();
      }
    });

    $('#gameSelect').addEventListener('change', async (e) => {
      const project = projects.find(p => p.id === currentId);
      if (!project) return;
      if (e.target.value === 'auto') {
        // Re-detect from save file
        if (project.savePath) {
          const detected = await window.api.detectGame(project.savePath);
          if (detected) {
            project.game = { generation: detected.generation, saveType: detected.saveType, version: detected.version, autoDetected: true };
          } else {
            project.game = { generation: 0, saveType: 'unknown', version: 'auto', autoDetected: true };
          }
        } else {
          project.game = { generation: 0, saveType: 'unknown', version: 'auto', autoDetected: true };
        }
      } else {
        const game = games.find(g => g.id === e.target.value);
        if (game) { project.game = { generation: game.generation, saveType: game.saveType, version: game.id }; }
      }
      await saveProject();
    });

    $('#styleSelect').addEventListener('change', async (e) => {
      const project = projects.find(p => p.id === currentId);
      if (!project) return;
      const opt = e.target.selectedOptions[0];
      project.spriteStyle = e.target.value;
      project.spriteStylePath = opt ? opt.dataset.path : '';
      await saveProject();
      updateSpritePreview(project.spriteStyle, project.spriteStylePath);
    });

    $('#showNames').addEventListener('change', async (e) => {
      const project = projects.find(p => p.id === currentId);
      if (project) {
        project.showNames = e.target.checked;
        await saveProject();
        renderCanvasSlots(project.slots || getDefaultSlots(), project.nicknameSlots || getDefaultNicknameSlots(project.slots));
      }
    });

    $('#usePlaceholder').addEventListener('change', async (e) => {
      const project = projects.find(p => p.id === currentId);
      if (!project) return;
      project.usePlaceholder = e.target.checked;
      await saveProject();
    });

    $('#nicknameFont').addEventListener('change', saveNicknameStyle);
    $('#nicknameBold').addEventListener('change', saveNicknameStyle);
    $('#nicknameItalic').addEventListener('change', saveNicknameStyle);
    $('#nicknameColorMode').addEventListener('change', (e) => {
      updateNicknameColorFields(e.target.value);
      saveNicknameStyle();
    });
    $('#nicknameColor').addEventListener('input', saveNicknameStyle);
    $('#nicknameGradColor1').addEventListener('input', saveNicknameStyle);
    $('#nicknameGradColor2').addEventListener('input', saveNicknameStyle);
    $('#nicknameAngle').addEventListener('input', (e) => {
      $('#nicknameAngleVal').textContent = e.target.value;
      saveNicknameStyle();
    });
    $('#nicknameStrokeWidth').addEventListener('change', saveNicknameStyle);
    $('#nicknameStrokeColor').addEventListener('input', saveNicknameStyle);
    $('#nicknameStrokePos').addEventListener('change', saveNicknameStyle);

    $('#copyUrlBtn').addEventListener('click', async () => {
      const url = $('#obsUrl').textContent;
      if (url && url !== '-') {
        navigator.clipboard.writeText(url);
        $('#copyUrlBtn').textContent = 'Copiado!';
        setTimeout(() => $('#copyUrlBtn').textContent = 'Copiar', 1200);
      }
    });

    $('#resetLayoutBtn').addEventListener('click', async () => {
      const project = projects.find(p => p.id === currentId);
      if (!project) return;
      pushHistory();
      project.slots = getDefaultSlots();
      project.nicknameSlots = getDefaultNicknameSlots(project.slots);
      await saveProject();
      renderCanvasSlots(project.slots, project.nicknameSlots);
      pushHistory();
    });

    $('#equalSpacingBtn').addEventListener('click', async () => {
      const project = projects.find(p => p.id === currentId);
      if (!project) return;
      pushHistory();
      const w = 120, h = 120;
      const totalW = 6 * w + 5 * 20;
      const startX = (1920 - totalW) / 2;
      project.slots = [];
      for (let i = 0; i < 6; i++) project.slots.push({ x: Math.round(startX + i * (w + 20)), y: 480, width: w, height: h });
      project.nicknameSlots = getDefaultNicknameSlots(project.slots);
      await saveProject();
      renderCanvasSlots(project.slots, project.nicknameSlots);
      pushHistory();
    });

    $('#savePresetBtn').addEventListener('click', async () => {
      if (!currentId) return;
      const name = await showModal('Nombre del preset:', 'Mi preset');
      if (!name) return;
      const project = projects.find(p => p.id === currentId);
      await window.api.savePreset({ name, slots: project.slots, nicknameSlots: project.nicknameSlots, nicknameStyle: project.nicknameStyle, style: project.spriteStyle, showNames: project.showNames });
      loadPresets();
    });

    $('#loadPresetBtn').addEventListener('click', async () => {
      const presetId = $('#presetSelect').value;
      if (!presetId || !currentId) return;
      const presets = await window.api.getPresets();
      const preset = presets.find(p => p.id === presetId);
      if (!preset) return;
      pushHistory();
      const project = projects.find(p => p.id === currentId);
      if (preset.slots) project.slots = preset.slots;
      if (preset.nicknameSlots) project.nicknameSlots = preset.nicknameSlots;
      if (preset.nicknameStyle) project.nicknameStyle = preset.nicknameStyle;
      if (preset.style) project.spriteStyle = preset.style;
      if (preset.showNames !== undefined) project.showNames = preset.showNames;
      await saveProject();
      selectProject(currentId);
    });

    $('#deletePresetBtn').addEventListener('click', async () => {
      const presetId = $('#presetSelect').value;
      if (!presetId) return;
      const ok = await showConfirm('Eliminar preset', 'Estas seguro de que quieres eliminar este preset?');
      if (!ok) return;
      await window.api.deletePreset(presetId);
      loadPresets();
    });

    $('#layoutCanvas').addEventListener('click', (e) => {
      if (e.target === $('#layoutCanvas') || e.target === $('#cameraPreview')) deselectAll();
    });

    let cameraStream = null;
    let currentCameraId = null;

    async function enumerateCameras() {
      const sel = $('#cameraSelect');
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      sel.innerHTML = '';
      videoDevices.forEach((d, i) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Cam ${i + 1}`;
        sel.appendChild(opt);
      });
      return videoDevices;
    }

    async function startCamera(deviceId) {
      const video = $('#cameraPreview');
      const btn = $('#cameraToggleBtn');
      const sel = $('#cameraSelect');

      if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
        video.srcObject = null;
      }

      try {
        const constraints = { video: { width: { ideal: 1920 }, height: { ideal: 1080 } } };
        if (deviceId) constraints.video.deviceId = { exact: deviceId };
        cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = cameraStream;
        video.classList.add('active');
        btn.classList.add('active');
        sel.style.display = '';

        const track = cameraStream.getVideoTracks()[0];
        currentCameraId = track.getSettings().deviceId || deviceId;
        sel.value = currentCameraId;
      } catch (err) {
        console.warn('Camera not available:', err.message);
        video.classList.remove('active');
        btn.classList.remove('active');
        sel.style.display = 'none';
      }
    }

    function stopCamera() {
      const video = $('#cameraPreview');
      const btn = $('#cameraToggleBtn');
      const sel = $('#cameraSelect');
      if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
        video.srcObject = null;
      }
      video.classList.remove('active');
      btn.classList.remove('active');
      sel.style.display = 'none';
      currentCameraId = null;
    }

    $('#cameraToggleBtn').addEventListener('click', async () => {
      if (cameraStream) {
        stopCamera();
        return;
      }
      await enumerateCameras();
      await startCamera();
    });

    $('#cameraSelect').addEventListener('change', async (e) => {
      await startCamera(e.target.value);
    });

    // ===== HELP PANEL =====
    $('#helpBtn').addEventListener('click', () => {
      $('#helpPanel').style.display = 'flex';
      $('#helpSearch').value = '';
      $('#helpSearch').focus();
      filterHelpTopics('');
    });

    const dlStatusBtn = document.getElementById('downloadStatusBtn');
    if (dlStatusBtn) {
      dlStatusBtn.addEventListener('click', () => {
        const overlay = document.getElementById('downloadOverlay');
        if (overlay) {
          overlay.style.display = overlay.style.display === 'none' ? 'flex' : 'none';
        }
      });
    }

    $('#closeHelpBtn').addEventListener('click', () => {
      $('#helpPanel').style.display = 'none';
    });

    $('#helpSearch').addEventListener('input', (e) => {
      filterHelpTopics(e.target.value.toLowerCase().trim());
    });

    document.querySelectorAll('.help-topic-title').forEach(title => {
      title.addEventListener('click', () => {
        title.parentElement.classList.toggle('open');
      });
    });

    function filterHelpTopics(query) {
      document.querySelectorAll('.help-topic').forEach(topic => {
        if (!query) {
          topic.classList.remove('hidden');
          return;
        }
        const keywords = (topic.dataset.keywords || '').toLowerCase();
        const title = topic.querySelector('.help-topic-title').textContent.toLowerCase();
        const content = topic.querySelector('.help-topic-content').textContent.toLowerCase();
        const match = keywords.includes(query) || title.includes(query) || content.includes(query);
        topic.classList.toggle('hidden', !match);
        if (match && query) topic.classList.add('open');
      });
    }

    // Settings panel open/close (event listeners only, functions are at module scope)
    $('#settingsBtn').addEventListener('click', async () => {
      await loadAndApplySettings();
      $('#settingsPanel').style.display = 'flex';
    });

    $('#closeSettingsBtn').addEventListener('click', () => {
      $('#settingsPanel').style.display = 'none';
    });

    $('#settingsLanguage').addEventListener('change', async (e) => {
      const lang = e.target.value;
      applyLanguage(lang);
      const bg = $('#settingsBackground');
      await window.api.saveSettings({ language: lang, backgroundMode: bg ? bg.checked : true });
    });

    $('#settingsBackground').addEventListener('change', async (e) => {
      const lang = $('#settingsLanguage').value;
      await window.api.saveSettings({ language: lang, backgroundMode: e.target.checked });
    });

    $('#settingsStartTour').addEventListener('click', () => {
      $('#settingsPanel').style.display = 'none';
      startTour();
    });

    $('#checkUpdatesBtn').addEventListener('click', async () => {
      const btn = $('#checkUpdatesBtn');
      btn.textContent = t('updateChecking');
      btn.disabled = true;
      try {
        const result = await window.api.checkForUpdates();
        if (result.hasUpdate) {
          showUpdatePopup(result);
        } else {
          showStatusPopup(
            t('upToDate'),
            `<p>${t('upToDateMessage')}</p><p style="color:#4ecdc4;font-weight:600;font-size:15px">v${result.currentVersion || '1.0.2'}</p>`
          );
        }
      } catch (e) {
        showStatusPopup(t('updateError'), `<p>${e.message}</p>`);
      }
      btn.textContent = t('checkUpdates');
      btn.disabled = false;
    });

    $('#settingsDownloadSprites').addEventListener('click', () => {
      startDownloadRecursos();
    });

    $('#settingsOpenRecursos').addEventListener('click', async () => {
      await window.api.openRecursosFolder();
    });

    window.api.onSettingsChanged((settings) => {
      currentLang = settings.language || 'es';
      applyLanguage(currentLang);
      const langSel = $('#settingsLanguage');
      const bgToggle = $('#settingsBackground');
      if (langSel) langSel.value = currentLang;
      if (bgToggle) bgToggle.checked = settings.backgroundMode !== false;
    });
  }

  // ===== i18n SYSTEM =====
  const LANG = window.TRANSLATIONS || {};

  function t(key) {
    return (LANG[currentLang] && LANG[currentLang][key]) || (LANG.es && LANG.es[key]) || key;
  }
  window.t = t;

  async function loadAndApplySettings() {
    try {
      const settings = await window.api.getSettings();

      if (!settings.language) {
        showLanguageSelector(settings);
        return;
      }

      currentLang = settings.language || 'es';
      applyLanguage(currentLang);
      const langSel = $('#settingsLanguage');
      const bgToggle = $('#settingsBackground');
      if (langSel) langSel.value = currentLang;
      if (bgToggle) bgToggle.checked = settings.backgroundMode !== false;

      if (settings.tutorialSeen !== true && projects.length === 0) {
        setTimeout(() => startTour(), 800);
        window.api.saveSettings({ ...settings, tutorialSeen: true });
      }
    } catch (e) {}
  }

  function showLanguageSelector(savedSettings) {
    const overlay = $('#langOverlay');
    if (!overlay) return;
    overlay.style.display = 'flex';

    const applyLang = (lang) => {
      currentLang = lang;
      applyLanguage(lang);
      const langSel = $('#settingsLanguage');
      if (langSel) langSel.value = lang;
      overlay.style.display = 'none';

      if (savedSettings.downloadMode) {
        if (savedSettings.tutorialSeen !== true && projects.length === 0) {
          setTimeout(() => startTour(), 800);
          window.api.saveSettings({ ...savedSettings, language: lang, tutorialSeen: true });
        }
        return;
      }

      showDownloadModeSelector({ ...savedSettings, language: lang });
    };

    overlay.querySelectorAll('.lang-option').forEach(btn => {
      btn.addEventListener('click', () => applyLang(btn.dataset.lang));
    });
  }

  function showDownloadModeSelector(savedSettings) {
    const overlay = document.getElementById('downloadModeOverlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    applyLanguage(currentLang);

    const cleanup = async (mode) => {
      overlay.style.display = 'none';
      const newSettings = { ...savedSettings, downloadMode: mode };
      await window.api.saveSettings(newSettings);
      if (newSettings.tutorialSeen !== true && projects.length === 0) {
        setTimeout(() => startTour(), 800);
        await window.api.saveSettings({ ...newSettings, tutorialSeen: true });
      }
    };

    document.getElementById('downloadModeAuto').onclick = () => cleanup('auto');
    document.getElementById('downloadModeManual').onclick = () => cleanup('manual');
  }

  function applyLanguage(lang) {
    currentLang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const val = t(key);
      if (val && val !== key) {
        if (el.tagName === 'INPUT' && el.type !== 'button') el.placeholder = val;
        else el.textContent = val;
      }
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      const val = t(key);
      if (val && val !== key) el.title = val;
    });
    document.querySelectorAll('[data-i18n-hint]').forEach(el => {
      const key = el.getAttribute('data-i18n-hint');
      const val = t(key);
      if (val && val !== key) el.innerHTML = val;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const val = t(key);
      if (val && val !== key) el.placeholder = val;
    });
    document.querySelectorAll('.help-topic-title').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) { const val = t(key); if (val && val !== key) el.textContent = val; }
    });
    document.querySelectorAll('.card h3').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) { const val = t(key); if (val && val !== key) el.textContent = val; }
    });
    updateTourTranslations();
  }

  function updateTourTranslations() {
    if (typeof TOUR_STEPS === 'undefined') return;
    TOUR_STEPS.forEach(step => {
      if (step._titleKey) { const v = t(step._titleKey); if (v && v !== step._titleKey) step.title = v; }
      if (step._contentKey) { const v = t(step._contentKey); if (v && v !== step._contentKey) step.content = v; }
    });
  }

  // ===== GUIDED TOUR SYSTEM =====
  const TOUR_STEPS = [
    {
      id: 'welcome',
      title: 'Bienvenido a Nuzlocke Overlay',
      _titleKey: 'tourWelcome', _contentKey: 'tourWelcomeContent',
      content: 'Esta guia interactiva te ayudara a configurar tu overlay en 8 pasos.<br>En cada paso, el area relevante se iluminara.<br><strong>Lee la instruccion y haz clic en "Siguiente" para continuar.</strong>',
      target: null,
      position: 'center',
      action: 'none',
      progress: 0
    },
    {
      id: 'create-project',
      title: '1. Crear tu primer proyecto',
      _titleKey: 'tourStep1', _contentKey: 'tourStep1Content',
      content: 'Haz clic en el boton <span class="tour-highlight">+</span> para crear un nuevo proyecto Nuzlocke.',
      target: '#addProjectBtn',
      position: 'right',
      action: 'click',
      progress: 12
    },
    {
      id: 'name-project',
      title: '2. Ponle nombre al proyecto',
      _titleKey: 'tourStepName', _contentKey: 'tourStepNameContent',
      content: 'Escribe un nombre para tu proyecto en el campo <span class="tour-highlight">Nombre</span>.<br>Ejemplo: "Nuzlocke Ruby", "Kaizo Plata", etc.',
      target: '#projectName',
      position: 'right',
      action: 'type',
      progress: 22
    },
    {
      id: 'select-save',
      title: '3. Seleccionar save file',
      _titleKey: 'tourStep2', _contentKey: 'tourStep2Content',
      content: 'Haz clic en <span class="tour-highlight">Examinar</span> y busca tu archivo de guardado (.sav, .dsv, etc.).<br>La app detectara la generacion y juego automaticamente.',
      target: '#browseBtn',
      position: 'right',
      action: 'click',
      progress: 35
    },
    {
      id: 'select-style',
      title: '4. Elegir estilo de sprites',
      _titleKey: 'tourStep3', _contentKey: 'tourStep3Content',
      content: 'Despliega el selector <span class="tour-highlight">Estilo de Sprite</span> y elige tu estilo favorito (Gen 1-9, animados o estaticos).',
      target: '#styleSelect',
      position: 'bottom',
      action: 'select',
      progress: 45
    },
    {
      id: 'nicknames',
      title: '5. Mostrar/ocultar nicknames',
      _titleKey: 'tourStepNick', _contentKey: 'tourStepNickContent',
      content: 'Activa o desactiva <span class="tour-highlight">Mostrar nombres / motes</span> para decidir si se muestran los nombres de los Pokemon en el overlay.',
      target: '#showNames',
      position: 'bottom',
      action: 'click',
      progress: 50
    },
    {
      id: 'placeholder',
      title: '6. Rellenar slots vacios',
      _titleKey: 'tourStepPlaceholder', _contentKey: 'tourStepPlaceholderContent',
      content: 'Activa <span class="tour-highlight">Rellenar slots vacios</span> para que los slots sin Pokemon se muestren con un sprite placeholder en vez de estar vacios.',
      target: '#usePlaceholder',
      position: 'bottom',
      action: 'click',
      progress: 55
    },
    {
      id: 'nickname-style',
      title: '7. Estilo de nickname',
      _titleKey: 'tourStepNicknameStyle', _contentKey: 'tourStepNicknameStyleContent',
      content: 'Personaliza el aspecto de los nicknames: <span class="tour-highlight">fuente</span>, <span class="tour-highlight">color</span>, <span class="tour-highlight">trazo</span> y mas en la seccion de Estilo de Nickname.',
      target: '#nicknameStyleCard',
      position: 'left',
      action: 'scroll',
      progress: 60
    },
    {
      id: 'presets',
      title: '8. Presets de layout',
      _titleKey: 'tourStepPresets', _contentKey: 'tourStepPresetsContent',
      content: 'Guarda y carga configuraciones de layout rapidamente con los <span class="tour-highlight">Presets</span>.<br>Guarda un preset, cargalo en otra ocasion, o elimina los que ya no necesites.',
      target: '.presets-row',
      position: 'top',
      action: 'none',
      progress: 65
    },
    {
      id: 'layout-editor',
      title: '9. Ajustar el Layout Editor',
      _titleKey: 'tourStep4', _contentKey: 'tourStep4Content',
      content: 'Arrastra los sprites para posicionarlos.<br><span class="tour-action-hint">Clic + arrastrar</span> = Mover<br><span class="tour-action-hint">Esquinas</span> = Redimensionar<br>Usa los botones de alineacion y espaciado arriba',
      target: '#layoutCanvas',
      position: 'top',
      action: 'drag',
      progress: 75
    },
    {
      id: 'obs-setup',
      title: '10. Configurar en OBS',
      _titleKey: 'tourStep5', _contentKey: 'tourStep5Content',
      content: 'Copia la <span class="tour-highlight">URL de OBS</span> (boton Copiar).<br>En OBS Studio: Fuente de Navegador -> Pega URL -> 1920x1080.<br>Los sprites se actualizan solos cada 500ms al guardar.',
      target: '#copyUrlBtn',
      position: 'bottom',
      action: 'click',
      progress: 85
    },
    {
      id: 'camera-setup',
      title: '11. Camara virtual - Previsualizar layout',
      _titleKey: 'tourStep6', _contentKey: 'tourStep6Content',
      content: 'Activa la <span class="tour-highlight">Camara virtual</span> (boton Cam) para ver tu webcam encima del Layout Editor.<br>Sirve para <span class="tour-highlight">posicionar los sprites</span> sabiendo donde quedara tu cara en OBS/Discord.',
      target: '#cameraToggleBtn',
      position: 'bottom',
      action: 'click',
      progress: 92
    },
    {
      id: 'finished',
      title: 'Listo! Tu overlay esta listo',
      _titleKey: 'tourFinished', _contentKey: 'tourFinishedContent',
      content: 'Ya puedes empezar tu run Nuzlocke.<br><span class="tour-highlight">Presets</span>: Guarda/carga layouts rapido<br><span class="tour-highlight">Ayuda</span>: Boton <span class="tour-highlight">?</span> para guia completa',
      target: null,
      position: 'center',
      action: 'none',
      progress: 100
    }
  ];

  let tourStep = 0;
  let tourActive = false;
  const tourOverlay = document.getElementById('tourOverlay');
  const tourBackdrop = document.getElementById('tourBackdrop');
  const tourSpotlight = document.getElementById('tourSpotlight');
  const tourPopover = document.getElementById('tourPopover');
  const tourTitle = document.getElementById('tourTitle');
  const tourContent = document.getElementById('tourContent');
  const tourStepEl = document.getElementById('tourStep');
  const tourProgressBar = document.getElementById('tourProgressBar');
  const tourSkip = document.getElementById('tourSkipStep');
  const tourPrev = document.getElementById('tourPrev');
  const tourNext = document.getElementById('tourNext');
  const tourClose = document.getElementById('tourClose');

  function startTour() {
    if (tourActive) return;
    // Close settings panel if open
    const settingsPanel = $('#settingsPanel');
    if (settingsPanel) settingsPanel.style.display = 'none';
    const helpPanel = $('#helpPanel');
    if (helpPanel) helpPanel.style.display = 'none';

    tourActive = true;
    tourStep = 0;
    showTourStep();
    tourOverlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  function getTargetElement(selector) {
    if (!selector) return null;
    const el = document.querySelector(selector);
    if (!el) return null;
    // Check if element is visible
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    return el;
  }

  function positionSpotlightAndPopover(targetEl, position) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!targetEl) {
      tourSpotlight.classList.remove('active');
      tourPopover.style.left = '50%';
      tourPopover.style.top = '50%';
      tourPopover.style.transform = 'translate(-50%, -50%)';
      tourPopover.dataset.position = 'center';
      tourPopover.style.removeProperty('--arrow-left');
      return;
    }

    const rect = targetEl.getBoundingClientRect();
    const pad = 6;

    // Position spotlight element at the target — its box-shadow creates the dark overlay everywhere else
    tourSpotlight.style.left = (rect.left - pad) + 'px';
    tourSpotlight.style.top = (rect.top - pad) + 'px';
    tourSpotlight.style.width = (rect.width + pad * 2) + 'px';
    tourSpotlight.style.height = (rect.height + pad * 2) + 'px';
    tourSpotlight.classList.add('active');

    // --- Popover positioning (must NEVER overlap the target) ---
    tourPopover.style.visibility = 'hidden';
    tourPopover.style.display = 'block';
    const popW = Math.min(360, vw - 40);
    const popH = tourPopover.offsetHeight;
    tourPopover.style.visibility = '';
    tourPopover.style.display = '';

    const gap = 32;
    const safeMargin = 16;
    const tLeft = rect.left - pad;
    const tTop = rect.top - pad;
    const tRight = rect.right + pad;
    const tBottom = rect.bottom + pad;
    const tCX = tLeft + (tRight - tLeft) / 2;
    const tCY = tTop + (tBottom - tTop) / 2;

    function clamp(l, t) {
      return {
        left: Math.max(safeMargin, Math.min(l, vw - popW - safeMargin)),
        top: Math.max(safeMargin, Math.min(t, vh - popH - safeMargin))
      };
    }

    function overlapArea(l, t) {
      const ox = Math.max(0, Math.min(l + popW, tRight) - Math.max(l, tLeft));
      const oy = Math.max(0, Math.min(t + popH, tBottom) - Math.max(t, tTop));
      return ox * oy;
    }

    // Generate many candidate positions
    const raw = [];
    if (position === 'right') {
      raw.push({ l: tRight + gap, t: tCY - popH / 2, p: 'left' });
      raw.push({ l: tLeft - popW - gap, t: tCY - popH / 2, p: 'right' });
      raw.push({ l: tCX - popW / 2, t: tBottom + gap, p: 'top' });
      raw.push({ l: tCX - popW / 2, t: tTop - popH - gap, p: 'bottom' });
    } else if (position === 'left') {
      raw.push({ l: tLeft - popW - gap, t: tCY - popH / 2, p: 'right' });
      raw.push({ l: tRight + gap, t: tCY - popH / 2, p: 'left' });
      raw.push({ l: tCX - popW / 2, t: tBottom + gap, p: 'top' });
      raw.push({ l: tCX - popW / 2, t: tTop - popH - gap, p: 'bottom' });
    } else if (position === 'bottom') {
      raw.push({ l: tCX - popW / 2, t: tBottom + gap, p: 'top' });
      raw.push({ l: tCX - popW / 2, t: tTop - popH - gap, p: 'bottom' });
      raw.push({ l: tRight + gap, t: tCY - popH / 2, p: 'left' });
      raw.push({ l: tLeft - popW - gap, t: tCY - popH / 2, p: 'right' });
    } else if (position === 'top') {
      raw.push({ l: tCX - popW / 2, t: tTop - popH - gap, p: 'bottom' });
      raw.push({ l: tCX - popW / 2, t: tBottom + gap, p: 'top' });
      raw.push({ l: tRight + gap, t: tCY - popH / 2, p: 'left' });
      raw.push({ l: tLeft - popW - gap, t: tCY - popH / 2, p: 'right' });
    }

    // Score each candidate: 0 = no overlap, otherwise area of overlap
    let bestScore = Infinity;
    let chosen = null;
    for (const c of raw) {
      const clamped = clamp(c.l, c.t);
      const score = overlapArea(clamped.left, clamped.top);
      if (score < bestScore) {
        bestScore = score;
        chosen = { left: clamped.left, top: clamped.top, pos: c.p };
      }
      if (score === 0) break; // Perfect, no need to check more
    }

    if (chosen) {
      tourPopover.style.left = chosen.left + 'px';
      tourPopover.style.top = chosen.top + 'px';
      tourPopover.style.transform = 'none';
      tourPopover.dataset.position = chosen.pos;
      const arrowPct = Math.max(10, Math.min(90, ((tCX - chosen.left) / popW) * 100));
      tourPopover.style.setProperty('--arrow-left', arrowPct + '%');
    }
  }

  function showTourStep() {
    const step = TOUR_STEPS[tourStep];
    tourTitle.textContent = step.title;
    tourContent.innerHTML = step.content;
    tourStepEl.textContent = `${tourStep + 1} / ${TOUR_STEPS.length}`;
    tourProgressBar.style.width = step.progress + '%';

    // Remove highlight from previous target
    clearTargetHighlight();

    const targetEl = getTargetElement(step.target);
    positionSpotlightAndPopover(targetEl, step.position);

    // Highlight target element (bring above overlay)
    if (targetEl) {
      targetEl.classList.add('tour-target');
    }

    tourPrev.style.display = tourStep === 0 ? 'none' : 'inline-block';
    tourNext.textContent = tourStep === TOUR_STEPS.length - 1 ? t('tourFinish') : t('tourNext');

    // Handle action
    if (step.action !== 'none' && targetEl) {
      handleTourAction(step.action, targetEl, step.target);
    }
  }

  function clearTargetHighlight() {
    document.querySelectorAll('.tour-target').forEach(el => {
      el.classList.remove('tour-target');
      el.style.boxShadow = '';
      el.style.borderColor = '';
    });
  }

  function handleTourAction(action, targetEl, selector) {
    // Tour no longer auto-advances on element interaction
    // User must click Next/Prev buttons to navigate
    // This prevents the tour from disappearing when performing actions
  }

  function nextTourStep() {
    if (tourStep < TOUR_STEPS.length - 1) {
      tourStep++;
      showTourStep();
    } else {
      closeTour();
      // Mark tutorial as seen so it won't auto-show again
      window.api.saveSettings({
        language: currentLang,
        backgroundMode: $('#settingsBackground').checked,
        tutorialSeen: true
      });
    }
  }

  function prevTourStep() {
    if (tourStep > 0) {
      tourStep--;
      showTourStep();
    }
  }

  function closeTour() {
    clearTargetHighlight();
    tourSpotlight.classList.remove('active');
    tourOverlay.style.display = 'none';
    tourActive = false;
    document.body.style.overflow = '';
  }

  function skipTourStep() {
    // Skip current step without completing action
    if (tourStep < TOUR_STEPS.length - 1) {
      tourStep++;
      showTourStep();
    } else {
      closeTour();
    }
  }

  // Tour event listeners
  tourSkip.addEventListener('click', skipTourStep);
  tourPrev.addEventListener('click', prevTourStep);
  tourNext.addEventListener('click', nextTourStep);
  tourClose.addEventListener('click', () => {
    closeTour();
  });

  // Tour does NOT close on backdrop click
  // User must use the close button or finish the tour

  // Handle window resize
  window.addEventListener('resize', () => {
    if (tourActive) {
      showTourStep(); // Reposition
    }
  });

  // === CHANGELOG & UPDATE NOTIFICATION ===

  function showChangelog(data) {
    const overlay = document.getElementById('changelogOverlay');
    const title = document.getElementById('changelogTitle');
    const content = document.getElementById('changelogContent');
    const okBtn = document.getElementById('changelogOk');
    if (!overlay || !content) return;
    title.textContent = t('changelogTitle') + ' v' + data.latestVersion;
    const notes = data.releaseNotes || '';
    const html = parseChangelog(notes, t);
    content.innerHTML = html || `<p style="opacity:0.5">${t('changelogNoNotes')}</p>`;
    overlay.style.display = 'flex';
    okBtn.onclick = async () => {
      overlay.style.display = 'none';
      await window.api.dismissChangelog(data.latestVersion);
    };
  }

  function parseChangelog(notes, t) {
    function cleanText(s) {
      return s.replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    const lines = notes.split('\n');
    const sections = [];
    let current = null;
    for (const line of lines) {
      const h3 = line.match(/^###\s+(.+)/);
      if (h3) {
        const header = cleanText(h3[1]);
        const isFeatures = /nuevas?\s+funciones?|new\s+features?|nouvelles?\s+fonctionnalit|neue\s+funktionen|新機能|новые\s+функции/i.test(header);
        const isFixes = /correcciones?|bug\s+fixes?|corrections?|fehlerbehebungen|バグ修正|исправления?\s+ошибок/i.test(header);
        if (isFeatures || isFixes) {
          current = { title: isFeatures ? t('changelogNewFeatures') : t('changelogBugFixes'), items: [] };
          sections.push(current);
        } else {
          current = null;
        }
        continue;
      }
      if (current && line.startsWith('- ')) {
        const text = cleanText(line.slice(2).replace(/\*\*/g, ''));
        if (text) current.items.push(text);
      }
    }
    let html = '';
    for (const sec of sections) {
      if (!sec.items.length) continue;
      html += '<div class="changelog-section">';
      html += '<div class="changelog-section-title">' + sec.title + '</div>';
      html += '<ul class="changelog-list">';
      for (const item of sec.items) {
        html += '<li>' + item + '</li>';
      }
      html += '</ul></div>';
    }
    return html;
  }

  function showStatusPopup(title, message) {
    const overlay = document.getElementById('statusOverlay');
    const titleEl = document.getElementById('statusTitle');
    const content = document.getElementById('statusContent');
    const okBtn = document.getElementById('statusOk');
    if (!overlay) return;
    titleEl.textContent = title;
    content.innerHTML = message;
    overlay.style.display = 'flex';
    okBtn.onclick = () => { overlay.style.display = 'none'; };
  }

  function showUpdatePopup(data) {
    if (data.skipped) return;
    const overlay = document.getElementById('updateOverlay');
    const msg = document.getElementById('updateMessage');
    const notes = document.getElementById('updateNotes');
    const skipBtn = document.getElementById('updateSkip');
    const goBtn = document.getElementById('updateGo');
    if (!overlay) return;
    msg.textContent = t('updateMessage');
    const versionInfo = document.createElement('div');
    versionInfo.className = 'update-version-info';
    versionInfo.innerHTML = `<span class="update-version-current">v${data.currentVersion}</span> <span class="update-version-arrow">&rarr;</span> <span class="update-version-latest">v${data.latestVersion}</span>`;
    msg.parentNode.insertBefore(versionInfo, notes);
    const parsed = parseChangelog(data.releaseNotes || '', t);
    notes.innerHTML = parsed || '';
    overlay.style.display = 'flex';
    goBtn.textContent = t('updateGo');
    goBtn.onclick = async () => {
      goBtn.textContent = t('updateDownloading') || 'Downloading...';
      goBtn.disabled = true;
      const removeProgress = window.api.onDownloadProgress((p) => {
        if (p.status === 'done') {
          goBtn.textContent = t('updateGo');
          goBtn.disabled = false;
        } else if (p.status === 'error') {
          goBtn.textContent = t('updateGo');
          goBtn.disabled = false;
        }
      });
      const result = await window.api.downloadUpdate(data.releaseUrl).catch(() => null);
      if (removeProgress) removeProgress();
      overlay.style.display = 'none';
      versionInfo.remove();
      goBtn.textContent = t('updateGo');
      goBtn.disabled = false;
    };
    skipBtn.onclick = async () => {
      overlay.style.display = 'none';
      versionInfo.remove();
      await window.api.skipVersion(data.latestVersion);
    };
  }

  async function checkForUpdates() {
    try {
      const result = await window.api.checkForUpdates();
      if (result.hasUpdate && !result.skipped) {
        showUpdatePopup(result);
      } else if (result.hasChangelog) {
        showChangelog(result);
      }
    } catch (e) {
      console.error('[UPDATE] check failed:', e);
    }
  }

  async function checkAndDownloadRecursos() {
    try {
      const dlStatus = await window.api.checkRecursosStatus().catch(() => null);
      if (!dlStatus || dlStatus.status === 'none') {
        const settings = await window.api.getSettings();
        if (settings.downloadMode !== 'manual') {
          const t = window.t || ((k) => k);
          if (confirm(t('downloadDesc') || 'Sprites not found. Download from Google Drive?')) {
            startDownloadRecursos();
            return;
          }
        }
      }
      const status = await window.api.getDownloadStatus();
      if (status && status.status === 'downloading') {
        startDownloadRecursos();
      }
    } catch (e) {
      console.error('[RECURSOS] check failed:', e);
    }
  }

  async function startDownloadRecursos() {
    const overlay = document.getElementById('downloadOverlay');
    const progress = document.getElementById('downloadProgress');
    const closeBtn = document.getElementById('downloadClose');
    const cancelBtn = document.getElementById('downloadCancel');
    const bgBtn = document.getElementById('downloadBackground');
    const dlBtn = document.getElementById('downloadStatusBtn');
    const dlBadge = document.getElementById('downloadBadge');
    if (!overlay) return;

    const existingStatus = await window.api.getDownloadStatus().catch(() => null);
    if (existingStatus && (existingStatus.status === 'downloading' || existingStatus.status === 'listing')) {
      overlay.style.display = 'flex';
      return;
    }
    if (existingStatus && existingStatus.status === 'done') {
      overlay.style.display = 'flex';
      const t2 = window.t || ((k) => k);
      progress.innerHTML = '<div class="download-progress-message">' + (t2('downloadDone') || 'Completado!') + '</div>' +
        '<div class="download-progress-stats"><span class="download-progress-percent">100%</span></div>' +
        '<div class="download-progress-bar-track"><div class="download-progress-bar-fill" style="width:100%"></div></div>';
      closeBtn.style.display = '';
      closeBtn.textContent = t2('downloadClose') || 'Cerrar';
      closeBtn.onclick = () => { overlay.style.display = 'none'; };
      cancelBtn.style.display = 'none';
      bgBtn.style.display = 'none';
      if (dlBtn) { dlBtn.classList.remove('active'); dlBtn.style.display = 'none'; }
      if (dlBadge) { dlBadge.classList.remove('active'); }
      return;
    }

    // Check if sprites are already downloaded
    const t = window.t || ((k) => k);
    const dlStatus = await window.api.checkRecursosStatus().catch(() => null);
    if (dlStatus && dlStatus.status === 'done' && dlStatus.downloaded > 0) {
      overlay.style.display = 'flex';
      progress.innerHTML = '<div class="download-progress-message">' +
        (t('spritesAllDownloaded') || 'Los sprites ya están descargados.') + '</div>' +
        '<div class="download-progress-stats"><span class="download-progress-percent">' +
        (t('spritesFileCount') || 'Archivos') + ': ' + dlStatus.downloaded + '</span></div>';
      closeBtn.style.display = '';
      closeBtn.textContent = t('downloadClose') || 'Cerrar';
      closeBtn.onclick = () => { overlay.style.display = 'none'; };
      cancelBtn.style.display = 'none';
      bgBtn.style.display = 'none';
      if (dlBtn) { dlBtn.classList.remove('active'); dlBtn.style.display = 'none'; }
      if (dlBadge) { dlBadge.classList.remove('active'); }
      return;
    }
    if (dlStatus && dlStatus.status === 'partial' && dlStatus.downloaded > 0) {
      const missing = dlStatus.total - dlStatus.downloaded;
      const proceed = await showConfirm(
        t('spritesPartialTitle') || 'Sprites parcialmente descargados',
        (t('spritesPartialDesc') || 'Faltan {missing} archivos. ¿Descargar los que faltan?').replace('{missing}', missing)
      );
      if (!proceed) return;
    }

    overlay.style.display = 'flex';
    progress.innerHTML = `<div class="download-progress-message">${t('downloadConnecting') || 'Connecting to Google Drive...'}</div>`;
    closeBtn.style.display = 'none';
    cancelBtn.style.display = 'none';
    bgBtn.style.display = 'none';
    if (dlBtn) { dlBtn.style.display = ''; dlBtn.classList.add('active'); }
    if (dlBadge) { dlBadge.classList.add('active'); }

    let startTime = null;
    let lastBytes = 0;
    let lastTime = 0;

    function formatEta(seconds) {
      if (seconds < 60) return `${Math.ceil(seconds)}s`;
      const m = Math.floor(seconds / 60);
      const s = Math.ceil(seconds % 60);
      return `${m}m ${s}s`;
    }

    function formatSpeed(filesPerSec) {
      if (filesPerSec < 1) return `${(filesPerSec * 60).toFixed(0)} files/min`;
      return `${filesPerSec.toFixed(1)} files/s`;
    }

    function renderProgress(current, total, message) {
      const percent = total > 0 ? Math.round((current / total) * 100) : 0;
      const elapsed = startTime ? (Date.now() - startTime) / 1000 : 0;
      const speed = elapsed > 0 ? current / elapsed : 0;
      const remaining = speed > 0 ? (total - current) / speed : 0;

      let statsHtml = '';
      if (current > 0 && startTime) {
        statsHtml = `
          <div class="download-progress-stats">
            <span class="download-progress-percent">${percent}%</span>
            <span>${current} / ${total}</span>
            <span class="download-progress-eta">${formatSpeed(speed)} &middot; ${formatEta(remaining)}</span>
          </div>`;
      } else if (total > 0) {
        statsHtml = `
          <div class="download-progress-stats">
            <span class="download-progress-percent">0%</span>
            <span>0 / ${total}</span>
          </div>`;
      }

      progress.innerHTML = `
        <div class="download-progress-message">${message || ''}</div>
        ${statsHtml}
        <div class="download-progress-bar-track">
          <div class="download-progress-bar-fill" style="width:${percent}%"></div>
        </div>`;
    }

    const removeListener = window.api.onDownloadProgress((data) => {
      if (data.status === 'listing') {
        progress.innerHTML = '<div class="download-progress-message">' + data.message + '</div>';
        cancelBtn.style.display = '';
        cancelBtn.textContent = t('downloadCancel') || 'Cancelar';
        cancelBtn.onclick = async () => {
          await window.api.cancelDownload().catch(() => {});
          overlay.style.display = 'none';
          if (dlBtn) { dlBtn.classList.remove('active'); dlBtn.style.display = 'none'; }
          if (dlBadge) { dlBadge.classList.remove('active'); }
          if (removeListener) removeListener();
        };
        bgBtn.style.display = '';
        bgBtn.textContent = t('downloadBackground') || 'Segundo Plano';
        bgBtn.onclick = () => { overlay.style.display = 'none'; };
      } else if (data.status === 'downloading' || data.status === 'extracting') {
        if (!startTime) {
          startTime = Date.now();
          lastTime = Date.now();
          lastBytes = 0;
        }
        if (data.isZipMode) {
          renderZipProgress(data);
        } else {
          renderProgress(data.current, data.total, data.message);
        }
      } else if (data.status === 'done') {
        const t2 = window.t || ((k) => k);
        if (data.isZipMode) {
          renderZipProgress(data);
          const msg = t2('downloadDone') || 'Done! Sprites downloaded.';
          progress.innerHTML = '<div class="download-progress-message">' + msg + '</div>' +
            '<div class="download-progress-stats"><span class="download-progress-percent">100%</span></div>' +
            '<div class="download-progress-bar-track"><div class="download-progress-bar-fill" style="width:100%"></div></div>';
        } else {
          renderProgress(data.total, data.total, t2('downloadDone') || 'Done! ' + data.total + ' files downloaded.');
        }
        if (dlBtn) { dlBtn.classList.remove('active'); dlBtn.style.display = 'none'; }
        if (dlBadge) { dlBadge.classList.remove('active'); }
        cancelBtn.style.display = 'none';
        bgBtn.style.display = 'none';
        closeBtn.style.display = '';
        closeBtn.textContent = t2('downloadClose') || 'Cerrar';
        closeBtn.onclick = () => {
          overlay.style.display = 'none';
          if (removeListener) removeListener();
        };
      } else if (data.status === 'error') {
        progress.innerHTML = '<div class="download-progress-message" style="color:#e94560">Error: ' + data.message + '</div>';
        if (dlBtn) { dlBtn.classList.remove('active'); dlBtn.style.display = 'none'; }
        if (dlBadge) { dlBadge.classList.remove('active'); }
        cancelBtn.style.display = 'none';
        bgBtn.style.display = 'none';
        closeBtn.style.display = '';
        closeBtn.textContent = t('downloadClose') || 'Cerrar';
        closeBtn.onclick = () => {
          overlay.style.display = 'none';
          if (removeListener) removeListener();
        };
      }
    });

    function renderZipProgress(data) {
      const current = data.current || 0;
      const total = data.total || 1;
      const percent = Math.round((current / total) * 100);
      const elapsed = startTime ? (Date.now() - startTime) / 1000 : 0;
      const bytesDone = data.bytesDownloaded || 0;
      const bytesTotal = data.bytesTotal || 0;
      const speed = elapsed > 0 ? bytesDone / elapsed : 0;
      const remaining = speed > 0 ? (bytesTotal - bytesDone) / speed : 0;
      const isExtracting = data.status === 'extracting';

      let statsHtml = '';
      if (current > 0 && startTime) {
        statsHtml = '<div class="download-progress-stats">' +
          '<span class="download-progress-percent">' + percent + '%</span>' +
          '<span>' + current + ' / ' + total + ' packs</span>' +
          '<span>' + formatBytes(bytesDone) + ' / ' + formatBytes(bytesTotal) + '</span>' +
          '<span class="download-progress-eta">' + (isExtracting ? 'Extracting' : formatSpeed2(speed)) + ' &middot; ' + formatEta2(remaining) + '</span>' +
          '</div>';
      }

      const extractIcon = isExtracting ? ' &#x1F4E6;' : '';
      progress.innerHTML = '<div class="download-progress-message">' + (data.message || '') + extractIcon + '</div>' +
        statsHtml +
        '<div class="download-progress-bar-track"><div class="download-progress-bar-fill" style="width:' + percent + '%"></div></div>';
    }

    function renderMultiGenProgress(data) {
      const current = data.current || 0;
      const total = data.total || 1;
      const percent = Math.round((current / total) * 100);
      const elapsed = startTime ? (Date.now() - startTime) / 1000 : 0;
      const speed = elapsed > 0 ? current / elapsed : 0;
      const remaining = speed > 0 ? (total - current) / speed : 0;

      let statsHtml = '';
      if (current > 0 && startTime) {
        statsHtml = '<div class="download-progress-stats">' +
          '<span class="download-progress-percent">' + percent + '%</span>' +
          '<span>' + current + ' / ' + total + ' files</span>' +
          '<span class="download-progress-eta">' + formatSpeed(speed) + ' &middot; ' + formatEta(remaining) + '</span>' +
          '</div>';
      }

      let genHtml = '';
      if (data.generations) {
        const gens = Object.entries(data.generations).filter(([k, v]) => v.total > 0);
        genHtml = '<div class="download-gen-bars">' +
          gens.map(([name, g]) => {
            const p = g.total > 0 ? Math.round((g.current / g.total) * 100) : 0;
            const barColor = g.done ? '#4caf50' : (g.current > 0 ? '#2196f3' : '#555');
            return '<div class="download-gen-row">' +
              '<span class="download-gen-name">' + name.replace('LEGENDS ARCEUS', 'LA') + '</span>' +
              '<div class="download-gen-bar"><div class="download-gen-fill" style="width:' + p + '%;background:' + barColor + '"></div></div>' +
              '<span class="download-gen-pct">' + (g.done ? '&#10003;' : p + '%') + '</span>' +
              '</div>';
          }).join('') +
          '</div>';
      }

      progress.innerHTML = '<div class="download-progress-message">' + (data.message || '') + '</div>' +
        statsHtml +
        '<div class="download-progress-bar-track"><div class="download-progress-bar-fill" style="width:' + percent + '%"></div></div>' +
        genHtml;
    }

    function formatBytes(bytes) {
      if (!bytes) return '0 B';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB';
      if (bytes < 1073741824) return (bytes / 1048576).toFixed(0) + ' MB';
      return (bytes / 1073741824).toFixed(1) + ' GB';
    }

    function formatEta2(seconds) {
      if (!seconds || seconds < 0) return '';
      if (seconds < 60) return Math.ceil(seconds) + 's';
      const m = Math.floor(seconds / 60);
      const s = Math.ceil(seconds % 60);
      return m + 'm ' + s + 's';
    }

    function formatSpeed2(bytesPerSec) {
      if (!bytesPerSec) return '';
      if (bytesPerSec < 1024) return bytesPerSec.toFixed(0) + ' B/s';
      if (bytesPerSec < 1048576) return (bytesPerSec / 1024).toFixed(0) + ' KB/s';
      return (bytesPerSec / 1048576).toFixed(1) + ' MB/s';
    }

    const status = await window.api.getDownloadStatus();
    const alreadyRunning = status && (status.status === 'downloading' || status.status === 'listing');

    if (!alreadyRunning) {
      window.api.downloadRecursos().catch((e) => {
        progress.innerHTML = `<div class="download-progress-message" style="color:#e94560">Error: ${e.message || 'Download failed'}</div>`;
        closeBtn.style.display = '';
        closeBtn.onclick = () => {
          overlay.style.display = 'none';
          if (removeListener) removeListener();
        };
      });
    }
  }

  init();
})();
