# ⚡ Volt — v1.2

> A precision-engineered new tab dashboard for Chromium. Built for people who want a fast, clean, and functional start page — not a bloated browser homepage.

---

## Overview

Volt replaces your new tab page with a fully customizable canvas of draggable widgets — clock, search, weather, crypto, notes, a Pomodoro timer, system stats, and an embedded AI assistant. The design is deliberately minimal: near-black backgrounds, a soft violet accent, and JetBrains Mono for data-heavy elements.

v1.2 is a full UI overhaul over the original release. Every system was rebuilt or fixed: the profile avatar no longer breaks on load, the AI chatbot now holds a conversation and handles errors cleanly, the clock shows seconds and a live date, and the entire visual system was rebuilt around a proper design token layer.

---

## Features

### Workspace
- Fully draggable widget canvas — positions persist across sessions via `chrome.storage.local`
- Lock/unlock workspace to prevent accidental repositioning
- Save and load layout presets
- Optional widget overlap mode
- One-click reset to default layout

### Widgets
| Widget | Description |
|---|---|
| **Volt Branding** | Gradient logotype anchor |
| **Clock** | Live HH:MM:SS with date, 12/24h switchable |
| **Search** | Full-width search bar with engine selector |
| **Weather** | Current temperature + condition via Open-Meteo |
| **Bitcoin** | Live BTC/USD price with 24h change |
| **Daily Quote** | Random quote on load |
| **System Stats** | Real CPU % (delta-sampled) + RAM usage |
| **Focus Timer** | Pomodoro with auto break switching |
| **Scratchpad** | Persistent notes, debounced autosave |

### AI Assistant
- Floating chat window powered by OpenRouter (Llama 3 · 8B, free)
- Full conversation history within the session
- Typing indicator with animated dots
- Clear history button
- Clean error messages for missing key, rate limits, or empty responses
- System prompt for concise, dashboard-appropriate replies

### Navigation
- Custom shortcut links with favicons (add via `+ ADD`, right-click to edit/delete)
- Google Account profile: name and canvas-generated avatar shown in nav and dropdown
- Search engine switcher: Google, Bing, DuckDuckGo, Brave Search

---

## Screenshots

> Add screenshots here — `assets/preview.png`

---

## Install

### From source (Developer Mode)

```bash
git clone https://github.com/Dev-Studio95/volt.git
```

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `volt` folder
4. Open a new tab

---

## Configuration

### AI Assistant

1. Get a free API key at [openrouter.ai](https://openrouter.ai)
2. Open Settings (⚙ icon in the navbar)
3. Paste your key under **VOLT AI — OpenRouter**

The model used is `meta-llama/llama-3-8b-instruct:free`. No cost for basic usage — OpenRouter's free tier covers it.

### Widgets

Toggle any widget from the Settings sidebar. Each widget's position is saved automatically when you drag it.

### Search Engine

Settings → **Search Engine** → pick from Google, Bing, DuckDuckGo, or Brave Search. The badge in the search bar updates to reflect your choice.

### Clock Format

Settings → **Appearance** → toggle **12-Hour Clock**.

---

## Permissions

| Permission | Purpose |
|---|---|
| `storage` | Persist layout, shortcuts, notes, and settings |
| `system.cpu` | Real CPU usage via delta-sampled processor info |
| `system.memory` | RAM widget — available vs total |
| `identity` | Read signed-in Google account name and email |
| `identity.email` | Required alongside `identity` for email access |

### Host permissions

| Host | Purpose |
|---|---|
| `openrouter.ai` | AI chat completions |
| `*.googleapis.com` | Google account info |
| `*.open-meteo.com` | Weather data (no API key needed) |
| `api.coingecko.com` | BTC/USD price |
| `dummyjson.com` | Daily quote |

---

## Widget Reference

### Clock
Shows `HH:MM` in large type, `:SS` in violet, and a full date string (`Monday, Jun 21 2025`). Switches between 24-hour and 12-hour format from Settings.

### Search
Press `Enter` to search. The selected engine is applied to all queries.

### Weather
Pulls from [Open-Meteo](https://open-meteo.com) — no API key required. Currently hardcoded to Jamshedpur coordinates (`22.8°N, 86.18°E`). Configurable location is planned.

### Bitcoin
Price and 24h change from CoinGecko public API. Change is coloured green (positive) or red (negative).

### System Stats
- **CPU**: Uses `chrome.system.cpu.getInfo()` called twice with a 2.5s interval. The delta between kernel + user time vs total time gives actual CPU utilisation rather than a simulated value.
- **RAM**: `chrome.system.memory.getInfo()` — available capacity subtracted from total capacity.

### Pomodoro
25-minute focus sessions with automatic 5-minute break switching. Start/Pause and Reset. The phase label (`Focus` / `Break`) updates automatically.

### Scratchpad
Saves 500ms after you stop typing (debounced) to `chrome.storage.local`. Content persists across browser sessions.

### VOLT AI
Requires an OpenRouter API key (free). Conversation history is kept in memory for the duration of the tab session. Clearing history resets the context. The chat window is draggable — click the floating robot button to toggle.

---

## Project Structure

```
volt/
├── index.html      # Markup — nav, workspace, widgets, modals, chat
├── styles.css      # Design tokens, layout, all component styles
├── script.js       # All logic — storage, drag, clock, fetchers, AI, auth
└── manifest.json   # MV3 config — permissions and host rules
```

No build tools. No frameworks. No dependencies. Four files, loads instantly.

---

## Design

The visual system uses a small set of CSS custom properties as its foundation:

```css
--bg:        #09090B;   /* page background  */
--surface:   #111115;   /* widget fill      */
--accent:    #818CF8;   /* violet highlight */
--text:      #F4F4F5;   /* primary text     */
--text-2:    #A1A1AA;   /* secondary text   */
--text-3:    #52525B;   /* muted / labels   */
```

Typography is `Space Grotesk` for UI copy and `JetBrains Mono` for all data-dense elements (clock, stats, labels, the chat interface).

---

## Browser Support

| Browser | Status |
|---|---|
| Chrome 88+ | ✅ Full support |
| Edge 88+ | ✅ Full support |
| Brave | ✅ Full support |
| Arc | ✅ Full support |
| Firefox | ❌ MV3 / `chrome.*` APIs not supported |
| Safari | ❌ Not supported |

---

## Roadmap

- [ ] Configurable weather location (lat/lng input in settings)
- [ ] Multiple AI model options in settings
- [ ] Light mode
- [ ] Custom accent colour picker
- [ ] Widget resize handles
- [ ] More Pomodoro session lengths

---

## License

MIT — use it, fork it, ship it.

---

<p align="center">
  Built by <a href="https://github.com/Dev-Studio95">@Dev-Studio95</a> &nbsp;·&nbsp; VOLT // v1.2
</p>
