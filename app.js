import { CommandProtocol } from "./protocol.js";
import {
  appStore, ConnectionStatus, connectWifi, disconnect, send, startDemoMode,
  setTimeSyncOnConnect, setUiScale, setThemeMode, setClockFormat, setLanguage, lastKnownHost
} from "./store.js";

const STR = {
  fa: {
    appTitle: "MrAqua", connect: "اتصال", home: "خانه", sensors: "سنسورها", settings: "تنظیمات", more: "بیشتر",
    connectTitle: "اتصال به مدار", connectHost: "آدرس IP دستگاه", connectPort: "پورت",
    connectBtn: "اتصال", tryDemo: "حالت نمایشی (بدون سخت‌افزار)", connecting: "در حال اتصال…",
    connected: "متصل", disconnected: "متصل نیست", errorConn: "خطا در اتصال",
    disconnect: "قطع اتصال", waterTemp: "دمای آب", heatsinkTemp: "دمای هیت‌سینک", internalTemp: "دمای داخل",
    tempUnitSection: "واحد دما", celsius: "سلسیوس", fahrenheit: "فارنهایت",
    themeSection: "پوسته", themeLight: "روشن", themeDark: "تیره", themeAuto: "خودکار",
    clockFormatSection: "فرمت ساعت", hour12: "۱۲ ساعته", hour24: "۲۴ ساعته",
    interfaceSize: "اندازه رابط", languageSection: "زبان", persian: "فارسی", english: "English",
    timeSyncTitle: "همگام‌سازی ساعت با سخت‌افزار",
    timeSyncDesc: "بلافاصله بعد از اتصال، تاریخ و ساعت دقیق گوشی فرستاده می‌شود.",
    lastSyncLabel: "آخرین همگام‌سازی", lastSyncNever: "هیچ‌وقت",
    outletsSection: "خروجی‌ها", comingSoon: "این بخش هنوز در حال ساخته‌شدنه — به‌زودی اضافه می‌شه.",
    demoBadge: "حالت نمایشی — به مدار واقعی وصل نیست"
  }
};
const t = (key) => STR.fa[key] ?? key;

const NAV = [
  { route: "home", icon: "🏠", label: () => t("home") },
  { route: "sensors", icon: "🌡️", label: () => t("sensors") },
  { route: "settings", icon: "⚙️", label: () => t("settings") },
  { route: "more", icon: "▦", label: () => t("more") }
];

const MORE_SCREENS = ["outlets", "dosing", "ato", "lighting", "feeding", "waterParams", "journal", "alerts"];
const MORE_ICONS = { outlets: "🔌", dosing: "💧", ato: "🌊", lighting: "💡", feeding: "🐟", waterParams: "🧪", journal: "📓", alerts: "🔔" };
const MORE_LABELS_FA = { outlets: "خروجی‌ها", dosing: "دوزینگ", ato: "ATO", lighting: "نور", feeding: "تغذیه", waterParams: "پارامترهای آب", journal: "دفترچه", alerts: "هشدارها" };

function currentRoute() {
  const h = location.hash.replace("#/", "");
  return h || (appStore.get().connectionStatus === ConnectionStatus.CONNECTED ? "home" : "connect");
}

function statusDotClass(status) {
  if (status === ConnectionStatus.CONNECTED) return "connected";
  if (status === ConnectionStatus.CONNECTING) return "connecting";
  if (status === ConnectionStatus.ERROR) return "error";
  return "";
}
function statusLabel(status) {
  if (status === ConnectionStatus.CONNECTED) return t("connected");
  if (status === ConnectionStatus.CONNECTING) return t("connecting");
  if (status === ConnectionStatus.ERROR) return t("errorConn");
  return t("disconnected");
}

function glowTile({ icon, label, active, color = "var(--aqua)", onClick }) {
  const id = "gt_" + Math.random().toString(36).slice(2);
  setTimeout(() => document.getElementById(id)?.addEventListener("click", onClick), 0);
  return `
    <div class="glow-tile-wrap ${active ? "active" : "off"}">
      <button id="${id}" class="glow-tile ${active ? "active" : ""}" style="--tile-color:${color}">${icon}</button>
      <span class="tile-label">${label}</span>
    </div>`;
}

function sectionCard(label, innerHtml) {
  return `<div class="section"><div class="section-label">${label}</div><div class="card">${innerHtml}</div></div>`;
}

// ---------------- Screens ----------------

function renderConnect() {
  const last = lastKnownHost();
  return `
    <div class="screen">
      ${sectionCard(t("connectTitle"), `
        <div class="row"><span class="label">${t("connectHost")}</span></div>
        <input id="hostInput" class="textfield" placeholder="192.168.1.50" value="${last?.host ?? ""}" style="margin-top:6px" inputmode="decimal">
        <div class="row" style="margin-top:12px"><span class="label">${t("connectPort")}</span></div>
        <input id="portInput" class="textfield" placeholder="81" value="${last?.port ?? 81}" style="margin-top:6px" inputmode="numeric">
        <button id="connectBtn" class="btn-primary" style="margin-top:16px">${t("connectBtn")}</button>
        <button id="demoBtn" class="btn-ghost" style="margin-top:10px">${t("tryDemo")}</button>
        <p class="hint">این نسخه‌ی وب فقط از طریق Wi‑Fi (WebSocket) وصل می‌شه — بلوتوث توی مرورگر آیفون در دسترس نیست.</p>
      `)}
    </div>`;
}

