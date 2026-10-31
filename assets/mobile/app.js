(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  let state = null, connected = false, authenticated = false, busy = false, activeTab = "live";
  let sceneKey = "", slideKey = "", tickerKey = "", tickerDirty = false, selectedTicker = "", lastActiveSlideId = null;
  let monitorPaused = false, frameUrl = null, installPrompt = null, wakeLock = null;
  let sessionEpoch = 0, locking = false, gainDirty = false;
  const toast = (message, error = false) => { $("toast").textContent = message; $("toast").classList.toggle("error", error); };
  const availability = () => {
    document.querySelectorAll("[data-control]").forEach(button => {
      button.disabled = !connected || busy || (button.dataset.mode === "logo" && !state?.hasLogo);
    });
    if (!state?.tickers.length) $("ticker-form").querySelector("button").disabled = true;
  };
  const setConnected = value => {
    if (value && !connected && !monitorPaused) { $("monitor-note").textContent = "Waiting for Program picture…"; $("monitor-note").hidden = false; }
    connected = value;
    $("connection").textContent = value ? "Connected" : "Disconnected";
    $("connection").classList.toggle("connected", value);
    $("offline").hidden = value;
    if (!value) { $("monitor-note").textContent = "Disconnected · picture unavailable"; $("monitor-note").hidden = false; }
    availability();
  };
  async function api(path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 14000);
    try {
      const response = await fetch(path, { method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
        headers: body === undefined ? {} : { "Content-Type": "application/json", "X-OpenChurch-Remote": "1" },
        body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401 && path !== "/api/session") showLogin();
        throw new Error(data.message || "The studio rejected this request.");
      }
      return data;
    } finally { clearTimeout(timer); }
  }
  function showLogin() {
    sessionEpoch++;
    authenticated = false;
    setConnected(false);
    $("login").hidden = false; $("desk").hidden = true; $("tabs").hidden = true;
    if (frameUrl) { URL.revokeObjectURL(frameUrl); frameUrl = null; }
    $("program-image").removeAttribute("src");
    $("program-image").hidden = true;
    releaseWakeLock();
  }
  function showDesk() {
    authenticated = true; $("login").hidden = true; $("desk").hidden = false; $("tabs").hidden = false;
  }
  function element(tag, text, className) {
    const node = document.createElement(tag); if (text !== undefined) node.textContent = text;
    if (className) node.className = className; return node;
  }
  function options(select, values, selected) {
    select.replaceChildren(...values.map(({ id, label }) => { const option = element("option", label); option.value = id; return option; }));
    if (values.some(value => value.id === selected)) select.value = selected;
  }
  function render(next) {
    state = next;
    $("station").textContent = state.stationName || "Main studio";
    $("program-name").textContent = state.scenes.find(scene => scene.id === state.programSceneId)?.name || "No scene";
    $("preview-name").textContent = "Preview: " + (state.scenes.find(scene => scene.id === state.previewSceneId)?.name || "—");
    $("stream-state").textContent = "STREAM " + state.streamStatus.toUpperCase();
    $("stream-state").className = state.streamStatus === "live" ? "active" : "";
    $("record-state").textContent = state.isRecording ? "REC ● " + Math.floor(state.recordingSeconds / 60) + ":" + String(state.recordingSeconds % 60).padStart(2, "0") : "REC OFF";
    $("record-state").className = state.isRecording ? "warning" : "";
    $("output-state").textContent = state.isBlack ? "BLACK" : state.isFrozen ? "FROZEN" : "PROGRAM";
    $("output-state").className = state.isBlack || state.isFrozen ? "warning" : "";
    $("black").textContent = state.isBlack ? "Restore Program" : "Black out";
    $("black").setAttribute("aria-pressed", String(state.isBlack));
    $("freeze").textContent = state.isFrozen ? "Unfreeze Program" : "Freeze Program";
    $("freeze").setAttribute("aria-pressed", String(state.isFrozen));
    $("record").textContent = state.isRecording ? "Stop recording" : "Start recording";
    $("hide-lower").textContent = state.lowerThirdHidden ? "Show lower third" : "Hide lower third";
    $("scripture-source").textContent = state.scriptureSource;
    document.querySelectorAll("[data-mode]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.mode === state.textMode)));
    if (!gainDirty && document.activeElement !== $("master-gain")) { $("master-gain").value = String(Math.round(state.masterGain * 100)); $("gain-value").textContent = $("master-gain").value + "%"; }
    const nextSceneKey = JSON.stringify([state.scenes, state.previewSceneId, state.programSceneId]);
    if (nextSceneKey !== sceneKey) {
      sceneKey = nextSceneKey;
      $("scenes").replaceChildren(...state.scenes.filter(scene => scene.enabled).map(scene => {
        const live = scene.id === state.programSceneId, preview = scene.id === state.previewSceneId;
        const tile = element("article", undefined, "scene" + (live ? " on-air" : preview ? " cued" : ""));
        tile.append(element("span", live ? "● ON PROGRAM" : preview ? "● PREVIEW" : "READY", "badge"), element("span", scene.name, "scene-name"), element("span", scene.cameras.join(" · ") || "Scene", "scene-meta"));
        const actions = element("div", undefined, "two-grid");
        [["Preview", "scene-preview"], ["Go live", "scene-live"]].forEach(([label, action]) => {
          const button = element("button", label); button.dataset.control = "";
          button.addEventListener("click", () => command({ action, sceneId: scene.id })); actions.append(button);
        });
        tile.append(actions); return tile;
      }));
      if (!state.scenes.some(scene => scene.enabled)) $("scenes").append(element("p", "Create scenes and add cameras on the desktop to begin.", "hint"));
    }
    const nextSlideKey = JSON.stringify([state.slides, state.activeSlideId]);
    if (nextSlideKey !== slideKey) {
      slideKey = nextSlideKey;
      const selected = lastActiveSlideId === state.activeSlideId && state.slides.some(slide => slide.id === $("slide").value) ? $("slide").value : state.activeSlideId;
      lastActiveSlideId = state.activeSlideId;
      options($("slide"), state.slides.map(slide => ({ id: slide.id, label: (slide.deckTitle || slide.reference || slide.title || slide.kind || "Text") + " · " + slide.text.slice(0, 55) })), selected);
      updateSlidePreview();
    }
    const liveSlide = state.slides.find(slide => slide.id === state.programSlideId);
    const staged = state.slides.find(slide => slide.id === state.activeSlideId);
    $("live-slide").textContent = "Staged: " + (staged?.reference || staged?.text.slice(0, 80) || "None") + " · Live: " + (liveSlide?.reference || liveSlide?.text.slice(0, 80) || "None");
    const nextTickerKey = JSON.stringify(state.tickers.map(ticker => [ticker.id, ticker.name]));
    if (nextTickerKey !== tickerKey) {
      tickerKey = nextTickerKey;
      options($("ticker-source"), state.tickers.map(ticker => ({ id: ticker.id, label: ticker.name })), selectedTicker);
    }
    if (!tickerDirty || !state.tickers.some(ticker => ticker.id === selectedTicker)) loadTicker();
    $("ticker-empty").hidden = state.tickers.length > 0;
    availability();
  }
  function updateSlidePreview() {
    const slide = state?.slides.find(slide => slide.id === $("slide").value);
    $("slide-preview").textContent = slide ? [slide.reference, slide.text].filter(Boolean).join("\n\n") : "No presentation slides yet. Stage text or load Scripture.";
  }
  function loadTicker() {
    selectedTicker = $("ticker-source").value;
    const ticker = state?.tickers.find(ticker => ticker.id === selectedTicker);
    tickerDirty = false;
    if (!ticker) return;
    $("ticker-text").value = ticker.text; $("ticker-speed").value = String(ticker.speed); $("ticker-direction").value = ticker.direction;
    $("ticker-enabled").checked = ticker.enabled; $("ticker-paused").checked = ticker.paused;
  }
  async function refresh() {
    if (locking) return;
    const epoch = sessionEpoch;
    const result = await api("/api/state");
    if (epoch !== sessionEpoch || locking) return;
    showDesk(); if (result.state) render(result.state); setConnected(result.online && Boolean(result.state));
  }
  async function poll() {
    try { await refresh(); } catch { setConnected(false); }
    setTimeout(poll, document.hidden ? 5000 : 1000);
  }
  async function confirm(title, message) {
    $("confirm-title").textContent = title; $("confirm-message").textContent = message;
    return new Promise(resolve => { $("confirm").addEventListener("close", () => resolve($("confirm").returnValue === "confirm"), { once: true }); $("confirm").showModal(); });
  }
  async function command(payload, confirmation) {
    if (!connected || busy) return;
    if (confirmation && !await confirm(confirmation[0], confirmation[1])) return;
    if (!connected || busy) return;
    busy = true; availability(); toast("Sending to studio…");
    try {
      const id = globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
      const result = await api("/api/command", { id, command: payload });
      toast(result.message, !result.ok);
      await refresh();
      return result.ok;
    } catch (error) {
      toast("Command not confirmed. " + (error.name === "AbortError" ? "Check live status before trying again." : error.message), true);
      setConnected(false);
    } finally { busy = false; availability(); }
  }
  $("login-form").addEventListener("submit", async event => {
    event.preventDefault(); const button = event.target.querySelector("button"); button.disabled = true;
    $("login-message").textContent = "Connecting…";
    try { await api("/api/session", { pin: $("pin").value }); sessionEpoch++; $("pin").value = ""; $("login-message").textContent = ""; await refresh(); }
    catch (error) { $("login-message").textContent = error.name === "AbortError" ? "Studio unreachable. Check the address and connection." : error.message; }
    finally { button.disabled = false; }
  });
  $("lock").addEventListener("click", async () => {
    if (locking) return;
    locking = true; sessionEpoch++; setConnected(false);
    try { await api("/api/logout", {}); showLogin(); } catch { toast("Could not lock the session. Reconnect and tap Lock again.", true); }
    finally { locking = false; }
  });
  document.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => {
    activeTab = button.dataset.tab;
    document.querySelectorAll(".tab-panel").forEach(panel => panel.hidden = panel.id !== "tab-" + activeTab);
    document.querySelectorAll("[data-tab]").forEach(tab => tab === button ? tab.setAttribute("aria-current", "page") : tab.removeAttribute("aria-current"));
    $("cue-panel").hidden = activeTab !== "text" && activeTab !== "scripture";
  }));
  $("take").onclick = () => command({ action: "take", transition: $("transition").value });
  $("black").onclick = () => command({ action: "black", enabled: !state.isBlack }, state.isBlack ? null : ["Black out Program?", "All Program outputs, including recordings and streams, will show black until restored."]);
  $("freeze").onclick = () => command({ action: "freeze", enabled: !state.isFrozen });
  $("record").onclick = () => command({ action: "record", enabled: !state.isRecording }, state.isRecording ? ["Stop recording?", "The studio computer will finish and save the current recording."] : null);
  $("text-form").onsubmit = event => { event.preventDefault(); command({ action: "text-stage", title: $("text-title").value, text: $("text-body").value, lines: Number($("text-lines").value) }); };
  $("scripture-form").onsubmit = event => { event.preventDefault(); command({ action: "scripture-stage", reference: $("reference").value }); };
  $("slide").onchange = updateSlidePreview;
  $("cue-slide").onclick = () => command({ action: "slide-cue", slideId: $("slide").value, live: false });
  $("show-text").onclick = () => command({ action: "text-live" });
  $("previous-slide").onclick = () => command({ action: "slide-step", direction: -1, live: true });
  $("next-slide").onclick = () => command({ action: "slide-step", direction: 1, live: true });
  $("hide-lower").onclick = () => command({ action: "lower-third", enabled: state.lowerThirdHidden });
  $("clear-text").onclick = () => command({ action: "text-clear" });
  document.querySelectorAll("[data-mode]").forEach(button => button.onclick = () => command({ action: "text-mode", mode: button.dataset.mode }));
  $("ticker-source").onchange = loadTicker;
  $("ticker-form").addEventListener("input", () => tickerDirty = true);
  $("ticker-form").onsubmit = async event => {
    event.preventDefault(); const applied = await command({ action: "ticker", sourceId: $("ticker-source").value, text: $("ticker-text").value, speed: Number($("ticker-speed").value), direction: $("ticker-direction").value, enabled: $("ticker-enabled").checked, paused: $("ticker-paused").checked });
    if (applied) tickerDirty = false;
  };
  $("master-gain").oninput = () => { gainDirty = true; $("gain-value").textContent = $("master-gain").value + "%"; };
  $("audio-form").onsubmit = async event => { event.preventDefault(); if (await command({ action: "master-gain", gain: Number($("master-gain").value) / 100 })) gainDirty = false; };
  $("monitor-toggle").onclick = () => {
    monitorPaused = !monitorPaused; $("monitor-toggle").textContent = monitorPaused ? "Resume monitor" : "Pause monitor";
    $("monitor-note").textContent = "Monitor paused · controls remain active"; $("monitor-note").hidden = !monitorPaused;
  };
  async function monitor() {
    if (authenticated && connected && !monitorPaused && !document.hidden) {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 4000);
      try {
        const response = await fetch("/api/frame", { cache: "no-store", signal: controller.signal });
        if (response.status === 200) {
          const blob = await response.blob();
          if (connected && authenticated && !monitorPaused) {
            const previous = frameUrl; frameUrl = URL.createObjectURL(blob); $("program-image").src = frameUrl;
            $("program-image").hidden = false;
            $("monitor-note").hidden = true; if (previous) URL.revokeObjectURL(previous);
          }
        } else { $("monitor-note").textContent = "Waiting for Program picture…"; $("monitor-note").hidden = false; }
      } catch { $("monitor-note").textContent = "Picture unavailable · checking connection…"; $("monitor-note").hidden = false; }
      finally { clearTimeout(timer); }
    }
    setTimeout(monitor, 1000);
  }
  window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); installPrompt = event; $("install").hidden = false; });
  $("install").onclick = async () => { if (installPrompt) { await installPrompt.prompt(); installPrompt = null; $("install").hidden = true; } };
  async function releaseWakeLock() { if (wakeLock) { await wakeLock.release().catch(() => {}); wakeLock = null; } }
  async function acquireWakeLock() {
    if (!$("awake").checked || !authenticated || document.hidden) return;
    try { if (!wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => wakeLock = null); } }
    catch { toast("Screen wake lock is unavailable. Check the device’s auto-lock setting."); }
    if (!navigator.wakeLock) toast("Use the device’s auto-lock setting to keep the screen on.");
  }
  $("awake").onchange = () => $("awake").checked ? acquireWakeLock() : releaseWakeLock();
  document.addEventListener("visibilitychange", () => { if (document.hidden) { setConnected(false); releaseWakeLock(); } else { refresh().catch(() => setConnected(false)); acquireWakeLock(); } });
  window.addEventListener("offline", () => setConnected(false));
  window.addEventListener("online", () => refresh().catch(() => setConnected(false)));
  $("share").onclick = async () => {
    const url = location.origin + "/operator";
    try { if (navigator.share) await navigator.share({ title: "OpenChurch Remote", url }); else { await navigator.clipboard.writeText(url); toast("Remote address copied. Share the PIN separately."); } }
    catch (error) { if (error.name !== "AbortError") toast("Remote address: " + url); }
  };
  // Remove old PIN links from browser history without reading or storing them.
  if (location.search || location.hash) history.replaceState(null, "", "/operator");
  if ("serviceWorker" in navigator && window.isSecureContext) navigator.serviceWorker.register("/sw.js").catch(() => {});
  availability(); poll(); monitor();
})();
