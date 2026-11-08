const fs = require("fs"), path = require("path");

module.exports = async function verifyPresentationControls(window, root) {
  const results = await window.webContents.executeJavaScript(`(${browserVerification.toString()})(${JSON.stringify(root.replace(/\\/g, "/"))})`, true);
  await window.webContents.capturePage();
  fs.writeFileSync(path.join(root, "tmp/presentation-controls.png"), (await window.webContents.capturePage()).toPNG());
  return results;
};

async function browserVerification(root) {
  const { useAppStore: store } = await import("/store/useAppStore.ts");
  const { default: React } = await import("/@fs/" + root + "/node_modules/.vite/deps/react.js");
  const { default: ReactDOM } = await import("/@fs/" + root + "/node_modules/.vite/deps/react-dom_client.js");
  const { default: Controls } = await import("/components/DisplayTextControls.tsx");
  const { default: LowerThird } = await import("/components/LowerThirdPanel.tsx");
  const { default: Schedule } = await import("/components/ServiceSchedulePanel.tsx");
  const { default: Scripture } = await import("/components/ScripturePanel.tsx");
  const { default: Sanctuary } = await import("/components/SanctuaryLayout.tsx");
  const { getSanctuaryDisplayState } = await import("/utils/sanctuaryContent.ts");
  const { lowerThirdDesignPresets } = await import("/@fs/" + root + "/src/shared/lowerThirdDesign.ts");
  const { defaultSanctuaryDisplay } = await import("/@fs/" + root + "/src/shared/sanctuaryDisplay.ts");
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const checks = [], hosts = [];
  const assert = (value, message) => { if (!value) throw Error(message); checks.push(message); };
  const until = async (test, label) => { for (let i = 0; i < 100; i++) { if (await test()) return; await wait(60); } throw Error("Timed out: " + label); };
  const mount = (Component, props, width = 320) => {
    const box = document.createElement("div"); box.style.cssText = `position:fixed;right:0;top:0;width:${width}px;max-height:95vh;overflow:auto;z-index:9999;background:#101722;padding:10px;box-sizing:border-box`;
    document.body.append(box); const mounted = ReactDOM.createRoot(box); mounted.render(React.createElement(Component, props)); hosts.push({ box, mounted }); return box;
  };
  const button = (box, text) => [...box.querySelectorAll("button")].find(b => b.textContent === text);
  const click = async (box, text) => { await until(() => button(box, text) && !button(box, text).disabled, text); button(box, text).click(); await wait(80); };
  const set = (box, selector, value) => {
    const input = box.querySelector(selector); if (!input) throw Error("Missing input " + selector);
    const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(input, value); input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  };
  const colorImage = color => { const c = document.createElement("canvas"); c.width = c.height = 80; c.getContext("2d").fillStyle = color; c.getContext("2d").fillRect(0, 0, 80, 80); return c.toDataURL(); };
  const count = (canvas, r, g, b) => {
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data; let n = 0;
    for (let i = 0; i < data.length; i += 4) if (Math.abs(data[i] - r) < 12 && Math.abs(data[i + 1] - g) < 12 && Math.abs(data[i + 2] - b) < 12 && data[i + 3] > 200) n++;
    return n;
  };
  const canvases = () => [...document.querySelectorAll(".preview-pane canvas,.program-pane canvas")];
  const logoUrl = colorImage("#ff00ff");
  const scene = { id: "presentation-test", name: "Presentation test", sourceIds: ["backdrop"] };
  const source = { id: "backdrop", name: "Backdrop", type: "image", enabled: true, audioEnabled: false, rect: { x: 0, y: 0, width: 100, height: 100 }, data: { url: colorImage("#123044") } };
  const originalFrame = window.dualcast.sendLowerThirdFrame, originalScripture = window.dualcast.fetchScripture;
  const frames = [];
  window.dualcast.sendLowerThirdFrame = frame => { frames.push(frame); if (frames.length > 20) frames.shift(); };
  const decode = async frame => { const image = new Image(); image.src = frame; await image.decode(); const c = document.createElement("canvas"); c.width = image.width; c.height = image.height; c.getContext("2d").drawImage(image, 0, 0); return c; };
  try {
    const lower = store.getState().settings.lowerThird;
    store.setState({ isCutToBlack: false, isFrozen: false, isLowerThirdHidden: false, displayTextMode: "show", isLowerThirdProjecting: true,
      settings: { ...store.getState().settings, outputResolution: "720p", qualityPreset: "low", audioMode: "none", serviceSchedules: [],
        lowerThird: { ...lower, imageUrl: logoUrl, bibleImageUrl: logoUrl, textColor: "#00ff00", entranceAnimation: "none", exitAnimation: "none", animationDurationMs: 100, slides: [], activeSlideId: null, programSlideId: null, showOnProgram: true } } });
    store.getState().setStudioState({ scenes: [scene], sources: { backdrop: source }, groups: [], previewSceneId: scene.id, programSceneId: scene.id });
    const controls = mount(Controls, {}, 620);
    for (const mode of ["classic", "designer"]) for (const kind of ["text", "scripture"]) {
      const design = structuredClone(lowerThirdDesignPresets[0].design); design.content.color = "#00ff00";
      await store.getState().updateSettings({ lowerThird: { ...store.getState().settings.lowerThird, mode, design } });
      store.getState().setDisplayTextMode("show");
      const slide = { id: mode + kind, kind, text: "Text remains visible", title: "A title", reference: kind === "scripture" ? "John 3:16" : "" };
      await store.getState().stageLowerThird([slide], slide.id, true);
      await until(() => canvases().length === 2 && canvases().every(c => count(c, 255, 0, 255) > 30), mode + " logo before hide");
      await click(controls, "Text Only (No Logo)");
      await until(() => canvases().every(c => count(c, 255, 0, 255) === 0 && count(c, 0, 255, 0) > 15), mode + " text only pixels");
      await wait(200);
      const output = await decode(frames.at(-1));
      assert(count(output, 255, 0, 255) === 0 && count(output, 0, 255, 0) > 15, mode + " " + kind + ": text without logo on Preview, Program and dedicated lower-third output");
      assert(store.getState().settings.lowerThird.imageUrl === logoUrl && store.getState().settings.lowerThird.bibleImageUrl === logoUrl, mode + " " + kind + ": configured logos retained");
      await click(controls, "Show Text"); await until(() => canvases().every(c => count(c, 255, 0, 255) > 30), "restore logo");
    }
    const independentState = { ...getSanctuaryDisplayState(store.getState()), settings: { ...defaultSanctuaryDisplay, mode: "independent" }, textMode: "text-only" };
    const independent = mount(Sanctuary, { state: independentState }); await wait(150);
    assert(independent.querySelector(".sanctuary-text")?.textContent.includes("Text remains visible"), "Independent sanctuary keeps text in text-only mode");
    hosts.at(-1).mounted.unmount(); independent.remove(); hosts.pop();
    store.setState({ isLowerThirdHidden: true }); await click(controls, "Text Only (No Logo)"); assert(!store.getState().isLowerThirdHidden, "Text-only button restores a hidden lower third in one click");
    await store.getState().updateSettings({ lowerThird: { ...store.getState().settings.lowerThird, mode: "classic" } });
    const panel = mount(LowerThird, {}); await wait(150);
    await click(panel, "Clear All Slides"); assert(store.getState().settings.lowerThird.slides.length > 0, "Clear-all confirmation leaves slides intact before approval");
    await click(panel, "Cancel"); assert(store.getState().settings.lowerThird.slides.length > 0, "Cancel preserves the slide queue");
    await click(panel, "Clear All Slides"); await click(panel, "Confirm Clear All Slides");
    await until(() => !store.getState().settings.lowerThird.slides.length, "queue cleared");
    assert(!store.getState().settings.lowerThird.activeSlideId && !store.getState().settings.lowerThird.programSlideId, "Clear all removes Preview and Program cue IDs together");
    await until(() => canvases().every(c => count(c, 0, 255, 0) === 0), "cleared output pixels");
    const baseline = store.getState().programRevision;
    const service = { id: "sunday-test", name: "Sunday service", date: "", items: [] };
    await store.getState().updateSettings({ serviceSchedules: [service] }); store.setState({ activeScheduleId: service.id });
    set(panel, "#manualLowerThird", "Welcome announcement"); await wait(30); panel.querySelector('[aria-label="Add manual text to schedule"]').click();
    await until(() => store.getState().settings.serviceSchedules[0].items.length === 1, "manual schedule add");
    set(panel, '[aria-label="Song or presentation title"]', "Test hymn"); set(panel, "#bulkLowerThird", "First line\nSecond line\n\nThird line\nFourth line"); await wait(30);
    panel.querySelector('[aria-label="Add song or lyrics to schedule"]').click();
    await until(() => store.getState().settings.serviceSchedules[0].items.length === 2, "lyrics schedule add");
    assert(panel.querySelector("#bulkLowerThird").value.startsWith("First line"), "Adding typed lyrics retains the editor draft");
    const hymn = store.getState().settings.serviceSchedules[0].items[1];
    assert(hymn.kind === "slides" && hymn.slides.length === 2 && hymn.slides[0].text.includes("First line"), "Typed hymn saves as ordered slides without showing it live");
    await click(panel, "Designer · Title + Content"); set(panel, '[aria-label="Designer title"]', "Presenter"); set(panel, '[aria-label="Designer content"]', "An edited card"); await wait(30);
    panel.querySelector('[aria-label="Add designer card to schedule"]').click(); await until(() => store.getState().settings.serviceSchedules[0].items.length === 3, "designer schedule add");
    window.dualcast.fetchScripture = async ({ reference }) => ({ reference, text: "<b>For God so loved the world</b>", verses: [{ reference, text: "<b>For God so loved the world</b>" }] });
    const scripture = mount(Scripture, {}); await wait(150); scripture.querySelector('[aria-label="Add selected Scripture to schedule"]').click();
    await until(() => store.getState().settings.serviceSchedules[0].items.length === 4, "scripture schedule add");
    assert(store.getState().programRevision === baseline && !store.getState().settings.lowerThird.programSlideId, "Direct additions preserve Program, Preview and the live presentation");
    const routed = [];
    const schedule = mount(Schedule, { onOpenItem: item => routed.push(item.kind === "slides" ? item.slides[0].kind : item.kind) }); await wait(150);
    await until(() => schedule.querySelectorAll(".schedule-item-select").length === 4, "schedule hydration");
    const items = () => [...schedule.querySelectorAll(".schedule-items li")];
    const itemButton = title => [...schedule.querySelectorAll(".schedule-item-select")].find(b => b.querySelector("strong").textContent === title);
    store.setState({ isFrozen: true, isCutToBlack: true, isLowerThirdHidden: true, manualBlend: .4 }); itemButton("Test hymn").click();
    await until(() => store.getState().settings.lowerThird.programSlideId?.endsWith(hymn.id + ":0"), "one click hymn");
    assert(!store.getState().isFrozen && !store.getState().isCutToBlack && !store.getState().isLowerThirdHidden && store.getState().manualBlend === 0, "Schedule clicks restore live text from frozen, black, hidden and blended states");
    await click(schedule, "Next · Live"); await until(() => store.getState().settings.lowerThird.programSlideId?.endsWith(hymn.id + ":1"), "next hymn slide");
    await until(() => !itemButton("Test hymn").disabled, "hymn ready"); itemButton("Test hymn").click(); await until(() => store.getState().settings.lowerThird.programSlideId?.endsWith(hymn.id + ":0"), "restart hymn");
    assert(routed.at(-1) === "song", "A hymn click opens its presentation controls and starts at slide one");
    await until(() => !itemButton("John 3:16").disabled, "Scripture ready"); itemButton("John 3:16").click(); await until(() => scripture.querySelector("#resolvedReference")?.value === "John 3:16", "scripture panel routed");
    assert(routed.at(-1) === "scripture" && scripture.querySelector("#scriptureText").value === "For God so loved the world", "Scripture clicks populate its editor with clean text and show it live");
    const originalOrder = store.getState().settings.serviceSchedules[0].items.map(item => item.id), liveId = store.getState().settings.lowerThird.programSlideId;
    const transfer = new DataTransfer(), dragged = items()[0].querySelector(".schedule-drag-handle"), target = items()[2];
    dragged.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer })); await wait(30);
    target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer })); target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    await until(() => store.getState().settings.serviceSchedules[0].items[2].id === originalOrder[0], "drag reorder");
    assert(store.getState().settings.lowerThird.programSlideId === liveId, "Dragging schedule items persists their order without changing the live slide");
    assert(schedule.scrollWidth <= schedule.clientWidth + 2, "Schedule and drag controls fit a 320px dock");
    await store.getState().clearLowerThirdSlides(); await until(() => !schedule.querySelector(".schedule-items .current"), "schedule live indicator cleared");
    assert(store.getState().settings.serviceSchedules[0].items.length === 4, "Clearing slides retains saved service items for replay");
    return { ok: true, checks, engine: navigator.userAgent };
  } finally { for (const host of hosts) { host.mounted.unmount(); host.box.remove(); } window.dualcast.sendLowerThirdFrame = originalFrame; window.dualcast.fetchScripture = originalScripture; store.setState({ isLowerThirdProjecting: false }); }
}