function bindConnectScreen() {
  document.getElementById("connectBtn")?.addEventListener("click", () => {
    const host = document.getElementById("hostInput").value.trim();
    const port = Number(document.getElementById("portInput").value.trim() || 81);
    if (!host) return;
    connectWifi(host, port);
    location.hash = "#/home";
  });
  document.getElementById("demoBtn")?.addEventListener("click", () => {
    startDemoMode();
    location.hash = "#/home";
  });
}

function renderHome() {
  const s = appStore.get();
  const st = s.aquariumState;
  const outlets = st?.outlets ?? {};
  const outletTiles = Object.entries(outlets).map(([wire, o]) =>
    glowTile({
      icon: MORE_ICONS[wire.toLowerCase()] ?? "🔌",
      label: wire,
      active: !!o.on,
      color: o.on ? "var(--aqua)" : "var(--muted)",
      onClick: () => send(CommandProtocol.outletOn ? (o.on ? CommandProtocol.outletOff(wire) : CommandProtocol.outletOn(wire)) : "")
    })
  ).join("");

  return `
    <div class="screen">
      ${s.demoMode ? `<div class="section"><div class="card" style="background:color-mix(in srgb, var(--warmth) 18%, var(--panel));"><span class="hint" style="color:var(--warmth);margin:0">${t("demoBadge")}</span></div></div>` : ""}
      ${sectionCard("وضعیت کلی", `
        <div class="row">
          <span class="label">${t("waterTemp")}</span>
          <span class="value">${st?.sensors?.water?.currentTemp?.toFixed(1) ?? "--"}°</span>
        </div>
        <div class="row">
          <span class="label">${t("heatsinkTemp")}</span>
          <span class="value">${st?.sensors?.heatsink?.currentTemp?.toFixed(1) ?? "--"}°</span>
        </div>
        <div class="row">
          <span class="label">${t("internalTemp")}</span>
          <span class="value">${st?.sensors?.internal?.currentTemp?.toFixed(1) ?? "--"}°</span>
        </div>
      `)}
      ${sectionCard(t("outletsSection"), `<div class="glow-row">${outletTiles || "<span class='hint'>در انتظار داده…</span>"}</div>`)}
    </div>`;
}

function renderSensors() {
  const s = appStore.get();
  const sensors = s.aquariumState?.sensors;
  const isCelsius = (sensors?.unit ?? "CELSIUS") === "CELSIUS";
  return `
    <div class="screen">
      ${sectionCard(t("tempUnitSection"), `
        <div class="glow-row">
          ${glowTile({ icon: "🌡️", label: t("celsius"), active: isCelsius, color: "var(--signal)", onClick: () => send(CommandProtocol.tempUnit(true)) })}
          ${glowTile({ icon: "🌡️", label: t("fahrenheit"), active: !isCelsius, color: "var(--warmth)", onClick: () => send(CommandProtocol.tempUnit(false)) })}
        </div>
      `)}
      ${sectionCard("سنسورها", `
        <div class="row"><span class="label">${t("waterTemp")}</span><span class="value">${sensors?.water?.currentTemp?.toFixed(1) ?? "--"}°</span></div>
        <div class="row"><span class="label">${t("heatsinkTemp")}</span><span class="value">${sensors?.heatsink?.currentTemp?.toFixed(1) ?? "--"}°</span></div>
        <div class="row"><span class="label">${t("internalTemp")}</span><span class="value">${sensors?.internal?.currentTemp?.toFixed(1) ?? "--"}°</span></div>
      `)}
    </div>`;
}

