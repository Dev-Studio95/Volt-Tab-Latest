document.addEventListener('DOMContentLoaded', () => {

  // ─── STORAGE SHIM ──────────────────────────────────────────────────────────
  const store = {
    get: (keys) => new Promise(res => chrome.storage.local.get(keys, res)),
    set: (obj)  => new Promise(res => chrome.storage.local.set(obj, res)),
  };

  // ─── DOM ───────────────────────────────────────────────────────────────────
  const workspace       = document.getElementById('workspace');
  const appFooter       = document.getElementById('app-footer');
  const configSidebar   = document.getElementById('config-sidebar');
  const shortcutModal   = document.getElementById('shortcut-modal');
  const shortcutsWrap   = document.getElementById('shortcuts-container');
  const chatWindow      = document.getElementById('chat-window');
  const chatMessages    = document.getElementById('chat-messages');
  const chatInput       = document.getElementById('chat-input');
  const chatSendBtn     = document.getElementById('chat-send-btn');
  const engineBadge     = document.getElementById('engine-badge');
  const userMenu        = document.getElementById('user-menu');

  // ─── STATE ─────────────────────────────────────────────────────────────────
  let shortcuts    = [];
  let settings     = {
    use12Hr:      false,
    showFooter:   true,
    locked:       false,
    allowOverlap: false,
    searchEngine: 'https://www.google.com/search?q=',
    openRouterKey: '',
  };
  let layoutMatrix  = {};
  let editingIndex  = null;
  let chatHistory   = [];
  let isSending     = false;
  let lastCpuInfo   = null;

  const ENGINE_BADGES = {
    'https://www.google.com/search?q=':       'G',
    'https://www.bing.com/search?q=':          'B',
    'https://duckduckgo.com/?q=':              'D',
    'https://search.brave.com/search?q=':     'Br',
  };

  const baseline = {
    volt:     { x: 60,  y: 80,  active: true  },
    clock:    { x: 560, y: 100, active: true  },
    search:   { x: 510, y: 250, active: true  },
    weather:  { x: 940, y: 100, active: false },
    crypto:   { x: 940, y: 240, active: false },
    quote:    { x: 510, y: 380, active: false },
    stats:    { x: 60,  y: 250, active: false },
    pomodoro: { x: 60,  y: 430, active: false },
    notes:    { x: 340, y: 430, active: false },
  };

  // ─── INIT ──────────────────────────────────────────────────────────────────
  async function init() {
    await loadSettings();
    await loadShortcuts();
    await loadLayout();
    await loadNotes();

    syncGoogleProfile();

    // Clock ticks every second
    runClock();
    setInterval(runClock, 1000);

    // System stats — poll every 2.5s (only if widget visible)
    pollStats();
    setInterval(pollStats, 2500);

    // Lazy-fetch external data only for active widgets
    if (isActive('weather')) fetchWeather();
    if (isActive('crypto'))  fetchCrypto();
    if (isActive('quote'))   fetchQuote();
  }

  const isActive = id => layoutMatrix[id]?.active;

  // ─── SETTINGS ──────────────────────────────────────────────────────────────
  async function loadSettings() {
    const data = await store.get('volt_settings');
    if (data.volt_settings) Object.assign(settings, data.volt_settings);

    document.getElementById('setting-12hr').checked    = settings.use12Hr;
    document.getElementById('setting-footer').checked  = settings.showFooter;
    document.getElementById('setting-lock').checked    = settings.locked;
    document.getElementById('setting-overlap').checked = settings.allowOverlap;
    document.getElementById('search-engine-select').value = settings.searchEngine;
    document.getElementById('api-key-input').value     = settings.openRouterKey || '';

    applySettings();
  }

  function applySettings() {
    appFooter.classList.toggle('hidden', !settings.showFooter);
    workspace.classList.toggle('workspace-locked', settings.locked);
    engineBadge.textContent = ENGINE_BADGES[settings.searchEngine] || 'S';
  }

  async function saveSettings() {
    settings.use12Hr      = document.getElementById('setting-12hr').checked;
    settings.showFooter   = document.getElementById('setting-footer').checked;
    settings.locked       = document.getElementById('setting-lock').checked;
    settings.allowOverlap = document.getElementById('setting-overlap').checked;
    settings.searchEngine = document.getElementById('search-engine-select').value;
    settings.openRouterKey = document.getElementById('api-key-input').value.trim();
    applySettings();
    await store.set({ volt_settings: settings });
    runClock(); // refresh clock format
  }

  ['setting-12hr','setting-footer','setting-lock','setting-overlap','search-engine-select','api-key-input']
    .forEach(id => {
      const el = document.getElementById(id);
      const evt = el.tagName === 'SELECT' || el.type === 'password' ? 'change' : 'change';
      el.addEventListener(evt, saveSettings);
    });

  // ─── GOOGLE PROFILE ────────────────────────────────────────────────────────
  // Generates a canvas avatar from the user's initial, coloured by email hash.
  // Used as the primary avatar — no external URLs, no CSP issues.
  function generateCanvasAvatar(initial, seed) {
    const palette = ['#818CF8','#34D399','#FB923C','#F472B6','#60A5FA','#A78BFA','#4ADE80'];
    const idx = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 80;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = palette[idx];
    ctx.beginPath(); ctx.arc(40, 40, 40, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px Space Grotesk, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(initial.toUpperCase(), 40, 42);
    return canvas.toDataURL();
  }

  function setAvatars(dataUrl, initial) {
    // Small nav avatar
    const smEl = document.getElementById('user-profile-btn');
    smEl.innerHTML = '';
    const smImg = document.createElement('img');
    smImg.src = dataUrl; smImg.alt = initial;
    smImg.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;';
    smEl.appendChild(smImg);

    // Large menu avatar
    document.getElementById('avatar-initial-lg').textContent = initial.toUpperCase();
    const lgImg = document.getElementById('user-avatar-img');
    lgImg.src = dataUrl;
    lgImg.classList.remove('hidden');
    lgImg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;';
  }

  function syncGoogleProfile() {
    if (!chrome.identity) return;

    chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (info) => {
      if (chrome.runtime.lastError || !info?.email) return;

      const email = info.email;
      const rawName = info.displayName || email.split('@')[0];
      const firstName = rawName.split(' ')[0];
      const initial = firstName.charAt(0);

      document.getElementById('user-display-name').textContent = `Hi, ${firstName}!`;
      document.getElementById('user-display-email').textContent = email;
      document.getElementById('avatar-initial-sm').textContent = initial.toUpperCase();

      // Generate local canvas avatar immediately — reliable fallback
      const avatarDataUrl = generateCanvasAvatar(initial, email);
      setAvatars(avatarDataUrl, initial);
    });
  }

  // User menu toggle
  document.getElementById('user-profile-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    userMenu.classList.toggle('hidden');
  });
  document.getElementById('close-user-menu').addEventListener('click', () =>
    userMenu.classList.add('hidden'));
  document.getElementById('btn-manage-account').addEventListener('click', () =>
    window.open('https://myaccount.google.com', '_blank'));
  document.getElementById('btn-sign-out').addEventListener('click', () =>
    window.open('https://accounts.google.com/Logout', '_blank'));
  document.addEventListener('click', e => {
    if (!userMenu.contains(e.target) && e.target.id !== 'user-profile-btn')
      userMenu.classList.add('hidden');
  });

  // ─── SHORTCUTS ─────────────────────────────────────────────────────────────
  async function loadShortcuts() {
    const data = await store.get('volt_shortcuts');
    shortcuts = data.volt_shortcuts || [
      { name: 'GitHub', url: 'https://github.com/Dev-Studio95' },
    ];
    renderShortcuts();
  }

  function getFavicon(url) {
    try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`; }
    catch (_) { return ''; }
  }

  function renderShortcuts() {
    shortcutsWrap.innerHTML = shortcuts.map((s, i) =>
      `<a href="${s.url}" class="shortcut-link" data-index="${i}" title="Right-click to edit">
        <img src="${getFavicon(s.url)}" class="shortcut-icon" alt="" onerror="this.style.display='none'">
        <span>${s.name}</span>
      </a>`
    ).join('');

    shortcutsWrap.querySelectorAll('.shortcut-link').forEach(link =>
      link.addEventListener('contextmenu', e => {
        e.preventDefault();
        editingIndex = Number(e.currentTarget.dataset.index);
        openModal('Edit Shortcut', shortcuts[editingIndex].name, shortcuts[editingIndex].url, true);
      })
    );
  }

  function openModal(title, name = '', url = '', showDelete = false) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('shortcut-name').value = name;
    document.getElementById('shortcut-url').value  = url;
    document.getElementById('modal-delete').classList.toggle('hidden', !showDelete);
    shortcutModal.classList.remove('hidden');
  }

  document.getElementById('add-shortcut-btn').addEventListener('click', () => {
    editingIndex = null;
    openModal('Add Shortcut');
  });

  document.getElementById('modal-cancel').addEventListener('click', () =>
    shortcutModal.classList.add('hidden'));

  document.getElementById('modal-delete').addEventListener('click', async () => {
    if (editingIndex !== null) {
      shortcuts.splice(editingIndex, 1);
      await store.set({ volt_shortcuts: shortcuts });
      renderShortcuts();
    }
    shortcutModal.classList.add('hidden');
  });

  document.getElementById('modal-save').addEventListener('click', async () => {
    let name = document.getElementById('shortcut-name').value.trim();
    let url  = document.getElementById('shortcut-url').value.trim();
    if (!name || !url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (editingIndex !== null) shortcuts[editingIndex] = { name, url };
    else shortcuts.push({ name, url });
    await store.set({ volt_shortcuts: shortcuts });
    renderShortcuts();
    shortcutModal.classList.add('hidden');
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      shortcutModal.classList.add('hidden');
      userMenu.classList.add('hidden');
    }
  });

  // ─── LAYOUT ────────────────────────────────────────────────────────────────
  async function loadLayout() {
    const data = await store.get('volt_layout_matrix');
    layoutMatrix = data.volt_layout_matrix || {};
    for (const key in baseline) {
      if (!layoutMatrix[key]) layoutMatrix[key] = { ...baseline[key] };
    }
    applyLayout();
  }

  function applyLayout() {
    document.querySelectorAll('.draggable').forEach(el => {
      const id    = el.dataset.id;
      const state = layoutMatrix[id];
      if (!state) return;
      el.style.left = `${state.x}px`;
      el.style.top  = `${state.y}px`;
      el.classList.toggle('hidden', !state.active);
      const tog = document.querySelector(`input.widget-toggle[data-target="${id}"]`);
      if (tog) tog.checked = state.active;
    });
    clampAll();
  }

  function clampAll() {
    document.querySelectorAll('.draggable:not(.hidden)').forEach(el => {
      const id = el.dataset.id;
      if (!layoutMatrix[id]) return;
      const maxX = window.innerWidth  - el.offsetWidth;
      const maxY = window.innerHeight - el.offsetHeight;
      const x = Math.max(0,  Math.min(parseInt(el.style.left, 10) || 0, maxX));
      const y = Math.max(52, Math.min(parseInt(el.style.top,  10) || 0, maxY));
      el.style.left = `${x}px`;
      el.style.top  = `${y}px`;
      layoutMatrix[id].x = x;
      layoutMatrix[id].y = y;
    });
  }
  window.addEventListener('resize', clampAll);

  // Widget toggles
  document.querySelectorAll('input.widget-toggle').forEach(tog => {
    tog.addEventListener('change', async e => {
      const id = e.target.dataset.target;
      layoutMatrix[id].active = e.target.checked;
      document.getElementById(`widget-${id}`)?.classList.toggle('hidden', !e.target.checked);
      await store.set({ volt_layout_matrix: layoutMatrix });
      if (e.target.checked) {
        clampAll();
        if (id === 'weather') fetchWeather();
        if (id === 'crypto')  fetchCrypto();
        if (id === 'quote')   fetchQuote();
      }
    });
  });

  // Presets
  document.getElementById('save-preset-btn').addEventListener('click', async () => {
    await store.set({ volt_preset: JSON.parse(JSON.stringify(layoutMatrix)) });
    flashBtn('save-preset-btn', 'Saved!');
  });

  document.getElementById('load-preset-btn').addEventListener('click', async () => {
    const data = await store.get('volt_preset');
    if (data.volt_preset) {
      layoutMatrix = data.volt_preset;
      await store.set({ volt_layout_matrix: layoutMatrix });
      applyLayout();
      flashBtn('load-preset-btn', 'Loaded!');
    }
  });

  function flashBtn(id, label) {
    const btn = document.getElementById(id);
    const prev = btn.textContent;
    btn.textContent = label;
    setTimeout(() => btn.textContent = prev, 1500);
  }

  // Reset
  document.getElementById('reset-layout-btn').addEventListener('click', async () => {
    layoutMatrix = JSON.parse(JSON.stringify(baseline));
    await store.set({ volt_layout_matrix: layoutMatrix });
    applyLayout();
  });

  // Sidebar
  document.getElementById('sidebar-toggle').addEventListener('click', () =>
    configSidebar.classList.remove('hidden-sidebar'));
  document.getElementById('close-sidebar-btn').addEventListener('click', () =>
    configSidebar.classList.add('hidden-sidebar'));

  // ─── DRAG ──────────────────────────────────────────────────────────────────
  let dragEl = null, offX = 0, offY = 0;

  workspace.addEventListener('mousedown', e => {
    if (settings.locked) return;
    const widget = e.target.closest('.draggable');
    if (!widget || ['INPUT','TEXTAREA','BUTTON','SELECT','A'].includes(e.target.tagName)) return;
    dragEl = widget;
    const rect = widget.getBoundingClientRect();
    offX = e.clientX - rect.left;
    offY = e.clientY - rect.top;
    widget.style.zIndex = '999';
    widget.style.transition = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragEl) return;
    const x = Math.max(0,  Math.min(e.clientX - offX, window.innerWidth  - dragEl.offsetWidth));
    const y = Math.max(52, Math.min(e.clientY - offY, window.innerHeight - dragEl.offsetHeight));
    dragEl.style.left = `${x}px`;
    dragEl.style.top  = `${y}px`;

    // Overlap detection: bring to front if not allowing overlap
    if (!settings.allowOverlap) resolveOverlap(dragEl, x, y);
  });

  document.addEventListener('mouseup', async () => {
    if (!dragEl) return;
    dragEl.style.zIndex = '10';
    dragEl.style.transition = '';
    const id = dragEl.dataset.id;
    layoutMatrix[id].x = parseInt(dragEl.style.left,  10);
    layoutMatrix[id].y = parseInt(dragEl.style.top,   10);
    await store.set({ volt_layout_matrix: layoutMatrix });
    dragEl = null;
  });

  function resolveOverlap(moving, mx, my) {
    const mR = { left: mx, top: my, right: mx + moving.offsetWidth, bottom: my + moving.offsetHeight };
    document.querySelectorAll('.draggable:not(.hidden)').forEach(other => {
      if (other === moving) return;
      const r = other.getBoundingClientRect();
      const overlaps = mR.left < r.right && mR.right > r.left && mR.top < r.bottom && mR.bottom > r.top;
      other.style.zIndex = overlaps ? '8' : '10';
    });
  }

  // ─── CLOCK ─────────────────────────────────────────────────────────────────
  const elHHMM = document.getElementById('clock-hhmm');
  const elSS   = document.getElementById('clock-ss');
  const elAMPM = document.getElementById('clock-ampm');
  const elDate = document.getElementById('clock-date');

  const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function runClock() {
    const d = new Date();
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');

    if (settings.use12Hr) {
      const period = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      elAMPM.textContent = period;
      elAMPM.classList.remove('hidden');
    } else {
      elAMPM.classList.add('hidden');
    }

    elHHMM.textContent = `${String(h).padStart(2, '0')}:${m}`;
    elSS.textContent   = `:${s}`;
    elDate.textContent = `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
  }

  // ─── SEARCH ────────────────────────────────────────────────────────────────
  document.getElementById('search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const q = e.target.value.trim();
      if (q) window.location.href = settings.searchEngine + encodeURIComponent(q);
    }
  });

  // ─── SYSTEM STATS ──────────────────────────────────────────────────────────
  function pollStats() {
    if (!isActive('stats')) return;

    // RAM via chrome.system.memory
    if (chrome.system?.memory) {
      chrome.system.memory.getInfo(info => {
        const total = info.capacity;
        const used  = total - info.availableCapacity;
        const pct   = Math.min(100, (used / total) * 100);
        document.getElementById('ram-text').textContent =
          `${(used / 1073741824).toFixed(1)} / ${(total / 1073741824).toFixed(0)} GB`;
        document.getElementById('ram-bar').style.width = `${pct.toFixed(1)}%`;
      });
    }

    // CPU via chrome.system.cpu — double-sample delta method
    if (chrome.system?.cpu) {
      chrome.system.cpu.getInfo(info => {
        if (!lastCpuInfo) { lastCpuInfo = info; return; }
        let totalUsed = 0, totalAll = 0;
        info.processors.forEach((proc, i) => {
          const cur = proc.usage, prv = lastCpuInfo.processors[i]?.usage;
          if (!prv) return;
          const used = (cur.kernel + cur.user) - (prv.kernel + prv.user);
          const all  = cur.total - prv.total;
          totalUsed += used; totalAll += all;
        });
        lastCpuInfo = info;
        const pct = totalAll > 0 ? Math.min(100, (totalUsed / totalAll) * 100) : 0;
        document.getElementById('cpu-text').textContent = `${pct.toFixed(0)}%`;
        document.getElementById('cpu-bar').style.width  = `${pct.toFixed(1)}%`;
      });
    }
  }

  // ─── DATA FETCHERS ─────────────────────────────────────────────────────────
  async function fetchWeather() {
    try {
      const r = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=22.8&longitude=86.18&current_weather=true'
      );
      if (!r.ok) return;
      const d = await r.json();
      const wc = d.current_weather;
      document.getElementById('weather-temp').textContent = `${wc.temperature}°C`;
      document.getElementById('weather-desc').textContent = wmoCodeToLabel(wc.weathercode);
    } catch (_) {}
  }

  function wmoCodeToLabel(code) {
    if (code === 0) return 'Clear sky';
    if (code <= 3)  return 'Partly cloudy';
    if (code <= 9)  return 'Overcast';
    if (code <= 29) return 'Rain';
    if (code <= 39) return 'Drizzle';
    if (code <= 49) return 'Fog';
    if (code <= 59) return 'Freezing drizzle';
    if (code <= 69) return 'Snow';
    if (code <= 79) return 'Snow grains';
    if (code <= 84) return 'Rain showers';
    if (code <= 94) return 'Thunderstorm';
    return 'Hail';
  }

  async function fetchCrypto() {
    try {
      const r = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true'
      );
      if (!r.ok) return;
      const d = await r.json();
      const price  = d.bitcoin.usd;
      const change = d.bitcoin.usd_24h_change;
      document.getElementById('crypto-price').textContent = `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
      const changeEl = document.getElementById('crypto-change');
      const sign = change >= 0 ? '+' : '';
      changeEl.textContent = `${sign}${change.toFixed(2)}% (24h)`;
      changeEl.className = `hero-sub ${change >= 0 ? 'up' : 'down'}`;
    } catch (_) {}
  }

  async function fetchQuote() {
    try {
      const r = await fetch('https://dummyjson.com/quotes/random');
      if (!r.ok) return;
      const d = await r.json();
      document.getElementById('quote-text').textContent   = `\u201c${d.quote}\u201d`;
      document.getElementById('quote-author').textContent = `\u2014 ${d.author}`;
    } catch (_) {}
  }

  // ─── NOTES ─────────────────────────────────────────────────────────────────
  const notesTA = document.getElementById('notes-textarea');
  let notesSaveTimer;

  async function loadNotes() {
    const data = await store.get('volt_notes');
    if (data.volt_notes) notesTA.value = data.volt_notes;
  }

  notesTA.addEventListener('input', () => {
    clearTimeout(notesSaveTimer);
    notesSaveTimer = setTimeout(() => store.set({ volt_notes: notesTA.value }), 500);
  });

  // ─── POMODORO ──────────────────────────────────────────────────────────────
  const POMO_FOCUS  = 25 * 60;
  const POMO_BREAK  = 5  * 60;
  let pomoRemaining = POMO_FOCUS;
  let pomoIsRunning = false;
  let pomoInterval  = null;
  let pomoIsBreak   = false;
  let pomoSessions  = 0;

  const pomoDisplay = document.getElementById('pomo-display');
  const pomoPhase   = document.getElementById('pomo-phase');
  const pomoStart   = document.getElementById('pomo-start');
  const pomoReset   = document.getElementById('pomo-reset');

  function renderPomo() {
    const m = String(Math.floor(pomoRemaining / 60)).padStart(2, '0');
    const s = String(pomoRemaining % 60).padStart(2, '0');
    pomoDisplay.textContent = `${m}:${s}`;
    pomoPhase.textContent   = pomoIsBreak ? 'Break' : 'Focus';
  }

  pomoStart.addEventListener('click', () => {
    if (pomoIsRunning) {
      clearInterval(pomoInterval);
      pomoIsRunning = false;
      pomoStart.textContent = 'Start';
    } else {
      pomoIsRunning = true;
      pomoStart.textContent = 'Pause';
      pomoInterval = setInterval(() => {
        if (pomoRemaining > 0) {
          pomoRemaining--;
          renderPomo();
        } else {
          clearInterval(pomoInterval);
          pomoIsRunning = false;
          pomoStart.textContent = 'Start';
          if (!pomoIsBreak) {
            pomoSessions++;
            pomoIsBreak   = true;
            pomoRemaining = POMO_BREAK;
          } else {
            pomoIsBreak   = false;
            pomoRemaining = POMO_FOCUS;
          }
          renderPomo();
        }
      }, 1000);
    }
  });

  pomoReset.addEventListener('click', () => {
    clearInterval(pomoInterval);
    pomoIsRunning = false;
    pomoIsBreak   = false;
    pomoRemaining = POMO_FOCUS;
    pomoStart.textContent = 'Start';
    renderPomo();
  });

  // ─── AI CHAT ───────────────────────────────────────────────────────────────
  const AI_MODEL        = 'meta-llama/llama-3-8b-instruct:free';
  const AI_SYSTEM_PROMPT = 'You are VOLT AI, a concise and intelligent assistant embedded in a Chrome new tab dashboard. Keep responses brief and clear. Format code with backtick blocks. Avoid unnecessary preamble.';

  document.getElementById('chat-fab').addEventListener('click', () => {
    chatWindow.classList.toggle('hidden');
    if (!chatWindow.classList.contains('hidden')) chatInput.focus();
  });
  document.getElementById('close-chat-btn').addEventListener('click', () =>
    chatWindow.classList.add('hidden'));

  document.getElementById('chat-clear-btn').addEventListener('click', () => {
    chatHistory = [];
    chatMessages.innerHTML = `<div class="msg msg-bot">History cleared. How can I help?</div>`;
  });

  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });
  chatSendBtn.addEventListener('click', sendChat);

  function appendMsg(text, type) {
    const div = document.createElement('div');
    div.className = `msg msg-${type}`;
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
  }

  function appendTyping() {
    const div = document.createElement('div');
    div.className = 'typing-dots';
    div.innerHTML = '<span></span><span></span><span></span>';
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
  }

  async function sendChat() {
    const text = chatInput.value.trim();
    if (!text || isSending) return;

    const key = settings.openRouterKey;
    if (!key) {
      appendMsg('No API key set. Go to Settings → VOLT AI and paste your OpenRouter key.', 'error');
      return;
    }

    isSending = true;
    chatSendBtn.disabled = true;
    chatInput.value = '';

    appendMsg(text, 'user');
    chatHistory.push({ role: 'user', content: text });

    const typingEl = appendTyping();

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization':  `Bearer ${key}`,
          'HTTP-Referer':   'https://github.com/Dev-Studio95/volt',
          'X-Title':        'Volt Dashboard',
          'Content-Type':   'application/json',
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            { role: 'system', content: AI_SYSTEM_PROMPT },
            ...chatHistory,
          ],
        }),
      });

      typingEl.remove();

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.error?.message || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const data  = await res.json();
      const reply = data?.choices?.[0]?.message?.content;

      if (!reply) throw new Error('Model returned an empty response. Try again.');

      chatHistory.push({ role: 'assistant', content: reply });
      appendMsg(reply, 'bot');

    } catch (err) {
      typingEl.remove();
      chatHistory.pop(); // remove the failed user message from history
      appendMsg(`Error: ${err.message}`, 'error');
    } finally {
      isSending = false;
      chatSendBtn.disabled = false;
      chatInput.focus();
    }
  }

  // ─── BOOT ──────────────────────────────────────────────────────────────────
  init();
});
