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
    styles = await window.api.getStyles();
    games = await window.api.getGames();
    projects = await window.api.listProjects();
    renderProjectList();
    if (projects.length > 0) selectProject(projects[0].id);
    setupListeners();
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
  }

  function renderProjectList() {
    const list = $('#projectList');
    list.innerHTML = '';
    projects.forEach(p => {
      const el = document.createElement('div');
      el.className = 'project-item' + (p.id === currentId ? ' active' : '');
      el.textContent = p.name || 'Sin nombre';
      el.addEventListener('click', () => selectProject(p.id));
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

    populateGameSelect(project.game);
    populateStyleSelect(project.spriteStyle);
    loadNicknameStyle(project.nicknameStyle);
    updateObsUrl();
    await refreshTeam();
    if (!project.slots) project.slots = getDefaultSlots();
    if (!project.nicknameSlots) project.nicknameSlots = getDefaultNicknameSlots(project.slots);
    renderCanvasSlots(project.slots, project.nicknameSlots);
    pushHistory();
    loadPresets();
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

    const genOrder = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
    const genLabels = {
      1: 'Gen 1 (Kanto)', 2: 'Gen 2 (Johto)', 3: 'Gen 3 (Hoenn)',
      4: 'Gen 4 (Sinnoh)', 5: 'Gen 5 (Teselia)', 6: 'Gen 6 (Kalos)',
      7: 'Gen 7 (Alola)', 8: 'Gen 8 (Galar)', 9: 'Gen 9 (Paldea)',
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

  const SYSTEM_FONTS = [
    'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Candara', 'Comic Sans MS',
    'Consolas', 'Constantia', 'Corbel', 'Courier New', 'Ebrima', 'Franklin Gothic',
    'Futura', 'Gabriola', 'Georgia', 'Haettenschweiler', 'Impact', 'Ink Free',
    'Leelawadee', 'Lucida Console', 'Lucida Sans', 'Malgun Gothic', 'Microsoft JhengHei',
    'Microsoft Sans Serif', 'Myanmar Text', 'Nirmala UI', 'Palatino Linotype',
    'Papyrus', 'Perpetua', 'Rockwell', 'Segoe UI', 'SimSun', 'Snap ITC',
    'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Viner Hand ITC'
  ];

  let activeSlotType = 'sprite';
  let lastClickIndex = -1;

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
      el.className = 'canvas-slot' + (activeSlotType === 'sprite' && selectedSlots.has(i) ? ' selected' : '');
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
        el.className = 'canvas-slot nickname-slot' + (activeSlotType === 'nickname' && selectedNicknameSlots.has(i) ? ' selected' : '');
        el.dataset.index = i;
        el.dataset.slotType = 'nickname';
        el.style.left = slot.x + 'px';
        el.style.top = slot.y + 'px';
        el.style.width = slot.width + 'px';
        el.style.height = slot.height + 'px';

        const pokemon = currentTeam && currentTeam[i];
        const textEl = document.createElement('span');
        textEl.className = 'slot-nickname-text';
        textEl.textContent = (pokemon && pokemon.nickname) ? pokemon.nickname : `N${i + 1}`;
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
    const otherSel = isNick ? selectedSlots : selectedNicknameSlots;

    if (e.shiftKey && lastClickIndex >= 0 && activeSlotType === slotType) {
      const start = Math.min(lastClickIndex, index);
      const end = Math.max(lastClickIndex, index);
      if (!e.ctrlKey && !e.metaKey) activeSel.clear();
      otherSel.clear();
      activeSlotType = slotType;
      for (let i = start; i <= end; i++) activeSel.add(i);
    } else if (e.ctrlKey || e.metaKey) {
      activeSlotType = slotType;
      otherSel.clear();
      if (activeSel.has(index)) activeSel.delete(index);
      else activeSel.add(index);
      lastClickIndex = index;
    } else {
      activeSlotType = slotType;
      activeSel.clear();
      otherSel.clear();
      activeSel.add(index);
      lastClickIndex = index;
    }
    syncSlotSelection();
    updatePropPanel();
  }

  function selectAllSlots() {
    const project = projects.find(p => p.id === currentId);
    if (!project) return;
    if (activeSlotType === 'nickname') {
      selectedNicknameSlots.clear();
      const nSlots = project.nicknameSlots || getDefaultNicknameSlots(project.slots);
      for (let i = 0; i < nSlots.length; i++) selectedNicknameSlots.add(i);
    } else {
      selectedSlots.clear();
      const sSlots = project.slots || getDefaultSlots();
      for (let i = 0; i < sSlots.length; i++) selectedSlots.add(i);
    }
    syncSlotSelection();
    updatePropPanel();
  }

  function deselectAll() {
    selectedSlots.clear();
    selectedNicknameSlots.clear();
    activeSlotType = 'sprite';
    lastClickIndex = -1;
    syncSlotSelection();
    updatePropPanel();
  }

  function syncSlotSelection() {
    $$('.canvas-slot').forEach(el => {
      const i = parseInt(el.dataset.index);
      const isNickname = el.dataset.slotType === 'nickname';
      if (isNickname) {
        el.classList.toggle('selected', activeSlotType === 'nickname' && selectedNicknameSlots.has(i));
      } else {
        el.classList.toggle('selected', activeSlotType === 'sprite' && selectedSlots.has(i));
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
        syncSlotSelection();
      } else {
        activeSlotType = slotType;
        lastClickIndex = slotIndex;
      }
    } else {
      if (activeSel.has(slotIndex)) activeSel.delete(slotIndex);
      else activeSel.add(slotIndex);
      activeSlotType = slotType;
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

  function populateFontSelect(selectedFont) {
    const sel = $('#nicknameFont');
    sel.innerHTML = '';
    SYSTEM_FONTS.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      opt.style.fontFamily = f;
      sel.appendChild(opt);
    });
    if (selectedFont) sel.value = selectedFont;
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
      const project = await window.api.createProject({ name: 'Nuevo Nuzlocke' });
      projects.push(project);
      currentId = project.id;
      renderProjectList();
      selectProject(project.id);
    });

    $('#donateBtn').addEventListener('click', () => {
      window.api.openExternal('https://streamelements.com/pokejgamer-de2e0/tip');
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
            populateGameSelect(project.game);
            Logger.info('App', `Auto-detected game: ${detected.name}`);
          }
        }
        await saveProject();
        setTimeout(() => refreshTeam().then(() => renderCanvasSlots(project.slots || getDefaultSlots(), project.nicknameSlots || getDefaultNicknameSlots(project.slots))), 1500);
      }
    });

    $('#refreshTeamBtn').addEventListener('click', async () => {
      const project = projects.find(p => p.id === currentId);
      if (!project) return;
      $('#refreshTeamBtn').textContent = '...';
      await refreshTeam();
      renderCanvasSlots(project.slots || getDefaultSlots(), project.nicknameSlots || getDefaultNicknameSlots(project.slots));
      $('#refreshTeamBtn').textContent = 'Refrescar';
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
            project.game = { generation: 8, saveType: 'gen8', version: 'auto', autoDetected: true };
          }
        } else {
          project.game = { generation: 8, saveType: 'gen8', version: 'auto', autoDetected: true };
        }
      } else {
        const game = games.find(g => g.id === e.target.value);
        if (game) { project.game = { generation: game.generation, saveType: game.saveType, version: game.id }; }
      }
      await saveProject();
      setTimeout(() => refreshTeam().then(() => renderCanvasSlots(project.slots || getDefaultSlots(), project.nicknameSlots || getDefaultNicknameSlots(project.slots))), 1500);
    });

    $('#styleSelect').addEventListener('change', async (e) => {
      const project = projects.find(p => p.id === currentId);
      if (!project) return;
      const opt = e.target.selectedOptions[0];
      project.spriteStyle = e.target.value;
      project.spriteStylePath = opt ? opt.dataset.path : '';
      await saveProject();
      setTimeout(() => refreshTeam().then(() => renderCanvasSlots(project.slots || getDefaultSlots(), project.nicknameSlots || getDefaultNicknameSlots(project.slots))), 500);
    });

    $('#showNames').addEventListener('change', async (e) => {
      const project = projects.find(p => p.id === currentId);
      if (project) { project.showNames = e.target.checked; await saveProject(); }
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

    $('#openUrlBtn').addEventListener('click', async () => {
      const url = $('#obsUrl').textContent;
      if (url && url !== '-') await window.api.openExternal(url);
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

    window.api.onSettingsChanged((settings) => {
      currentLang = settings.language || 'es';
      applyLanguage(currentLang);
      const langSel = $('#settingsLanguage');
      const bgToggle = $('#settingsBackground');
      if (langSel) langSel.value = currentLang;
      if (bgToggle) bgToggle.checked = settings.backgroundMode !== false;
    });
  }

  // ===== SETTINGS LANGUAGE SYSTEM (module scope) =====
  const TRANSLATIONS = {
    es: {
      help: 'Ayuda', helpTitle: 'Ayuda',
      search: 'Buscar...',
      emptyState: 'Crea un proyecto para empezar',
      newProject: 'Nuevo proyecto',
      delete: 'Eliminar', save: 'Guardar', load: 'Cargar',
      browse: 'Examinar', refresh: 'Refrescar', copy: 'Copiar', open: 'Abrir',
      reset: 'Reset', undo: 'Undo', redo: 'Redo',
      savePreset: 'Guardar', loadPreset: 'Cargar', deletePreset: 'Eliminar',
      projectName: 'Nombre del proyecto',
      saveFile: 'Ruta del save file',
      gameGen: 'Juego / Generacion',
      teamDetected: 'Equipo Detectado', noTeam: 'Sin equipo detectado',
      spriteStyle: 'Estilo de Sprite', selectStyle: 'Selecciona un estilo',
      options: 'Opciones', showNames: 'Mostrar nombres / motes',
      nicknameStyle: 'Estilo de Nickname', font: 'Fuente',
      bold: 'Negrita', italic: 'Cursiva',
      textColor: 'Color del texto', solid: 'Solido',
      linearGrad: 'Degradado lineal', radialGrad: 'Degradado radial',
      color: 'Color', angle: 'Angulo', stroke: 'Trazo',
      strokeWidth: 'Grosor', strokePos: 'Exterior', strokeCenter: 'Centrico',
      strokeInterior: 'Interior',
      obsUrl: 'URL de OBS',
      obsHint: 'En OBS: Fuente de navegador -> Pegar URL -> 1920x1080',
      layoutEditor: 'Layout Editor', espaciado: 'Espaciado',
      preset: '-- Preset --',
      settings: 'Configuracion', settingsTitle: 'Configuracion',
      langLabel: 'Idioma de la app', langDesc: 'Cambia el idioma de la interfaz',
      bgMode: 'Modo en segundo plano',
      bgDesc: 'Mantener la app en la bandeja del sistema al cerrar',
      languageGroup: 'Idioma / Language', behaviorGroup: 'Comportamiento',
      helpObs: 'Configurar en OBS', helpProject: 'Crear un proyecto',
      helpSprites: 'Estilos de sprite', helpNicknames: 'Personalizar nicknames',
      helpLayout: 'Layout Editor', helpGames: 'Juegos compatibles',
      helpTroubleshoot: 'Solucion de problemas', helpShortcuts: 'Atajos de teclado',
    },
    en: {
      help: 'Help', helpTitle: 'Help',
      search: 'Search...',
      emptyState: 'Create a project to get started',
      newProject: 'New project',
      delete: 'Delete', save: 'Save', load: 'Load',
      browse: 'Browse', refresh: 'Refresh', copy: 'Copy', open: 'Open',
      reset: 'Reset', undo: 'Undo', redo: 'Redo',
      savePreset: 'Save', loadPreset: 'Load', deletePreset: 'Delete',
      projectName: 'Project name',
      saveFile: 'Save file path',
      gameGen: 'Game / Generation',
      teamDetected: 'Detected Team', noTeam: 'No team detected',
      spriteStyle: 'Sprite Style', selectStyle: 'Select a style',
      options: 'Options', showNames: 'Show names / nicknames',
      nicknameStyle: 'Nickname Style', font: 'Font',
      bold: 'Bold', italic: 'Italic',
      textColor: 'Text color', solid: 'Solid',
      linearGrad: 'Linear gradient', radialGrad: 'Radial gradient',
      color: 'Color', angle: 'Angle', stroke: 'Stroke',
      strokeWidth: 'Width', strokePos: 'Exterior', strokeCenter: 'Center',
      strokeInterior: 'Interior',
      obsUrl: 'OBS URL',
      obsHint: 'In OBS: Browser Source -> Paste URL -> 1920x1080',
      layoutEditor: 'Layout Editor', espaciado: 'Spacing',
      preset: '-- Preset --',
      settings: 'Settings', settingsTitle: 'Settings',
      langLabel: 'App language', langDesc: 'Change the interface language',
      bgMode: 'Background mode',
      bgDesc: 'Keep the app in the system tray when closed',
      languageGroup: 'Language', behaviorGroup: 'Behavior',
      helpObs: 'Set up in OBS', helpProject: 'Create a project',
      helpSprites: 'Sprite styles', helpNicknames: 'Customize nicknames',
      helpLayout: 'Layout Editor', helpGames: 'Compatible games',
      helpTroubleshoot: 'Troubleshooting', helpShortcuts: 'Keyboard shortcuts',
    }
  };

  async function loadAndApplySettings() {
    try {
      const settings = await window.api.getSettings();
      currentLang = settings.language || 'es';
      applyLanguage(currentLang);
      const langSel = $('#settingsLanguage');
      const bgToggle = $('#settingsBackground');
      if (langSel) langSel.value = currentLang;
      if (bgToggle) bgToggle.checked = settings.backgroundMode !== false;
    } catch (e) {}
  }

  function applyLanguage(lang) {
    currentLang = lang;
    const t = TRANSLATIONS[lang] || TRANSLATIONS.es;

    const helpBtn = $('#helpBtn');
    if (helpBtn) helpBtn.title = t.help;
    const settingsBtn = $('#settingsBtn');
    if (settingsBtn) settingsBtn.title = t.settings;

    const emptyP = $('#emptyState p');
    if (emptyP) emptyP.textContent = t.emptyState;

    const helpHeader = $('#helpPanel .help-header h2');
    if (helpHeader) helpHeader.textContent = t.helpTitle;
    const helpSearch = $('#helpSearch');
    if (helpSearch) helpSearch.placeholder = t.search;

    const helpTopicMap = {
      'Configurar en OBS': t.helpObs, 'Set up in OBS': t.helpObs,
      'Crear un proyecto': t.helpProject, 'Create a project': t.helpProject,
      'Estilos de sprite': t.helpSprites, 'Sprite styles': t.helpSprites,
      'Personalizar nicknames': t.helpNicknames, 'Customize nicknames': t.helpNicknames,
      'Layout Editor': t.helpLayout,
      'Juegos compatibles': t.helpGames, 'Compatible games': t.helpGames,
      'Solucion de problemas': t.helpTroubleshoot, 'Troubleshooting': t.helpTroubleshoot,
      'Atajos de teclado': t.helpShortcuts, 'Keyboard shortcuts': t.helpShortcuts,
    };
    document.querySelectorAll('.help-topic-title').forEach(el => {
      if (helpTopicMap[el.textContent]) el.textContent = helpTopicMap[el.textContent];
    });

    const settingsTitle = $('#settingsPanel .settings-header h2');
    if (settingsTitle) settingsTitle.textContent = t.settingsTitle;

    if ($('#editor') && $('#editor').style.display !== 'none') {
      applyEditorLanguage(t);
    }
  }

  function applyEditorLanguage(t) {
    const btnMap = {
      'Guardar': t.save, 'Examinar': t.browse, 'Refrescar': t.refresh,
      'Copiar': t.copy, 'Abrir': t.open, 'Nuevo proyecto': t.newProject,
      'Save': t.save, 'Browse': t.browse, 'Refresh': t.refresh,
      'Copy': t.copy, 'Open': t.open, 'New project': t.newProject,
    };
    document.querySelectorAll('.btn-secondary, .btn-small').forEach(btn => {
      if (btnMap[btn.textContent]) btn.textContent = btnMap[btn.textContent];
    });
    document.querySelectorAll('.btn-danger').forEach(btn => {
      if (btn.textContent === 'Eliminar' || btn.textContent === 'Delete') btn.textContent = t.delete;
    });

    const pn = $('#projectName');
    if (pn) pn.placeholder = t.projectName;

    const cardMap = {
      'Guardar': t.saveFile, 'Save file': t.saveFile,
      'Equipo Detectado': t.teamDetected, 'Detected Team': t.teamDetected,
      'Estilo de Sprite': t.spriteStyle, 'Sprite Style': t.spriteStyle,
      'Opciones': t.options, 'Options': t.options,
      'Estilo de Nickname': t.nicknameStyle, 'Nickname Style': t.nicknameStyle,
      'URL de OBS': t.obsUrl, 'OBS URL': t.obsUrl,
    };
    document.querySelectorAll('.card h3').forEach(h => {
      if (cardMap[h.textContent]) h.textContent = cardMap[h.textContent];
    });

    const showNames = $('#showNames');
    if (showNames && showNames.parentElement) {
      const txt = showNames.parentElement.childNodes[1];
      if (txt) txt.textContent = ' ' + t.showNames;
    }

    document.querySelectorAll('.hint').forEach(h => { h.innerHTML = t.obsHint; });

    const layoutH3 = document.querySelector('.card-canvas h3');
    if (layoutH3) layoutH3.textContent = t.layoutEditor;

    const espBtn = $('#equalSpacingBtn');
    if (espBtn) espBtn.textContent = t.espaciado;

    const presetSel = $('#presetSelect');
    if (presetSel && presetSel.options[0]) presetSel.options[0].text = t.preset;
  }

  init();
})();