function renderSettings() {
  const s = appStore.get();
  const lastSync = s.lastTimeSyncMs ? new Date(s.lastTimeSyncMs).toLocaleString("fa-IR") : t("lastSyncNever");
  return `
    <div class="screen">
      ${sectionCard(t("languageSection"), `
        <div class="chipset">
          <button class="chip ${s.language === "fa" ? "selected" : ""}" data-lang="fa">${t("persian")}</button>
          <button class="chip ${s.language === "en" ? "selected" : ""}" data-lang="en">${t("english")}</button>
        </div>
      `)}
      ${sectionCard(t("themeSection"), `
        <div class="glow-row">
          ${glowTile({ icon: "☀️", label: t("themeLight"), active: s.themeMode === "light", color: "var(--warmth)", onClick: () => applyTheme("light") })}
          ${glowTile({ icon: "🌙", label: t("themeDark"), active: s.themeMode === "dark", color: "var(--signal)", onClick: () => applyTheme("dark") })}
          ${glowTile({ icon: "🌓", label: t("themeAuto"), active: s.themeMode === "auto", color: "var(--aqua)", onClick: () => applyTheme("auto") })}
        </div>
      `)}
      ${sectionCard(t("clockFormatSection"), `
        <div class="glow-row">
          ${glowTile({ icon: "🕐", label: t("hour12"), active: s.is12HourClock, color: "var(--aqua)", onClick: () => setClockFormat(true) })}
          ${glowTile({ icon: "🕓", label: t("hour24"), active: !s.is12HourClock, color: "var(--aqua)", onClick: () => setClockFormat(false) })}
        </div>
      `)}
      ${sectionCard(t("interfaceSize"), `
        <div class="row"><span class="label">۴۰٪</span><span class="value" id="scaleVal">${Math.round(s.uiScale * 100)}٪</span><span class="label">۱۰۰٪</span></div>
        <input type="range" id="scaleSlider" min="40" max="100" value="${Math.round(s.uiScale * 100)}">
      `)}
      ${sectionCard(t("timeSyncTitle"), `
        <div class="row">
          <span class="label">${t("timeSyncTitle")}</span>
          <label class="switch"><input type="checkbox" id="timeSyncToggle" ${s.timeSyncOnConnect ? "checked" : ""}><span class="slider-toggle"></span></label>
        </div>
        <p class="hint">${t("timeSyncDesc")}</p>
        <div class="row" style="margin-top:10px">
          <span class="label" style="font-size:12px;color:var(--muted)">${t("lastSyncLabel")}</span>
          <span class="value" style="color:var(--alive)">${lastSync}</span>
        </div>
      `)}
      ${sectionCard("اتصال", `
        <button id="disconnectBtn" class="btn-ghost">${t("disconnect")}</button>
      `)}
    </div>`;
}

function applyTheme(mode) {
  setThemeMode(mode);
  document.body.classList.toggle("theme-light", mode === "light");
}

function bindSettingsScreen() {
  document.querySelectorAll("[data-lang]").forEach((el) =>
    el.addEventListener("click", () => setLanguage(el.dataset.lang))
  );
  document.getElementById("scaleSlider")?.addEventListener("input", (e) => {
    document.getElementById("scaleVal").textContent = e.target.value + "٪";
    setUiScale(Number(e.target.value) / 100);
  });
  document.getElementById("timeSyncToggle")?.addEventListener("change", (e) => setTimeSyncOnConnect(e.target.checked));
  document.getElementById("disconnectBtn")?.addEventListener("click", () => {
    disconnect();
    location.hash = "#/connect";
  });
}

function renderMore() {
  const tiles = MORE_SCREENS.map((key) =>
    `<button class="chip" data-more="${key}" style="padding:14px 10px;flex-direction:column;display:flex;gap:6px;align-items:center;width:calc(50% - 8px)">
       <span style="font-size:20px">${MORE_ICONS[key]}</span>${MORE_LABELS_FA[key]}
     </button>`
  ).join("");
  return `<div class="screen">${sectionCard(t("more"), `<div style="display:flex;flex-wrap:wrap;gap:8px">${tiles}</div>`)}</div>`;
}

function bindMoreScreen() {
  document.querySelectorAll("[data-more]").forEach((el) =>
    el.addEventListener("click", () => alert(t("comingSoon")))
  );
}

// ---------------- Router / shell ----------------

function render() {
  const s = appStore.get();
  const route = currentRoute();
  document.documentElement.style.setProperty("--ui-scale", s.uiScale);
  document.body.classList.toggle("theme-light", s.themeMode === "light");

  let body, bind = () => {};
  if (route === "connect" || s.connectionStatus !== ConnectionStatus.CONNECTED) {
    body = renderConnect(); bind = bindConnectScreen;
  } else if (route === "sensors") { body = renderSensors(); }
  else if (route === "settings") { body = renderSettings(); bind = bindSettingsScreen; }
  else if (route === "more") { body = renderMore(); bind = bindMoreScreen; }
  else { body = renderHome(); }

  const showNav = s.connectionStatus === ConnectionStatus.CONNECTED;
  document.getElementById("app").innerHTML = `
    <div class="topbar">
      <span class="title">${t("appTitle")}</span>
      <span class="status-pill"><span class="status-dot ${statusDotClass(s.connectionStatus)}"></span>${statusLabel(s.connectionStatus)}</span>
    </div>
    ${body}
    ${showNav ? `
      <nav class="bottomnav">
        ${NAV.map((n) => `
          <button class="navbtn ${route === n.route ? "active" : ""}" data-route="${n.route}">
            <span class="icon">${n.icon}</span>${n.label()}
          </button>`).join("")}
      </nav>` : ""}
  `;

  document.querySelectorAll("[data-route]").forEach((el) =>
    el.addEventListener("click", () => { location.hash = "#/" + el.dataset.route; })
  );
  bind();
}

window.addEventListener("hashchange", render);
appStore.subscribe(render);
render();
