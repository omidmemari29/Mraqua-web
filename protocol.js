// Mirrors app/src/main/java/com/omid/mraqua/network/CommandProtocol.kt exactly.
// Every command is one plain-text line. The firmware answers STATUS? (and should push
// updates on its own) with a single-line JSON blob — see PROTOCOL.md in the Android project.
//
// IMPORTANT: browsers cannot open a raw TCP socket like the Android app's WifiController does.
// The firmware needs a small WebSocket (or HTTP) bridge added so this file can actually reach it —
// see store.js for the connection wrapper this expects.

const b = (v) => (v ? 1 : 0);
const f1 = (n) => Number(n).toFixed(1);
const f2 = (n) => Number(n).toFixed(2);
const f0 = (n) => Math.round(Number(n)).toString();

export const CommandProtocol = {
  statusQuery: () => "STATUS?",

  // ---------- Outlets ----------
  outletOn: (wireName) => `OUT:${wireName}:ON`,
  outletOff: (wireName) => `OUT:${wireName}:OFF`,
  outletSchedule: (wireName, s) =>
    `OUT:${wireName}:SCHED:${b(s.active)}:${s.onHour}:${s.onMinute}:${s.offHour}:${s.offMinute}:${s.daysMask}`,
  outletTimerCycle: (wireName, cycle) =>
    `OUT:${wireName}:TIMER:${b(cycle.active)}:${cycle.onMinutes}:${cycle.repeatEveryMinutes}`,

  // ---------- Feeding ----------
  feedStart: () => "FEED:START",
  feedStop: () => "FEED:STOP",
  feedDuration: (minutes) => `FEED:DUR:${minutes}`,
  feedHoldOutlets: (bitIndices) => {
    let mask = 0;
    bitIndices.forEach((i) => (mask |= (1 << i)));
    return `FEED:HOLD:${mask}`;
  },

  // ---------- ATO ----------
  atoEnable: (enabled) => `ATO:ENABLE:${b(enabled)}`,
  atoReservoirSwitch: (enabled) => `ATO:RESSWITCH:${b(enabled)}`,
  atoLowWaitMinutes: (minutes) => `ATO:LOWWAIT:${minutes}`,
  atoMaxRunSeconds: (seconds) => `ATO:MAXRUN:${seconds}`,
  atoManualTrigger: () => "ATO:MANUAL",
  atoDualSensorConfirm: (enabled) => `ATO:DUALCONFIRM:${b(enabled)}`,
  atoPauseDuringFeeding: (enabled) => `ATO:PAUSEFEED:${b(enabled)}`,
  atoCooldownMinutes: (minutes) => `ATO:COOLDOWN:${minutes}`,
  atoReservoirCapacityMl: (ml) => `ATO:RESCAP:${f0(ml)}`,
  atoPumpFlowMlPerSec: (mlPerSec) => `ATO:FLOWRATE:${f2(mlPerSec)}`,

  // ---------- Dosing (pump index 1..3) ----------
  doseAmount: (pump, ml) => `DOSE:${pump}:AMOUNT:${f2(ml)}`,
  doseSpeed: (pump, secPerMl) => `DOSE:${pump}:SPEED:${f2(secPerMl)}`,
  doseFullVolume: (pump, ml) => `DOSE:${pump}:FULLVOL:${f1(ml)}`,
  doseRefill: (pump) => `DOSE:${pump}:REFILL`,
  doseSchedule: (pump, s) => `DOSE:${pump}:SCHED:${b(s.active)}:${s.onHour}:${s.onMinute}:${s.daysMask}`,
  doseNow: (pump) => `DOSE:${pump}:NOW`,

  // ---------- Lighting ----------
  lightLevels: (modeIndex, levels) => `LIGHT:LEVELS:${modeIndex}:${levels.join(":")}`,
  lightRamp: (index, ramp) => `LIGHT:RAMP:${index}:${ramp.startHour}:${ramp.startMinute}:${ramp.lengthMinutes}`,
  lightLunar: (enabled) => `LIGHT:LUNAR:${b(enabled)}`,
  lightBarColor: (channelIndex, colorIdx) => `LIGHT:BARCOLOR:${channelIndex}:${colorIdx}`,

  // ---------- Sensors / heater / fans ----------
  sensorInstalled: (which, installed) => `SENSOR:${which}:INSTALLED:${b(installed)}`,
  sensorOffset: (which, offset) => `SENSOR:${which}:OFFSET:${f2(offset)}`,
  sensorShowOnHome: (which, show) => `SENSOR:${which}:SHOW:${b(show)}`,
  heaterEnable: (enabled) => `HEATER:ENABLE:${b(enabled)}`,
  heaterSetpoint: (tempC) => `HEATER:SETPOINT:${f1(tempC)}`,
  heaterShutoff: (enabled) => `HEATER:SHUTOFF:${b(enabled)}`,
  fanHeatsink: (onTempC, offTempC) => `FAN:HEATSINK:${f1(onTempC)}:${f1(offTempC)}`,
  fanInternal: (onTempC, offTempC) => `FAN:INTERNAL:${f1(onTempC)}:${f1(offTempC)}`,
  tempUnit: (isCelsius) => `UNIT:${isCelsius ? "C" : "F"}`,

  // ---------- Screen ----------
  screenDim: (level, afterSeconds) => `SCREEN:DIM:${level}:${afterSeconds}`,
  screenBright: (level) => `SCREEN:BRIGHT:${level}`,
  screenReturnHome: (afterSeconds) => `SCREEN:HOMESEC:${afterSeconds}`,
  screenClockFormat: (is12Hour) => `SCREEN:CLOCKFMT:${is12Hour ? 12 : 24}`,

  // ---------- Clock sync ----------
  setDateTime: (year, month, day, hour, minute, second) =>
    `TIME:SET:${year}:${month}:${day}:${hour}:${minute}:${second}`,
  setDateTimeNow: () => {
    const d = new Date();
    return CommandProtocol.setDateTime(
      d.getFullYear(), d.getMonth() + 1, d.getDate(),
      d.getHours(), d.getMinutes(), d.getSeconds()
    );
  },

  // ---------- Status parsing ----------
  // The firmware bridge should send STATUS? replies as JSON already (not the raw line format),
  // so on the web side this is just JSON.parse with safe defaults — see store.js `applyStatus`.
  parseStatus(line) {
    try {
      return JSON.parse(line.trim());
    } catch (e) {
      return null;
    }
  }
};
