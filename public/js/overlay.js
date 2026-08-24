(function() {
  const overlay = document.getElementById('overlay');
  let slots = [];
  let nicknameSlotEls = [];
  let showNames = true;
  let nicknameStyle = {};
  let nicknameSlots = [];

  function getProjectId() {
    return window.location.pathname.split('/').pop();
  }

  async function loadConfig() {
    const projectId = getProjectId();
    if (!projectId) return;
    try {
      const res = await fetch('/api/projects/' + projectId);
      if (!res.ok) return;
      const config = await res.json();
      showNames = config.showNames;
      nicknameStyle = config.nicknameStyle || {};
      nicknameSlots = config.nicknameSlots || [];
      renderSlots(config.slots || []);
      renderNicknameSlots();

      const teamRes = await fetch('/api/team/' + projectId);
      if (teamRes.ok) {
        const teamData = await teamRes.json();
        if (teamData.team && teamData.team.length > 0) {
          updateTeam(teamData.team);
        }
      }

      connectSSE();
    } catch (e) {
      console.error('[Overlay] Error:', e);
    }
  }

  function renderSlots(slotConfigs) {
    overlay.innerHTML = '';
    slots = [];
    nicknameSlotEls = [];

    for (let i = 0; i < 6; i++) {
      const config = slotConfigs[i] || { x: i * 140 + 100, y: 480, width: 120, height: 120 };

      const slot = document.createElement('div');
      slot.className = 'pokemon-slot';
      slot.dataset.slot = i;
      slot.style.left = config.x + 'px';
      slot.style.top = config.y + 'px';
      slot.style.width = config.width + 'px';
      slot.style.height = config.height + 'px';

      const spriteContainer = document.createElement('div');
      spriteContainer.className = 'sprite-container';

      const img = document.createElement('img');
      img.alt = '';
      img.draggable = false;

      const nickname = document.createElement('span');
      nickname.className = 'nickname';

      spriteContainer.appendChild(img);
      slot.appendChild(spriteContainer);
      slot.appendChild(nickname);
      overlay.appendChild(slot);

      slots.push({ element: slot, img, nickname });
    }
  }

  function renderNicknameSlots() {
    for (var j = 0; j < nicknameSlotEls.length; j++) {
      if (nicknameSlotEls[j] && nicknameSlotEls[j].element && nicknameSlotEls[j].element.parentNode) {
        nicknameSlotEls[j].element.parentNode.removeChild(nicknameSlotEls[j].element);
      }
    }
    nicknameSlotEls = [];

    for (let i = 0; i < 6; i++) {
      const config = nicknameSlots[i];
      if (!config) { nicknameSlotEls.push(null); continue; }

      const slot = document.createElement('div');
      slot.className = 'nickname-slot';
      slot.dataset.slot = i;
      slot.style.left = config.x + 'px';
      slot.style.top = config.y + 'px';
      slot.style.width = config.width + 'px';
      slot.style.height = config.height + 'px';

      const textEl = document.createElement('div');
      textEl.className = 'nickname-text';
      applyNicknameStyle(textEl);

      slot.appendChild(textEl);
      overlay.appendChild(slot);
      nicknameSlotEls.push({ element: slot, text: textEl });
    }
  }

  function applyNicknameStyle(textEl) {
    const s = nicknameStyle;
    const fontBold = s.fontBold ? 'bold ' : '';
    const fontItalic = s.fontItalic ? 'italic ' : '';
    const fontFamily = s.fontFamily || 'Arial';

    textEl.style.fontFamily = `'${fontFamily}', sans-serif`;
    textEl.style.fontWeight = s.fontBold ? 'bold' : 'normal';
    textEl.style.fontStyle = s.fontItalic ? 'italic' : 'normal';

    if (s.colorMode === 'linear') {
      const angle = s.angle || 0;
      textEl.style.background = `linear-gradient(${angle}deg, ${s.gradColor1 || '#fff'}, ${s.gradColor2 || '#000'})`;
      textEl.style.webkitBackgroundClip = 'text';
      textEl.style.webkitTextFillColor = 'transparent';
      textEl.style.backgroundClip = 'text';
      textEl.style.color = 'transparent';
    } else if (s.colorMode === 'radial') {
      textEl.style.background = `radial-gradient(circle, ${s.gradColor1 || '#fff'}, ${s.gradColor2 || '#000'})`;
      textEl.style.webkitBackgroundClip = 'text';
      textEl.style.webkitTextFillColor = 'transparent';
      textEl.style.backgroundClip = 'text';
      textEl.style.color = 'transparent';
    } else {
      textEl.style.background = 'none';
      textEl.style.webkitBackgroundClip = '';
      textEl.style.webkitTextFillColor = s.color || '#ffffff';
      textEl.style.backgroundClip = '';
      textEl.style.color = s.color || '#ffffff';
    }

    const sw = s.strokeWidth || 0;
    const sc = s.strokeColor || '#000000';
    textEl.classList.remove('stroke-exterior', 'stroke-center', 'stroke-interior');
    textEl.style.removeProperty('--stroke-width');
    textEl.style.removeProperty('--stroke-color');
    textEl.style.removeProperty('--stroke-shadow');
    textEl.style.textShadow = '';
    textEl.style.webkitTextStroke = '';

    if (sw > 0) {
      if (s.strokePosition === 'exterior') {
        textEl.classList.add('stroke-exterior');
        textEl.style.setProperty('--stroke-width', sw + 'px');
        textEl.style.setProperty('--stroke-color', sc);
      } else if (s.strokePosition === 'center') {
        textEl.classList.add('stroke-center');
        textEl.style.setProperty('--stroke-width', sw + 'px');
        textEl.style.setProperty('--stroke-color', sc);
      } else {
        textEl.classList.add('stroke-interior');
        const shadows = [];
        for (let dx = -sw; dx <= sw; dx++) {
          for (let dy = -sw; dy <= sw; dy++) {
            if (dx === 0 && dy === 0) continue;
            shadows.push(`${dx}px ${dy}px 0 ${sc}`);
          }
        }
        textEl.style.setProperty('--stroke-shadow', shadows.join(', '));
        textEl.style.textShadow = shadows.join(', ');
      }
    }
  }

  function fitTextToSlot(textEl, text, slotWidth, slotHeight) {
    textEl.textContent = text;
    if (!text) { textEl.style.fontSize = '12px'; return; }

    let low = 4, high = Math.min(slotHeight, 200);
    let bestSize = 4;
    const testCanvas = document.createElement('canvas');
    const ctx = testCanvas.getContext('2d');

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const fontBold = nicknameStyle.fontBold ? 'bold ' : '';
      const fontItalic = nicknameStyle.fontItalic ? 'italic ' : '';
      ctx.font = `${fontItalic}${fontBold}${mid}px '${nicknameStyle.fontFamily || 'Arial'}', sans-serif`;
      const metrics = ctx.measureText(text);
      if (metrics.width <= slotWidth) {
        bestSize = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    textEl.style.fontSize = bestSize + 'px';
  }

  function updateTeam(team) {
    if (!team || slots.length === 0) return;

    team.forEach(function(pokemon, i) {
      if (i >= slots.length) return;
      var slot = slots[i];

      if (pokemon && pokemon.spriteUrl) {
        slot.img.src = pokemon.spriteUrl;
        slot.element.classList.add('active');
        slot.img.alt = pokemon.nickname || pokemon.speciesId.toString();

        if (showNames && pokemon.nickname) {
          slot.nickname.textContent = pokemon.nickname;
        } else {
          slot.nickname.textContent = '';
        }

        if (nicknameSlotEls[i] && showNames && pokemon.nickname) {
          nicknameSlotEls[i].element.classList.add('active');
          fitTextToSlot(nicknameSlotEls[i].text, pokemon.nickname, nicknameSlots[i].width, nicknameSlots[i].height);
        } else if (nicknameSlotEls[i]) {
          nicknameSlotEls[i].element.classList.remove('active');
          nicknameSlotEls[i].text.textContent = '';
        }
      } else {
        slot.element.classList.remove('active');
        slot.img.src = '';
        slot.nickname.textContent = '';
        if (nicknameSlotEls[i]) {
          nicknameSlotEls[i].element.classList.remove('active');
          nicknameSlotEls[i].text.textContent = '';
        }
      }
    });

    for (var i = team.length; i < slots.length; i++) {
      slots[i].element.classList.remove('active');
      slots[i].img.src = '';
      slots[i].nickname.textContent = '';
      if (nicknameSlotEls[i]) {
        nicknameSlotEls[i].element.classList.remove('active');
        nicknameSlotEls[i].text.textContent = '';
      }
    }
  }

  function connectSSE() {
    var projectId = getProjectId();
    var eventSource = new EventSource('/events/' + projectId);

    eventSource.addEventListener('config-updated', function(e) {
      try {
        var config = JSON.parse(e.data);
        showNames = config.showNames;
        nicknameStyle = config.nicknameStyle || {};
        nicknameSlots = config.nicknameSlots || [];
        renderNicknameSlots();
        var teamRes = fetch('/api/team/' + projectId);
        teamRes.then(function(r) { return r.json(); }).then(function(teamData) {
          if (teamData.team) updateTeam(teamData.team);
        });
      } catch (err) {}
    });

    eventSource.onmessage = function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.team) updateTeam(data.team);
      } catch (err) {}
    };

    eventSource.onerror = function() {
      eventSource.close();
      setTimeout(connectSSE, 3000);
    };
  }

  loadConfig();
})();
