import { CommandProtocol } from "./protocol.js";

// Connection status enum — mirrors model/ConnectionStatus.kt
export const ConnectionStatus = {
  DISCONNECTED: "DISCONNECTED",
  CONNECTING: "CONNECTING",
  CONNECTED: "CONNECTED",
  ERROR: "ERROR"
};

const LS_KEY_LAST_HOST = "mraqua_last_host";
const LS_KEY_TIME_SYNC = "mraqua_time_sync_on_connect";
const LS_KEY_LAST_SYNC = "mraqua_last_time_sync_ms";
const LS_KEY_UI_SCALE = "mraqua_ui_scale";
const LS_KEY_THEME = "mraqua_theme_mode";
const LS_KEY_CLOCK_FMT = "mraqua_clock_12h";
const LS_KEY_LANG = "mraqua_language";

/**
 * Tiny pub/sub store. Every screen subscribes to the bits of state it cares about instead of
 * each holding its own copy — same idea as the StateFlow fields on AquariumViewModel.
 */
function createStore(initial) {
  let state = initial;
  const listeners = new Set();
  return {
    get: () => state,
    set: (patch) => {
      state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
      listeners.forEach((l) => l(state));
    },
    subscribe: (fn) => { listeners.add(fn); fn(state); return () => listeners.delete(fn); }
  };
}

export const appStore = createStore({
  connectionStatus: ConnectionStatus.DISCONNECTED,
  connectedHost: null,
  aquariumState: null,       // last STATUS? payload, parsed
  demoMode: false,
  timeSyncOnConnect: localStorage.getItem(LS_KEY_TIME_SYNC) !== "false", // default true
  lastTimeSyncMs: Number(localStorage.getItem(LS_KEY_LAST_SYNC)) || null,
  uiScale: Number(localStorage.getItem(LS_KEY_UI_SCALE)) || 1.0,
  themeMode: localStorage.getItem(LS_KEY_THEME) || "dark",
  is12HourClock: localStorage.getItem(LS_KEY_CLOCK_FMT) === "true",
  language: localStorage.getItem(LS_KEY_LANG) || "fa"
});

let socket = null;
let statusTimer = null;
let timeSyncedThisSession = false;

/**
 * Connects to the firmware's WebSocket bridge at ws://<host>:<port>/mraqua (adjust the path
 * to whatever the ESP32 sketch actually serves). Requires the firmware to speak WebSocket —
 * a raw TCP socket like the Android app's WifiController uses is NOT reachable from a browser.
 */
export function connectWifi(host, port = 81) {
  disconnect();
  appStore.set({ connectionStatus: ConnectionStatus.CONNECTING });
  localStorage.setItem(LS_KEY_LAST_HOST, JSON.stringify({ host, port }));
  timeSyncedThisSession = false;

  try {
    socket = new WebSocket(`ws://${host}:${port}/`);
  } catch (e) {
    appStore.set({ connectionStatus: ConnectionStatus.ERROR });
    return;
  }

  socket.onopen = () => {
    appStore.set({ connectionStatus: ConnectionStatus.CONNECTED, connectedHost: host, demoMode: false });
    send(CommandProtocol.statusQuery());
    statusTimer = setInterval(() => send(CommandProtocol.statusQuery()), 3000);
    maybeSyncClock();
  };

  socket.onmessage = (evt) => {
    const parsed = CommandProtocol.parseStatus(evt.data);
    if (parsed) appStore.set({ aquariumState: parsed });
  };

  socket.onclose = () => {
    clearInterval(statusTimer);
    if (appStore.get().connectionStatus !== ConnectionStatus.DISCONNECTED) {
      appStore.set({ connectionStatus: ConnectionStatus.DISCONNECTED });
    }
  };

  socket.onerror = () => {
    appStore.set({ connectionStatus: ConnectionStatus.ERROR });
  };
}

export function disconnect() {
  clearInterval(statusTimer);
  if (socket) { try { socket.close(); } catch (e) {} socket = null; }
  appStore.set({ connectionStatus: ConnectionStatus.DISCONNECTED, connectedHost: null, demoMode: false });
}

export function send(commandString) {
  if (appStore.get().demoMode) return; // no-op in demo mode
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(commandString + "\n");
}

function maybeSyncClock() {
  if (timeSyncedThisSession) return;
  timeSyncedThisSession = true;
  if (!appStore.get().timeSyncOnConnect) return;
  send(CommandProtocol.setDateTimeNow());
  const now = Date.now();
  localStorage.setItem(LS_KEY_LAST_SYNC, String(now));
  appStore.set({ lastTimeSyncMs: now });
}

export function setTimeSyncOnConnect(enabled) {
  localStorage.setItem(LS_KEY_TIME_SYNC, String(enabled));
  appStore.set({ timeSyncOnConnect: enabled });
}

export function setUiScale(scale) {
  localStorage.setItem(LS_KEY_UI_SCALE, String(scale));
  appStore.set({ uiScale: scale });
}

export function setThemeMode(mode) {
  localStorage.setItem(LS_KEY_THEME, mode);
  appStore.set({ themeMode: mode });
}

export function setClockFormat(is12h) {
  localStorage.setItem(LS_KEY_CLOCK_FMT, String(is12h));
  appStore.set({ is12HourClock: is12h });
}

export function setLanguage(lang) {
  localStorage.setItem(LS_KEY_LANG, lang);
  appStore.set({ language: lang });
}

export function lastKnownHost() {
  try { return JSON.parse(localStorage.getItem(LS_KEY_LAST_HOST) || "null"); }
  catch (e) { return null; }
}

/** Lets you click around the whole UI with realistic-looking data before the firmware
 * WebSocket bridge exists — remove once real hardware is connected. */
export function startDemoMode() {
  disconnect();
  appStore.set({
    connectionStatus: ConnectionStatus.CONNECTED,
    connectedHost: "demo",
    demoMode: true,
    aquariumState: {
      sensors: {
        water: { currentTemp: 26.4, installed: true },
        heatsink: { currentTemp: 31.2, installed: true },
        internal: { currentTemp: 28.7, installed: true },
        unit: "CELSIUS",
        heater: { enabled: true, setpointC: 26.0, overTempShutoff: true },
        heatsinkFan: { onTempC: 34, offTempC: 30, currentlyOn: false },
        internalFan: { onTempC: 32, offTempC: 29, currentlyOn: true }
      },
      outlets: {
        LIGHT1: { on: true }, LIGHT2: { on: true }, FILTER: { on: true },
        CIRC: { on: true }, HEAT: { on: true }, CO2: { on: false },
        AUX1: { on: false }, AUX2: { on: false }
      },
      ato: { tankLevelLow: false, alarmFlagged: false, sensorFault: false, reservoirFraction: 0.68 }
    }
  });
}
